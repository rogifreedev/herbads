# Implementation Plan: Creative Intelligence Platform

## Ziel

Dieses Dokument beschreibt die konkrete Umsetzung der Webapp mit Vercel, Next.js, Supabase, Meta Marketing API, Supabase Vector und AI-Analyse.

Der Plan ist in Phasen aufgeteilt, damit zuerst ein nutzbarer MVP entsteht und danach Analysequalitaet, Automatisierung und Reporting ausgebaut werden koennen.

## Implementierungsstatus

Stand: MVP-Implementierungsphase abgeschlossen.

Abgeschlossen:

- Next.js App Shell, Navigation, Kundenverwaltung und Herb-Media Design System.
- Supabase Schema, Service-Role-Datenzugriff, Storage-Uploads und Knowledge Embeddings.
- Meta Sync fuer Campaigns, Ad Sets, Ads, Creatives und Insights inklusive Backfill, Tages-Cron und Rate-Limit-Pausen.
- Creative Library, Creative Detail, Landingpages, Video Transcripts, AI Creative Analysen und Kundenprofil-AI.
- Creative Performance Score mit Score-Erklaerung, Score-Sortierung und Score-Filter.
- Pattern Analyse MVP auf `/analysis` mit Top-/Low-Performer-Vergleich.
- Creative Learning MVP auf `/clients/[clientId]/learning` mit Winner-/Loser-Patterns, Opportunities, Fatigue-Warnings, Hook-Testzellen und Prediction Board fuer Ad Ideas.
- Reports MVP auf `/reports` und globale Integrationsuebersicht auf `/settings`.
- Kritische Unit Tests fuer KPI-Aggregation und Creative Score.

Post-MVP offen:

- Automatische AI-Analyse-Queue nach Daily Sync.
- Ad Ideas Engine unter META Ads: Hook Intelligence, Meta-Ads-Kontext, gespeicherte Reel-/Static-Ideen und Self-Learning ueber verknuepfte Creative-Performance.
- Competitor Intelligence unter META Ads: Competitor Ad Library Links, manuell erfasste Competitor Creatives, Reach-/Budget-Schaetzung, AI Analyse und Einspeisung in Ad Ideas.
- Persistenter Prediction-vs-Actual-Feedback-Loop fuer das Creative Learning System.
- Persistierte Score-Historie, falls Score-Trends historisch ausgewertet werden sollen.
- RLS/Security-Haertung fuer spaetere externe Kunden-Logins.
- Deployment-Finalisierung mit Vercel Env Review, Supabase Backups und finaler Storage-Bucket-Pruefung.
- Erweiterte Tests fuer Meta Parser, Backfill Chunking und API-Routen.

## Post-MVP: Ad Ideas Engine

### Ziel

Unter `META Ads` entsteht ein neuer Bereich `Ad Ideas`, der laufend neue Anzeigenideen fuer Reels und Static Images erzeugt. Die Engine soll nicht nur Hooks formulieren, sondern echte Meta-Ads-Daten aus Campaigns, Ad Sets, Ads, Creatives, Insights und AI-Analysen einbeziehen.

### MVP Umfang

- Neuer Navigationspunkt `Ad Ideas` unter `META Ads` mit Route `/clients/[clientId]/ideas`.
- Hook Intelligence: Ranking der besten bestehenden Hooks nach Creative Score, Spend, CTR, Hookrate, Holdrate, Outbound CVR, Purchases und ROAS.
- Meta-Ads-Kontext: Einbezug von Campaign Objective, Campaign Name, Ad Set Optimization Goal, Ad Set Name, Ad Name, Status und Effective Status.
- AI Idea Generation: Erstellung neuer strukturierter Anzeigenideen fuer `reel`, `static` und optional `carousel`.
- Ideen persistieren mit Status-Workflow: `new`, `shortlisted`, `in_production`, `launched`, `learned`, `rejected`.
- Ideen enthalten Hook, Angle, Format, Funnel Stage, Visual Direction, First Seconds, Script Outline, Primary Text, Headline, CTA, Rationale und Source Patterns.
- Self-Learning-Grundlage: Ideen koennen spaeter mit live gegangenen Creatives verknuepft werden, damit Performance in neue Generierungen einfliesst.

### Datenmodell

Neue Tabellen:

- `ad_ideas`: gespeicherte Ideen mit Status, Format, Funnel Stage, Hook, Angle, Copy-/Script-Feldern, AI-Rationale, Source Patterns und Meta-Kontext.
- `ad_idea_generations`: Generation Runs mit Modell, Optionen, Prompt-Kontext und Rohantwort fuer Nachvollziehbarkeit.
- `ad_idea_creative_links`: Verknuepfung zwischen Idee und spaeterem Creative inklusive Performance Snapshot.

### Serverlogik

Neue Datei `lib/ad-ideas.ts`:

