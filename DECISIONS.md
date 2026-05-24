# Decisions

Dieses Dokument haelt technische und produktbezogene Entscheidungen fuer das Projekt fest. Entscheidungen koennen spaeter geaendert werden, sollten dann aber bewusst aktualisiert werden.

## Aktuelle Entscheidungen

### Hosting

Entscheidung: Vercel

Grund:

- Passt gut zu Next.js.
- Einfache Preview Deployments.
- Cron Jobs fuer MVP ausreichend.
- Environment Variables einfach verwaltbar.

### App Framework

Entscheidung: Next.js App Router

Grund:

- Server Components und Route Handlers eignen sich gut fuer Dashboard plus API.
- Meta Tokens und AI Keys bleiben serverseitig.
- Deployment auf Vercel ist direkt unterstuetzt.

### UI Komponenten

Entscheidung: shadcn/ui

Grund:

- Passt sehr gut zu Next.js und Tailwind CSS.
- Komponenten sind kopierbar und anpassbar statt Blackbox-Library.
- Gute Basis fuer internes Dashboard mit Tabellen, Cards, Dialogen und Forms.
- Radix UI sorgt fuer robuste Accessibility-Grundlagen.

### Design Richtung

Entscheidung: Herb-Media-Branding als App-Designbasis

Quelle: `https://herb-media.com/de`

Details: `DESIGN_SYSTEM.md`

Grund:

- Tool wird intern fuer die Agentur genutzt und soll visuell zur Marke passen.
- Wiedererkennbare Brand-Farben und Typografie verbessern Konsistenz.

Design Tokens:

- Primary Pink: `#e51f76`
- Primary Pink Dark: `#c91b66`
- Primary Pink Hover: `#b01959`
- Background Dark: `#000000`
- Surface Dark: `#111827`
- Surface Muted: `#1f2937`
- Headline Dark: `#2e3744`
- Text Light: `#ffffff`
- Border Dark: `#263241`
- Success: `#22c55e`
- Warning: `#f59e0b`
- Danger: `#ef4444`
- Info: `#3b82f6`

Fonts:

- Body: `Work Sans`
- Headings: `Oswald`
- Mono: `Geist Mono` oder System Mono

UI Prinzipien:

- Dark Dashboard als Default.
- Desktop Layout mit linker Sidebar und rechter Content-Fläche.
- Topbar ueber dem Content mit Kunden-Dropdown und Settings-Icon rechts.
- Sidebar-Menuepunkte koennen aufklappbare Sublinks haben.
- Mobile Navigation wird als Sheet/Drawer umgesetzt.
- Sidebar und Mobile Navigation verwenden dieselbe Navigation Config.
- Kundenwechsel bleibt in der Topbar zentral erreichbar.
- Pinke Akzente fuer CTAs, aktive Navigation, Fokus und Highlights.
- shadcn Komponenten werden ueber CSS-Variablen angepasst.
- Datenansichten bleiben ruhig, kontrastreich und gut scanbar.

### Datenbank

Entscheidung: Supabase Postgres

Grund:

- Relationale Daten passen gut fuer Kunden, Meta-Entities, Creatives und Insights.
- Supabase bringt Auth, Storage und pgvector mit.
- Kein separater Datenbankanbieter fuer den MVP noetig.

### Auth

Entscheidung: Supabase Auth

Grund:

- Schnell fuer internes Login nutzbar.
- Spaetere Rollen und Kundenlogins koennen darauf aufbauen.

### Supabase Service Role Key

Entscheidung: Der `SUPABASE_SERVICE_ROLE_KEY` darf nur serverseitig und nur fuer Development/Admin-Jobs genutzt werden.

Grund:

- Der Service Role Key umgeht Row Level Security.
- Normale App-Operationen sollen ueber Supabase Auth und RLS laufen.
- Kundenverwaltung, Wissensdatenbank und Dashboard-Zugriffe sollen langfristig nicht vom Service Role Key abhaengen.
- Fuer Production soll der Key nur fuer sichere Serverprozesse wie Cron Jobs, Meta Sync, AI Jobs und Knowledge Indexing verwendet werden.

Regeln:

- Nie im Browser verwenden.
- Nie in Client Components importieren.
- Nie in Git committen.
- Nur ueber `.env.local`, Vercel Server Env Vars oder Supabase Vault speichern.
- Vor Production pruefen, ob alle normalen App-Flows ohne Service Role funktionieren.

### Storage

Entscheidung: Supabase Storage

Grund:

- Originale Wissensdokumente koennen pro Kunde gespeichert werden.
- Optional koennen spaeter Creative Assets und Thumbnails gespeichert werden.

### Vector Search

Entscheidung: Supabase `pgvector`

Grund:

- Kein separater Vector-DB-Service noetig.
- Kundenwissen bleibt in derselben Datenbank.
- RAG kann direkt ueber SQL/RPC angebunden werden.

### Meta Zugriff

Entscheidung: Meta Marketing API mit Agentur-System-User

Grund:

- Tool wird intern in der Agentur genutzt.
- Kein OAuth-Flow pro Kunde im MVP noetig.
- Kunden-Ad-Accounts muessen dem Business/System User korrekt freigegeben sein.
- Beim Anlegen eines Kunden soll das Werbekonto aus der System-User-Ad-Account-Liste ausgewaehlt werden, statt die ID primaer manuell einzutragen.

### Background Jobs

