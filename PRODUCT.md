# Product: Creative Intelligence Platform

## Kurzbeschreibung

Die Webapp ist ein internes Creative-Intelligence-Tool fuer die Agentur. Sie verbindet Kunden-Werbekonten von Meta, synchronisiert Ads, Creatives und Performance-Daten, analysiert Bilder und Videos mit AI und verknuepft die Ergebnisse mit kundenspezifischem Wissen wie Zielgruppen, Branding, Angeboten und No-Gos.

Das Ziel ist, bessere Creative-Entscheidungen zu treffen: Welche Creatives funktionieren, warum funktionieren sie, welche Muster wiederholen sich und welche neuen Creative-Ideen ergeben sich daraus?

## Zielgruppe

Primaere Nutzer:

- Internes Agentur-Team
- Performance-Marketing-Team
- Creative Strategists
- Account Manager

Spaetere Nutzer optional:

- Kunden mit eingeschraenktem Dashboard-Zugriff
- Freelancer/Partner mit rollenbasiertem Zugriff

## Kernproblem

Meta Ads liefern Performance-Daten, aber sie erklaeren nicht ausreichend, welche visuellen, strategischen und psychologischen Creative-Merkmale fuer Performance verantwortlich sind.

Agenturen analysieren Creatives oft manuell ueber Ads Manager, Screenshots, Spreadsheets und subjektive Einschaetzungen. Dadurch gehen Learnings verloren, Analysen sind nicht skalierbar und Kundenwissen wird nicht konsequent in Creative-Bewertungen einbezogen.

## Produktziel

Die App soll pro Kunde eine zentrale Datenbasis schaffen fuer:

- Meta Creatives
- Performance-KPIs
- AI-basierte Creative-Beschreibungen
- Kundenwissen aus PDFs, Textdokumenten und strukturierten Profilen
- Historische Creative-Learnings
- Muster erfolgreicher und schwacher Creatives

## Techstack

- Frontend/App: Next.js auf Vercel
- UI Komponenten: shadcn/ui auf Basis von Radix UI und Tailwind CSS
- Backend/API: Next.js Route Handlers und Server Actions
- Datenbank: Supabase Postgres
- Auth: Supabase Auth
- Storage: Supabase Storage
- Vector Search: Supabase pgvector
- Cron/Scheduled Jobs: Vercel Cron, Supabase Cron oder Inngest
- Meta Integration: Meta Marketing API mit System User
- AI Analyse: multimodales AI-Modell fuer Bild/Video und Text
- Embeddings: OpenAI `text-embedding-3-small` oder vergleichbares Embedding-Modell

## Design System

Die App soll visuell zur Herb-Media-Marke passen und kein generisches SaaS-Dashboard wirken. Als Komponentenbasis wird `shadcn/ui` genutzt. Die Komponenten werden ueber Tailwind CSS und CSS-Variablen an die Herb-Media-Farbwelt angepasst.

Die detaillierte UX- und Layout-Spezifikation steht in `DESIGN_SYSTEM.md`.

### Brand Fonts

- Body Font: `Work Sans`
- Heading Font: `Oswald`
- Mono Font: `Geist Mono` oder System Mono

### Brand Farben

- Primary Pink: `#e51f76`
- Primary Pink Dark: `#c91b66`
- Primary Pink Hover: `#b01959`
- App Background Dark: `#000000`
- Surface Dark: `#111827`
- Surface Muted: `#1f2937`
- Headline Dark: `#2e3744`
- Text Light: `#ffffff`
- Text Muted Light: `rgba(255,255,255,0.70)`
- Border Dark: `#263241`
- Success: `#22c55e`
- Warning: `#f59e0b`
- Danger: `#ef4444`
- Info: `#3b82f6`

### UI Richtung

- Dunkles Agentur-Dashboard als Default.
- Pinke Akzentfarbe fuer CTAs, aktive Navigation, Fokus-Ringe und wichtige KPI-Hervorhebungen.
- Starke, klare Typografie mit `Oswald` fuer Headlines und `Work Sans` fuer UI/Text.
- Abgerundete Cards und Buttons im shadcn-Stil.
- Dezente Hover- und Focus-States, aber keine ueberladenen Animationen.
- Datenlastige Ansichten sollen ruhig, kontrastreich und gut scanbar bleiben.

### App Layout