- `getAdIdeasOverview(clientId)`: laedt Hook Insights, gespeicherte Ideen und Meta-Kontext-Zusammenfassung.
- `getHookInsights(clientId)`: aggregiert bestehende Hooks mit Performance- und Meta-Ads-Kontext.
- `generateAdIdeas(clientId, options)`: erstellt neue Ideen ueber OpenRouter und speichert sie.
- `updateAdIdeaStatus(...)`: aktualisiert Workflow-Status.

### APIs

- `GET /api/clients/[clientId]/ideas`: Liste/Status laden.
- `POST /api/clients/[clientId]/ideas/generate`: neue Ideen generieren.
- `PATCH /api/clients/[clientId]/ideas/[ideaId]`: Status aktualisieren.

### Self-Learning

Im MVP wird Self-Learning als persistenter Feedback Loop umgesetzt:

- Gewinner-Hooks und schwache Hooks werden aus Meta Performance + AI-Analyse abgeleitet.
- Generierte Ideen speichern ihre verwendeten Patterns und Meta-Kontextquellen.
- Wenn Ideen spaeter mit Creatives verknuepft werden, kann die echte Performance zur Bewertung der Idee genutzt werden.
- Zukuenftige Generationen nutzen Gewinner-/Verlierer-Patterns, verknuepfte Idea-Performance und Kundenwissen als Prompt-Kontext.

### Spaetere Ausbaustufe

- Woechentlicher Cron zur automatischen Generierung neuer Ideen.
- UI zum Verknuepfen einer Idee mit einem Live-Creative.
- Performance Learning Dashboard pro Hook Type, Angle, Format und Funnel Stage.
- Depriorisierung von wiederholt schwachen Claims, Hooks und Visual Directions.

## Post-MVP: Creative Learning System

### Ziel

Unter `META Ads` gibt es den Bereich `Learning` mit Route `/clients/[clientId]/learning`. Dieser Bereich fasst eigene Meta-Performance, Creative Scores, AI-Analysen, Hook Intelligence, Angle Cluster und gespeicherte Ad Ideas zu einem erklaerbaren Self-Learning-System zusammen.

Das System soll nicht nur sagen, welche Ads gut waren, sondern warum sie gut waren, welche Muster wiederholbar sind, welche Muster schwach sind und welche neuen Hooks/Angles als naechstes getestet werden sollten.

### MVP Umfang

- Neue Datei `lib/creative-learning.ts` fuer serverseitige Aggregation.
- Neue Seite `app/(app)/clients/[clientId]/learning/page.tsx`.
- Navigationseintrag `Learning` unter `META Ads`.
- Winner Patterns aus Angle Performance, Creative Score, Spend, Impressions, CTR/ROAS und Beispiel-Creatives.
- Loser Patterns aus schwachen Angle Scores mit ausreichend Spend/Performance-Signal.
- Emerging Opportunities aus historisch starken, aktuell wenig genutzten Angles.
- Fatigue Warnings durch Vergleich historischer Angle-Scores mit den letzten 30 Tagen.
- Hook & Angle Testzellen aus Winner Patterns und bestehenden Hook Insights.
- Prediction Board fuer gespeicherte Ad Ideas mit predicted Score, Confidence, CTR-Band, Begruendung und Risiken.

### Aktuelle Score-Logik

Der MVP nutzt bewusst ein erklaerbares heuristisches Modell statt eigenem ML-Training:

- Angle Score aus `getCreativeAnglesOverview`.
- Hook Score aus `getAdIdeasOverview` / Hook Insights.
- AI-Ideen-Score aus gespeicherten `ad_ideas`.
- Confidence aus Anzahl Creatives, Spend, Impressions und AI-Analyseabdeckung.
- Textaehnlichkeit zwischen neuen Ideen und historischen Hooks/Angles als Similarity-Signal.

Prediction fuer eine Ad Idea:

```text
predictedScore = angleScore * 0.45 + hookScore * 0.35 + ideaScore * 0.20
confidence = Datenmenge + Spend + Creative-Anzahl + Hook-/Angle-Match
```

### Naechste Ausbaustufe

- Persistente Tabellen fuer `learning_insights`, `prediction_runs` und `ad_idea_prediction_results`.
- Verknuepfung von `ad_ideas` mit live gegangenen Creatives.
- Prediction-vs-Actual Auswertung nach 3, 7, 14 und 30 Tagen.
- Automatischer Learning-Job nach Meta Daily Sync.
- Gewichtsanpassung fuer Hook Type, Angle, Format, Funnel Stage, Offer, Proof und Landingpage Match.
- UI fuer historische Prediction Accuracy und Modell-Confidence je Kunde.

## Post-MVP: Competitor Intelligence

### Ziel

