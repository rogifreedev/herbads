import { NextResponse } from "next/server";
import { prepareKnowledgeUpload, processKnowledgeUpload } from "@/lib/knowledge";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const input = await request.json() as Record<string, unknown>;

    if (input.action === "prepare") {
      const upload = await prepareKnowledgeUpload({
        clientId,
        fileName: String(input.fileName ?? ""),
        fileSize: Number(input.fileSize)
      });
      return NextResponse.json(upload);
    }

    if (input.action !== "process") throw new Error("Ungueltige Upload-Aktion.");

    const document = await processKnowledgeUpload({
      clientId,
      storagePath: String(input.storagePath ?? ""),
      fileName: String(input.fileName ?? ""),
      fileSize: Number(input.fileSize),
      mimeType: typeof input.mimeType === "string" ? input.mimeType : undefined,
      title: typeof input.title === "string" ? input.title : undefined,
      documentType: typeof input.documentType === "string" ? input.documentType : undefined
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Wissensdokument konnte nicht hochgeladen werden." },
      { status: 400 }
    );
  }
}
