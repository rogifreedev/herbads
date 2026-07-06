# i18n Deutsch/Italienisch Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Komplette UI zweisprachig (Deutsch Default, Italienisch), Globus-Dropdown in der Topbar, Sprachwahl per Cookie persistiert.

**Architecture:** next-intl v4 ohne i18n-Routing (Cookie `NEXT_LOCALE`, gelesen in `i18n/request.ts`). Kataloge `messages/de.json`/`messages/it.json` mit identischer Schlüsselstruktur, abgesichert durch einen Paritäts-Test. Migration in Etappen: Infrastruktur → Chrome → Seiten; die App bleibt nach jeder Etappe voll funktionsfähig und wird pro Etappe committet und gepusht.

**Tech Stack:** Next.js 16 (App Router, Turbopack), next-intl ^4, React 19, vitest 4, Radix DropdownMenu (vorhanden), lucide-react (vorhanden).

**Spec:** `docs/superpowers/specs/2026-07-06-i18n-german-italian-design.md`

**Arbeitsverzeichnis:** `c:\Users\Rogi Free\Documents\codex\herbads` (direkt auf `main`, wie im Projekt üblich; Push nach jeder Etappe deployt auf Vercel).

**Verifikation pro Task (sofern nicht anders angegeben):** `npm run test`, `npm run typecheck`, `npm run lint` — alle müssen grün sein. Hinweis: `npm run build` schlägt lokal beim Prerendern env-bedingt fehl (vorbestehend, dokumentiert); der Vercel-Build ist der Referenz-Build.

**Übersetzungs-Glossar (konsistent verwenden):**

| Deutsch | Italienisch | Anmerkung |
|---|---|---|
| Kunde/Kunden | Cliente/Clienti | |
| Einstellungen | Impostazioni | |
| Wissensdatenbank | Base di conoscenza | |
| Ausgaben (Spend) | Spesa | KPI-Kürzel wie „Spend", „CPC", „CPM", „ROAS", „CTR" bleiben unübersetzt |
| Creative(s), Batch(es), Angle(s), Funnel, Hook, Iteration(s) | unverändert | Fachbegriffe der Branche, bleiben englisch |
| Laden/Lädt… | Caricamento… | |
| Speichern | Salva | |
| Abbrechen | Annulla | |
| Suchen | Cerca | |
| Keine Daten | Nessun dato | |
| Zeitraum | Periodo | |
| Abmelden | Esci | |

---

## Chunk 1: Infrastruktur

### Task 1: next-intl installieren und in next.config.ts registrieren

**Files:**
- Modify: `next.config.ts`
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Package installieren**

Run: `npm install next-intl`
Expected: exit 0, next-intl ^4.x in dependencies.

- [ ] **Step 2: next.config.ts wrappen**

Kompletter neuer Inhalt von `next.config.ts`:

```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "mammoth"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.fbcdn.net"
      },
      {
        protocol: "https",
        hostname: "*.cdninstagram.com"
      }
    ]
  }
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. (Der Dev-Server würde jetzt warnen, dass `i18n/request.ts` fehlt — kommt in Task 3.)

- [ ] **Step 4: Commit**

```bash
git add next.config.ts package.json package-lock.json
git commit -m "feat(i18n): install next-intl and register plugin"
```

### Task 2: Locale-Konstanten + Paritäts-Test + Start-Kataloge

**Files:**
- Create: `lib/i18n-locales.ts`
- Create: `messages/de.json`
- Create: `messages/it.json`
- Test: `tests/i18n-messages.test.ts`

- [ ] **Step 1: Failing Test schreiben**

`tests/i18n-messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import de from "@/messages/de.json";
import it from "@/messages/it.json";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale } from "@/lib/i18n-locales";

function collectKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    collectKeys(child, prefix ? `${prefix}.${key}` : key)
  );
}

describe("i18n locales", () => {
  it("defines de as default and de/it as supported", () => {
    expect(DEFAULT_LOCALE).toBe("de");
    expect(SUPPORTED_LOCALES).toEqual(["de", "it"]);
    expect(isSupportedLocale("de")).toBe(true);
    expect(isSupportedLocale("it")).toBe(true);
    expect(isSupportedLocale("en")).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });
});