Unter `META Ads` entsteht ein neuer Bereich `Competitors`, in dem Competitor Ad Library Links, sichtbare Creatives und manuell ergaenzte Assets gesammelt werden. Die Competitor Creatives werden aehnlich wie eigene Creatives analysiert, bekommen ein Ranking und liefern Hook-/Angle-Patterns fuer die Ad Ideas Engine.

### MVP Umfang

- Neuer Navigationspunkt `Competitors` unter `META Ads` mit Route `/clients/[clientId]/competitors`.
- Competitor erfassen mit Name, Website, Meta Page ID, Meta Ad Library URL und Notizen.
- Ad Library Source Links speichern und verwalten.
- Competitor Creatives manuell anlegen mit Source URL, Format, Copy, Hook, Headline, CTA, Landingpage, Laufzeit und Reach Range.
- Reach-/Budget-Schaetzung aus eigener Meta-Performance: `estimatedSpend = reachEstimate / 1000 * estimatedCPM`.
- Confidence fuer Budget-Schaetzung: `high`, `medium`, `low` je nach Reach/Laufzeit/CPM-Qualitaet.
- Competitor Creative Ranking Score aus Reach Velocity, Estimated Spend, Hook/AI Score, Emotionen und Adaptability.
- AI Analyse fuer Competitor Creatives mit Hook, Hook-Erklaerung, Offer, Angle, Funnel Stage, Visual Elements, Emotion Scores, Staerken, Schwaechen, Hypothesen und Adaptation Ideas.
- Ad Ideas nutzt zusaetzlich Top Competitor Hooks und Patterns, aber mit Copycat-Risiko-Hinweis und ohne 1:1 Kopien.

### Datenmodell

Neue Tabellen:

- `competitors`: Competitor-Stammdaten pro Kunde.
- `competitor_ad_library_sources`: gespeicherte Ad Library Links und Import-/Pruefstatus.
- `competitor_creatives`: sichtbare oder manuell erfasste Competitor Ads inklusive Reach Range, Laufzeit, Copy, Assets und Schaetzwerte.
- `competitor_creative_analyses`: AI Analyse und Ranking-Kontext zu jedem Competitor Creative.

### Serverlogik

Neue Datei `lib/competitors.ts`:

- `getCompetitorOverview(clientId)`: Competitors, Sources, Creatives, Analysen, erkannte Links aus Profil/Wissensdatenbank und eigene CPM-Basis laden.
- `createCompetitor(...)`, `createCompetitorSource(...)`, `createCompetitorCreative(...)`.
- `analyzeCompetitorCreative(clientId, creativeId)`: OpenRouter Analyse und Score-Berechnung.
- `getCompetitorIdeaPatterns(clientId)`: Top Competitor Hooks/Angles fuer `lib/ad-ideas.ts`.

### Quellen aus Profil und Wissensdatenbank

- Das Feld `client_profiles.competitors` und Knowledge Chunks werden nach Meta Ad Library URLs durchsucht.
- Gefundene Links werden in der Competitors UI als Vorschlaege angezeigt.
- Fuer den MVP werden diese Links nicht automatisch gescraped, sondern koennen als Source gespeichert und manuell mit Creative-Daten angereichert werden.

### Budget- und Ranking-Logik

- `reachEstimate`: Mittelwert aus `reach_min` und `reach_max`, falls beide vorhanden; sonst vorhandener Einzelwert.
- `estimatedCPM`: eigener Kunden-CPM aus `creative_insights_daily`, falls genug Impressions vorhanden; sonst Benchmark-Fallback.
- `activeDays`: Differenz aus `started_at` und `ended_at` oder heute.
- `reachVelocity`: `reachEstimate / activeDays`.
- Ranking Score kombiniert Reach Velocity, Estimated Spend, Analyse-Score, Emotionen und Adaptability.

### Integration in Ad Ideas

- `generateAdIdeas` bekommt `competitorPatterns` als zusaetzlichen Prompt-Kontext.
- Regeln: Competitor Patterns adaptieren, nicht kopieren; Brand Voice und Kundenwissen beachten; `riskOfCopycat` im Prompt-Kontext beruecksichtigen.

### Spaetere Ausbaustufe

- Screenshot-/Video-Upload in Supabase Storage.
- OCR fuer Static Ads und Transkription fuer Competitor Videos.
- Bulk Analyse und woechentlicher Competitor Refresh.
- Optionaler Import aus Meta Ad Library API, falls Berechtigungen/Datenlage ausreichend sind.

## Phase 0: Projektgrundlage

### Entscheidungen

- App Framework: Next.js App Router
- Hosting: Vercel
- UI Komponenten: shadcn/ui
- Styling: Tailwind CSS mit Herb-Media-Brand-Tokens
- Datenbank: Supabase Postgres
- Auth: Supabase Auth
- Storage: Supabase Storage
- Vector DB: Supabase `pgvector`
- Meta Zugriff: Agentur-System-User
- Background Jobs: zuerst einfache Job-Tabellen plus Cron, spaeter optional Inngest/QStash
- AI Provider: initial festlegen, empfohlen OpenAI fuer Vision und Embeddings

