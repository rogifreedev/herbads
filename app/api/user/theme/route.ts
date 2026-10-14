import { NextResponse } from "next/server";
import { isTheme } from "@/lib/theme";
import { getThemeUserEmail, saveUserTheme } from "@/lib/user-theme";

const headers = { "Cache-Control": "private, no-store" };

export async function PUT(request: Request) {
  // Only the signed-in identity can choose its own preference. No user ID is accepted.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  let sameOrigin = false;
  try {
    const source = new URL(origin ?? "");
    sameOrigin = ["https:", "http:"].includes(source.protocol) && source.host === host;
  } catch { /* Missing or malformed origins are rejected. */ }
  if (!sameOrigin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  }
  const email = await getThemeUserEmail();
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("theme" in body) || !isTheme(body.theme) || Object.keys(body).length !== 1) {
    return NextResponse.json({ error: "invalidTheme" }, { status: 400, headers });
  }
  try {
    await saveUserTheme(email, body.theme);
    return NextResponse.json({ theme: body.theme }, { headers });
  } catch {
    return NextResponse.json({ error: "saveError" }, { status: 500, headers });
  }
}