describe("message catalogs", () => {
  it("de.json and it.json have identical key sets", () => {
    const deKeys = collectKeys(de).sort();
    const itKeys = collectKeys(it).sort();
    expect(itKeys).toEqual(deKeys);
  });

  it("no empty translations in either catalog", () => {
    function emptyKeys(catalog: Record<string, unknown>) {
      return collectKeys(catalog).filter((key) => key.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], catalog) === "");
    }
    expect(emptyKeys(de)).toEqual([]);
    expect(emptyKeys(it)).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npm run test`
Expected: FAIL (Cannot find module `@/messages/de.json` bzw. `@/lib/i18n-locales`).

- [ ] **Step 3: lib/i18n-locales.ts anlegen**

```ts
export const SUPPORTED_LOCALES = ["de", "it"] as const;
export const DEFAULT_LOCALE = "de";

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
```

Hinweis: bewusst ohne `server-only`, damit der Vitest-Import und Client-Komponenten funktionieren. Keine Secrets enthalten.

- [ ] **Step 4: Start-Kataloge anlegen**

`messages/de.json`:

```json
{
  "common": {
    "loading": "Lädt…",
    "save": "Speichern",
    "cancel": "Abbrechen",
    "search": "Suchen",
    "noData": "Keine Daten"
  },
  "topbar": {
    "subtitle": "Agenturweite Performance und Creative Intelligence",
    "metaSynced": "Meta synced",
    "notifications": "Benachrichtigungen",
    "settings": "Einstellungen",
    "logout": "Abmelden",
    "language": "Sprache",
    "german": "Deutsch",
    "italian": "Italiano"
  },
  "nav": {
    "dashboard": "Dashboard",
    "metaAds": "META Ads",
    "creatives": "Creatives",
    "iterations": "Iterations",
    "settings": "Einstellungen",
    "competitors": "Competitors",
    "predictionTool": "Prediction Tool",
    "analysis": "Analyse",
    "history": "History",
    "batches": "Batches",
    "reports": "Reports",
    "clients": "Kunden",
    "clientProfile": "Kundenprofil",
    "knowledgeBase": "Wissensdatenbank",
    "appSettings": "App Einstellungen",
    "brandTagline": "Creative Intelligence",
    "metaSync": "Meta Sync",
    "dailySyncReady": "Daily Sync bereit",
    "live": "Live",
    "library": "Library"
  }
}
```

`messages/it.json`:

```json
{
  "common": {
    "loading": "Caricamento…",
    "save": "Salva",
    "cancel": "Annulla",
    "search": "Cerca",
    "noData": "Nessun dato"
  },
  "topbar": {
    "subtitle": "Performance dell'agenzia e Creative Intelligence",
    "metaSynced": "Meta sincronizzato",
    "notifications": "Notifiche",
    "settings": "Impostazioni",
    "logout": "Esci",
    "language": "Lingua",
    "german": "Deutsch",
    "italian": "Italiano"
  },
  "nav": {
    "dashboard": "Dashboard",
    "metaAds": "META Ads",
    "creatives": "Creatives",
    "iterations": "Iterations",
    "settings": "Impostazioni",
    "competitors": "Competitors",
    "predictionTool": "Prediction Tool",
    "analysis": "Analisi",
    "history": "Cronologia",
    "batches": "Batches",
    "reports": "Report",
    "clients": "Clienti",
    "clientProfile": "Profilo cliente",
    "knowledgeBase": "Base di conoscenza",
    "appSettings": "Impostazioni app",
    "brandTagline": "Creative Intelligence",
    "metaSync": "Meta Sync",
    "dailySyncReady": "Sync giornaliero pronto",
    "live": "Live",
    "library": "Library"
  }
}
```

Wichtig: „Deutsch"/„Italiano" bleiben in beiden Katalogen Eigennamen (jede Sprache in ihrer eigenen Schreibweise), damit man die eigene Sprache im Dropdown immer erkennt.

- [ ] **Step 5: Test laufen lassen — muss bestehen**

Run: `npm run test`
Expected: PASS (alle Tests, auch die 4 bestehenden).

- [ ] **Step 6: Commit**

```bash
git add lib/i18n-locales.ts messages/ tests/i18n-messages.test.ts
git commit -m "feat(i18n): add locale constants, catalogs and parity test"
```

### Task 3: Request-Konfiguration + Provider im Root-Layout

**Files:**
- Create: `i18n/request.ts`
- Modify: `app/layout.tsx`

- [ ] **Step 1: i18n/request.ts anlegen**

```ts
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n-locales";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const candidate = cookieStore.get("NEXT_LOCALE")?.value;
  const locale = isSupportedLocale(candidate) ? candidate : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
```

- [ ] **Step 2: app/layout.tsx umbauen**

Änderungen gegenüber dem Bestand (Fonts, Toaster, NavigationProgress, TooltipProvider bleiben unverändert):

```tsx
import type { Metadata } from "next";
import { Geist_Mono, Oswald, Work_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { NavigationProgress } from "@/components/navigation-progress";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const workSans = Work_Sans({ subsets: ["latin"], variable: "--font-work-sans" });
const oswald = Oswald({ subsets: ["latin"], variable: "--font-oswald" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Herb Ads",
  description: "Creative Intelligence fuer Meta Ads"
};

export const preferredRegion = "fra1";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <html lang={locale}>
      <body className={`${workSans.variable} ${oswald.variable} ${geistMono.variable} ${workSans.className}`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
          <Toaster richColors position="top-right" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verifizieren**

Run: `npm run typecheck` und `npm run lint`
Expected: beide exit 0.

Run (falls kein Dev-Server läuft, zuerst `npm run dev` im Hintergrund starten): `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login`
Expected: `200`.

- [ ] **Step 4: Commit**

```bash
git add i18n/request.ts app/layout.tsx
git commit -m "feat(i18n): resolve locale from cookie and provide messages"
```

### Task 4: Server Action für Sprachwechsel

**Files:**
- Create: `app/actions/locale.ts`

- [ ] **Step 1: Action anlegen**

```ts
"use server";

import { cookies } from "next/headers";
import { isSupportedLocale } from "@/lib/i18n-locales";

const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function setLocale(locale: string) {
  if (!isSupportedLocale(locale)) return;

  const cookieStore = await cookies();
  cookieStore.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax"
  });
}
```

(Die Validierungslogik `isSupportedLocale` ist bereits durch Task 2 getestet; die Action selbst ist eine dünne Hülle um `cookies()` und wird über den manuellen Test in Task 5 verifiziert.)

- [ ] **Step 2: Verifizieren + Commit**

Run: `npm run typecheck`
Expected: exit 0.

```bash
git add app/actions/locale.ts
git commit -m "feat(i18n): add setLocale server action"
```

### Task 5: LanguageSwitcher + Topbar-Integration

**Files:**
- Create: `components/language-switcher.tsx`
- Modify: `components/topbar.tsx`

- [ ] **Step 1: LanguageSwitcher anlegen**

```tsx
"use client";

import { Check, Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/app/actions/locale";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n-locales";

const LOCALE_LABEL_KEYS: Record<SupportedLocale, "german" | "italian"> = {
  de: "german",
  it: "italian"
};

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("topbar");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function selectLocale(nextLocale: SupportedLocale) {
    if (nextLocale === locale) return;
    startTransition(async () => {
      await setLocale(nextLocale);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="text-foreground/65 hover:text-foreground" aria-label={t("language")} disabled={isPending}>
          <Globe className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LOCALES.map((supportedLocale) => (
          <DropdownMenuItem key={supportedLocale} onSelect={() => selectLocale(supportedLocale)} className={supportedLocale === locale ? "font-semibold text-primary" : undefined}>
            {t(LOCALE_LABEL_KEYS[supportedLocale])}
            {supportedLocale === locale ? <Check className="ml-auto h-4 w-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: In Topbar einhängen und Topbar-Strings übersetzen**

In `components/topbar.tsx`:
1. Imports ergänzen: `import { useTranslations } from "next-intl";` und `import { LanguageSwitcher } from "@/components/language-switcher";`
2. Im Component-Body: `const t = useTranslations("topbar");`
3. `<LanguageSwitcher />` einfügen **zwischen** dem Bell-Button und dem Settings-Link.
4. Hartkodierte Strings ersetzen: Subtitle → `{t("subtitle")}`, „Meta synced" → `{t("metaSynced")}`, `aria-label="Benachrichtigungen"` → `aria-label={t("notifications")}`, `aria-label="Einstellungen"` → `aria-label={t("settings")}`, `aria-label="Abmelden"` → `aria-label={t("logout")}`.

- [ ] **Step 3: Verifizieren (automatisch + manuell)**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: alles grün.

Manuell (Browser, eingeloggt): Globus rechts oben sichtbar → „Italiano" wählen → Topbar-Subtitle wechselt auf Italienisch, `<html lang="it">` im Inspector, Reload behält Italienisch. Zurück auf „Deutsch" → alles wieder deutsch.

- [ ] **Step 4: Commit + Push (Etappe 1 live)**

```bash
git add components/language-switcher.tsx components/topbar.tsx
git commit -m "feat(i18n): add globe language switcher to topbar"
git push origin main
```

## Chunk 2: Chrome (Sidebar, Navigation, Seitentitel, Tabs)

### Task 6: Navigation und Seitentitel auf Message-Keys umstellen

**Files:**
- Modify: `lib/navigation.ts`
- Modify: `lib/routes.ts` (nur `getPageTitle`)
- Modify: `components/sidebar-nav.tsx`
- Modify: `components/sidebar-nav-item.tsx` (Anzeige der Titel)
- Modify: `components/topbar.tsx` (Titel-Übersetzung)
- Modify: `messages/de.json`, `messages/it.json`

- [ ] **Step 1: navigation.ts — `title` wird Message-Key**

`NavItem.title` enthält künftig einen Key unterhalb von `nav` (z. B. `"dashboard"`, `"metaAds"`). Die deutschen Klartexte aus `lib/navigation.ts:12-81` wandern als Werte nach `messages/de.json` unter `nav.*` (die meisten existieren seit Task 2), italienische Pendants nach `it.json`. Neue Keys dabei: `nav.adSet`, `nav.landingpages`, `nav.batchPerformance`, `nav.creativeLearning`, `nav.competitorIterations`, `nav.predictionHistory`, `nav.batchSettings`, `nav.creativeAngles`, `nav.adIdeas`, `nav.metaAdsSettings`, `nav.clientSettings`, `nav.clientDashboard`.

- [ ] **Step 2: getPageTitle liefert Keys**

Jeder Rückgabewert in `lib/routes.ts:34-58` wird durch den entsprechenden `nav.*`-Key ersetzt (z. B. `"Kunden-Dashboard"` → `"nav.clientDashboard"`, `"Landingpages"` → `"nav.landingpages"`). Signatur bleibt `getPageTitle(pathname: string): string`.

- [ ] **Step 3: Konsumenten übersetzen**

- `components/topbar.tsx`: `const tRoot = useTranslations();` und `{tRoot(getPageTitle(pathname))}` statt `{getPageTitle(pathname)}`.
- `components/sidebar-nav-item.tsx`: analog — `useTranslations("nav")` und `t(item.title)` an allen Stellen, die `item.title`/`child.title` rendern. `key={item.title}` funktioniert mit Keys unverändert.
- `components/sidebar-nav.tsx`: „Creative Intelligence" → `t("brandTagline")`, „Meta Sync" → `t("metaSync")`, „Daily Sync bereit" → `t("dailySyncReady")`, „Live"-Badge → `t("live")` (via `useTranslations("nav")`).

- [ ] **Step 4: Verifizieren + Commit**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: grün. Manuell: Sidebar + Seitentitel wechseln beim Umschalten.

```bash
git add lib/navigation.ts lib/routes.ts components/sidebar-nav.tsx components/sidebar-nav-item.tsx components/topbar.tsx messages/
git commit -m "feat(i18n): translate navigation, sidebar and page titles"
```

### Task 7: Gemeinsame Komponenten

**Files:**
- Modify: `components/meta-ads-tabs.tsx` (Tab-Labels → `nav.*`)
- Modify: `components/empty-state.tsx`, `components/client-switcher.tsx`, `components/create-client-dialog.tsx`, `components/creative-date-range-picker.tsx` und weitere Komponenten mit deutschen Strings (per Grep ermitteln)
- Modify: `messages/de.json`, `messages/it.json` (Namespace `common` erweitern)

- [ ] **Step 1: Betroffene Komponenten auflisten**

Run: `LC_ALL=C.UTF-8 grep -rlPi "[äöüÄÖÜß]|fuer|laedt|waehle|zurueck|loeschen|verfuegbar|ausgewaehlt|hinzufuegen|uebersicht|uebergreifend|\b(Keine|Noch|Speichern|Abbrechen|Fehler|Suche|Kunde)\b" components/ --include="*.tsx" | sort`
Expected: nicht-leere Liste (~27 Dateien). Eine Fehlermeldung oder leere Ausgabe bedeutet, dass der Befehl selbst fehlgeschlagen ist (z. B. Locale-Problem) — NICHT als „nichts zu migrieren" werten.
Die Liste ist der Arbeitsvorrat für diesen Task (Komponenten, nicht Seiten).

Wichtig: Dieser Codebase schreibt Umlaute überwiegend transliteriert („fuer", „Laedt", „Uebergreifend") — solche Strings sind deutsche UI-Strings und werden genauso migriert (im `de.json` dabei in korrekte Umlaute umwandeln: „fuer" → „für").

- [ ] **Step 2: Komponente für Komponente umstellen**

Muster pro Komponente: Strings in `common` (oder passenden Namespace) beider Kataloge eintragen → `useTranslations` (Client) bzw. `getTranslations` (Server) → `t()`-Aufrufe. Client-Komponenten, die bereits `"use client"` haben, brauchen keine strukturelle Änderung.

- [ ] **Step 3: Verifizieren + Commit + Push (Etappe 2 live)**

Run: `npm run test && npm run typecheck && npm run lint`

```bash
git add components/ messages/
git commit -m "feat(i18n): translate shared components"
git push origin main
```

## Chunk 3: Seiten-Migration

### Arbeitsmuster für alle Seiten-Tasks (8-13)

Für jede Seite gilt dasselbe Vorgehen — hier einmal vollständig am Beispiel `app/(app)/clients/[clientId]/creatives/page.tsx`:

1. **Strings extrahieren:** Alle deutschen UI-Strings der Datei sammeln (Überschriften, Beschreibungen, Button-Labels, Alerts, Empty-States, Tabellen-Header). Beispiel: „Creative Library", „Alle Meta Creatives, Performance KPIs und AI Analysen an einem Ort.", „Noch keine Creatives synchronisiert", …
2. **Keys anlegen:** In `messages/de.json` unter dem Seiten-Namespace (hier `creatives`) eintragen, italienische Übersetzung in `it.json` (Glossar beachten). Key-Stil: camelCase, beschreibend (`title`, `subtitle`, `emptyTitle`, `emptyDescription`, `rankingTitle`).
3. **Seite umstellen:** Server-Komponente: `const t = await getTranslations("creatives");` nach dem Auflösen der params; alle Strings durch `t("...")` ersetzen. In Server-Komponenten importiert man aus `next-intl/server`, in Client-Komponenten `useTranslations` aus `next-intl`.
4. **Interpolation:** Dynamische Teile als Parameter: `t("adCount", { count: creative.adCount })` mit `"adCount": "{count} Ads"` im Katalog.
5. **DB-Werte nicht anfassen:** `creative.name`, `creative.status`, Funnel-Stages aus der DB usw. bleiben unübersetzt (Spec-Entscheidung).
6. **Verifizieren:** `npm run test && npm run typecheck && npm run lint` — der Paritäts-Test erzwingt vollständige it-Übersetzungen.
7. **Commit** pro Task (Dateigruppe), Push am Ende jedes Tasks.

Commit-Message-Muster: `feat(i18n): translate <bereich> pages`

### Task 8: Dashboard-, Analysis- und Reports-Seiten

**Files:** `app/(app)/dashboard/page.tsx`, `app/(app)/analysis/page.tsx`, `app/(app)/reports/page.tsx`, `app/(app)/clients/page.tsx`, `app/(app)/clients/[clientId]/page.tsx`, `app/page.tsx`, zugehörige Karten-/Tabellen-Komponenten (`components/metric-card.tsx`, `components/creative-ranking-table.tsx`, `components/pattern-insights-data-table.tsx`, `components/reports-data-table.tsx`), `messages/*.json` (Namespaces `dashboard`, `analysis`, `reports`, `clients`)

- [ ] Strings extrahieren, Kataloge erweitern, Seiten + Komponenten auf `t()` umstellen (Arbeitsmuster oben)
- [ ] Verifizieren: Tests/Typecheck/Lint grün, beide Sprachen im Browser prüfen
- [ ] Commit + Push

### Task 9: Creative Library, Creative-Detail, Ad Sets

**Files:** `app/(app)/clients/[clientId]/creatives/page.tsx`, `.../creatives/[creativeId]/page.tsx`, `.../adsets/[adSetId]/page.tsx`, zugehörige Komponenten (u. a. `bulk-creative-analysis-button.tsx`, `creative-type-badge.tsx`, `funnel-stage-badge.tsx`), `messages/*.json` (Namespace `creatives`)

- [ ] Umstellen nach Arbeitsmuster
- [ ] Verifizieren
- [ ] Commit + Push

### Task 10: Batches, Angles, Landingpages, Iterations, Ideas

**Files:** `.../batches/page.tsx`, `.../batches/settings/page.tsx`, `.../creatives/batches/page.tsx`, `.../angles/page.tsx`, `.../creatives/landingpages/page.tsx`, `.../iterations/page.tsx`, `.../iterations/[iterationId]/page.tsx`, `.../ideas/page.tsx`, zugehörige Komponenten, `messages/*.json` (Namespaces `batches`, `angles`, `landingpages`, `iterations`, `ideas`)

- [ ] Umstellen nach Arbeitsmuster
- [ ] Verifizieren
- [ ] Commit + Push

### Task 11: Competitors (alle Unterseiten)

**Files:** `.../competitors/page.tsx`, `.../competitors/creatives/page.tsx`, `.../competitors/creatives/[creativeId]/page.tsx`, `.../competitors/iterations/page.tsx`, `.../competitors/iterations/[iterationId]/page.tsx`, `.../competitors/settings/page.tsx`, `components/competitor-*.tsx`, `messages/*.json` (Namespace `competitors`)

- [ ] Umstellen nach Arbeitsmuster
- [ ] Verifizieren
- [ ] Commit + Push

### Task 12: Knowledge, Learning, Prediction Tool, Meta-Settings

**Files:** `.../knowledge/page.tsx`, `.../learning/page.tsx`, `.../prediction-tool/page.tsx`, `.../prediction-tool/history/page.tsx`, `.../prediction-tool/history/[analysisId]/page.tsx`, `.../meta/settings/page.tsx`, `.../settings/page.tsx` (Kundenprofil), zugehörige Komponenten, `messages/*.json` (Namespaces `knowledge`, `learning`, `predictionTool`, `clientSettings`)

- [ ] Umstellen nach Arbeitsmuster
- [ ] Verifizieren
- [ ] Commit + Push

### Task 13: App-Settings, Login, Fehlerseiten

**Files:** `app/(app)/settings/page.tsx`, `app/(auth)/login/page.tsx` (bzw. tatsächlicher Login-Pfad, per Glob ermitteln), `app/not-found.tsx`/Error-Boundaries falls vorhanden, `messages/*.json` (Namespaces `settings`, `auth`, `errors`)

Hinweis Login: Die Login-Seite liegt vor der Authentifizierung; `i18n/request.ts` funktioniert dort identisch (Cookie ist nicht auth-gebunden).

- [ ] Umstellen nach Arbeitsmuster
- [ ] Verifizieren
- [ ] Commit + Push

### Task 14: Abschluss-Sweep + Endabnahme

- [ ] **Step 1: Verbliebene deutsche Strings finden**

Run: `LC_ALL=C.UTF-8 grep -rnPi "[äöüÄÖÜß]|fuer|laedt|waehle|zurueck|loeschen|verfuegbar|ausgewaehlt|hinzufuegen|uebersicht|uebergreifend|\b(Keine|Noch|Speichern|Abbrechen|Fehler|Kunden?)\b" app/ components/ --include="*.tsx" --include="*.ts" | grep -v "\.test\." | grep -vE "^[[:space:]]*//"`
Expected beim ersten Lauf: nicht-leere Liste (~170 Zeilen). Fehlermeldung oder von Beginn an leere Ausgabe = Befehl fehlgeschlagen, nicht „sauber".
(Transliterierte Umlaute — „fuer", „Laedt" usw. — zählen als deutsche Strings, siehe Task 7.) Jede Fundstelle entweder migrieren oder begründet belassen (z. B. DB-Fallback-Fehlermeldungen aus `lib/` — diese sind laut Spec-Scope UI-nah, aber in `lib/`-Dateien mit `server-only`; sie werden migriert, sofern sie im UI landen: die `error`-Strings aus `lib/creatives.ts` etc. erscheinen in Alerts → Namespace `errors`).

- [ ] **Step 2: Volle Verifikation**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: alles grün.

- [ ] **Step 3: Manueller Durchklick**

Beide Sprachen: Dashboard, Creative Library, ein Creative-Detail, Competitors, Settings. Prüfen: keine Mischsprache, Cookie überlebt Reload, `<html lang>` korrekt.

- [ ] **Step 4: Finaler Commit + Push**

```bash
git add -A
git commit -m "feat(i18n): complete German/Italian translation sweep"
git push origin main
```

- [ ] **Step 5: Vercel-Deployment prüfen**

Auf herbads.vercel.app einloggen, Globus testen. Erst danach ist der Plan abgeschlossen.