### Environment Variables

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
META_SYSTEM_USER_ACCESS_TOKEN=
META_APP_ID=
META_APP_SECRET=
OPENAI_API_KEY=
CRON_SECRET=
```

### Projektstruktur

```text
app/
  dashboard/
  clients/
  api/
    meta/
    ai/
    knowledge/
    cron/
components/
  ui/
lib/
  supabase/
  meta/
  ai/
  knowledge/
  scoring/
  jobs/
supabase/
  migrations/
```

## Phase 0.5: Design System Setup

### Ziel

Die App nutzt `shadcn/ui` als Komponentenbasis und wird visuell an Herb Media angepasst. Das Design soll dunkle Agentur-Dashboard-Optik, pinke Brand-Akzente und starke Typografie kombinieren.

Die verbindliche UX-Spezifikation steht in `DESIGN_SYSTEM.md`.

### shadcn Setup

Nach Initialisierung des Next.js Projekts:

```bash
npx shadcn@latest init
```

Empfohlene Konfiguration:

```text
Style: New York
Base color: Neutral
CSS variables: yes
Icon library: lucide-react
```

MVP-Komponenten installieren:

```bash
npx shadcn@latest add button card collapsible dialog dropdown-menu input label select table tabs badge progress skeleton sonner sheet separator scroll-area
```

### Fonts

Fonts ueber `next/font/google` einbinden:

```ts
import { Oswald, Work_Sans } from "next/font/google";

const workSans = Work_Sans({ subsets: ["latin"], variable: "--font-work-sans" });
const oswald = Oswald({ subsets: ["latin"], variable: "--font-oswald" });
```

Verwendung:

- `Work Sans` fuer Body, UI, Tabellen und Formulartexte.
- `Oswald` fuer H1 bis H6, Dashboard-Titel und starke Section-Headlines.

### Brand Tokens

Die shadcn CSS-Variablen sollen auf Herb-Media-Farben gemappt werden.

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
  --border: 215 28% 22%;
  --input: 215 28% 22%;
  --ring: 332 79% 51%;
  --radius: 0.875rem;
}
```

Referenzfarben:

- Primary Pink: `#e51f76`
- Pink Dark: `#c91b66`
- Pink Hover: `#b01959`
- Background: `#000000`
- Surface: `#111827`
- Surface Muted: `#1f2937`
- Headline Dark: `#2e3744`
- Text Light: `#ffffff`
- Border Dark: `#263241`
- Success: `#22c55e`
- Warning: `#f59e0b`
- Danger: `#ef4444`
- Info: `#3b82f6`

### Layout Prinzipien

- Default Theme ist dark.
- Sidebar schwarz oder nahezu schwarz und auf Desktop permanent sichtbar.
- Main Content liegt rechts neben der Sidebar.
- Topbar liegt oberhalb des Main Contents.
- Topbar enthaelt einen Kunden-Dropdown zum Wechseln des aktiven Kunden.
- Topbar zeigt rechts ein Settings-Icon fuer Einstellungen.
- Sidebar-Menuepunkte koennen Sublinks enthalten und per Collapsible aufgeklappt werden.
- Auf Mobile wird die Sidebar als Sheet/Drawer geoeffnet.
- Aktive Navigation nutzt Pink-Akzent.
- KPI Cards nutzen dunkle Surfaces mit klaren Zahlen und pinken Highlights.
- Tabellen bleiben kontrastreich und ruhig.
- CTAs nutzen Pink-Verlauf `#e51f76` nach `#c91b66`.
- Hover-Zustaende koennen auf `#b01959` abdunkeln.
- AI-Insights und Risiken sollen visuell klar getrennt werden, z. B. Badges und Cards.

### Erste UI Bausteine

- `AppShell` mit Sidebar, Topbar und Content-Bereich.
- `SidebarNav` mit aufklappbaren Menuepunkten und Sublinks.
- `Topbar` mit Kunden-Dropdown und Settings-Icon.
- `ClientSwitcher` fuer den Wechsel des aktiven Kunden.
- `MobileNav` als Sheet/Drawer fuer kleinere Screens.
- `MetricCard` fuer KPIs.
- `CreativeCard` fuer Creative Grid.
- `CreativeRankingTable` fuer Performance-Vergleich.
- `AiAnalysisCard` fuer AI-Zusammenfassungen.
- `KnowledgeDocumentList` fuer Dokumente und Status.
- `SyncStatusBadge` fuer Meta/AI/Knowledge Jobs.

### App Shell Struktur

```text
app/(app)/layout.tsx
-> AppShell
   -> SidebarNav
   -> main
      -> Topbar
         -> MobileNav trigger
         -> ClientSwitcher
         -> Settings icon
      -> page content
```

### Komponentenstruktur

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

### Navigation Config

