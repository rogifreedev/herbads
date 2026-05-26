import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const ALLOWED_EMAIL_DOMAIN = "herb-media.com";

type AuthUser = {
  email?: string;
};

function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/auth/");
}

function isCronPath(pathname: string) {
  return pathname.startsWith("/api/cron/");
}

function isAllowedEmail(email: string | undefined) {
  return Boolean(email?.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`));
}

function unauthorizedResponse(request: NextRequest, status = 401) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

function getSupabasePublicKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
}

function getProjectRef() {
  return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
}

function getAuthCookieValue(request: NextRequest) {
  const name = `sb-${getProjectRef()}-auth-token`;
  const singleCookie = request.cookies.get(name)?.value;
  if (singleCookie) return singleCookie;

  const chunks: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const chunk = request.cookies.get(`${name}.${index}`)?.value;
    if (!chunk) break;
    chunks.push(chunk);
  }

  return chunks.length > 0 ? chunks.join("") : null;
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function parseSessionCookie(value: string | null) {
  if (!value) return null;

  try {
    const raw = value.startsWith("base64-") ? decodeBase64Url(value.slice("base64-".length)) : decodeURIComponent(value);
    const session = JSON.parse(raw) as { access_token?: unknown; expires_at?: unknown; user?: { email?: unknown } };
    const accessToken = typeof session.access_token === "string" ? session.access_token : null;
    const expiresAt = Number(session.expires_at ?? 0);

    if (!accessToken) return null;
    if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt * 1000 < Date.now()) return null;

    return {
      accessToken,
      userEmail: typeof session.user?.email === "string" ? session.user.email : undefined
    };
  } catch {
    return null;
  }
}

async function getUserFromAuthCookie(request: NextRequest): Promise<AuthUser | null> {
  const session = parseSessionCookie(getAuthCookieValue(request));
  if (!session) return null;

  if (isAllowedEmail(session.userEmail)) return { email: session.userEmail };

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL!}/auth/v1/user`, {
      headers: {
        apikey: getSupabasePublicKey(),
        authorization: `Bearer ${session.accessToken}`
      },
      cache: "no-store"
    });

    if (!response.ok) return null;
    const user = await response.json() as AuthUser;
    return user;
  } catch {
    return null;
  }
}

export async function updateSession(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname) || isCronPath(request.nextUrl.pathname)) {
    return NextResponse.next({
      request: {
        headers: request.headers
      }
    });
  }

  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublicKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request: {
              headers: request.headers
            }
          });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, { ...options, path: "/" }));
        }
      }
    }
  );

  const { data: { user: supabaseUser } } = await supabase.auth.getUser();
  const user = supabaseUser ?? await getUserFromAuthCookie(request);

  if (!user) {
    return unauthorizedResponse(request);
  }

  if (!isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    return unauthorizedResponse(request, 403);
  }

  return supabaseResponse;
}
