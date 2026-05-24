import { NextResponse } from "next/server";
import { uploadKnowledgeDocument } from "@/lib/knowledge";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      throw new Error("Bitte waehle eine Datei aus.");
    }

    const document = await uploadKnowledgeDocument({
      clientId,
      file,
      title: typeof formData.get("title") === "string" ? String(formData.get("title")) : undefined,
      documentType: typeof formData.get("documentType") === "string" ? String(formData.get("documentType")) : undefined
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Wissensdokument konnte nicht hochgeladen werden." },
      { status: 400 }
    );
  }
}
