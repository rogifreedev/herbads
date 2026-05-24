import type { Metadata } from "next";
import { Geist_Mono, Oswald, Work_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const workSans = Work_Sans({ subsets: ["latin"], variable: "--font-work-sans" });
const oswald = Oswald({ subsets: ["latin"], variable: "--font-oswald" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Herb Ads",
  description: "Creative Intelligence fuer Meta Ads"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className="dark">
      <body className={`${workSans.variable} ${oswald.variable} ${geistMono.variable}`}>
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