- Links steht eine permanente Sidebar-Navigation fuer Desktop.
- Rechts steht der Hauptinhalt der aktuellen Seite.
- Menuepunkte in der Sidebar koennen Sublinks haben und auf-/zugeklappt werden.
- Oben im Inhaltsbereich steht eine Topbar.
- In der Topbar gibt es einen Kunden-Dropdown, um zwischen angelegten Kunden zu wechseln.
- Ganz rechts in der Topbar gibt es ein Settings-Icon fuer globale Einstellungen oder Nutzer-/App-Einstellungen.
- Auf Mobile wird die Sidebar als ausklappbares Sheet/Drawer dargestellt.
- Aktive Navigationselemente nutzen die Herb-Pink-Akzentfarbe.

### Navigationsstruktur

- `Dashboard`: globale Agentur-Uebersicht.
- `Analysen`: kundenspezifische Performance- und Creative-Analysen fuer den in der Topbar gewaehlten Kunden.
- `Analysen > Performance`: Dashboard fuer den aktuell gewaehlten Kunden.
- `Analysen > Learning`: Self-Learning-System fuer Winner-/Loser-Patterns, Fatigue, Opportunities und Prediction Scores.
- `Analysen > Creatives`: Creative Library und Rankings.
- `Analysen > Pattern Analyse`: uebergreifende Muster, Learnings und Creative-Hypothesen.
- `Reports`: Exporte und spaetere Kundenreports.
- `Einstellungen`: kundenspezifische und globale Einstellungen.
- `Einstellungen > Kunden`: Kundenverwaltung, Kundenliste und Kunden anlegen.
- `Einstellungen > Kundenprofil`: Meta Ad Account, Profil, Zielgruppe, Branding und Kundensettings.
- `Einstellungen > Wissensdatenbank`: Dokumente, Zielgruppen, Branding und Vector Knowledge.
- `Einstellungen > App Einstellungen`: globale App-, Nutzer- und Integrations-Einstellungen.

### Kundenwechsel UX

- Der aktive Kunde wird in der Topbar angezeigt.
- Der Kunden-Dropdown erlaubt den Wechsel zwischen allen aktiven Kunden.
- Beim Wechsel auf einer Kundenseite bleibt der aktuelle Bereich erhalten, aber die `clientId` wechselt.
- Beispiel: `/clients/a/creatives` wird nach Auswahl von Kunde B zu `/clients/b/creatives`.
- Wenn kein Kunde ausgewaehlt ist, zeigt die App globale Agentur-Daten oder fordert zur Auswahl auf.

### shadcn Komponenten fuer den MVP

- Button
- Card
- Collapsible
- Dialog
- Dropdown Menu
- Input
- Label
- Select
- Table
- Tabs
- Badge
- Progress
- Skeleton
- Toast/Sonner
- Sheet
- Separator
- Scroll Area

## MVP Scope

### Kundenverwaltung

- Interne Nutzer koennen Kunden anlegen.
- Pro Kunde wird ein Meta Ad Account aus der vom System User verfuegbaren Werbekonto-Liste ausgewaehlt.
- Falls die Meta API noch nicht konfiguriert ist, kann die Meta Ad Account ID im Development manuell eingetragen werden.
- Pro Kunde koennen strukturierte Informationen gepflegt werden: Zielgruppe, Branding, USPs, Angebote, No-Gos, Tone of Voice.

### Meta Sync

- Synchronisierung von Kampagnen, Ad Sets, Ads und Creatives.
- Synchronisierung taeglicher Performance-Daten.
- Speicherung der wichtigsten KPIs pro Ad/Creative/Tag.
- Nutzung eines Agentur-System-Users statt OAuth pro Kunde.

Aktueller MVP-Stand:

- Manuelle Synchronisierung fuer Account Metadata, Campaigns, Ad Sets, Ads und Creatives ist vorbereitet.
- Insights/KPIs werden auf Ad-Level taeglich gespeichert und fuer Dashboards/Creative Library aggregiert.

### Creative Analyse

- Bild-Creatives werden per AI analysiert.
- Video-Creatives werden im MVP ueber Thumbnail und ausgewaehlte Frames analysiert.
- Ergebnisse werden strukturiert gespeichert.
- Analyse wird mit Kundenwissen aus der Wissensdatenbank angereichert.

### Wissensdatenbank

- Pro Kunde koennen PDFs und Textdokumente hochgeladen werden.
- Originaldateien werden in Supabase Storage gespeichert.
- Text wird extrahiert, in Chunks geteilt und als Embeddings in Supabase Vector gespeichert.
- Bei Creative-Analysen werden relevante Wissens-Chunks abgerufen.

