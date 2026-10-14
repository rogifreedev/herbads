import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { createHmac, randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { checkTextContrast } from "./theme-contrast.mjs";

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(tmpdir(), "herbads-adset-output-smoke");
const fixture = [
  ["Rocco", "Sparkling Rocco", "video", "2026-10-01"],
  ["Rocco", "Sparkling Rocco", "static", "2026-10-02"],
  ["Calmont", "Calmont x HERB media", "video", "2026-10-03"],
  ["Adyro", "Adyro Women", "static", "2026-10-04"],
  ["Adyro", "Adyro Women", "mixed", "2026-10-05"],
  ["Adyro", "Adyro EU", "unknown", "2026-09-01"]
].map(([client, account, media_type, first_delivery_date], i) => ({
  job_id: `job-${i}`, client_id: `client-${client}`, client_name: client,
  account_id: account.replaceAll(" ", "-"), account_name: account, meta_account_id: "act_123",
  meta_adset_id: String(100 + i), batch_name: `10${i} - ${client} Launch`, folder_id: `folder-${i}`,
  media_type, first_delivery_date
}));
const listen = (server) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});

async function main() {
  await mkdir(output, { recursive: true });
  let fail = false;
  let release;
  let gate = null;
  let calls = 0;
  let failTheme = false;
  const preferences = new Map();
  // The application API and UI run normally against isolated database/auth fixtures.
  const mock = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url.startsWith("/rest/v1/user_preferences")) {
      if (req.method === "POST") {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        if (failTheme) { res.statusCode = 500; return res.end('{"message":"Fixture save failure"}'); }
        const preference = JSON.parse(raw);
        preferences.set(preference.user_email, preference.theme);
        return res.end("{}");
      }
      const email = new URL(req.url, "http://fixture").searchParams.get("user_email")?.replace(/^eq\./, "");
      return res.end(JSON.stringify(preferences.has(email) ? [{ theme: preferences.get(email) }] : []));
    }
    if (!req.url.includes("/rpc/get_adset_output")) return res.end(req.url.startsWith("/auth/") ? '{"user":null}' : "[]");
    calls++;
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (gate) await gate;
    if (fail) { res.statusCode = 500; return res.end('{"message":"Fixture database failure"}'); }
    res.end(JSON.stringify(fixture.filter((row) =>
      (!body.p_since || row.first_delivery_date >= body.p_since) && (!body.p_until || row.first_delivery_date <= body.p_until)
    )));
  });
  const mockPort = await listen(mock);
  const reservation = http.createServer();
  const port = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const secret = randomUUID();
  const logs = [];
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: repo, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${mockPort}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test", SUPABASE_SERVICE_ROLE_KEY: "test", APP_SESSION_SECRET: secret,
      META_SYSTEM_USER_ACCESS_TOKEN: "", NEXT_PUBLIC_APP_URL: origin, NEXT_TELEMETRY_DISABLED: "1" }
  });
  server.stdout.on("data", (data) => logs.push(data.toString()));
  server.stderr.on("data", (data) => logs.push(data.toString()));
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw new Error("Server exited");
      try { ready = (await fetch(`${origin}/login`, { signal: AbortSignal.timeout(2000) })).ok; } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert(ready);
    const unauthorized = await fetch(`${origin}/api/adset-output`);
    assert.equal(unauthorized.status, 401);
    assert.equal(calls, 0, "No database access without login");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const payload = Buffer.from(JSON.stringify({ email: "tester@herb-media.com", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    await context.addCookies([{ name: "herbads-session", value: `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`, url: origin }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const url = `${origin}/dashboard/adset-output?since=2026-09-15&until=2026-10-14`;
    gate = new Promise((resolve) => { release = resolve; });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.getByRole("status").filter({ hasText: "Adset Output wird geladen" }).waitFor();
    assert.equal(await page.locator("[data-output-metric]").count(), 0, "No misleading zeroes while loading");
    gate = null; release();
    const total = page.locator('[data-output-metric="total"] dd');
    await total.waitFor();
    assert.equal(await total.innerText(), "5");
    assert.equal(await page.locator('[data-output-metric="video"] dd').innerText(), "2");
    assert.equal(await page.locator('[data-output-metric="static"] dd').innerText(), "2");
    assert.equal(await page.locator('[data-output-metric="mixed"] dd').innerText(), "1");
    const outputLink = page.getByRole("link", { name: "Adset Output", exact: true });
    assert.equal(await outputLink.getAttribute("href"), "/dashboard/adset-output");
    assert.equal(await page.getByRole("link", { name: "\u00dcbersicht", exact: true }).getAttribute("href"), "/dashboard");
    assert.equal(await page.getByText("Total Input", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Rocco Sparkling Rocco", exact: true }).click();
    const detail = page.getByRole("link", { name: "100 - Rocco Launch", exact: true });
    await detail.waitFor();
    assert.match(await detail.getAttribute("href"), /folderId=folder-0&jobId=job-0/);
    assert.match(await page.getByRole("link", { name: "100 - Rocco Launch in Meta \u00f6ffnen", exact: true }).getAttribute("href"), /selected_adset_ids=100/);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: path.join(output, `output-${width}.png`), fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Viewport overflow ${width}`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "15.09.2026 - 14.10.2026", exact: true }).click();
    await page.getByRole("button", { name: "Gesamt", exact: true }).click();
    await page.waitForURL(/range=all/);
    await page.waitForFunction(() => document.querySelector('[data-output-metric="total"] dd')?.textContent === "6");
    assert.equal(await page.locator('[data-output-metric="unknown"] dd').innerText(), "1");
    await page.goBack({ waitUntil: "networkidle" });
    assert.equal(await total.innerText(), "5", "Back restores the date filter");
    await page.getByRole("button", { name: "15.09.2026 - 14.10.2026", exact: true }).click();
    await page.getByRole("button", { name: "Gesamt", exact: true }).click();
    await page.waitForURL(/range=all/);
    await page.getByRole("button", { name: "Alle Daten", exact: true }).click();
    await page.locator('[data-day="2026-10-03"]:not([data-outside]) button').click();
    await page.locator('[data-day="2026-10-05"]:not([data-outside]) button').click();
    await page.getByRole("button", { name: "Anwenden", exact: true }).click();
    await page.waitForURL(/since=2026-10-03&until=2026-10-05/);
    await page.waitForFunction(() => document.querySelector('[data-output-metric="total"] dd')?.textContent === "3");
    await page.goto(`${origin}/dashboard/adset-output?since=2026-10-03&until=2026-10-03`, { waitUntil: "networkidle" });
    assert.equal(await total.innerText(), "1", "A custom inclusive one-day interval is applied");
    await page.goto(`${origin}/dashboard/adset-output?since=2025-01-01&until=2025-01-07`, { waitUntil: "networkidle" });
    await page.getByText("Keine erstmals ausgelieferten HERBAds-Batches in diesem Zeitraum.", { exact: true }).waitFor();
    assert.equal(await total.innerText(), "0");
    await page.goto(`${origin}/dashboard/adset-output?since=2026-10-14&until=2026-10-01`, { waitUntil: "networkidle" });
    await page.getByRole("alert").filter({ hasText: "Startdatum" }).waitFor();
    fail = true;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("alert").filter({ hasText: "Adset Output konnte nicht geladen werden." }).waitFor();
    assert.equal(await total.count(), 0, "Errors do not look like a zero-output period");
    fail = false;
    await page.getByRole("button", { name: "Erneut versuchen", exact: true }).click();
    await total.waitFor();
    assert.equal(await total.innerText(), "5");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole("button", { name: "15.09.2026 - 14.10.2026", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(output, `date-picker-${width}.png`) });
      const bounds = await dialog.boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, "Calendar fits viewport width");
      assert(bounds.y >= 0 && bounds.y + bounds.height <= 901, "Calendar fits viewport height");
      await page.keyboard.press("Escape");
    }
    const refreshCalls = calls;
    await page.getByRole("button", { name: "Output aktualisieren", exact: true }).click();
    await total.waitFor();
    assert(calls > refreshCalls);
    // Exercise the real preference endpoint and server-rendered theme across isolated users/devices.
    await page.getByRole("button", { name: "Dunkelmodus aktivieren", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Hellmodus aktivieren"]')?.getAttribute("aria-busy") === "false");
    assert.equal(preferences.get("tester@herb-media.com"), "dark");
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("html").getAttribute("class"), "dark");
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), "dark");
    await checkTextContrast(page);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.getByRole("button", { name: "Hellmodus aktivieren", exact: true }).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, `dark-output-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "15.09.2026 - 14.10.2026", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(250);
    await checkTextContrast(page);
    await page.screenshot({ path: path.join(output, "dark-calendar.png") });
    await page.keyboard.press("Escape");
    await page.route("**/api/meta/ad-accounts", (route) => route.fulfill({ json: { accounts: [{ id: "test", accountId: "act_test", name: "Testkonto" }] } }));
    await page.getByRole("button", { name: "Partner anlegen", exact: true }).click();
    await page.getByRole("dialog", { name: "Partner anlegen", exact: true }).waitFor();
    await page.waitForTimeout(250);
    await checkTextContrast(page);
    await page.screenshot({ path: path.join(output, "dark-form.png") });
    await page.keyboard.press("Escape");
    failTheme = true;
    await page.getByRole("button", { name: "Hellmodus aktivieren", exact: true }).click();
    await page.getByText("Die Darstellung konnte nicht gespeichert werden. Bitte erneut versuchen.", { exact: true }).waitFor();
    assert.equal(await page.locator("html").getAttribute("class"), "dark", "Failed saves roll back visibly");
    failTheme = false;
    const secondDevice = await browser.newContext();
    await secondDevice.addCookies(await context.cookies());
    const secondPage = await secondDevice.newPage();
    const html = await secondPage.goto(url, { waitUntil: "networkidle" });
    assert.match(await html.text(), /<html[^>]*class="dark"/, "Dark mode is present before hydration");
    const otherPayload = Buffer.from(JSON.stringify({ email: "other@herb-media.com", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    await secondDevice.addCookies([{ name: "herbads-session", value: `${otherPayload}.${createHmac("sha256", secret).update(otherPayload).digest("base64url")}`, url: origin }]);
    await secondPage.reload({ waitUntil: "networkidle" });
    assert.notEqual(await secondPage.locator("html").getAttribute("class"), "dark", "Other users do not inherit a shared browser theme");
    const forbidden = await secondDevice.request.put(`${origin}/api/user/theme`, { headers: { Origin: "https://other.example" }, data: { theme: "dark" } });
    assert.equal(forbidden.status(), 403);
    await page.getByRole("button", { name: "Hellmodus aktivieren", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Dunkelmodus aktivieren"]')?.getAttribute("aria-busy") === "false");
    assert.equal(preferences.get("tester@herb-media.com"), "light");
    await page.reload({ waitUntil: "networkidle" });
    assert.notEqual(await page.locator("html").getAttribute("class"), "dark");
    await secondDevice.close();
    assert.deepEqual(errors, []);
    console.log("PASS per-user themes, SSR persistence, separate device, user isolation, CSRF, save failure rollback, mobile toggle, dark calendar/dialog/table contrast");
    console.log("PASS auth, database-backed API, navigation, account totals, batch drilldown, date filters, history, loading, empty/error/retry and desktop/mobile views");
    console.log("Screenshots:", output);
  } catch (error) {
    const page = browser?.contexts()[0]?.pages()[0];
    if (page) {
      console.error(await page.locator("body").innerText());
      await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
    }
    console.error(logs.join("").slice(-8000));
    throw error;
  } finally {
    gate = null; release?.();
    await browser?.close();
    if (server.exitCode === null) execFileSync("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    await new Promise((resolve) => mock.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
