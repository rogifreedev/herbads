import { NextResponse } from "next/server";
import { predictUploadedCreative } from "@/lib/creative-predictions";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

function normalizeFormat(value: FormDataEntryValue | null) {
  return value === "video" ? "video" : "static";
}

function parseFrames(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return [];
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const dataUrl = typeof record.dataUrl === "string" ? record.dataUrl : "";
      if (!dataUrl.startsWith("data:image/")) return null;
      return {
        label: typeof record.label === "string" ? record.label : "Frame",
        dataUrl,
        timeSeconds: typeof record.timeSeconds === "number" ? record.timeSeconds : null
      };
    })
    .filter((item): item is { label: string; dataUrl: string; timeSeconds: number | null } => Boolean(item))
    .slice(0, 4);
}

function stringField(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("Creative Upload fehlt.");

    const format = normalizeFormat(formData.get("format"));
    if (format === "video" && !file.type.startsWith("video/")) throw new Error("Bitte ein Video fuer Video Prediction hochladen.");
    if (format === "static" && !file.type.startsWith("image/")) throw new Error("Bitte ein Bild fuer Static Prediction hochladen.");

    const result = await predictUploadedCreative(clientId, {
      format,
      file,
      frames: parseFrames(formData.get("frames")),
      primaryText: stringField(formData.get("primaryText")),
      headline: stringField(formData.get("headline")),
      landingUrl: stringField(formData.get("landingUrl"))
    });

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Prediction konnte nicht erstellt werden." },
      { status: 400 }
    );
  }
}
