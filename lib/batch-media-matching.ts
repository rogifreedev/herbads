import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Mat, KeyPointVector } from "@techstark/opencv-js";
import { batchMediaScope, groupBatchMedia } from "@/lib/batch-launch-plan";
import type { BatchAdGroup, BatchMediaFile } from "@/lib/batch-launch-types";

type CV = typeof import("@techstark/opencv-js");
type Features = { descriptors: Mat; keys: KeyPointVector; width: number; height: number };
type MatchResult = { groups: BatchAdGroup[]; matchingUnavailable: boolean };
type PairScore = { feed: BatchMediaFile; story: BatchMediaFile; score: number };
const cache = new Map<string, { expires: number; result: MatchResult }>();
let cvPromise: Promise<{ cv: CV }> | undefined;

async function openCv() {
  // The CommonJS export is a Promise; ESM namespace wrapping breaks its native .then receiver.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (cvPromise ??= Promise.resolve(require("@techstark/opencv-js") as Promise<CV>).then((cv) => ({ cv })));
}

async function thumbnail(file: BatchMediaFile, signal: AbortSignal) {
  if (!file.thumbnailUrl) throw new Error("Missing thumbnail");
  const url = new URL(file.thumbnailUrl);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".googleusercontent.com"))
    throw new Error("Invalid thumbnail host");
  url.pathname = url.pathname.replace(/=s\d+$/, "=s1000");
  const response = await fetch(url, { signal, redirect: "error" });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/"))
    throw new Error("Thumbnail unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty thumbnail");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4 * 1024 * 1024) throw new Error("Thumbnail too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

async function features(cv: CV, buffer: Buffer): Promise<Features> {
  const { data, info } = await sharp(buffer, { limitInputPixels: 16_000_000 })
    .rotate()
    .resize({ width: 700, height: 1000, fit: "inside" })
    .flatten({ background: "white" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mat = cv.matFromArray(info.height, info.width, cv.CV_8UC1, data);
  const keys = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  const mask = new cv.Mat();
  const orb = new cv.ORB(1200);
  try {
    orb.detectAndCompute(mat, mask, keys, descriptors);
    return { keys, descriptors, width: info.width, height: info.height };
  } catch (error) {
    keys.delete();
    descriptors.delete();
    throw error;
  } finally {
    mat.delete();
    mask.delete();
    orb.delete();
  }
}

function visualScore(cv: CV, a: Features, b: Features) {
  if (a.descriptors.rows < 30 || b.descriptors.rows < 30) return 0;
  const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
  const matches = new cv.DMatchVectorVector();
  const pointsA: number[] = [],
    pointsB: number[] = [];
  try {
    matcher.knnMatch(a.descriptors, b.descriptors, matches, 2);
    for (let i = 0; i < matches.size(); i++) {
      const candidates = matches.get(i);
      try {
        if (candidates.size() < 2) continue;
        const best = candidates.get(0),
          second = candidates.get(1);
        if (best.distance >= 0.7 * second.distance || best.distance >= 45) continue;
        const p = a.keys.get(best.queryIdx).pt,
          q = b.keys.get(best.trainIdx).pt;
        pointsA.push(p.x, p.y);
        pointsB.push(q.x, q.y);
      } finally {
        candidates.delete();
      }
    }
  } finally {
    matches.delete();
    matcher.delete();
  }
  const count = pointsA.length / 2;
  if (count < 30) return 0;
  const ma = cv.matFromArray(count, 1, cv.CV_32FC2, pointsA);
  const mb = cv.matFromArray(count, 1, cv.CV_32FC2, pointsB);
  const mask = new cv.Mat();
  let transform: Mat | undefined;
  try {
    transform = cv.findHomography(ma, mb, cv.RANSAC, 4, mask);
    if (transform.empty()) return 0;
    const xs: number[] = [],
      ys: number[] = [],
      xt: number[] = [],
      yt: number[] = [];
    for (let i = 0; i < count; i++)
      if (mask.data[i]) {
        xs.push(pointsA[i * 2] / a.width);
        ys.push(pointsA[i * 2 + 1] / a.height);
        xt.push(pointsB[i * 2] / b.width);
        yt.push(pointsB[i * 2 + 1] / b.height);
      }
    if (xs.length < 30) return 0;
    const area = Math.sqrt(
      (Math.max(...xs) - Math.min(...xs)) *
        (Math.max(...ys) - Math.min(...ys)) *
        (Math.max(...xt) - Math.min(...xt)) *
        (Math.max(...yt) - Math.min(...yt))
    );
    // A shared logo, bottle or text block alone is not enough to match two whole creatives.
    return area >= 0.15 ? xs.length * area : 0;
  } finally {
    ma.delete();
    mb.delete();
    mask.delete();
    transform?.delete();
  }
}

export function selectVisualPairs(scores: PairScore[]) {
  return scores.filter((pair) => {
    if (pair.score < 8) return false;
    const alternatives = scores.filter(
      (other) => other !== pair && (other.feed.id === pair.feed.id || other.story.id === pair.story.id)
    );
    return alternatives.every((other) => pair.score >= other.score * 1.5 && pair.score - other.score >= 4);
  });
}

export async function matchBatchMedia(files: BatchMediaFile[]): Promise<MatchResult> {
  const groups = groupBatchMedia(files);
  const paired = new Set(
    groups.filter((g) => g.feedFileId && g.storyFileId).flatMap((g) => [g.feedFileId, g.storyFileId])
  );
  const scopes = new Map<string, BatchMediaFile[]>();
  for (const file of files) {
    if (file.kind !== "image" || file.placement === "unknown" || paired.has(file.id)) continue;
    const scope = batchMediaScope(file);
    scopes.set(scope, [...(scopes.get(scope) ?? []), file]);
  }
  const candidates = [...scopes.values()].filter(
    (scope) => scope.some((f) => f.placement === "feed") && scope.some((f) => f.placement === "story")
  );
  if (!candidates.length) return { groups, matchingUnavailable: false };
  const key = createHash("sha256")
    .update(
      JSON.stringify(
        files.map(({ id, path, modifiedTime, width, height, size }) => ({
          id,
          path,
          modifiedTime,
          width,
          height,
          size
        }))
      )
    )
    .digest("hex");
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.result;
  const matches: PairScore[] = [];
  let matchingUnavailable = false;
  const deadline = Date.now() + 35_000;
  let comparisons = 0;
  try {
    const { cv } = await openCv();
    for (const scope of candidates) {
      const feed = scope.filter((f) => f.placement === "feed"),
        story = scope.filter((f) => f.placement === "story");
      comparisons += feed.length * story.length;
      if (comparisons > 625 || Date.now() >= deadline) {
        matchingUnavailable = true;
        continue;
      }
      const descriptors = new Map<string, Features>();
      try {
        // Bound downloads and decoding; a missing candidate prevents uniqueness checks for the whole scope.
        for (let offset = 0; offset < scope.length; offset += 4) {
          const results = await Promise.allSettled(
            scope.slice(offset, offset + 4).map(async (file) => {
              const signal = AbortSignal.timeout(Math.max(1, Math.min(10_000, deadline - Date.now())));
              descriptors.set(file.id, await features(cv, await thumbnail(file, signal)));
            })
          );
          const failed = results.find((r) => r.status === "rejected");
          if (failed?.status === "rejected") throw failed.reason;
        }
        const scores: PairScore[] = [];
        for (const a of feed)
          for (const b of story) {
            if (Date.now() >= deadline) throw new Error("Matching time limit");
            scores.push({ feed: a, story: b, score: visualScore(cv, descriptors.get(a.id)!, descriptors.get(b.id)!) });
          }
        matches.push(...selectVisualPairs(scores));
      } catch {
        matchingUnavailable = true;
      } finally {
        for (const value of descriptors.values()) {
          value.keys.delete();
          value.descriptors.delete();
        }
      }
    }
  } catch {
    matchingUnavailable = true;
  }
  const byFeed = new Map(matches.map((pair) => [pair.feed.id, pair.story.id]));
  const usedStories = new Set(matches.map((pair) => pair.story.id));
  const result: MatchResult = {
    groups: groups
      .filter((g) => !g.storyFileId || !usedStories.has(g.storyFileId))
      .map((g) =>
        g.feedFileId && byFeed.has(g.feedFileId)
          ? { ...g, storyFileId: byFeed.get(g.feedFileId)!, matchMethod: "visual" }
          : g
      ),
    matchingUnavailable
  };
  if (!matchingUnavailable) {
    if (cache.size >= 32) cache.delete(cache.keys().next().value!);
    cache.set(key, { result, expires: Date.now() + 5 * 60_000 });
  }
  return result;
}
