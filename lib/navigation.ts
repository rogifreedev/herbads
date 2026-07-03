import type { LucideIcon } from "lucide-react";
import { ChartNoAxesCombined, FileText, FolderKanban, LayoutDashboard, Sparkles, Swords, Settings } from "lucide-react";

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
    href: "/clients/[clientId]",
    icon: ChartNoAxesCombined,
    activeHrefs: [
      "/clients/[clientId]/creatives",
      "/clients/[clientId]/iterations",
      "/clients/[clientId]/angles",
      "/clients/[clientId]/creatives/landingpages"
    ],
    children: [
      { title: "Creatives", href: "/clients/[clientId]" },
      { title: "Iterations", href: "/clients/[clientId]/iterations" },
      { title: "Settings", href: "/clients/[clientId]/meta/settings" }
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
    title: "Prediction Tool",
    href: "/clients/[clientId]/prediction-tool",
    icon: Sparkles,
    activeHrefs: [
      "/clients/[clientId]/prediction-tool"
    ],
    children: [
      { title: "Analyse", href: "/clients/[clientId]/prediction-tool" },
      { title: "History", href: "/clients/[clientId]/prediction-tool/history" }
    ]
  },
  {
    title: "Batches",
    href: "/clients/[clientId]/batches",
    icon: FolderKanban,
    children: [
      { title: "Batches", href: "/clients/[clientId]/batches" },
      { title: "Settings", href: "/clients/[clientId]/batches/settings" }
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
