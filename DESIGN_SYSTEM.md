# Design System

Dieses Dokument definiert den visuellen und strukturellen Aufbau der App. Die App nutzt `shadcn/ui`, Tailwind CSS und die Herb-Media-Brand-Richtung von `https://herb-media.com/de`.

## Design Ziel

Die App soll wie ein internes Agentur-Intelligence-Dashboard wirken: dunkel, klar, hochwertig, datenorientiert und eindeutig als Herb-Media-Tool erkennbar.

Die UI soll nicht wie ein generisches SaaS-Template aussehen. Pinke Brand-Akzente, starke Headlines und ein ruhiger dunkler Arbeitsbereich sind die wichtigsten visuellen Merkmale.

## Brand Quelle

Quelle: `https://herb-media.com/de`

Extrahierte Designmerkmale:

- Dunkle Layouts mit schwarzem Hintergrund.
- Pinke Akzentfarbe fuer Navigation, CTAs und Fokus-Zustaende.
- Gradient-CTAs von Pink zu dunklerem Pink.
- Starke, kompakte Headlines.
- Moderne Sans-Serif-UI-Schrift.
- Abgerundete Buttons und Cards.
- Dezente Hover-Zustaende und klare Kontraste.

## Farbpalette

### Primaerfarben

- Herb Pink: `#e51f76`
- Herb Pink Dark: `#c91b66`
- Herb Pink Hover: `#b01959`

### Dark UI Farben

- App Background: `#000000`
- Sidebar Background: `#000000`
- Topbar Background: `#050505`
- Card Surface: `#111827`
- Muted Surface: `#1f2937`
- Elevated Surface: `#151f2e`
- Border Dark: `#263241`

### Textfarben

- Text Primary: `#ffffff`
- Text Secondary: `rgba(255,255,255,0.72)`
- Text Muted: `rgba(255,255,255,0.55)`
- Text Disabled: `rgba(255,255,255,0.35)`

### Statusfarben

- Success: `#22c55e`
- Warning: `#f59e0b`
- Danger: `#ef4444`
- Info: `#3b82f6`

## CSS Variablen

Diese Tokens sollen nach `shadcn/ui` Initialisierung in `app/globals.css` als Basis genutzt werden.

```css
:root {
  --font-sans: var(--font-work-sans);
  --font-heading: var(--font-oswald);
  --background: 0 0% 0%;
  --foreground: 0 0% 100%;
  --card: 221 39% 11%;
  --card-foreground: 0 0% 100%;
  --popover: 221 39% 11%;
  --popover-foreground: 0 0% 100%;
  --primary: 332 79% 51%;
  --primary-foreground: 0 0% 100%;
  --secondary: 215 28% 17%;
  --secondary-foreground: 0 0% 100%;
  --muted: 215 28% 17%;
  --muted-foreground: 0 0% 70%;
  --accent: 332 79% 51%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;
  --border: 215 28% 22%;
  --input: 215 28% 22%;
  --ring: 332 79% 51%;
  --radius: 0.875rem;
}
```

## Typografie

### Fonts

- Body/UI: `Work Sans`
- Headlines: `Oswald`
- Code/IDs: `Geist Mono` oder System Mono

### Einsatz

- `Work Sans` fuer Navigation, Tabellen, Cards, Formulare, Buttons und Fliesstext.
- `Oswald` fuer Page Titles, Dashboard Headlines, KPI-Zahlen und wichtige Section-Titel.
- Mono Font fuer Meta IDs, technische Statuswerte, Logs und API-Referenzen.

### Typografie-Richtung

- Headlines sollen kompakt, klar und selbstbewusst wirken.
- KPI-Zahlen duerfen groesser und staerker sein als normale UI-Texte.
- Lange Analyse-Texte sollen gut lesbar bleiben und nicht zu eng gesetzt werden.

## App Layout

Desktop Layout:

