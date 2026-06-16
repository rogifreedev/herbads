# Herbads Competitor Crawler Worker

Docker worker for Meta Ad Library competitor crawling. Vercel only creates crawl jobs in Supabase; this worker claims those jobs, runs Playwright Chromium, imports creatives, EU Transparency details, reach signals, and marks the job complete.

## How it works

1. In Herbads, click `Crawl starten` on a competitor source.
2. The Vercel API inserts a row into `competitor_crawl_jobs`.
3. This Docker worker polls Supabase for `pending` or `retry` jobs.
4. The worker claims one job, starts Playwright Chromium, and calls the shared crawler in `lib/competitors.ts`.
5. Results are written into `competitor_creatives`; job and source status are updated in Supabase.

## Required migration

Run the app migrations before starting the worker:

```bash
npx supabase db push
```

The required migration is:

```text
supabase/migrations/202606160005_add_competitor_crawl_jobs.sql
```

## Environment

Create the worker env file on the server:

```bash
cp workers/competitor-crawler/.env.example workers/competitor-crawler/.env
```

Set at least:

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Keep `SUPABASE_SERVICE_ROLE_KEY` only on your server. Do not expose it in the browser.

## Build and run with Docker

From the repository root:

```bash
docker build -f workers/competitor-crawler/Dockerfile -t herbads-competitor-crawler .
docker run --rm --env-file workers/competitor-crawler/.env --shm-size=1g herbads-competitor-crawler
```

## Run with Compose

Preferred: run from the repository root:

```bash
docker compose -f docker-compose.competitor-crawler.yml up -d --build
docker compose -f docker-compose.competitor-crawler.yml logs -f competitor-crawler
```

Alternative: from `workers/competitor-crawler`:

```bash
docker compose up -d --build
docker compose logs -f competitor-crawler
```

`docker-compose.yml` is the server-ready compose file. `docker-compose.example.yml` is kept only as a minimal reference.

The container exposes a lightweight health endpoint on port `39123`:

```bash
curl http://localhost:39123/healthz
```

## Useful env vars

```bash
COMPETITOR_CRAWL_WORKER_BATCH_SIZE=1
COMPETITOR_CRAWL_CONCURRENCY=4
COMPETITOR_CRAWL_POLL_INTERVAL_MS=5000
COMPETITOR_CRAWL_JOB_MAX_ATTEMPTS=3
COMPETITOR_CRAWL_RUN_ONCE=0
COMPETITOR_CRAWLER_HEALTH_PORT=39123
LOG_LEVEL=info
```

`COMPETITOR_CRAWL_WORKER_BATCH_SIZE` controls how many crawl jobs the container runs at once. Keep it at `1` first. `COMPETITOR_CRAWL_CONCURRENCY` controls how many ad detail pages are crawled in parallel inside one job.

## Smoke test

To process at most one queued job and exit:

```bash
docker run --rm --env-file workers/competitor-crawler/.env \
  -e COMPETITOR_CRAWL_RUN_ONCE=1 \
  --shm-size=1g \
  herbads-competitor-crawler
```

## Local direct mode

The Vercel API defaults to worker mode. If you ever want the API route to crawl directly again, set:

```bash
COMPETITOR_CRAWL_MODE=inline
```

For production, keep worker mode.
