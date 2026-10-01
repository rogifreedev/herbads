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

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = process.env.SMOKE_OUTPUT_DIR || path.join(tmpdir(), "herbads-batch-check-smoke");
const now = new Date().toISOString();
const names = [
  "100 - Static Bezahlen",
  "10 - Static Angebot",
  "09 - Video Sommer",
  "02 - Ersten Ads",
  "102 - 3 Gr\u00fcnde VSL",
  "101 - BP Neue Claims"
];
const checks = names.map((name, index) => ({
  id: `check-${index}`,
  client_id: "test-client",
  source_folder_id: "root",
  source_folder_label: "Blytz Always On",
  drive_folder_id: `drive-${index}`,
  name,
  path: name,
  depth: 1,
  web_view_link: `https://drive.google.com/drive/folders/drive-${index}`,
  modified_time: now,
  checked_at: now,
  status: index === 5 ? "found" : index === 2 ? "live" : "missing",
  match_type: index === 2 || index === 5 ? "adset" : null,
  match_id: index === 2 || index === 5 ? `adset-${index}` : null,
  match_name: index === 2 ? "Sommer Gewinner" : index === 5 ? "BP Neue Claims" : null,
  match_status: index === 2 ? "ACTIVE" : "PAUSED",
  match_effective_status: null
}));

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function main() {
  await mkdir(output, { recursive: true });
  let snapshotReads = 0;
  // All data and authentication are isolated fixtures; no production credentials or providers are used.
  const mock = http.createServer((req, res) => {
    const url = new URL(req.url, "http://fixture");
    const table = url.pathname.split("/").pop();
    let rows = [];
    if (table === "batch_settings")
      rows = [
        {
          id: "settings",
          client_id: "test-client",
          last_checked_at: now,
          last_check_status: "completed",
          last_meta_entities_count: 71
        }
      ];
    if (table === "batch_drive_folders")
      rows = [
        {
          id: "root",
          client_id: "test-client",
          label: "Blytz Always On",
          google_drive_folder_id: "root",
          enabled: true,
          last_checked_at: now,
          last_check_status: "completed"
        }
      ];
    if (table === "batch_folder_checks") {
      snapshotReads++;
      rows = checks;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        req.url.startsWith("/auth/")
          ? { user: null }
          : req.headers.accept?.includes("vnd.pgrst.object")
            ? (rows[0] ?? null)
            : rows
      )
    );
  });
  const mockPort = await listen(mock);
  const reservation = http.createServer();
  const port = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const secret = randomUUID();
  const logs = [];
  const server = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: repo,
      windowsHide: true,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${mockPort}`,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-public",
        SUPABASE_SERVICE_ROLE_KEY: "test-service",
        APP_SESSION_SECRET: secret,
        META_SYSTEM_USER_ACCESS_TOKEN: "",
        GOOGLE_DRIVE_AUTH_MODE: "api_key",
        GOOGLE_DRIVE_API_KEY: "",
        GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: "",
        NEXT_PUBLIC_APP_URL: origin,
        NEXT_TELEMETRY_DISABLED: "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  server.stdout.on("data", (data) => logs.push(data.toString()));
  server.stderr.on("data", (data) => logs.push(data.toString()));
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (server.exitCode !== null) throw new Error("Next.js exited");
      try {
        ready = (await fetch(`${origin}/login`, { signal: AbortSignal.timeout(2000) })).ok;
      } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert(ready, "Next.js readiness");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "America/Los_Angeles"
    });
    const payload = Buffer.from(
      JSON.stringify({ email: "tester@herb-media.com", exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString("base64url");
    await context.addCookies([
      {
        name: "herbads-session",
        value: `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`,
        url: origin
      }
    ]);
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort()
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/clients/test-client/batches`, { waitUntil: "networkidle", timeout: 90000 });
    const table = page.getByRole("table", { name: "Batch Check" });
    const rows = table.locator("tbody tr");
    const search = page.getByRole("searchbox", { name: "Batches durchsuchen" });
    await search.waitFor();
    const waitForCount = (count) =>
      page.waitForFunction(
        (value) => document.querySelectorAll("#batch-check-results tbody tr").length === value,
        count
      );
    assert.equal(await rows.count(), 6);
    assert.deepEqual(await rows.locator("td:first-child").allTextContents(), ["1", "2", "3", "4", "5", "6"]);
    assert.deepEqual(await rows.locator("td:nth-child(3) p:first-child").allTextContents(), [
      names[3],
      names[2],
      names[1],
      names[0],
      names[5],
      names[4]
    ]);
    const initialReads = snapshotReads;
    let searchRequests = 0;
    const countRequests = (request) => {
      if (request.resourceType() === "fetch" || request.isNavigationRequest()) searchRequests++;
    };
    page.on("request", countRequests);
    await search.pressSequentially("static", { delay: 30 });
    await waitForCount(2);
    assert.deepEqual(await rows.locator("td:first-child").allTextContents(), ["3", "4"]);
    assert(await page.getByRole("status").filter({ hasText: "2 von 6 Batches" }).count());
    const createLink = rows.first().getByRole("link", { name: "Auf Meta erstellen" });
    assert.equal(await createLink.getAttribute("href"), "/clients/test-client/batches/create?folderId=drive-1");
    await search.fill("GRUNDE");
    await waitForCount(1);
    await page.waitForFunction(() =>
      document.querySelector("#batch-check-results tbody")?.textContent.includes("102 - 3")
    );
    assert.equal(await rows.locator("td:first-child").innerText(), "6");
    await search.fill("sommer blytz");
    await page.waitForFunction(() =>
      document.querySelector("#batch-check-results tbody")?.textContent.includes("Sommer Gewinner")
    );
    await search.fill("does-not-exist");
    await page.getByText("Keine Batches f\u00fcr diesen Suchbegriff.").waitFor();
    await page.screenshot({ path: path.join(output, "empty-desktop.png") });
    await page.getByRole("button", { name: "Suche l\u00f6schen" }).click();
    await waitForCount(6);
    assert.equal(await search.inputValue(), "");
    assert(await search.evaluate((node) => node === document.activeElement));
    await search.fill("100");
    await search.fill("102");
    await search.fill("9 - Video");
    await page.waitForFunction(
      () =>
        document.querySelectorAll("#batch-check-results tbody tr").length === 1 &&
        document.querySelector("#batch-check-results tbody")?.textContent.includes("09 - Video")
    );
    await search.press("Escape");
    await waitForCount(6);
    page.off("request", countRequests);
    assert.equal(searchRequests, 0, "Typing must not navigate or refetch provider/snapshot data");
    assert.equal(snapshotReads, initialReads, "Search must reuse the snapshot");
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await search.scrollIntoViewIfNeeded();
      await search.fill("static");
      await waitForCount(2);
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `Page overflow at ${width}`
      );
      const bounds = await search.boundingBox();
      assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `Search bounds at ${width}`);
      await page.screenshot({ path: path.join(output, `search-${width}.png`) });
      await search.fill("");
      await waitForCount(6);
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, snapshotReads, searchRequests, screenshots: output }));
  } catch (error) {
    const page = browser?.contexts()[0]?.pages()[0];
    if (page) {
      console.error(
        await page
          .locator("body")
          .innerText()
          .catch(() => "Page unavailable")
      );
      await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
    }
    console.error(logs.join("").slice(-8000));
    throw error;
  } finally {
    await browser?.close();
    if (server.exitCode === null) {
      if (process.platform === "win32")
        execFileSync("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      else server.kill("SIGTERM");
    }
    await new Promise((resolve) => mock.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