```text
┌──────────────────────┬────────────────────────────────────────────┐
│ Sidebar              │ Topbar                                     │
│                      ├────────────────────────────────────────────┤
│ Navigation           │ Main Content                               │
│                      │                                            │
│                      │                                            │
└──────────────────────┴────────────────────────────────────────────┘
```

### Sidebar

- Position: links.
- Breite Desktop: ca. `280px`.
- Hintergrund: `#000000` oder sehr dunkles Schwarz.
- Border rechts: dezente dunkle Linie.
- Oben: Herb/Tool Logo und Produktname.
- Mitte: Hauptnavigation mit aufklappbaren Sublinks.
- Unten: User-Bereich, Logout oder Status.
- Aktiver Link: Pinker Akzent, leichter Surface-Hintergrund, klare Schrift.
- Subnavigation: leicht eingerueckt, kleiner, gedimmt, aktiver Sublink in Pink.

### Topbar

- Position: oben im rechten Content-Bereich.
- Hoehe Desktop: ca. `64px`.
- Hintergrund: `#050505` oder transparent ueber dunklem Content.
- Links: optional Mobile-Menue-Button und Breadcrumb/Page Context.
- Mitte oder links: Kunden-Dropdown als `ClientSwitcher`.
- Rechts: Settings-Icon, optional User Avatar spaeter.
- Topbar bleibt beim Scrollen sticky, wenn es die Seite verbessert.

### Main Content

- Rechts neben der Sidebar.
- Enthalt Page Header, KPI Cards, Tabellen, Grids und Detailbereiche.
- Maximalbreite nur bei Formularseiten, Dashboard nutzt volle Breite.
- Padding Desktop: `24px` bis `32px`.
- Padding Mobile: `16px`.

## Navigation

Die Navigation soll zentral als Konfiguration gepflegt werden.

```ts
export const navItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: "LayoutDashboard"
  },
  {
    title: "Analysen",
    href: "/analysis",
    icon: "ChartNoAxesCombined",
    children: [
      { title: "Performance", href: "/clients/[clientId]" },
      { title: "Creatives", href: "/clients/[clientId]/creatives" },
      { title: "Pattern Analyse", href: "/analysis" }
    ]
  },
  {
    title: "Reports",
    href: "/reports",
    icon: "FileText"
  },
  {
    title: "Einstellungen",
    href: "/settings",
    icon: "Settings",
    children: [
      { title: "Kunden", href: "/clients" },
      { title: "Kundenprofil", href: "/clients/[clientId]/settings" },
      { title: "Wissensdatenbank", href: "/clients/[clientId]/knowledge" },
      { title: "App Einstellungen", href: "/settings" }
    ]
  }
];
```

## Kundenwechsel

Der aktive Kunde wird ueber die Topbar gewechselt.

Die Sidebar trennt globale Agentur-Bereiche von kundenspezifischen Bereichen:

- `Analysen` enthaelt Performance, Creatives und Pattern Analyse fuer den aktuell in der Topbar ausgewaehlten Kunden.
- `Einstellungen` enthaelt Kundenverwaltung, Kundenprofil, Wissensdatenbank und globale App Einstellungen.
- Dadurch muss nicht jeder Kunde einzeln in der Sidebar erscheinen.
- Der Kundenwechsel bleibt zentral in der Topbar.

### ClientSwitcher Verhalten

- Zeigt aktuellen Kunden an.
- Oeffnet per Dropdown eine Liste aller aktiven Kunden.
- Hat eine Suche, sobald viele Kunden vorhanden sind.
- Wechsel navigiert auf die entsprechende Kunden-Route oder aktualisiert den globalen Kundenkontext.
- Wenn kein Kunde ausgewaehlt ist, zeigt die App globale Agentur-Daten oder fordert zur Auswahl auf.

### Routenverhalten

- Auf globalen Seiten bleibt der Kundenwechsel optional.
- Auf Kundenseiten setzt der Kundenwechsel die Route auf denselben Bereich fuer den neuen Kunden.
- Beispiel: Von `/clients/a/creatives` nach Auswahl von Kunde B zu `/clients/b/creatives`.

## Mobile UX