Die Sidebar Navigation soll als Konfiguration gepflegt werden, damit Desktop- und Mobile-Navigation dieselben Daten verwenden.

```ts
export const navItems = [
  { title: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
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
  { title: "Reports", href: "/reports", icon: "FileText" },
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

### ClientSwitcher Verhalten

- Zeigt den aktuell aktiven Kunden in der Topbar.
- Nutzt `DropdownMenu` im MVP.
- Nutzt spaeter optional `Command`, wenn viele Kunden vorhanden sind.
- Wechselt bei Kundenseiten die `clientId` und behaelt den aktuellen Bereich bei.
- Navigiert bei globalen Seiten optional auf `/clients/[clientId]`.
- Zeigt einen leeren Zustand, wenn noch kein Kunde angelegt ist.

### Settings Icon Verhalten

- Position rechts in der Topbar.
- Standardroute: `/settings`.
- Auf Kundenseiten kann optional ein zweites Kontext-Setting auf `/clients/[clientId]/settings` fuehren.
- Icon: `Settings` aus `lucide-react`.

## Phase 1: Supabase Schema

### Extensions

```sql
create extension if not exists vector;
create extension if not exists pgcrypto;
```

### Core Tables

```sql
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table client_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  brand_name text,
  positioning text,
  tone_of_voice text,
  target_audience text,
  pain_points text,
  buying_triggers text,
  usps text,
  offers text,
  forbidden_claims text,
  brand_no_gos text,
  competitors text,
  cta_preferences text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id)
);

create table meta_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  meta_account_id text not null,
  name text,
  currency text,
  timezone_name text,
  status text not null default 'active',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique(meta_account_id)
);
```

### Meta Entity Tables

```sql
create table meta_campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  ad_account_id uuid not null references meta_ad_accounts(id) on delete cascade,
  meta_campaign_id text not null,
  name text,
  objective text,
  status text,
  effective_status text,
  raw jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique(meta_campaign_id)
);

create table meta_ad_sets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  ad_account_id uuid not null references meta_ad_accounts(id) on delete cascade,
  campaign_id uuid references meta_campaigns(id) on delete set null,
  meta_adset_id text not null,
  name text,
  optimization_goal text,
  billing_event text,
  status text,
  effective_status text,
  raw jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique(meta_adset_id)
);

create table meta_ads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  ad_account_id uuid not null references meta_ad_accounts(id) on delete cascade,
  campaign_id uuid references meta_campaigns(id) on delete set null,
  adset_id uuid references meta_ad_sets(id) on delete set null,
  creative_id uuid,
  meta_ad_id text not null,
  meta_creative_id text,
  name text,
  status text,
  effective_status text,
  raw jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique(meta_ad_id)
);

