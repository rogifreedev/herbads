import type { Metadata } from "next";
import { Geist_Mono, Oswald, Work_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { NavigationProgress } from "@/components/navigation-progress";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const workSans = Work_Sans({ subsets: ["latin"], variable: "--font-work-sans" });
const oswald = Oswald({ subsets: ["latin"], variable: "--font-oswald" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return {
    title: "Herb Ads",
    description: t("appDescription")
  };
}

export const preferredRegion = "fra1";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <html lang={locale}>
      <body className={`${workSans.variable} ${oswald.variable} ${geistMono.variable} ${workSans.className}`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
          <Toaster richColors position="top-right" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
