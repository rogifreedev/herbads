import type { LucideIcon } from "lucide-react";
import { ChartNoAxesCombined, FileText, LayoutDashboard, Swords, Settings } from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon?: LucideIcon;
  activeHrefs?: string[];
  children?: Omit<NavItem, "icon" | "children">[];
};

export const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard
  },
  {
    title: "META Ads",
    href: "/analysis",
    icon: ChartNoAxesCombined,
    activeHrefs: [
      "/clients/[clientId]/creatives",
      "/clients/[clientId]/iterations",
      "/clients/[clientId]/angles",
      "/clients/[clientId]/creatives/landingpages"
    ],
    children: [
      { title: "Creatives", href: "/clients/[clientId]" },
      { title: "Learning", href: "/clients/[clientId]/learning" },
      { title: "Ad Ideas", href: "/clients/[clientId]/ideas" },
      { title: "Iterations", href: "/clients/[clientId]/iterations" },
      { title: "Settings", href: "/clients/[clientId]/meta/settings" },
      { title: "Pattern Analyse", href: "/analysis" }
    ]
  },
  {
    title: "Competitors",
    href: "/clients/[clientId]/competitors/creatives",
    icon: Swords,
    children: [
      { title: "Creatives", href: "/clients/[clientId]/competitors/creatives" },
      { title: "Iterations", href: "/clients/[clientId]/competitors/iterations" },
      { title: "Settings", href: "/clients/[clientId]/competitors/settings" }
    ]
  },
  {
    title: "Reports",
    href: "/reports",
    icon: FileText
  },
  {
    title: "Einstellungen",
    href: "/settings",
    icon: Settings,
    children: [
      { title: "Kunden", href: "/clients" },
      { title: "Kundenprofil", href: "/clients/[clientId]/settings" },
      { title: "Wissensdatenbank", href: "/clients/[clientId]/knowledge" },
      { title: "App Einstellungen", href: "/settings" }
    ]
  },
];