Entscheidung fuer MVP: Datenbankbasierte Job-Tabelle plus Cron

Grund:

- Wenig Zusatzkomplexitaet.
- Ausreichend fuer erste Syncs, Knowledge Indexing und AI Analysen.

Moegliche spaetere Entscheidung:

- Inngest oder QStash, wenn Jobs laenger, paralleler oder robuster werden muessen.

### AI Provider

Vorlaeufige Entscheidung: OpenAI

Grund:

- Gute Unterstuetzung fuer Vision, strukturierte Outputs und Embeddings.
- Einfach in Next.js integrierbar.

Noch zu bestaetigen:

- Finales Modell fuer Bild-/Videoanalyse.
- Kostenlimit pro Kunde oder pro Monat.

### Embedding Modell

Vorlaeufige Entscheidung: `text-embedding-3-small`

Dimension: `1536`

Grund:

- Gutes Preis-Leistungs-Verhaeltnis.
- Ausreichend fuer MVP-RAG ueber Kundenwissen.

Auswirkung:

- Supabase Vector Spalte wird als `vector(1536)` angelegt.

### Videoanalyse

Entscheidung fuer MVP: Thumbnail plus ausgewaehlte Frames

Grund:

- Vollstaendige Videoanalyse ist teurer und komplexer.
- Fuer Creative Strategy sind Thumbnail, erste Sekunden und visuelle Struktur im MVP ausreichend.

Spaeter moeglich:

- Vollstaendige Transkription.
- Szenenerkennung.
- Hook-Rate/Retention-Daten aus Meta, falls verfuegbar.

### Creative Asset Speicherung

Vorlaeufige Entscheidung: Meta URLs und Thumbnails speichern, Original-Assets optional spaeter kopieren

Grund:

- MVP bleibt einfacher.
- Weniger Storage-Kosten.

Risiko:

- Meta URLs koennen ablaufen oder sich aendern.

Spaetere Verbesserung:

- Wichtige Assets dauerhaft in Supabase Storage sichern.

### Meta Insights Zeitraum

Vorlaeufige Entscheidung:

- Daily Sync: gestern plus letzte 7 Tage neu synchronisieren.
- Initialer Backfill: auswählbar 30, 90, 180 oder 365 Tage.

Grund:

- Meta Attribution kann nachtraeglich Daten veraendern.
- Letzte 7 Tage erneut zu synchronisieren reduziert Datenabweichungen.

### Attribution Window

Offene Entscheidung

Optionen:

- Meta Default Attribution verwenden.
- Fest `7d_click,1d_view` verwenden.
- Pro Kunde konfigurierbar machen.

Empfehlung fuer MVP:

- Meta Default starten und sichtbar dokumentieren.
- Attribution spaeter pro Kunde konfigurierbar machen.

### Creative Score

Vorlaeufige Entscheidung:

- Score wird pro Kunde und Zeitraum berechnet.
- Score nutzt ROAS, CPA, CTR, Umsatz, Spend und Conversion-Volumen.
- Creatives mit zu wenig Daten erhalten niedrige Confidence.

Noch zu definieren:

- Mindest-Spend.
- Mindest-Impressions.
- Gewichtung nach Funnel-Ziel.

## Offene Entscheidungen

### Welche AI Modelle verwenden wir konkret?

Zu klaeren:

- Vision-Modell fuer Bilder.
- Vision-/Video-Modell fuer Frames.
- Textmodell fuer Zusammenfassungen und Pattern Analyse.
- Embedding-Modell final bestaetigen.

### Welche Meta KPIs sind Pflicht?

Vorschlag Pflicht:

- Spend
- Impressions
- Reach
- Frequency
- CTR
- CPC
- CPM
- Link Clicks
- Purchases
- Purchase Value
- Cost per Purchase
- ROAS

Optional:

- Engagement
- Comments
- Shares
- Saves
- Video 3s Views
- ThruPlays
- Hook Rate

### Wie definieren wir Gewinner-Creatives?

Moegliche Varianten:

- ROAS-first
- CPA-first
- Umsatz-first
- CTR-first fuer Top-of-Funnel
- Gewichteter Score je Kampagnenziel

Empfehlung:

- MVP startet mit gewichteter Score-Formel plus Mindestdaten.
- Spaeter Scores je Kampagnenziel trennen.

### Sollen AI-Analysen Quellen anzeigen?

Empfehlung: Ja

Grund:

- Hoehere Nachvollziehbarkeit.
- Besser fuer Kundenwissen, Brand Guidelines und verbotene Claims.

### Welche Dokumenttypen unterstuetzen wir im MVP?

Empfehlung MVP:

- PDF
- TXT
- Markdown

Spaeter:

- DOCX
- Google Docs
- Notion

### Sollen Kunden spaeter Zugriff erhalten?

Offen

Auswirkung:

- Falls ja, RLS und Rollenmodell frueh sauber vorbereiten.
- Falls nein, internes Admin-Modell reicht fuer MVP.

## Entscheidungshistorie

### 2026-05-11

- Produkt als internes Agentur-Tool definiert.
- Vercel, Next.js und Supabase als Kernstack festgelegt.
- Supabase Vector fuer Kunden-Wissensdatenbank vorgesehen.
- Meta System User als Zugriffsmethode vorgesehen.
- MVP soll Meta Sync, AI Creative Analyse, Knowledge Base und Dashboard enthalten.