Aktueller MVP-Stand:

- Die Wissensdatenbank-Seite liest echte Dokument-Metadaten aus Supabase.
- Upload und Embedding-Indexierung folgen als naechster Schritt.

### Dashboard

- Kundenuebersicht
- Creative-Ranking
- Creative-Detailseite
- KPI-Vergleich
- AI-Zusammenfassung je Creative
- Erste Pattern-Erkennung: Gemeinsamkeiten der Top- und Low-Performer
- Creative Learning: datenbasierte Winner-/Loser-Patterns, neue Hook-/Angle-Testzellen und Prediction Board fuer gespeicherte Ad Ideas.

Aktueller MVP-Stand:

- Globale und kundenspezifische KPI Cards nutzen echte Meta Insights, sobald synchronisiert.
- Creative Library und Creative Detailseiten nutzen echte synchronisierte Creatives und Ads.

### Creative Learning System

Das Creative Learning System ist der Einstieg in ein selbstlernendes Creative-OS. Es ersetzt kein grosses ML-Modell, sondern nutzt zuerst erklaerbare Signale aus echten Meta-Daten, Creative Scores, AI-Analysen, Hooks, Angles und gespeicherten Ad Ideas.

MVP-Umfang:

- Neue Route `/clients/[clientId]/learning` unter `META Ads > Learning`.
- Winner Patterns: starke Angles mit Performance-Evidence wie Score, Spend, Impressions, CTR/ROAS und Beispiel-Creatives.
- Loser Patterns: schwache Angles mit Empfehlung, ob Hook, Offer, Proof oder Funnel-Fit ueberarbeitet werden soll.
- Emerging Opportunities: historisch positive Angles, die aktuell wenig oder gar nicht genutzt werden.
- Fatigue Warnings: Vergleich historischer Angle-Performance gegen die letzten 30 Tage.
- Hook & Angle Tests: neue Testzellen aus Winner Patterns und bestehenden Hook Insights.
- Prediction Board: gespeicherte Ad Ideas bekommen einen prognostischen Score mit Confidence, CTR-Band, Begruendung und Risiken.

Score-Prinzip:

- Der Prediction Score ist erklaerbar und kombiniert Angle-Historie, Hook-Aehnlichkeit, AI-Ideen-Score und vorhandene Performance-Signifikanz.
- Confidence steigt mit mehr Creatives, Spend, Impressions und AI-Analysen.
- Ziel ist kein absoluter Forecast, sondern eine priorisierte Testentscheidung vor Launch.

Spaetere Self-Learning-Schleife:

- Ad Ideas werden mit live gegangenen Creatives verknuepft.
- Prediction und echte Performance werden nach 3, 7, 14 und 30 Tagen verglichen.
- Pattern-Gewichte werden anhand von Prediction-vs-Actual-Learnings angepasst.
- Wiederholt schwache Hooks, Claims, Angles oder Formate werden automatisch depriorisiert.

## Nicht im MVP

- Kunden-Login
- Automatische Erstellung neuer Ads
- Vollstaendige Video-Transkription fuer alle Creatives
- Eigene Model-Trainings
- Multi-Touch-Attribution ausserhalb von Meta
- Automatische Budget- oder Kampagnensteuerung
- Komplexe Forecasting-Modelle

## Wichtige KPIs

Primaer:

- Spend
- Impressions
- Reach
- Frequency
- CTR
- CPC
- CPM
- Link Clicks
- Landing Page Views
- Purchases
- Cost per Purchase
- Purchase Conversion Value
- ROAS

Optional/kontextabhaengig:

- Engagement
- Video 3-second views
- ThruPlays
- Hook Rate
- Hold Rate
- Thumbstop Rate
- Saves
- Shares
- Comments

## Creative Score

Der Creative Score sollte nicht als absolute Wahrheit verstanden werden, sondern als sortierbare Entscheidungshilfe.

Eine erste Score-Logik kann gewichtet werden aus:

- ROAS
- Cost per Purchase
- CTR
- Spend-Signifikanz
- Conversion Volume
- Creative-Fatigue-Indikatoren

Wichtig: Creatives mit sehr wenig Spend oder wenigen Impressions sollten nicht als Gewinner klassifiziert werden, auch wenn einzelne KPIs gut aussehen.

## AI-Analysefelder

### Bildanalyse