- Sidebar wird auf Mobile nicht permanent angezeigt.
- Links in der Topbar erscheint ein Menue-Button.
- Menue-Button oeffnet ein shadcn `Sheet` mit der Navigation.
- Sublinks bleiben auch mobile per `Collapsible` aufklappbar.
- Kunden-Dropdown bleibt in der Topbar sichtbar, falls genug Platz vorhanden ist.
- Bei sehr kleinen Screens kann der Kunden-Dropdown auf eine kompakte Variante wechseln.

## shadcn Komponenten

MVP Komponenten:

- `button`
- `card`
- `collapsible`
- `dialog`
- `dropdown-menu`
- `input`
- `label`
- `select`
- `table`
- `tabs`
- `badge`
- `progress`
- `skeleton`
- `sonner`
- `sheet`
- `separator`
- `scroll-area`

Spaeter optional:

- `command` fuer schnelle Kundensuche.
- `popover` fuer Filter und Date Picker.
- `calendar` fuer Date Range Picker.
- `tooltip` fuer Icons und KPI-Erklaerungen.

## Komponentenstruktur

Empfohlene Dateien:

```text
components/
  app-shell.tsx
  sidebar-nav.tsx
  sidebar-nav-item.tsx
  topbar.tsx
  client-switcher.tsx
  mobile-nav.tsx
  metric-card.tsx
  creative-card.tsx
  creative-ranking-table.tsx
  ai-analysis-card.tsx
  knowledge-document-list.tsx
  sync-status-badge.tsx
  ui/
```

## App Route Layout

Empfohlene App-Router-Struktur:

```text
app/
  (auth)/
    login/
      page.tsx
  (app)/
    layout.tsx
    dashboard/
      page.tsx
    clients/
      page.tsx
      [clientId]/
        page.tsx
        creatives/
          page.tsx
          [creativeId]/
            page.tsx
        knowledge/
          page.tsx
        settings/
          page.tsx
    analysis/
      page.tsx
    reports/
      page.tsx
    settings/
      page.tsx
```

`app/(app)/layout.tsx` rendert dauerhaft die Shell:

```tsx
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
```

## UX Patterns

### Buttons

- Primary Buttons nutzen Herb Pink oder Pink-Gradient.
- Secondary Buttons nutzen dunkle Surfaces mit Border.
- Destructive Buttons bleiben rot und nicht pink.
- Fokus-Ring nutzt Herb Pink.

### Cards

- Cards nutzen `#111827` als Basis.
- Wichtige Cards koennen einen dezenten Pink Glow oder Pink Border erhalten.
- KPI Cards muessen schnell scanbar sein: Label klein, Wert gross, Kontext gedimmt.

### Tabellen

- Tabellen bleiben ruhig und dicht.
- Header gedimmt, Rows mit dezentem Hover.
- Aktive oder wichtige Werte koennen pink hervorgehoben werden.
- Technische IDs werden in Mono Font angezeigt.

### Badges

- Positive Performance: gruen.
- Warnung oder Fatigue: orange.
- Risiko oder Fehler: rot.
- AI/Analyse-Status: pink oder blau.

### Loading States

- `Skeleton` fuer Cards und Tabellen.
- `Progress` fuer Knowledge Indexing, Meta Sync und AI Analyse.
- `Sonner` fuer kurze Erfolg-/Fehlermeldungen.

## Erste Layout-Akzeptanzkriterien

- Auf Desktop ist links immer eine Sidebar sichtbar.
- Rechts ist der Content-Bereich mit eigener Topbar sichtbar.
- Topbar enthaelt einen Kunden-Dropdown.
- Topbar enthaelt rechts ein Settings-Icon.
- Sidebar-Sublinks sind aufklappbar.
- Aktiver Link und wichtige CTAs nutzen Herb Pink.
- Fonts sind `Work Sans` fuer UI und `Oswald` fuer Headlines.
- Mobile Navigation funktioniert ueber ein Sheet.
- Layout bleibt auf kleinen Screens bedienbar.
