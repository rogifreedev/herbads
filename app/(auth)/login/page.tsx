import { getTranslations } from "next-intl/server";
import { GoogleLoginButton } from "@/components/google-login-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Translator } from "@/lib/i18n-types";

function errorMessage(t: Translator, error: string | string[] | undefined) {
  const value = Array.isArray(error) ? error[0] : error;
  if (value === "domain") return t("errorDomain");
  if (value === "oauth") return t("errorOauth");
  return null;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [resolvedSearchParams, t] = await Promise.all([searchParams, getTranslations("auth")]);
  const message = errorMessage(t, resolvedSearchParams.error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-herb-border bg-herb-surface/90">
        <CardHeader>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl herb-gradient font-heading text-xl text-white">H</div>
          <CardTitle className="text-4xl">{t("loginTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-white/65">{t("loginDescription")}</p>
          {message ? <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{message}</p> : null}
          <GoogleLoginButton />
        </CardContent>
      </Card>
    </main>
  );
}