- Creative Type: UGC, Produktbild, Testimonial, Meme, Screenshot, Before/After, Studio Shot, Offer Creative
- Format: Feed, Story, Reel, Square, Portrait, Landscape
- Visuelle Elemente: Personen, Produkt, Umgebung, Text, Logo, Farben
- Hook/Claim: sichtbarer Text und Hauptversprechen
- Emotion: Vertrauen, Dringlichkeit, Neugier, Social Proof, Schmerzpunkt
- Designqualitaet: Kontrast, Lesbarkeit, Hierarchie, Branding
- Zielgruppen-Fit
- Brand-Fit
- CTA-Klarheit
- Risiken: rechtliche Claims, unpassende Tonalitaet, verwirrendes Angebot

### Videoanalyse

- Thumbnail-Bewertung
- Erste 3 Sekunden
- Hook-Typ
- Szenenstruktur
- Tempo
- Personen/Sprecher
- Untertitel/Text Overlays
- Produkt-Demo
- CTA
- Story Arc
- Potenzielle Drop-off-Risiken

## Wissensdatenbank

Pro Kunde gibt es zwei Wissensebenen.

### Strukturierte Kundeninformationen

Diese Felder werden bei jeder Analyse direkt beruecksichtigt:

- Brand Name
- Positionierung
- Zielgruppen
- Pain Points
- Buying Triggers
- USPs
- Angebote
- Tone of Voice
- Brand No-Gos
- Verbotene Claims
- Wettbewerber
- Bevorzugte CTAs

### Dokumentenbasierte Wissensdatenbank

Diese wird per Vector Search abgefragt:

- Brand Guidelines
- Zielgruppen-PDFs
- Kundenbriefings
- Produktdatenblaetter
- Creative Research
- Kundeninterviews
- Vergangene Kampagnenlearnings
- Wettbewerbsanalysen

## RAG-Konzept

Bei jeder Creative-Analyse wird eine semantische Suche ueber Supabase Vector ausgefuehrt.

Beispiel-Suchkontext:

```text
target audience, brand guidelines, offer, product claims, forbidden claims, tone of voice, visual identity
```

Die relevantesten Chunks werden in den AI-Prompt eingefuegt. Die AI soll ihre Bewertung auf Creative-Inhalt, Performance-Daten und Kundenwissen stuetzen.

## Rollen und Zugriff

MVP:

- Admin: kann alles verwalten
- Team Member: kann Kunden, Daten und Analysen sehen und bearbeiten

Spaeter:

- Client Viewer: kann nur eigene Dashboards sehen
- Creative Strategist: kann Analysen und Learnings bearbeiten
- Analyst: kann Reports exportieren

## Datenschutz und Sicherheit

- Meta Access Tokens nie im Frontend verwenden.
- System User Token nur serverseitig speichern.
- Supabase Service Role Key nie im Frontend verwenden und nur fuer Server-Jobs/Admin-Flows nutzen.
- Secrets in Vercel Environment Variables oder Supabase Vault speichern.
- Supabase Row Level Security aktivieren.
- Dateien pro Kunde logisch trennen.
- AI-Anbieter pruefen hinsichtlich Datenverarbeitung und Kundenanforderungen.
- Original-Creatives und Kundendokumente als sensible Daten behandeln.

## Produktprinzipien

- Erst Fakten speichern, dann interpretieren.
- AI-Bewertungen als Hypothesen formulieren, nicht als absolute Wahrheit.
- Performance immer im Kontext betrachten: Spend, Ziel, Kampagne, Ad Set, Placement und Zeitraum.
- Kundenwissen strukturiert und per Vector Search nutzbar machen.
- Jede AI-Aussage sollte moeglichst auf Daten oder Quellen zurueckfuehrbar sein.
- MVP klein halten, aber Datenmodell zukunftsfaehig bauen.

## Offene Fragen

- Welche Meta-KPIs sind fuer euren Agenturprozess Pflicht?
- Welche Attribution Settings sollen standardmaessig verwendet werden?
- Wie weit sollen historische Meta-Daten initial importiert werden: 30, 90, 180 oder 365 Tage?
- Welches AI-Modell soll fuer Bild- und Videoanalyse genutzt werden?
- Sollen Creative-Dateien dauerhaft gespeichert oder nur Meta-URLs referenziert werden?
- Sollen Kunden spaeter Zugriff erhalten?
- Welche Branchen mit rechtlichen Risiken werden betreut?
- Soll die AI Quellen aus der Wissensdatenbank in der Analyse anzeigen?
- Wie soll ein Gewinner-Creative definiert werden: ROAS, CPA, CTR, Umsatz oder gewichteter Score?
