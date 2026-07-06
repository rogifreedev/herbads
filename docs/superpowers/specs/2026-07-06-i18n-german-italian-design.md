# i18n: Deutsch (Default) + Italienisch mit Globus-Umschalter

**Datum:** 2026-07-06
**Status:** Entwurf genehmigt (Ansatz A)

## Ziel

Die komplette UI der Herb-Ads-App ist zweisprachig: Deutsch (Default) und
Italienisch. Ein Globus-Icon rechts oben in der Topbar öffnet ein Dropdown
zum Umschalten. Die Wahl bleibt über Sessions erhalten.

## Nicht im Scope

- DB-Inhalte (AI-Analysen, Creative-Namen, Funnel-Stages, Ideen) bleiben deutsch.
- AI-Prompts und API-Routen bleiben unverändert.
- Keine URL-Präfixe (`/it/...`); URLs bleiben wie heute.
- Zahlen-/Währungs-/Datumsformate bleiben im heutigen (deutschen) Format.
- Keine weitere Sprache (Englisch später = eigene Katalogdatei, kein Umbau).

## Architektur

**Library:** `next-intl` ohne i18n-Routing (Cookie-Modus).

**Sprachauflösung:**

1. `next.config.ts` wird mit `createNextIntlPlugin()` gewrappt
   (`createNextIntlPlugin()(nextConfig)`) — dadurch wird `i18n/request.ts`
   als Request-Konfiguration registriert. Ohne diesen Schritt läuft
   next-intl nicht.
2. Cookie `NEXT_LOCALE` (`de` | `it`) wird in `i18n/request.ts` per
   `getRequestConfig` gelesen (Server) und bestimmt die Messages.
3. Fehlt der Cookie oder enthält er einen unbekannten Wert → `de`.
4. `app/layout.tsx` setzt `<html lang={locale}>` und wrappt die App in
   `NextIntlClientProvider` (für Client-Komponenten).

Hinweis: Das Lesen von `cookies()` in `getRequestConfig` macht alle Seiten
dynamisch gerendert. Die App ist als Supabase-Auth-Dashboard bereits
vollständig dynamisch — keine praktische Änderung.

**Sprachwechsel:**

- Server Action `setLocale(locale)` in `app/actions/locale.ts`: validiert
  gegen `["de", "it"]`, setzt den Cookie (`path=/`, `maxAge` 1 Jahr,
  `sameSite=lax`), kein Redirect.
- `LanguageSwitcher` (Client-Komponente): Globe-Icon (lucide-react) als
  Ghost-Icon-Button im bestehenden Topbar-Stil, DropdownMenu (Radix, bereits
  vorhanden) mit „Deutsch" / „Italiano", aktive Sprache mit Häkchen markiert.
  Nach Auswahl: Server Action aufrufen, dann `router.refresh()`.
- Platzierung: Topbar rechts, zwischen Glocke und Settings-Icon.

**Übersetzungskataloge:**

- `messages/de.json` — exakt die heutigen deutschen Texte.
- `messages/it.json` — italienische Übersetzung, identische Schlüsselstruktur.
- Gliederung nach Bereichen: `common`, `nav`, `topbar`, `dashboard`,
  `creatives`, `batches`, `angles`, `landingpages`, `iterations`,
  `competitors`, `knowledge`, `learning`, `predictionTool`, `settings`,
  `clients`, `auth`, `errors`.
- Fehlender Schlüssel in `it.json`: next-intl wirft im Dev eine Warnung und
  rendert den Schlüsselnamen; ein Unit-Test (siehe Testing) verhindert
  Schlüssel-Drift zwischen den Katalogen.

**Verwendung im Code:**

- Server-Komponenten (Seiten): `const t = await getTranslations("dashboard")`.
- Client-Komponenten: `const t = useTranslations("common")`.
- Dynamische Werte über next-intl-Interpolation (`{count}` etc.).
- Texte, die aus der DB kommen, werden unverändert durchgereicht.

## Migrationsstrategie

Phasenweise, App bleibt nach jeder Phase voll funktionsfähig:

1. **Infrastruktur:** next-intl installieren, `next.config.ts` wrappen,
   `i18n/request.ts`, Provider im Layout, Kataloge mit `common` + `topbar`
   + `nav`, LanguageSwitcher in der Topbar. Ab hier ist der Umschalter sichtbar und funktioniert für die
   bereits migrierten Bereiche.
2. **Chrome:** Sidebar, Tabs (`MetaAdsTabs`), Seitentitel, gemeinsame
   Komponenten (EmptyState, Dialoge, Tabellen-Header). Interface-Änderung
   für Seitentitel: `getPageTitle(pathname)` in `lib/routes.ts` liefert
   künftig einen Message-Key (z. B. `"nav.dashboard"`) statt eines
   deutschen Strings; die Topbar übersetzt ihn via
   `useTranslations()`.
3. **Seiten in Etappen:** Dashboard → Creative Library/Detail → restliche
   Tabs (Batches, Angles, Landingpages, Iterations) → Competitors →
   Knowledge/Learning/Prediction → Settings/Login. Pro Etappe: Strings in
   beide Kataloge, Seite auf `t()` umstellen.
4. **Abschluss:** Sweep nach verbliebenen hartkodierten Strings
   (Grep nach deutschen Wörtern in `app/` und `components/`).

## Fehlerbehandlung

- Ungültiger Cookie-Wert → Fallback `de` (in `i18n/request.ts` validiert).
- Server Action mit ungültigem Locale → wird ignoriert (keine Exception
  Richtung Client nötig, Validierung ist ein einfacher Include-Check).
- Fehlende it-Übersetzung → Dev-Warnung durch next-intl; der Schlüssel-
  Paritätstest schlägt im CI/`npm run test` fehl.

## Testing

- **Unit-Test (vitest):** `tests/i18n-messages.test.ts` — beide Kataloge
  haben exakt dieselbe Schlüsselmenge (rekursiv); schlägt fehl, wenn eine
  Übersetzung fehlt oder verwaist. Die Kataloge werden per `import`
  geladen, sodass auch fehlerhaftes JSON den Test fehlschlagen lässt.
- **Bestehende Checks:** `npm run typecheck`, `npm run lint`, Build.
- **Manuell:** Umschalten via Globus auf Dashboard + Creative Library;
  Cookie-Persistenz nach Reload; `<html lang>`-Attribut wechselt.

## Betroffene Einheiten (Interfaces)

| Einheit | Zweck | Interface |
|---|---|---|
| `next.config.ts` | next-intl-Plugin registrieren | `createNextIntlPlugin()(nextConfig)` |
| `i18n/request.ts` | Locale + Messages pro Request auflösen | next-intl `getRequestConfig` |
| `app/actions/locale.ts` | Sprachwechsel persistieren | `setLocale(locale: "de" \| "it"): Promise<void>` |
| `components/language-switcher.tsx` | Globus-Dropdown | Props: keine; nutzt `useLocale()` + Server Action |
| `lib/routes.ts` | Seitentitel als Message-Keys | `getPageTitle(pathname): string` (Message-Key) |
| `messages/de.json`, `messages/it.json` | Übersetzungskataloge | JSON, identische Schlüsselstruktur |
| Seiten/Komponenten | Konsumenten | `getTranslations`/`useTranslations` |