create table creatives (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  ad_account_id uuid not null references meta_ad_accounts(id) on delete cascade,
  meta_creative_id text not null,
  creative_type text,
  name text,
  title text,
  body text,
  call_to_action_type text,
  image_url text,
  video_id text,
  thumbnail_url text,
  landing_url text,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(meta_creative_id)
);
```

Nach Erstellung von `creatives` sollte `meta_ads.creative_id` als Foreign Key gesetzt werden:

```sql
alter table meta_ads
add constraint meta_ads_creative_id_fkey
foreign key (creative_id) references creatives(id) on delete set null;
```

### Insights Tables

```sql
create table creative_insights_daily (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  ad_account_id uuid not null references meta_ad_accounts(id) on delete cascade,
  campaign_id uuid references meta_campaigns(id) on delete set null,
  adset_id uuid references meta_ad_sets(id) on delete set null,
  ad_id uuid references meta_ads(id) on delete cascade,
  creative_id uuid references creatives(id) on delete set null,
  date date not null,
  spend numeric not null default 0,
  impressions integer not null default 0,
  reach integer not null default 0,
  frequency numeric,
  clicks integer not null default 0,
  link_clicks integer not null default 0,
  ctr numeric,
  cpc numeric,
  cpm numeric,
  purchases integer not null default 0,
  purchase_value numeric not null default 0,
  cost_per_purchase numeric,
  roas numeric,
  engagement integer not null default 0,
  video_3s_views integer not null default 0,
  thruplays integer not null default 0,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(ad_id, date)
);
```

### AI Analysis Tables

```sql
create table creative_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  creative_id uuid not null references creatives(id) on delete cascade,
  model text not null,
  status text not null default 'pending',
  summary text,
  creative_type text,
  visual_elements jsonb not null default '{}',
  detected_text text,
  hook text,
  target_audience_fit_score numeric,
  brand_fit_score numeric,
  clarity_score numeric,
  scrollstopper_score numeric,
  cta_score numeric,
  risks jsonb not null default '[]',
  hypotheses jsonb not null default '[]',
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table creative_scores (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  creative_id uuid not null references creatives(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  score numeric not null,
  score_components jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(creative_id, from_date, to_date)
);
```

### Knowledge Base Tables

```sql
create table client_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  document_type text not null default 'general',
  source_type text not null default 'upload',
  storage_path text,
  status text not null default 'pending',
  error_message text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table client_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  document_id uuid not null references client_knowledge_documents(id) on delete cascade,
  content text not null,
  embedding vector(1536),
  chunk_index integer not null,
  token_count integer,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index client_knowledge_chunks_client_id_idx
on client_knowledge_chunks(client_id);

create index client_knowledge_chunks_embedding_idx
on client_knowledge_chunks
using hnsw (embedding vector_cosine_ops);
```

### Vector Search RPC

```sql
create or replace function match_client_knowledge (
  query_embedding vector(1536),
  match_client_id uuid,
  match_count int default 8
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    client_knowledge_chunks.id,
    client_knowledge_chunks.document_id,
    client_knowledge_chunks.content,
    client_knowledge_chunks.metadata,
    1 - (client_knowledge_chunks.embedding <=> query_embedding) as similarity
  from client_knowledge_chunks
  where client_knowledge_chunks.client_id = match_client_id
  order by client_knowledge_chunks.embedding <=> query_embedding
  limit match_count;
$$;
```

### Job Tables

```sql
create table sync_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  ad_account_id uuid references meta_ad_accounts(id) on delete cascade,
  job_type text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}',
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
```

## Phase 2: Auth und App Shell

### Aufgaben

- Supabase Auth einrichten.
- Login-Seite bauen.
- Geschuetzten Dashboard-Bereich bauen.
- Serverseitigen Supabase Client fuer Auth-geschuetzte Requests einrichten.
- Service-Role Client nur in Server-Code verwenden und nicht fuer normale User-Flows nutzen.
- Vor Production pruefen, ob Kundenverwaltung und Dashboard-Zugriffe ueber Auth/RLS funktionieren.

### Screens

- `/login`
- `/dashboard`
- `/clients`
- `/clients/[clientId]`

## Phase 3: Kundenverwaltung

### Aufgaben

- Kunden erstellen, bearbeiten und archivieren.
- Meta Ad Accounts ueber den System User laden und beim Kunden-Anlegen per Dropdown auswaehlen.
- Manueller Meta Ad Account ID Fallback fuer Development und API-Ausfaelle.
- Kundenprofil pflegen.
- Validierung: Meta Ad Account ID Format akzeptieren, z. B. `act_123` oder `123`.

Aktueller Implementierungsstand:

- Kunden koennen in Supabase angelegt werden.
- Meta Werbekonto wird aus der System-User-Liste ausgewaehlt.
- Kundenprofil kann auf `/clients/[clientId]/settings` geladen und gespeichert werden.

### API/Server Actions

- `createClient`
- `updateClientProfile`
- `createMetaAdAccount`
- `archiveClient`

### UI Flow

```text
Kunde anlegen
-> Meta Werbekonten ueber /api/meta/ad-accounts laden
-> Werbekonto im Dropdown auswaehlen
-> optional Brand Name und Zielgruppe eintragen
-> clients, meta_ad_accounts und client_profiles speichern
```

## Phase 4: Meta Integration

### Meta Permissions

Voraussichtlich notwendig:

- `ads_read`
- `business_management` falls Business-/Account-Struktur gelesen werden muss

### Meta Endpunkte

Ad Account:

```text
GET /act_{ad_account_id}
```

Campaigns:

```text
GET /act_{ad_account_id}/campaigns
```

Ad Sets:

```text
GET /act_{ad_account_id}/adsets
```

Ads:

```text
GET /act_{ad_account_id}/ads
```

Creatives:

```text
GET /{ad_id}?fields=creative{...}
GET /{creative_id}
```

Insights:

```text
GET /act_{ad_account_id}/insights
```

### Sync Flow

```text
manual sync or daily cron
-> fetch ad account metadata
-> upsert campaigns
-> upsert ad sets
-> upsert ads
-> upsert creatives
-> fetch insights by day and ad
-> calculate derived KPIs
-> enqueue creative analysis for new/changed creatives
```

Aktueller Implementierungsstand:

- `/api/meta/ad-accounts` laedt Werbekonten des System Users.
- `/api/clients/[clientId]/meta/sync` fuehrt einen manuellen Sync fuer den Kunden aus.
- Der erste Sync schreibt Ad Account Metadata, Campaigns, Ad Sets, Ads und Creatives in Supabase.
- Insights Sync schreibt taegliche Ad-Level-KPIs in `creative_insights_daily`.
- AI Analyse Queue folgt als naechste Ausbaustufe.

### Insights Query

Level: `ad`

Breakdown im MVP: keine oder optional `publisher_platform`, `platform_position`.

Fields:

```text
campaign_id,campaign_name,
adset_id,adset_name,
ad_id,ad_name,
impressions,reach,frequency,spend,clicks,inline_link_clicks,ctr,cpc,cpm,actions,action_values,video_3_sec_watched_actions,video_thruplay_watched_actions
```

### KPI Mapping

- `purchases` aus `actions` mit `action_type` wie `purchase` oder `omni_purchase`.
- `purchase_value` aus `action_values` mit passendem `action_type`.
- `roas = purchase_value / spend` wenn spend groesser 0.
- `cost_per_purchase = spend / purchases` wenn purchases groesser 0.

## Phase 5: Wissensdatenbank mit Supabase Vector

### Upload Flow

```text
user uploads PDF/text
-> save original file in Supabase Storage
-> create client_knowledge_documents row
-> extract text
-> split into chunks
-> create embeddings
-> insert client_knowledge_chunks
-> mark document as ready
```

### Chunking

Empfehlung:

- Chunk Groesse: 500 bis 1.000 Tokens
- Overlap: 100 bis 150 Tokens
- Metadata speichern: Dokumenttitel, Dokumenttyp, Seite, Abschnitt

### Dateitypen

MVP:

- PDF
- TXT
- Markdown

Spaeter:

- DOCX
- Google Docs Import
- Notion Import

### Funktionen

- `extractDocumentText(document)`
- `chunkText(text)`
- `createEmbedding(text)`
- `indexKnowledgeDocument(documentId)`
- `matchClientKnowledge(clientId, queryText, count)`

Aktueller Implementierungsstand:

- `/clients/[clientId]/knowledge` liest echte `client_knowledge_documents` aus Supabase.
- Upload, Text-Extraktion, Chunking und Embeddings sind als naechste Ausbaustufe offen.

## Phase 6: AI Creative Analyse

### Analyse Flow

```text
new creative detected
-> identify asset type
-> for image: analyze image URL
-> for video: fetch thumbnail and selected frames if available
-> load structured client profile
-> run vector search for relevant knowledge
-> call multimodal AI model
-> parse structured JSON result
-> save creative_ai_analyses row
```

### RAG Query

```text
Brand guidelines, target audience, product claims, forbidden claims, offer, tone of voice, visual identity, creative strategy
```

### AI Output Schema

```json
{
  "summary": "string",
  "creative_type": "string",
  "visual_elements": {
    "people": true,
    "product_visible": true,
    "dominant_colors": ["string"],
    "format": "string"
  },
  "detected_text": "string",
  "hook": "string",
  "scores": {
    "target_audience_fit": 0,
    "brand_fit": 0,
    "clarity": 0,
    "scrollstopper": 0,
    "cta": 0
  },
  "risks": ["string"],
  "hypotheses": ["string"],
  "recommended_tests": ["string"]
}
```

### Prompt Prinzipien

- AI soll beschreiben, was sichtbar ist.
- AI soll Performance nicht erfinden.
- AI soll Hypothesen klar als Hypothesen kennzeichnen.
- AI soll Kundenwissen beruecksichtigen.
- AI soll Risiken wie verbotene Claims hervorheben.

## Phase 7: Creative Score und Pattern Analyse

### Score MVP

Berechnung pro Creative und Zeitraum.

Inputs:

- Spend
- Impressions
- CTR
- CPA
- ROAS
- Purchases
- Purchase Value

Regeln:

- Creatives unter Mindest-Impressions oder Mindest-Spend erhalten niedrige Confidence.
- Score soll normalisiert pro Kunde berechnet werden.
- ROAS/CPA nur verwenden, wenn ausreichend Conversion-Daten vorhanden sind.

### Pattern Analyse MVP

```text
top creatives by score
-> collect AI analysis fields
-> compare against low performers
-> identify repeated attributes
-> create human-readable learnings
```

Beispiele:

- Top-Creatives zeigen haeufig echte Personen.
- Creatives mit klarer Rabatt-Hook haben hoehere CTR, aber niedrigeren ROAS.
- Videos mit Produktdemo in den ersten 3 Sekunden performen besser als reine Lifestyle-Hooks.

## Phase 8: Dashboard

### Seiten

- `/dashboard`: Gesamtuebersicht
- `/clients`: Kundenliste
- `/clients/[clientId]`: Kunden-Dashboard
- `/clients/[clientId]/creatives`: Creative Library
- `/clients/[clientId]/creatives/[creativeId]`: Creative Detail
- `/clients/[clientId]/knowledge`: Wissensdatenbank
- `/clients/[clientId]/settings`: Kunde, Profil, Ad Accounts
- `/analysis`: uebergreifende Analysen
- `/reports`: Reports und Exporte
- `/settings`: globale Einstellungen

Aktueller Implementierungsstand:

- `/dashboard` und `/clients/[clientId]` zeigen echte KPI-Aggregationen aus `creative_insights_daily`, sobald Insights synchronisiert sind.
- `/clients/[clientId]/creatives` zeigt echte synchronisierte Creatives inklusive Preview, Status, Ad Count und aggregierten KPIs.
- `/clients/[clientId]/creatives/[creativeId]` zeigt echte Creative-Details, Performance Summary und verknuepfte Ads.

### App Layout Routen

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

### Komponenten

- App Shell
- Sidebar Navigation
- Topbar
- Client Switcher
- Mobile Navigation Sheet
- KPI Cards
- Creative Grid
- Creative Ranking Table
- Date Range Picker
- Creative Detail Panel
- AI Analysis Card
- Knowledge Source List
- Sync Status Indicator
- Score Explanation

## Phase 9: Cron und Automatisierung

### Daily Sync

Route:

```text
GET /api/cron/daily-sync
```

Absicherung:

- Header mit `CRON_SECRET` pruefen.
- Nur serverseitig ausfuehren.

Flow:

```text
get active ad accounts
-> create sync job
-> sync yesterday and last 7 days
-> refresh creative scores
-> enqueue missing AI analyses
```

### Backfill

Manuell ausloesbar pro Kunde:

```text
last 30 days
last 90 days
last 180 days
last 365 days
```

## Phase 10: Testing und Qualitaet

### Tests

- Unit Tests fuer KPI Mapping
- Unit Tests fuer Score Berechnung
- Unit Tests fuer Chunking
- Integration Test fuer Vector RPC, falls Test-DB vorhanden
- Mock Tests fuer Meta API Parser

### Manuelle QA

- Kunde anlegen
- Ad Account verbinden
- Meta Sync starten
- Insights korrekt speichern
- PDF hochladen
- Knowledge Chunks erzeugen
- Creative AI Analyse ausloesen
- Dashboard pruefen

## Phase 11: Deployment

### Vercel

- Environment Variables setzen.
- Cron konfigurieren.
- Preview Deployments nutzen.
- Production Branch festlegen.

### Supabase

- Migrations ausfuehren.
- Storage Buckets anlegen.
- RLS Policies aktivieren.
- Backups aktivieren.

### Storage Buckets

```text
knowledge-documents
creative-assets
creative-thumbnails
```

## Empfohlene Build-Reihenfolge

1. Next.js Projekt initialisieren.
2. shadcn/ui initialisieren und Herb-Media-Design-Tokens setzen.
3. Supabase Projekt verbinden.
4. Auth und geschuetzte App Shell bauen.
5. Tabellen und Migrations anlegen.
6. Kundenverwaltung bauen.
7. Meta Ad Account speichern und validieren.
8. Meta Sync fuer Campaigns, Ad Sets, Ads, Creatives bauen.
9. Insights Sync bauen.
10. Dashboard mit echten Meta-Daten bauen.
11. Wissensdatenbank Upload bauen.
12. PDF/Text Parsing und Embeddings bauen.
13. Supabase Vector Search anbinden.
14. Bildanalyse mit AI bauen.
15. Videoanalyse ueber Thumbnail/Frames bauen.
16. Creative Score berechnen.
17. Pattern Analyse bauen.
18. Cron Jobs aktivieren.
19. RLS und Security haerten.
20. Tests fuer kritische Parser und Score-Logik schreiben.
21. MVP deployen.

## Risiken und Gegenmassnahmen

### Meta API Limits

Gegenmassnahme:

- Sync inkrementell bauen.
- Pagination sauber behandeln.
- Retry mit Backoff.
- Raw Responses speichern, wo sinnvoll.

### Attribution und KPI-Unschärfe

Gegenmassnahme:

- Attribution Settings dokumentieren.
- Zeitraum sichtbar machen.
- Keine absoluten Aussagen ohne Datenbasis.

### Videoanalyse-Kosten

Gegenmassnahme:

- MVP analysiert Thumbnail und wenige Frames.
- Vollanalyse nur bei Top-Spend oder manuell ausloesen.

### AI Halluzinationen

Gegenmassnahme:

- Strukturierte JSON-Ausgabe erzwingen.
- Prompts mit klaren Regeln.
- Fakten, Hypothesen und Empfehlungen getrennt speichern.
- Quellen aus Knowledge Base mitgeben.

### Kundenwissen veraltet

Gegenmassnahme:

- Dokumentstatus: active/archived.
- Versionierung optional.
- Quellen und Upload-Datum anzeigen.

## Offene Implementierungsentscheidungen

- AI Provider final festlegen.
- Embedding-Dimension bestaetigen.
- PDF Parser auswaehlen.
- Job-System final festlegen: einfache DB Jobs, Inngest oder QStash.
- Meta Attribution Window definieren.
- Mindestdaten fuer Creative Score definieren.
- Entscheiden, ob Creative Assets lokal gespeichert oder nur referenziert werden.
- RLS-Modell fuer spaeteren Kunden-Login vorbereiten oder erst intern halten.
