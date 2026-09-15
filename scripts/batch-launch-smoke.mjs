import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { createHmac, randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const repo = path.resolve(__dirname, "..");
const output = process.env.SMOKE_OUTPUT_DIR || path.join(tmpdir(), "herbads-batch-smoke");
const copy = {
  primaryText: "Ein besonderer Moment verdient ein besonderes Geschenk.",
  headline: "Dein persoenliches Geschenk",
  description: "Mit Liebe gestaltet",
  landingUrl: "https://example.com/product",
  callToAction: "SHOP_NOW",
  pageId: "123",
  instagramId: "456",
  urlTags: "utm_source=meta"
};
const files = [
  { id: "feed", name: "Motif_1_1x1.png", path: "Feed/Motif_1_1x1.png", width: 1080, height: 1080, placement: "feed" },
  {
    id: "story",
    name: "Motif_1_9x16.png",
    path: "Story/Motif_1_9x16.png",
    width: 1080,
    height: 1920,
    placement: "story"
  }
].map((file) => ({
  ...file,
  kind: "image",
  mimeType: "image/png",
  size: 1000,
  thumbnailUrl: "/assets/herb-logo.png",
  modifiedTime: "2026-09-15T10:00:00Z"
}));
const initialGroups = [{ id: "ad-1", name: "Motif 1", feedFileId: "feed", storyFileId: "story" }];
function fixture(accountId = "account-a", presets = [], jobs = [], favoriteTemplateIds = []) {
  return {
    folder: { id: "folder", name: "Batch 01 - Herbstkampagne" },
    accounts: [
      { id: "account-a", metaAccountId: "act_111", name: "Testkonto A", currency: "EUR" },
      { id: "account-b", metaAccountId: "act_222", name: "Testkonto B", currency: "EUR" }
    ],
    accountId,
    favoriteTemplateIds,
    campaigns: [
      {
        id: "789",
        name: "Sales - Deutschland",
        objective: "OUTCOME_SALES",
        status: "ACTIVE",
        dailyBudget: 0,
        lifetimeBudget: 0
      },
      {
        id: "790",
        name: "Sales - CBO",
        objective: "OUTCOME_SALES",
        status: "ACTIVE",
        dailyBudget: 10000,
        lifetimeBudget: 0
      },
      {
        id: "791",
        name: "Paused campaign",
        objective: "OUTCOME_SALES",
        status: "PAUSED",
        dailyBudget: 0,
        lifetimeBudget: 0
      }
    ],
    templates: ["789", "790"].map((id) => ({
      id: `9${id}`,
      campaignId: id,
      name: "Website Purchases",
      raw: {
        daily_budget: id === "789" ? "6500" : "4500",
        optimization_goal: "OFFSITE_CONVERSIONS",
        promoted_object: { pixel_id: "333", custom_event_type: "PURCHASE" },
        targeting: { age_min: 18, age_max: 65, geo_locations: { countries: [id === "789" ? "DE" : "AT"] } }
      }
    })),
    presets,
    suggestions: [{ ...copy, id: "suggestion", spend: 1200, purchases: 40, revenue: 5000, adCount: 3 }],
    files,
    groups: initialGroups,
    ignoredFiles: ["Briefing.pdf"],
    recentJobs: jobs,
    metaConfigured: true
  };
}
function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function main() {
  await mkdir(output, { recursive: true });
  // Isolated Supabase and browser API fixtures: this test cannot create real Meta objects.
  const mock = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(req.url.startsWith("/auth/") ? '{"user":null}' : "[]");
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
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw new Error("Next.js exited");
      try {
        ready = (await fetch(`${origin}/login`, { signal: AbortSignal.timeout(2000) })).ok;
      } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert(ready, "Next.js readiness");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let accountId = "account-a",
      saved = [],
      job = null,
      submitted = null,
      failOnce = true,
      steps = 0;
    let creationRequests = 0;
    const favorites = { "account-a": [], "account-b": [] };
    await page.route("**/api/clients/test-client/batches/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      let result;
      if (url.pathname.endsWith("/favorites")) {
        const body = request.postDataJSON();
        favorites[body.accountId] = body.favorite
          ? [...new Set([...favorites[body.accountId], body.templateId])]
          : favorites[body.accountId].filter((id) => id !== body.templateId);
        result = { favoriteTemplateIds: favorites[body.accountId] };
      } else if (url.pathname.endsWith("/presets")) {
        const body = request.postDataJSON();
        if (request.method() === "DELETE") saved = saved.filter((item) => item.id !== body.id);
        else saved = [{ ...body.preset, id: "preset-1" }];
        result = { presets: saved };
      } else if (url.pathname.endsWith("/locales")) result = { locales: [{ id: 5, name: "Deutsch" }] };
      else if (url.pathname.endsWith("/launch") && request.method() === "GET") {
        accountId = url.searchParams.get("accountId") || "account-a";
        result = fixture(accountId, accountId === "account-a" ? saved : [], job ? [job] : [], favorites[accountId]);
      } else if (url.pathname.endsWith("/launch")) {
        submitted = request.postDataJSON();
        creationRequests++;
        job = {
          activate: Boolean(submitted.activate),
          id: "job-1",
          accountId,
          metaAccountId: "act_111",
          folderId: "folder",
          campaignId: submitted.campaignId,
          name: submitted.name,
          status: "pending",
          state: { media: {}, ads: {}, step: "adset" },
          error: null,
          adCount: submitted.groups.length,
          fileCount: 2,
          updatedAt: new Date().toISOString()
        };
        result = { job };
      } else {
        if (failOnce) {
          failOnce = false;
          job.status = "failed";
          job.error = "Test-Unterbrechung";
        } else {
          steps++;
          job.status = steps >= 2 ? "completed" : "running";
          job.error = null;
          job.state = {
            activated: steps >= 2 && job.activate,
            adsetId: "100",
            media: { feed: { imageHash: "hash1" }, story: { imageHash: "hash2" } },
            ads: steps >= 2 ? { "ad-1": { creativeId: "200", adId: "300" } } : {},
            step: steps >= 2 ? "done" : "creative"
          };
        }
        result = { job };
      }
      await route.fulfill({ json: result });
    });
    const url = `${origin}/clients/test-client/batches/create?folderId=folder`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
    await page.getByRole("heading", { name: "Batch auf Meta erstellen" }).waitFor();
    await page.locator("#launch-campaign").selectOption("789");
    assert.equal(await page.locator("#launch-template").inputValue(), "9789");
    assert.equal(await page.locator("#launch-budget").inputValue(), "65.00");
    await page.getByRole("button", { name: "Adset favorisieren", exact: true }).click();
    await page.getByRole("button", { name: "Adset aus Favoriten entfernen", exact: true }).waitFor();
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#launch-campaign").selectOption("789");
    assert.equal(
      await page
        .getByRole("button", { name: "Adset aus Favoriten entfernen", exact: true })
        .getAttribute("aria-pressed"),
      "true"
    );
    await page.locator("#launch-budget").fill("60");
    assert.equal(await page.locator("#launch-text").inputValue(), copy.primaryText);
    await page.locator("#language-search").fill("Deu");
    await page.getByRole("button", { name: "Deutsch", exact: true }).click();
    await page.locator("#preset-name").fill("DACH Standard");
    await page.getByRole("button", { name: "Vorlage speichern", exact: true }).click();
    await page.locator('#launch-preset option[value="preset-1"]').waitFor({ state: "attached" });
    await page.locator("#launch-account").selectOption("account-b");
    await page.waitForFunction(
      () =>
        document.querySelector("#launch-account")?.value === "account-b" &&
        document.querySelectorAll("#launch-preset option").length === 1
    );
    assert.equal(await page.locator('#launch-template optgroup[label="Favorisierte Adsets"] option').count(), 0);
    await page.locator("#launch-account").selectOption("account-a");
    await page.locator('#launch-preset option[value="preset-1"]').waitFor({ state: "attached" });
    await page.locator("#launch-preset").selectOption("preset-1");
    assert.equal(await page.locator("#launch-budget").inputValue(), "60");
    await page.locator("#launch-campaign").selectOption("790");
    assert(await page.locator("#launch-budget").isDisabled());
    await page.locator("#launch-campaign").selectOption("789");
    await page.locator("#launch-template").selectOption("9790");
    assert.equal(
      await page.locator("#launch-campaign").inputValue(),
      "789",
      "Source template must not change destination campaign"
    );
    assert.equal(await page.locator("#launch-budget").inputValue(), "45.00");
    assert.equal(await page.locator("#launch-preset").inputValue(), "");
    await page.locator("#launch-template").selectOption("9789");
    await page.locator("#launch-preset").selectOption("preset-1");
    await page.getByRole("button", { name: "Formatpaar trennen", exact: true }).click();
    await page.getByRole("heading", { name: "Anzeigen (2)", exact: true }).waitFor();
    await page.getByRole("button", { name: "Zuordnung zurücksetzen", exact: true }).click();
    await page.getByRole("heading", { name: "Anzeigen (1)", exact: true }).waitFor();
    await page.getByText("Eigener Primaertext (optional)", { exact: true }).click();
    await page
      .getByRole("textbox", { name: "Primärer Text: Motif 1", exact: true })
      .fill("Individueller Text nur fuer dieses Motiv.");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, "desktop.png"), fullPage: true });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(100);
      const measurements = await page.evaluate(() => ({
        width: innerWidth,
        content: document.documentElement.scrollWidth,
        missingImages: [...document.querySelectorAll('img[alt="Motif_1_1x1.png"], img[alt="Motif_1_9x16.png"]')].filter(
          (image) => !image.complete || !image.naturalWidth
        ).length
      }));
      if (measurements.content > measurements.width + 1) {
        console.log(
          await page.evaluate(() =>
            [...document.querySelectorAll("body *")]
              .map((element) => ({
                tag: element.tagName,
                text: element.textContent?.slice(0, 70),
                className: element.className,
                right: element.getBoundingClientRect().right
              }))
              .filter((item) => item.right > innerWidth + 1)
              .slice(0, 15)
          )
        );
        await page.screenshot({ path: path.join(output, `overflow-${width}.png`), fullPage: true });
      }
      assert(
        measurements.content <= measurements.width + 1,
        `Horizontal overflow at ${width}: ${measurements.content}`
      );
      assert.equal(measurements.missingImages, 0, "Media previews render");
      if (width === 390) await page.screenshot({ path: path.join(output, "mobile.png"), fullPage: true });
    }
    await page.getByRole("button", { name: "Pausiert auf Meta erstellen", exact: true }).click();
    await page.getByText("Test-Unterbrechung", { exact: true }).waitFor();
    assert.equal(submitted.groups.length, 1);
    assert.equal(submitted.groups[0].storyFileId, "story");
    assert.equal(submitted.groups[0].primaryText, "Individueller Text nur fuer dieses Motiv.");
    assert(!("spend" in submitted.copy), "Suggestion statistics must not leak into text payload");
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Upload fortsetzen", exact: true }).click();
    await page.getByText("Pausiert erstellt", { exact: true }).waitFor();
    assert.equal(
      await page.getByRole("link", { name: "In Meta öffnen", exact: true }).getAttribute("href"),
      "https://adsmanager.facebook.com/adsmanager/manage/adsets?act=111&selected_adset_ids=100"
    );
    await page.screenshot({ path: path.join(output, "completed.png"), fullPage: true });
    assert.equal(submitted.activate, false, "Default remains paused");
    job = null;
    steps = 0;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("#launch-campaign").selectOption("791");
    assert(await page.getByRole("radio", { name: "Direkt aktivieren", exact: true }).isDisabled());
    await page.locator("#launch-campaign").selectOption("790");
    await page.getByRole("radio", { name: "Direkt aktivieren", exact: true }).check();
    await page.getByRole("button", { name: "Erstellen und aktivieren", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal(creationRequests, 1, "Opening confirmation must not create anything");
    assert(await dialog.getByText("Kampagnen-Tagesbudget (gesamt)", { exact: true }).isVisible());
    assert.match(await dialog.innerText(), /100,00/);
    await dialog.getByRole("button", { name: "Abbrechen", exact: true }).click();
    assert.equal(creationRequests, 1, "Cancelling must not create anything");
    await page.getByRole("button", { name: "Erstellen und aktivieren", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(output, "activation-confirmation-mobile.png") });
    const bounds = await dialog.evaluate((element) => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      width: innerWidth
    }));
    assert(bounds.left >= 0 && bounds.right <= bounds.width, `Dialog overflow: ${JSON.stringify(bounds)}`);
    await dialog.getByRole("button", { name: "Bestätigen und aktivieren", exact: true }).click();
    await page.getByText("Aktiviert", { exact: true }).first().waitFor();
    assert.equal(submitted.activate, true);
    assert.deepEqual(submitted.activationBudget, { dailyBudget: 10000, lifetimeBudget: 0 });
    assert.equal(creationRequests, 2);
    assert.deepEqual(errors, [], "Browser exceptions");
    console.log(
      "PASS desktop/mobile, presets, persistent account favorites, cross-campaign templates, CBO, pairing, resume, paused default and explicit activation confirmation"
    );
    console.log("Screenshots:", output);
  } catch (error) {
    console.error(logs.join("").slice(-12000));
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
