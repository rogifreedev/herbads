import { GoogleLoginButton } from "@/components/google-login-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const ALLOWED_EMAIL_DOMAIN = "herb-media.com";

function errorMessage(error: string | string[] | undefined) {
  const value = Array.isArray(error) ? error[0] : error;
  if (value === "domain") return "Zugriff verweigert. Bitte verwende einen Google Workspace Account von herb-media.com.";
  if (value === "oauth") return "Google Login konnte nicht abgeschlossen werden. Bitte versuche es erneut.";
  return null;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [supabase, resolvedSearchParams] = await Promise.all([createSupabaseServerClient(), searchParams]);
  const { data: { user } } = await supabase.auth.getUser();

  if (user?.email?.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    redirect("/dashboard");
  }

  const message = errorMessage(resolvedSearchParams.error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-herb-border bg-herb-surface/90">
        <CardHeader>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl herb-gradient font-heading text-xl text-white">H</div>
          <CardTitle className="text-4xl">Herb Ads Login</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-white/65">Zugriff ist nur fuer Team-Mitglieder mit einem Google Workspace Account von herb-media.com erlaubt.</p>
          {message ? <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{message}</p> : null}
          <GoogleLoginButton />
        </CardContent>
      </Card>
    </main>
  );
}
