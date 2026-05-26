import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (value.startsWith("/auth") || value.startsWith("/login")) return "/dashboard";
  return value;
}

function getSupabasePublicKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
}

function getProjectRef() {
  return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sessionCookieValue(session: Session) {
  const payload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    token_type: session.token_type,
    user: session.user
  };

  return `base64-${encodeBase64Url(JSON.stringify(payload))}`;
}

function sessionCookieChunks(name: string, value: string) {
  const chunkSize = 3180;
  if (value.length <= chunkSize) return [{ name, value }];

  const chunks: { name: string; value: string }[] = [];
  for (let index = 0; index * chunkSize < value.length; index += 1) {
    chunks.push({ name: `${name}.${index}`, value: value.slice(index * chunkSize, (index + 1) * chunkSize) });
  }
  return chunks;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNext(requestUrl.searchParams.get("next"));
  const cookiesToSet: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublicKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(newCookies) {
          newCookies.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.push(...newCookies);
        }
      }
    }
  );

  function redirect(url: string) {
    const response = NextResponse.redirect(url);
    cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, path: "/" }));
    return response;
  }

  function persistSession(response: NextResponse, session: Session) {
    const projectRef = getProjectRef();
    const authCookieName = `sb-${projectRef}-auth-token`;
    const verifierCookieName = `${authCookieName}-code-verifier`;
    const options = {
      path: "/",
      sameSite: "lax" as const,
      httpOnly: false,
      secure: requestUrl.protocol === "https:",
      maxAge: 400 * 24 * 60 * 60
    };
    const chunks = sessionCookieChunks(authCookieName, sessionCookieValue(session));
    const chunkNames = new Set(chunks.map((chunk) => chunk.name));

    response.cookies.set(authCookieName, "", { ...options, maxAge: 0 });
    for (let index = 0; index < 8; index += 1) {
      response.cookies.set(`${authCookieName}.${index}`, "", { ...options, maxAge: 0 });
    }
    response.cookies.set(verifierCookieName, "", { ...options, maxAge: 0 });

    for (const chunk of chunks) {
      response.cookies.set(chunk.name, chunk.value, options);
    }

    if (chunkNames.has(authCookieName)) return;
    response.cookies.set(authCookieName, "", { ...options, maxAge: 0 });
  }

  function finishRedirect() {
    const url = new URL(requestUrl.toString());
    url.pathname = "/auth/finish";
    url.search = `?next=${encodeURIComponent(next)}`;
    const response = redirect(url.toString());
    return response;
  }

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const url = requestUrl.origin + "/login?error=oauth";
      return redirect(url);
    }

    if (!data.session) return redirect(requestUrl.origin + "/login?error=oauth");

    const response = finishRedirect();
    persistSession(response, data.session);
    return response;
  }

  return finishRedirect();
}
