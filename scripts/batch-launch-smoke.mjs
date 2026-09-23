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
const variantCopy = {
  ...copy,
  primaryText: "Primaerer Text 1 aus Vorlage",
  headline: "Headline 1 aus Vorlage",
  description: "Beschreibung 1 aus Vorlage",
  primaryTexts: Array.from({ length: 5 }, (_, i) => `Primaerer Text ${i + 1} aus Vorlage`),
  headlines: Array.from({ length: 5 }, (_, i) => `Headline ${i + 1} aus Vorlage`),
  descriptions: Array.from({ length: 5 }, (_, i) => `Beschreibung ${i + 1} aus Vorlage`)
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
    templates: ["789", "790", "791"].map((id) => ({
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
    let visualFixture = false;
    let regionalFixture = false;
    let liveLanguageIds = [5];
    let failLocaleNames = false;
    let variantFixture = false;
    let failCopy = false;
    let copyGate = null;
    let failIdentities = false;
    let partialIdentities = false;
    let emptyIdentities = false;
    let identityGate = null;
    let mediaRequests = 0;
    let pauseCampaignOnRefresh = false;
    let failMedia = false,
      failOptions = false,
      delayAccountB = false;
    let releaseAccountB, accountBStarted;
    const slowAccountB = new Promise((resolve) => {
      releaseAccountB = resolve;
    });
    const accountBRequested = new Promise((resolve) => {
      accountBStarted = resolve;
    });
    let releaseMedia, releaseOptions;
    const slowMedia = new Promise((resolve) => {
      releaseMedia = resolve;
    });
    const slowOptions = new Promise((resolve) => {
      releaseOptions = resolve;
    });
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
      } else if (url.pathname.endsWith("/locales")) {
        const ids = url.searchParams.get("ids");
        if (ids && failLocaleNames)
          return route.fulfill({ status: 503, json: { error: "Language lookup unavailable" } });
        result = {
          locales: ids
            ? [
                { id: 5, name: "Deutsch" },
                { id: 9999, name: "Testsprache" }
              ].filter((item) => ids.split(",").includes(String(item.id)))
            : [{ id: 5, name: "Deutsch" }]
        };
      } else if (url.pathname.endsWith("/launch/identities")) {
        if (failIdentities) return route.fulfill({ status: 503, json: { error: "Test-Identitaeten-Ausfall" } });
        const requestedAccount = url.searchParams.get("accountId");
        result = emptyIdentities
          ? { pages: [], instagramAccounts: [] }
          : requestedAccount === "account-b"
            ? {
                pages: [{ id: "223", name: "Seite Konto B" }],
                instagramAccounts: [{ id: "556", name: "@konto_b" }]
              }
            : {
                pages: [
                  { id: "123", name: "HERB Facebook" },
                  { id: "124", name: "Weitere Facebook-Seite" }
                ],
                instagramAccounts: [
                  { id: "456", name: "@herb" },
                  { id: "457", name: "@herb_design" },
                  { id: "17841402245652920", name: "@kohl_test" }
                ]
              };
        if (partialIdentities) result.warnings = ["connectedInstagramUnavailable"];
        const gate = identityGate;
        if (gate?.accountId === requestedAccount) {
          gate.started();
          await gate.promise;
        }
      } else if (url.pathname.endsWith("/launch/copy")) {
        if (failCopy) return route.fulfill({ status: 503, json: { error: "Test-Text-Ausfall" } });
        const templateId = url.searchParams.get("templateId");
        result = {
          sources: variantFixture
            ? [
                {
                  id: `${templateId}-full`,
                  name: "Anzeige mit allen Varianten",
                  status: "ACTIVE",
                  copy: variantCopy,
                  truncated: false
                },
                {
                  id: `${templateId}-single`,
                  name: "Anzeige mit einem Text",
                  status: "PAUSED",
                  copy: { ...copy, description: "" },
                  truncated: false
                }
              ]
            : [{ id: `${templateId}-copy`, name: "Quellanzeige", status: "ACTIVE", copy, truncated: false }]
        };
        const gate = copyGate;
        if (gate?.templateId === templateId) {
          gate.started();
          await gate.promise;
        }
      } else if (url.pathname.endsWith("/launch/media")) {
        mediaRequests++;
        if (failMedia) return route.fulfill({ status: 503, json: { error: "Test-Drive-Ausfall" } });
        await slowMedia;
        result = {
          files,
          groups: visualFixture ? initialGroups.map((group) => ({ ...group, matchMethod: "visual" })) : initialGroups,
          ignoredFiles: ["Briefing.pdf"]
        };
      } else if (url.pathname.endsWith("/launch/options")) {
        if (failOptions) return route.fulfill({ status: 503, json: { error: "Test-Meta-Ausfall" } });
        await slowOptions;
        const requestedAccount = url.searchParams.get("accountId");
        const data = fixture(requestedAccount);
        if (liveLanguageIds) data.templates[0].raw.targeting.locales = liveLanguageIds;
        if (pauseCampaignOnRefresh) data.campaigns[0].status = "PAUSED";
        if (requestedAccount === "account-b" && delayAccountB) {
          accountBStarted();
          await slowAccountB;
          data.campaigns.push({ ...data.campaigns[0], id: "only-b", name: "Account B only" });
        }
        result = { campaigns: data.campaigns, templates: data.templates };
      } else if (url.pathname.endsWith("/launch") && request.method() === "GET") {
        accountId = url.searchParams.get("accountId") || "account-a";
        result = fixture(accountId, accountId === "account-a" ? saved : [], job ? [job] : [], favorites[accountId]);
        delete result.files;
        delete result.groups;
        delete result.ignoredFiles;
      } else if (url.pathname.endsWith("/launch")) {
        submitted = request.postDataJSON();
        creationRequests++;
        job = {
          queueEnabled: true,
          controlStatus: "run",
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
        if (request.method() === "POST") {
          const action = request.postDataJSON().action;
          job.controlStatus = action === "resume" ? "run" : action;
          job.status = action === "resume" ? "pending" : "paused";
          job.error = null;
        } else if (["failed", "paused", "cancelled", "review", "completed"].includes(job.status)) {
          // Read-only polling cannot implicitly resume a job.
        } else if (failOnce) {
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
      if (regionalFixture && result.templates) {
        result.templates[0].raw.daily_budget = "1500";
        result.templates[0].raw.targeting.locales = [5, "9999"];
        result.templates[0].raw.targeting.geo_locations = {
          cities: [{ key: "1182606", name: "Lana", country: "IT", radius: 30, distance_unit: "kilometer" }],
          location_types: ["frequently_in", "home", "recent"]
        };
      }
      await route.fulfill({ json: result });
    });
    const url = `${origin}/clients/test-client/batches/create?folderId=folder`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.getByRole("heading", { name: "Batch auf Meta erstellen" }).waitFor();
    await page.locator("#launch-account").waitFor();
    await page.locator('#launch-pageId option[value="123"]:not([disabled])').waitFor({ state: "attached" });
    assert.equal(await page.locator("#launch-pageId").evaluate((element) => element.tagName), "SELECT");
    assert.equal(await page.locator("#launch-instagramId").evaluate((element) => element.tagName), "SELECT");
    assert.equal(
      await page.locator("#launch-pageId").inputValue(),
      "123",
      "Identity is preloaded before campaign selection"
    );
    assert.equal(await page.locator("#launch-instagramId").inputValue(), "456");
    assert(
      await page.locator("#launch-campaign").isEnabled(),
      "Account settings usable while sources are still pending"
    );
    assert(await page.getByRole("status").filter({ hasText: "Kampagnen und Adsets werden" }).isVisible());
    assert(await page.getByRole("status").filter({ hasText: "Drive-Medien werden" }).isVisible());
    await page.locator("#launch-campaign").selectOption("789");
    await page.locator("#launch-budget").fill("71");
    await page.locator("#launch-text").fill("Text edited while sources load");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, "progressive-loading.png"), fullPage: true });
    const pausedButton = page.getByRole("button", { name: "Pausiert auf Meta erstellen", exact: true });
    assert(await pausedButton.isDisabled());
    releaseMedia();
    await page.getByRole("heading", { name: "Anzeigen (1)", exact: true }).waitFor();
    assert(await pausedButton.isDisabled(), "Creation waits for live Meta even when matched media is ready");
    releaseOptions();
    await page.getByRole("status").filter({ hasText: "Kampagnen und Adsets werden" }).waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Deutsch", exact: true }).waitFor();
    assert.equal(
      await page.getByText("Alle Sprachen", { exact: true }).count(),
      0,
      "Late Meta data must update untouched inherited languages"
    );
    liveLanguageIds = null;
    assert.equal(await page.locator("#launch-text").inputValue(), "Text edited while sources load");
    assert.equal(await page.locator("#launch-budget").inputValue(), "71");
    assert.equal(await page.locator("#launch-campaign").inputValue(), "789");
    assert(await pausedButton.isEnabled());
    await page.locator("#launch-campaign").selectOption("");
    await page.locator("#launch-text").fill(copy.primaryText);
    const expectedName = `${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date())}_Batch 01 - Herbstkampagne`;
    assert.equal(await page.locator("#launch-name").inputValue(), expectedName);
    assert(await page.locator("#launch-name").evaluate((input) => input.readOnly));
    assert.deepEqual(
      await page.locator("#launch-campaign option").evaluateAll((options) => options.map((option) => option.value)),
      ["", "789", "790"]
    );
    await page.locator("#launch-campaign").selectOption("789");
    assert.match(await page.locator("#launch-template").innerText(), /Website Purchases.*Sales - Deutschland/);
    assert.equal(await page.locator("#launch-budget").inputValue(), "71");
    const search = page.getByRole("combobox", { name: "Adset oder Kampagne suchen", exact: true });
    assert.equal(await search.count(), 0, "Search belongs inside the dropdown");
    await page.locator("#launch-template").click();
    await search.waitFor();
    assert(await search.evaluate((input) => input === document.activeElement));
    await search.fill("not-a-template");
    await page.getByRole("status").filter({ hasText: "Keine Ergebnisse." }).waitFor();
    assert.equal(await page.getByRole("listbox").getByRole("option").count(), 0);
    await search.fill("website");
    assert.equal(await page.getByRole("listbox").getByRole("option").count(), 3);
    await search.fill("Paused campaign");
    assert.equal(
      await page.getByRole("listbox").getByRole("option").count(),
      1,
      "Paused campaign source templates remain searchable"
    );
    await search.press("Enter");
    assert.match(await page.locator("#launch-template").innerText(), /Paused campaign/);
    assert.equal(await page.locator("#launch-campaign").inputValue(), "789");
    await page.locator("#launch-template").click();
    assert.equal(await search.inputValue(), "", "Opening resets the previous search");
    await search.fill("9789");
    await page.getByRole("listbox").getByRole("option").click();
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
    const mediaBeforeSwitch = mediaRequests;
    delayAccountB = true;
    await page.locator("#launch-account").selectOption("account-b");
    await page.waitForFunction(
      () =>
        document.querySelector("#launch-account")?.value === "account-b" &&
        document.querySelectorAll("#launch-preset option").length === 1
    );
    await page.locator("#launch-template").click();
    assert.equal(await page.getByRole("group", { name: "Favorisierte Adsets", exact: true }).count(), 0);
    await search.press("Escape");
    await page.waitForFunction(() => document.activeElement?.id === "launch-template");
    await accountBRequested;
    await page.locator("#launch-account").selectOption("account-a");
    await page.locator('#launch-preset option[value="preset-1"]').waitFor({ state: "attached" });
    releaseAccountB();
    await page.waitForLoadState("networkidle");
    assert.equal(
      await page.locator('#launch-campaign option[value="only-b"]').count(),
      0,
      "Discard late responses from the previous account"
    );
    assert.equal(mediaRequests, mediaBeforeSwitch, "Account switching must not reload Drive or redo matching");
    await page.locator("#launch-preset").selectOption("preset-1");
    assert.equal(await page.locator("#launch-budget").inputValue(), "60");
    await page.locator("#launch-campaign").selectOption("790");
    assert(await page.locator("#launch-budget").isDisabled());
    await page.locator("#launch-campaign").selectOption("789");
    await page.locator("#launch-template").click();
    assert.equal(
      await page.getByRole("group", { name: "Favorisierte Adsets", exact: true }).getByRole("option").count(),
      1
    );
    await search.fill("CBO");
    await search.press("Enter");
    assert.equal(
      await page.locator("#launch-campaign").inputValue(),
      "789",
      "Source template must not change destination campaign"
    );
    assert.equal(await page.locator("#launch-budget").inputValue(), "45.00");
    assert.equal(await page.locator("#launch-preset").inputValue(), "");
    await page.locator("#launch-template").click();
    await search.fill("Website");
    await search.press("ArrowDown");
    await search.press("ArrowUp");
    await search.press("Enter");
    assert.match(
      await page.locator("#launch-template").innerText(),
      /Sales - Deutschland/,
      "Keyboard selection follows favorites-first order"
    );
    await page.locator("#launch-preset").selectOption("preset-1");
    await page.getByRole("button", { name: "Formatpaar trennen", exact: true }).click();
    await page.getByRole("heading", { name: "Anzeigen (2)", exact: true }).waitFor();
    await page.locator('select[id$="-storyFileId"]').first().selectOption("story");
    await page.getByRole("heading", { name: "Anzeigen (1)", exact: true }).waitFor();
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
      await page.locator("#launch-template").click();
      const popup = page.getByRole("dialog", { name: "Referenz-Adset", exact: true });
      await popup.waitFor();
      await page.waitForTimeout(150);
      const popupBounds = await popup.evaluate((element) => ({
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
        width: innerWidth,
        content: element.scrollWidth,
        container: element.clientWidth
      }));
      assert(
        popupBounds.left >= 0 &&
          popupBounds.right <= popupBounds.width &&
          popupBounds.content <= popupBounds.container + 1,
        `Dropdown overflow at ${width}: ${JSON.stringify(popupBounds)}`
      );
      await page.screenshot({ path: path.join(output, `dropdown-${width}.png`) });
      await search.press("Escape");
    }
    await page.getByRole("button", { name: "Pausiert auf Meta erstellen", exact: true }).click();
    await page.getByText("Test-Unterbrechung", { exact: true }).waitFor();
    assert.equal(submitted.groups.length, 1);
    assert.equal(submitted.name, expectedName);
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
    visualFixture = true;
    await page.goto(url, { waitUntil: "networkidle" });
    assert.equal(await page.locator('#launch-campaign option[value="791"]').count(), 0);
    assert(await page.getByRole("radio", { name: "Direkt aktivieren", exact: true }).isDisabled());
    await page.locator("#launch-campaign").selectOption("790");
    await page.getByRole("radio", { name: "Direkt aktivieren", exact: true }).check();
    await page.waitForLoadState("networkidle");
    assert(await page.getByRole("button", { name: "Erstellen und aktivieren", exact: true }).isDisabled());
    const blockers = page.locator("#launch-blockers");
    const matchingReason = blockers.getByRole("link", { name: /Visuell erkannte Formatpaare/ });
    assert(await matchingReason.isVisible(), "The batch's hidden matching gate is explained next to submit");
    assert.equal(await blockers.getByRole("link").count(), 1, "A complete batch only needs the visual review");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.screenshot({ path: path.join(output, `launch-blockers-${width}.png`) });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    await matchingReason.click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "launch-matching-review");
    assert(
      await page.getByRole("button", { name: "Erstellen und aktivieren", exact: true }).isDisabled(),
      "Jumping to review never confirms it"
    );
    await page.getByRole("checkbox", { name: "Formatpaare geprüft", exact: true }).check();
    await blockers.waitFor({ state: "hidden" });
    await page.locator("#launch-pageId").selectOption("");
    const pageReason = blockers.getByRole("link", { name: /Facebook-Seite/ });
    await pageReason.click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "launch-pageId");
    await page.locator("#launch-pageId").selectOption(copy.pageId);
    await page.locator("#launch-landingUrl").fill("example.com");
    assert(await blockers.getByRole("link", { name: /vollständige Ziel-URL/ }).isVisible());
    await page.locator("#launch-landingUrl").fill(copy.landingUrl);
    await blockers.waitFor({ state: "hidden" });
    assert.equal(creationRequests, 1, "Readiness checks and field links never create ads");
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
    job = null;
    visualFixture = false;
    failMedia = true;
    failOptions = true;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("#launch-campaign").selectOption("789");
    await page.locator("#launch-text").fill("Preserve this text through retries");
    assert(await pausedButton.isDisabled());
    const failedMeta = page.getByRole("alert").filter({ hasText: "Test-Meta-Ausfall" });
    const failedMedia = page.getByRole("alert").filter({ hasText: "Test-Drive-Ausfall" });
    assert(await failedMeta.isVisible());
    assert(await failedMedia.isVisible());
    const failedMediaCount = mediaRequests;
    failOptions = false;
    await failedMeta.getByRole("button", { name: "Erneut versuchen", exact: true }).click();
    await failedMeta.waitFor({ state: "hidden" });
    await page.waitForLoadState("networkidle");
    assert.equal(mediaRequests, failedMediaCount, "Retry Meta independently from Drive");
    assert(await pausedButton.isDisabled(), "Cannot create without matched media after a retry");
    failMedia = false;
    await failedMedia.getByRole("button", { name: "Erneut versuchen", exact: true }).click();
    await page.getByRole("heading", { name: "Anzeigen (1)", exact: true }).waitFor();
    assert.equal(await page.locator("#launch-text").inputValue(), "Preserve this text through retries");
    assert.equal(await page.locator("#launch-campaign").inputValue(), "789");
    assert(await pausedButton.isEnabled());
    assert.equal(creationRequests, 2, "Loading and retrying must never create Meta objects");
    failOptions = true;
    pauseCampaignOnRefresh = true;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("#launch-campaign").selectOption("789");
    failOptions = false;
    await failedMeta.getByRole("button", { name: "Erneut versuchen", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Die ausgewählte Kampagne ist nicht mehr aktiv" }).waitFor();
    assert.equal(await page.locator('#launch-campaign option[value="789"]').count(), 0);
    assert(await pausedButton.isDisabled(), "A campaign paused since the last sync cannot be submitted");
    assert.equal(creationRequests, 2);
    pauseCampaignOnRefresh = false;
    regionalFixture = true;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("#launch-campaign").selectOption("789");
    const italy = page.getByRole("checkbox", { name: "Italien", exact: true });
    const austria = page.getByRole("checkbox", { name: "Österreich", exact: true });
    const inheritedLocation = page.getByText("Standorte aus Referenz-Adset: Lana (30 km)", { exact: true });
    assert(await italy.isChecked(), "City-only targeting automatically selects its country");
    assert.equal(await page.locator("#launch-budget").inputValue(), "15.00");
    await inheritedLocation.waitFor();
    await page.getByRole("button", { name: "Deutsch", exact: true }).waitFor();
    await page.getByRole("button", { name: "Testsprache", exact: true }).waitFor();
    assert.equal(await page.getByText("Alle Sprachen", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Testsprache", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Testsprache", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Adset-Einstellungen übernehmen", exact: true }).click();
    await page.getByRole("button", { name: "Testsprache", exact: true }).waitFor();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await inheritedLocation.scrollIntoViewIfNeeded();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, `inherited-location-${width}.png`) });
    }
    await austria.check();
    assert.equal(
      await inheritedLocation.count(),
      0,
      "Changed country selection does not claim inherited city targeting"
    );
    await page.getByRole("button", { name: "Adset-Einstellungen übernehmen", exact: true }).click();
    assert(await italy.isChecked());
    assert(!(await austria.isChecked()));
    await inheritedLocation.waitFor();
    await page.locator("#launch-template").click();
    await search.fill("9790");
    await search.press("Enter");
    assert(await austria.isChecked());
    assert(!(await italy.isChecked()));
    assert(
      await page.getByText("Alle Sprachen", { exact: true }).isVisible(),
      "Unrestricted source clears inherited language restrictions"
    );
    await page.locator("#launch-template").click();
    await search.fill("9789");
    await search.press("Enter");
    assert(await italy.isChecked());
    await page
      .getByRole("status")
      .filter({ hasText: "Anzeigentexte aus dem Referenz-Adset" })
      .waitFor({ state: "hidden" });
    assert(await pausedButton.isEnabled());
    await pausedButton.click();
    await page.getByText("Pausiert erstellt", { exact: true }).waitFor();
    assert.deepEqual(submitted.settings.countries, ["IT"]);
    assert.equal(submitted.settings.dailyBudget, "15.00");
    assert.deepEqual(submitted.settings.locales, [
      { id: 5, name: "Deutsch" },
      { id: 9999, name: "Testsprache" }
    ]);
    assert.equal(creationRequests, 3);
    job = null;
    regionalFixture = false;
    liveLanguageIds = [9999];
    failOptions = true;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("#launch-campaign").selectOption("789");
    await page.locator("#language-search").fill("Deu");
    await page.getByRole("button", { name: "Deutsch", exact: true }).click();
    failOptions = false;
    await failedMeta.getByRole("button", { name: "Erneut versuchen", exact: true }).click();
    await page.waitForLoadState("networkidle");
    assert(await page.getByRole("button", { name: "Deutsch", exact: true }).isVisible());
    assert.equal(
      await page.getByRole("button", { name: "Testsprache", exact: true }).count(),
      0,
      "Live refresh must preserve manual language selection"
    );
    await page.getByRole("button", { name: "Adset-Einstellungen übernehmen", exact: true }).click();
    await page.getByRole("button", { name: "Testsprache", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Deutsch", exact: true }).count(), 0);
    regionalFixture = true;
    liveLanguageIds = null;
    failLocaleNames = true;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("#launch-campaign").selectOption("789");
    const nameError = page.getByText("Sprachnamen nicht verfügbar. Die Sprachwahl bleibt erhalten.", { exact: true });
    await nameError.waitFor();
    assert(await page.getByRole("button", { name: "Meta-Sprache 5", exact: true }).isVisible());
    assert(await page.getByRole("button", { name: "Meta-Sprache 9999", exact: true }).isVisible());
    assert.equal(await page.getByText("Alle Sprachen", { exact: true }).count(), 0);
    assert(await pausedButton.isEnabled(), "Language name errors must not discard selected IDs or block creation");
    failLocaleNames = false;
    await page.getByRole("button", { name: "Erneut versuchen", exact: true }).click();
    await page.getByRole("button", { name: "Deutsch", exact: true }).waitFor();
    await page.getByRole("button", { name: "Testsprache", exact: true }).waitFor();
    await nameError.waitFor({ state: "hidden" });
    assert.equal(creationRequests, 3);
    variantFixture = true;
    regionalFixture = false;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("#launch-campaign").selectOption("789");
    const sourcePicker = page.locator("#launch-copy-source");
    await sourcePicker.waitFor();
    const variantField = (base, i) => page.locator(`#launch-${base}${i ? `-${i + 1}` : ""}`);
    for (const [base, key] of [
      ["text", "primaryTexts"],
      ["headline", "headlines"],
      ["description", "descriptions"]
    ]) {
      for (let i = 0; i < 5; i++) assert.equal(await variantField(base, i).inputValue(), variantCopy[key][i]);
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole("heading", { name: "Anzeigentexte und Ziel", exact: true }).evaluate((element) => {
        window.scrollTo(0, element.getBoundingClientRect().top + scrollY - 80);
      });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, `copy-variants-${width}.png`) });
    }
    await sourcePicker.selectOption("9789-single");
    assert.equal(await page.locator("#launch-text").inputValue(), copy.primaryText);
    for (let i = 1; i < 5; i++) {
      assert.equal(await variantField("text", i).inputValue(), "");
      assert.equal(await variantField("headline", i).inputValue(), "");
    }
    for (let i = 0; i < 5; i++) assert.equal(await variantField("description", i).inputValue(), "");
    await sourcePicker.selectOption("9789-full");
    await page.locator("#launch-text-5").fill("Manuell bearbeiteter Text 5");
    await page.locator("#launch-headline-5").fill("Manuelle Headline 5");
    await page.locator("#launch-description-5").fill("Manuelle Beschreibung 5");
    assert.equal(await sourcePicker.inputValue(), "");
    await pausedButton.click();
    await page.getByText("Pausiert erstellt", { exact: true }).waitFor();
    assert.deepEqual(submitted.copy.primaryTexts, [
      ...variantCopy.primaryTexts.slice(0, 4),
      "Manuell bearbeiteter Text 5"
    ]);
    assert.deepEqual(submitted.copy.headlines, [...variantCopy.headlines.slice(0, 4), "Manuelle Headline 5"]);
    assert.deepEqual(submitted.copy.descriptions, [...variantCopy.descriptions.slice(0, 4), "Manuelle Beschreibung 5"]);
    assert.equal(submitted.groups.length, 1, "Text alternatives do not split a matched creative into separate ads");
    assert.equal(submitted.groups[0].storyFileId, "story");
    job = null;
    await page.goto(url, { waitUntil: "networkidle" });
    let releaseCopy, copyStarted;
    const heldCopy = new Promise((resolve) => {
      releaseCopy = resolve;
    });
    const startedCopy = new Promise((resolve) => {
      copyStarted = resolve;
    });
    copyGate = { templateId: "9789", promise: heldCopy, started: copyStarted };
    await page.locator("#launch-campaign").selectOption("789");
    await startedCopy;
    await page.locator("#launch-pageId").selectOption("124");
    await page.locator("#launch-instagramId").selectOption("457");
    await page.locator("#launch-text").fill("Manuelle Eingabe waehrend Textabruf");
    assert(await pausedButton.isDisabled(), "Pending import cannot launch stale copy");
    releaseCopy();
    await sourcePicker.waitFor();
    assert.equal(await page.locator("#launch-text").inputValue(), "Manuelle Eingabe waehrend Textabruf");
    assert.equal(
      await page.locator("#launch-pageId").inputValue(),
      "124",
      "Late template copy preserves manual Facebook selection"
    );
    assert.equal(await page.locator("#launch-instagramId").inputValue(), "457");
    let releaseStale, staleStarted;
    const heldStale = new Promise((resolve) => {
      releaseStale = resolve;
    });
    const startedStale = new Promise((resolve) => {
      staleStarted = resolve;
    });
    copyGate = { templateId: "9789", promise: heldStale, started: staleStarted };
    await page.getByRole("button", { name: "Adset-Einstellungen übernehmen", exact: true }).click();
    await startedStale;
    await page.locator("#launch-template").click();
    await search.fill("9790");
    await search.press("Enter");
    await sourcePicker.waitFor();
    await page.waitForFunction(() => document.querySelector("#launch-copy-source")?.value === "9790-full");
    releaseStale();
    copyGate = null;
    await page.waitForLoadState("networkidle");
    assert.equal(await sourcePicker.inputValue(), "9790-full", "Late copy from previous adset must be discarded");
    failCopy = true;
    await page.getByRole("button", { name: "Adset-Einstellungen übernehmen", exact: true }).click();
    const copyFailure = page.getByRole("alert").filter({ hasText: "Test-Text-Ausfall" });
    await copyFailure.waitFor();
    assert(await pausedButton.isDisabled());
    await page.locator("#launch-budget").fill("77");
    await page.getByRole("checkbox", { name: "Italien", exact: true }).check();
    failCopy = false;
    await copyFailure.getByRole("button", { name: "Erneut versuchen", exact: true }).click();
    await sourcePicker.waitFor();
    assert.equal(await page.locator("#launch-text-5").inputValue(), variantCopy.primaryTexts[4]);
    assert.equal(await page.locator("#launch-budget").inputValue(), "77", "Text retry preserves edited budget");
    assert(
      await page.getByRole("checkbox", { name: "Italien", exact: true }).isChecked(),
      "Text retry preserves targeting"
    );
    failCopy = true;
    await page.getByRole("button", { name: "Adset-Einstellungen übernehmen", exact: true }).click();
    await copyFailure.waitFor();
    await copyFailure.getByRole("button", { name: "Eigene Texte verwenden", exact: true }).click();
    assert(await pausedButton.isEnabled(), "Manual text fallback requires explicit choice after a failed import");
    assert.equal(creationRequests, 4);
    failCopy = false;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("#launch-campaign").selectOption("789");
    await page.waitForLoadState("networkidle");
    await page.locator("#launch-pageId").selectOption("124");
    await page.locator("#launch-instagramId").selectOption("");
    const refreshIdentities = page.getByRole("button", {
      name: "Facebook- und Instagram-Auswahl aktualisieren",
      exact: true
    });
    failIdentities = true;
    await refreshIdentities.click();
    const identityFailure = page.getByRole("alert").filter({ hasText: "Test-Identitaeten-Ausfall" });
    await identityFailure.waitFor();
    assert(await pausedButton.isDisabled());
    assert(await page.locator("#launch-pageId").isDisabled());
    assert(
      await page
        .locator("#launch-blockers")
        .getByRole("link", { name: /Facebook- und Instagram-Auswahl konnte nicht/ })
        .isVisible()
    );
    failIdentities = false;
    await refreshIdentities.click();
    await identityFailure.waitFor({ state: "hidden" });
    await page.waitForLoadState("networkidle");
    assert.equal(await page.locator("#launch-pageId").inputValue(), "124");
    assert.equal(
      await page.locator("#launch-instagramId").inputValue(),
      "",
      "Explicitly empty Instagram is retained on retry"
    );
    emptyIdentities = true;
    await refreshIdentities.click();
    await page.getByText(/Für dieses Werbekonto ist keine Facebook-Seite verfügbar/).waitFor();
    assert(await pausedButton.isDisabled(), "Unavailable IDs cannot silently remain valid");
    assert(await page.locator('#launch-pageId option[value="124"]').evaluate((option) => option.disabled));
    emptyIdentities = false;
    await refreshIdentities.click();
    await page.getByText(/Für dieses Werbekonto ist keine Facebook-Seite verfügbar/).waitFor({ state: "hidden" });
    await page.waitForLoadState("networkidle");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator("#launch-identities").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `identity-dropdowns-${width}.png`) });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    await pausedButton.click();
    await page.getByText("Pausiert erstellt", { exact: true }).waitFor();
    assert.equal(submitted.copy.pageId, "124");
    assert.equal(submitted.copy.instagramId, "");
    job = null;
    await page.goto(url, { waitUntil: "networkidle" });
    let releaseIdentity, identityStarted;
    const heldIdentity = new Promise((resolve) => {
      releaseIdentity = resolve;
    });
    const identityRequested = new Promise((resolve) => {
      identityStarted = resolve;
    });
    identityGate = { accountId: "account-b", promise: heldIdentity, started: identityStarted };
    await page.locator("#launch-account").selectOption("account-b");
    await identityRequested;
    assert(await page.locator("#launch-pageId").isDisabled(), "Old account identities are not usable while switching");
    await page.locator("#launch-account").selectOption("account-a");
    await page.locator('#launch-pageId option[value="123"]:not([disabled])').waitFor({ state: "attached" });
    releaseIdentity();
    identityGate = null;
    await page.waitForLoadState("networkidle");
    assert.equal(
      await page.locator('#launch-pageId option[value="223"]').count(),
      0,
      "Late identity response from a previous account is discarded"
    );
    assert.equal(creationRequests, 5);
    const cancelledJob = {
      id: "cancelled-rouge",
      accountId: "account-a",
      metaAccountId: "act_111",
      folderId: "folder",
      campaignId: "789",
      name: "Cancelled Rouge",
      status: "cancelled",
      controlStatus: "cancel",
      activate: true,
      state: {
        adsetId: "100",
        media: { feed: { imageHash: "old" } },
        ads: { first: { creativeId: "200" } },
        step: "ad"
      },
      error: "Wähle ein Instagram-Konto oder eine Facebook-Seite aus.",
      adCount: 1,
      fileCount: 2,
      updatedAt: new Date().toISOString(),
      retryDraft: {
        campaignId: "789",
        templateId: "9789",
        settings: { dailyBudget: "83", countries: ["IT"], locales: [{ id: 5, name: "Deutsch" }] },
        copy: { ...variantCopy, pageId: "124", instagramId: "" }
      }
    };
    job = structuredClone(cancelledJob);
    visualFixture = true;
    await page.goto(url, { waitUntil: "networkidle" });
    const restart = page.getByRole("button", { name: "Einstellungen korrigieren und neu erstellen", exact: true });
    await restart.waitFor();
    assert.equal(await page.getByText(/Direkte Aktivierung ist beauftragt und läuft/).count(), 0);
    assert.equal(await page.locator("#launch-campaign").count(), 0);
    assert.equal(creationRequests, 5, "Viewing a cancelled job cannot start another upload");
    await page.setViewportSize({ width: 390, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, "cancelled-retry-action-390.png") });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.evaluate(() => {
      const location = new URL(window.location.href);
      location.searchParams.set("jobId", "cancelled-rouge");
      window.history.replaceState(window.history.state, "", location);
    });
    await restart.click();
    assert.equal(new URL(page.url()).searchParams.has("jobId"), false, "Old job deep link is cleared for retries");
    await page.locator("#launch-campaign").waitFor();
    assert.equal(await page.locator("#launch-campaign").inputValue(), "789");
    assert.equal(await page.locator("#launch-budget").inputValue(), "83");
    assert(await page.getByRole("checkbox", { name: "Italien", exact: true }).isChecked());
    assert.equal(await page.locator("#launch-text-5").inputValue(), variantCopy.primaryTexts[4]);
    assert.equal(await page.locator("#launch-headline-5").inputValue(), variantCopy.headlines[4]);
    assert.equal(await page.locator("#launch-description-5").inputValue(), variantCopy.descriptions[4]);
    assert.equal(await page.locator("#launch-pageId").inputValue(), "124");
    assert(await page.getByRole("link", { name: "Vorheriges Adset in Meta öffnen" }).isVisible());
    assert(await pausedButton.isDisabled(), "Fresh media pairing must be confirmed again");
    await page.locator("#launch-instagramId").selectOption("457");
    await page.getByRole("checkbox", { name: "Formatpaare geprüft", exact: true }).check();
    assert(await pausedButton.isEnabled(), "Corrected cancelled batch is not stuck on its old job");
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, `cancelled-retry-${width}.png`) });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    await pausedButton.click();
    await page.getByText("Pausiert erstellt", { exact: true }).waitFor();
    assert.equal(submitted.activate, false, "Old activation choice is never silently reused");
    assert.equal(submitted.campaignId, cancelledJob.campaignId);
    assert.equal(submitted.copy.instagramId, "457");
    assert.equal(submitted.copy.primaryTexts[4], variantCopy.primaryTexts[4]);
    assert.equal(job.id, "job-1", "A separate job is created; cancelled history is not resumed");
    assert.equal(creationRequests, 6);
    job = { ...cancelledJob, retryDraft: undefined, state: { ...cancelledJob.state, inFlight: "ad:first" } };
    await page.goto(url, { waitUntil: "networkidle" });
    assert.equal(await restart.count(), 0, "Uncertain cancelled attempt cannot be restarted");
    await page.getByText(/ein neuer Versuch ist zum Schutz vor doppelten Anzeigen gesperrt/).waitFor();
    assert.equal(creationRequests, 6);
    job = null;
    visualFixture = false;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("#launch-campaign").selectOption("789");
    await page.waitForLoadState("networkidle");
    await page.locator("#launch-instagramId").selectOption("17841402245652920");
    assert.equal(
      await page.locator("#launch-instagramId option:checked").textContent(),
      "@kohl_test (17841402245652920)"
    );
    partialIdentities = true;
    await refreshIdentities.click();
    const partialIdentityWarning = page
      .getByRole("alert")
      .filter({ hasText: "Verbundene Instagram-Konten konnten nicht geladen werden" });
    await partialIdentityWarning.waitFor();
    assert.equal(await page.locator("#launch-instagramId").inputValue(), "17841402245652920");
    assert(await pausedButton.isEnabled(), "Verified page-linked identities remain usable after a partial failure");
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator("#launch-identities").evaluate((element) => element.scrollIntoView({ block: "center" }));
      await page.screenshot({ path: path.join(output, `connected-instagram-${width}.png`) });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    partialIdentities = false;
    await refreshIdentities.click();
    await partialIdentityWarning.waitFor({ state: "hidden" });
    await pausedButton.click();
    await page.getByText("Pausiert erstellt", { exact: true }).waitFor();
    assert.equal(submitted.copy.instagramId, "17841402245652920");
    assert.equal(creationRequests, 7);
    job = null;
    const queueClient = "11111111-1111-4111-8111-111111111111";
    const queueJobs = ["running", "pending", "paused", "failed", "review", "completed", "cancelled"].map(
      (status, index) => ({
        id: `queue-${index}`,
        client_id: queueClient,
        client_name: "Karlo Testpartner",
        ad_account_id: "account-a",
        account_name: "Meta Testkonto",
        meta_account_id: "act_111",
        drive_folder_id: `folder-${index}`,
        name: `18.09.2026_Batch ${index + 1}`,
        status,
        control_status: "run",
        queue_enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        queued_at: new Date().toISOString(),
        error:
          status === "failed"
            ? "Video konnte nicht verarbeitet werden."
            : status === "review"
              ? "Meta-Antwort unklar. Bitte prüfen."
              : null,
        lease_until: null,
        step: status === "completed" ? "done" : "processing",
        adset_id: "123",
        activate: false,
        activated: false,
        activation_started: false,
        ad_count: 3,
        file_count: 6,
        ads_done: status === "completed" ? 3 : 0,
        files_done: status === "completed" ? 6 : 2,
        queue_position: index < 2 ? index + 1 : null
      })
    );
    let queueActionCount = 0;
    let queueReadCount = 0;
    await page.route("**/api/batch-uploads?**", async (route) => {
      queueReadCount++;
      const params = new URL(route.request().url()).searchParams;
      const statuses = {
        active: ["pending", "running"],
        attention: ["paused", "failed", "review"],
        completed: ["completed", "cancelled"]
      };
      const selected = statuses[params.get("status")];
      let queuePosition = 0;
      for (const job of queueJobs)
        job.queue_position = ["pending", "running"].includes(job.status) ? ++queuePosition : null;
      const jobs = queueJobs.filter((job) => !selected || selected.includes(job.status));
      await route.fulfill({
        json: {
          jobs,
          total: jobs.length,
          page: 0,
          clients: [{ id: queueClient, name: "Karlo Testpartner" }],
          runtime: {
            enabled: true,
            scheduler_seen_at: new Date().toISOString(),
            heartbeat_at: new Date().toISOString(),
            last_error: null
          }
        }
      });
    });
    await page.route(`**/api/clients/${queueClient}/batches/launch/queue-*`, async (route) => {
      assert.equal(route.request().method(), "POST");
      const action = route.request().postDataJSON().action;
      const id = new URL(route.request().url()).pathname.split("/").at(-1);
      const job = queueJobs.find((item) => item.id === id);
      queueActionCount++;
      job.status = action === "pause" ? "paused" : action === "resume" ? "pending" : "cancelled";
      job.control_status = action === "resume" ? "run" : action;
      await route.fulfill({ json: { job: { id: job.id, status: job.status } } });
    });
    await page.goto(`${origin}/uploads`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Batch-Uploads", exact: true }).waitFor();
    await page.getByText("Worker bereit", { exact: true }).waitFor();
    const firstQueueRow = page.getByRole("row").filter({ hasText: "18.09.2026_Batch 1" });
    assert.equal(await page.locator("tbody tr").count(), 2);
    await firstQueueRow.getByRole("button", { name: "Upload anhalten", exact: true }).click();
    await firstQueueRow.waitFor({ state: "hidden" });
    await page.getByRole("tab", { name: "Handlungsbedarf", exact: true }).click();
    await firstQueueRow.waitFor();
    await firstQueueRow.getByRole("button", { name: "Upload fortsetzen", exact: true }).click();
    await firstQueueRow.waitFor({ state: "hidden" });
    const reviewRow = page.getByRole("row").filter({ hasText: "18.09.2026_Batch 5" });
    assert.equal(await reviewRow.getByRole("button", { name: "Upload fortsetzen", exact: true }).count(), 0);
    await page.getByRole("tab", { name: "Warteschlange", exact: true }).click();
    await firstQueueRow.waitFor();
    await firstQueueRow.getByRole("button", { name: "Upload abbrechen", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Beibehalten", exact: true }).click();
    assert.equal(queueActionCount, 2, "Dismissing cancellation does not mutate the job");
    await firstQueueRow.getByRole("button", { name: "Upload abbrechen", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Upload abbrechen", exact: true }).click();
    await firstQueueRow.waitFor({ state: "hidden" });
    assert.equal(queueActionCount, 3);
    await page.getByRole("tab", { name: "Alle", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 7);
    await page.locator("#upload-client").selectOption(queueClient);
    await page.waitForLoadState("networkidle");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        "Upload page has no viewport overflow"
      );
      await page.screenshot({ path: path.join(output, `upload-queue-${width}.png`), fullPage: true });
    }
    const readsBeforePolling = queueReadCount;
    await page.waitForTimeout(5200);
    assert(queueReadCount > readsBeforePolling, "Status polling continues without mutation requests");
    assert.equal(queueActionCount, 3, "Polling is read-only");
    assert.deepEqual(errors, [], "Browser exceptions");
    console.log(
      "PASS cancelled retry, preserved settings, corrected identities, duplicate/activation protection, 5x3 copy variants, source selection, stale responses, recovery, languages, countries, progressive loading, matching, presets, favorites and activation confirmation"
    );
    console.log("Screenshots:", output);
  } catch (error) {
    const failedPage = browser?.contexts()[0]?.pages()[0];
    if (failedPage) {
      console.error(
        await failedPage
          .locator("body")
          .innerText()
          .catch(() => "Page unavailable")
      );
      await failedPage.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
    }
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
