import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  claimNextCompetitorCrawlJob,
  completeCompetitorCrawlJob,
  failCompetitorCrawlJob,
  heartbeatCompetitorCrawlJob,
  resetStaleCompetitorCrawlJobs,
  type CompetitorCrawlJob
} from "../../lib/competitor-crawl-jobs";
import { crawlCompetitorSource } from "../../lib/competitors";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const workerState = {
  startedAt: new Date().toISOString(),
  lastLoopAt: null as string | null,
  activeJobs: 0,
  completedJobs: 0,
  failedJobs: 0,
  lastJobId: null as string | null,
  lastError: null as string | null,
  shuttingDown: false
};

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function loadLocalEnv() {
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, ".env"));
  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, "workers", "competitor-crawler", ".env"));
}

function numberEnv(key: string, fallback: number, options: { min?: number; max?: number } = {}) {
  const parsed = Number(process.env[key]);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(options.min ?? Number.NEGATIVE_INFINITY, Math.min(options.max ?? Number.POSITIVE_INFINITY, value));
}

function log(level: LogLevel, message: string, meta: Record<string, unknown> = {}) {
  const configured = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  if (LOG_LEVELS[level] < LOG_LEVELS[configured]) return;

  const payload = {
    level,
    message,
    workerId: process.env.COMPETITOR_CRAWL_WORKER_ID,
    time: new Date().toISOString(),
    ...meta
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function normalizeEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= process.env.SUPABASE_URL;
  process.env.COMPETITOR_CRAWL_WORKER_ID ??= `competitor-crawler-${os.hostname()}-${process.pid}`;
  process.env.COMPETITOR_BROWSER_CRAWL ??= "1";
  process.env.COMPETITOR_CRAWL_MODE ??= "worker";
  process.env.COMPETITOR_CRAWLER_HEALTH_HOST ??= "0.0.0.0";
  process.env.COMPETITOR_CRAWLER_HEALTH_PORT ??= "39123";
}

function startHealthServer(workerId: string) {
  const port = numberEnv("COMPETITOR_CRAWLER_HEALTH_PORT", 39123, { min: 1, max: 65535 });
  const host = process.env.COMPETITOR_CRAWLER_HEALTH_HOST ?? "0.0.0.0";
  const server = createServer((request, response) => {
    if (request.url !== "/healthz" && request.url !== "/readyz" && request.url !== "/") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "not_found" }));
      return;
    }

    response.writeHead(workerState.shuttingDown ? 503 : 200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      ok: !workerState.shuttingDown,
      workerId,
      uptimeSeconds: Math.round(process.uptime()),
      ...workerState
    }));
  });

  server.listen(port, host, () => {
    log("info", "health server listening", { host, port });
  });
  server.on("error", (error) => {
    log("error", "health server error", { error: error instanceof Error ? error.message : String(error), host, port });
  });

  return server;
}

async function closeHealthServer(server: Server) {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

async function withHeartbeat<T>(job: CompetitorCrawlJob, workerId: string, work: () => Promise<T>) {
  const heartbeatIntervalMs = numberEnv("COMPETITOR_CRAWL_HEARTBEAT_INTERVAL_MS", 15000, { min: 5000, max: 120000 });
  const interval = setInterval(() => {
    heartbeatCompetitorCrawlJob(job.id, workerId).catch((error) => {
      log("warn", "heartbeat failed", { jobId: job.id, error: error instanceof Error ? error.message : String(error) });
    });
  }, heartbeatIntervalMs);

  try {
    await heartbeatCompetitorCrawlJob(job.id, workerId);
    return await work();
  } finally {
    clearInterval(interval);
  }
}

async function processOne(workerId: string) {
  const job = await claimNextCompetitorCrawlJob(workerId);
  if (!job) return false;

  workerState.activeJobs += 1;
  workerState.lastJobId = job.id;
  workerState.lastError = null;

  log("info", "claimed competitor crawl job", {
    jobId: job.id,
    clientId: job.clientId,
    sourceId: job.sourceId,
    attempt: job.attempts,
    maxAttempts: job.maxAttempts
  });

  try {
    await withHeartbeat(job, workerId, async () => {
      await crawlCompetitorSource(job.clientId, job.sourceId);
    });
    const completed = await completeCompetitorCrawlJob(job.id, workerId);
    log("info", "completed competitor crawl job", {
      jobId: completed.id,
      importedItems: completed.importedItems,
      skippedItems: completed.skippedItems
    });
    workerState.completedJobs += 1;
  } catch (error) {
    const failed = await failCompetitorCrawlJob(job, workerId, error);
    workerState.failedJobs += 1;
    workerState.lastError = failed.errorMessage;
    log(failed.status === "retry" ? "warn" : "error", "competitor crawl job failed", {
      jobId: failed.id,
      status: failed.status,
      attempts: failed.attempts,
      maxAttempts: failed.maxAttempts,
      error: failed.errorMessage
    });
  } finally {
    workerState.activeJobs = Math.max(0, workerState.activeJobs - 1);
  }

  return true;
}

async function processBatch(workerId: string) {
  workerState.lastLoopAt = new Date().toISOString();
  await resetStaleCompetitorCrawlJobs();

  const batchSize = numberEnv("COMPETITOR_CRAWL_WORKER_BATCH_SIZE", 1, { min: 1, max: 4 });
  const results = await Promise.all(Array.from({ length: batchSize }, () => processOne(workerId)));
  return results.some(Boolean);
}

async function main() {
  loadLocalEnv();
  normalizeEnv();

  const workerId = process.env.COMPETITOR_CRAWL_WORKER_ID!;
  const pollIntervalMs = numberEnv("COMPETITOR_CRAWL_POLL_INTERVAL_MS", 5000, { min: 1000, max: 60000 });
  const runOnce = process.env.COMPETITOR_CRAWL_RUN_ONCE === "1";
  const healthServer = startHealthServer(workerId);
  let shuttingDown = false;

  process.on("SIGINT", () => {
    shuttingDown = true;
    workerState.shuttingDown = true;
    log("info", "received SIGINT, shutting down after current batch");
  });
  process.on("SIGTERM", () => {
    shuttingDown = true;
    workerState.shuttingDown = true;
    log("info", "received SIGTERM, shutting down after current batch");
  });

  log("info", "competitor crawler worker started", {
    pollIntervalMs,
    batchSize: numberEnv("COMPETITOR_CRAWL_WORKER_BATCH_SIZE", 1, { min: 1, max: 4 }),
    browserCrawl: process.env.COMPETITOR_BROWSER_CRAWL,
    detailConcurrency: process.env.COMPETITOR_CRAWL_CONCURRENCY ?? "4",
    runOnce
  });

  while (!shuttingDown) {
    try {
      const didWork = await processBatch(workerId);
      if (runOnce) break;
      if (!didWork) await delay(pollIntervalMs);
    } catch (error) {
      log("error", "worker loop error", { error: error instanceof Error ? error.message : String(error) });
      if (runOnce) throw error;
      await delay(pollIntervalMs);
    }
  }

  log("info", "competitor crawler worker stopped");
  await closeHealthServer(healthServer);
}

main().catch((error) => {
  log("error", "competitor crawler worker crashed", { error: error instanceof Error ? error.stack ?? error.message : String(error) });
  process.exitCode = 1;
});
