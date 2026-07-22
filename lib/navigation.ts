import type { LucideIcon } from "lucide-react";
import { ChartNoAxesCombined, FileText, FolderKanban, LayoutDashboard, Sparkles, Swords, Settings } from "lucide-react";

export type NavItem = {
  /** Message key within the "nav" namespace. */
  title: string;
  href: string;
  icon?: LucideIcon;
  activeHrefs?: string[];
  children?: Omit<NavItem, "icon" | "children">[];
};

export const navItems: NavItem[] = [
  {
    title: "dashboard",
    href: "/dashboard",
    icon: LayoutDashboard
  },
  {
    title: "metaAds",
    href: "/clients/[clientId]",
    icon: ChartNoAxesCombined,
    activeHrefs: [
      "/clients/[clientId]/creatives",
      "/clients/[clientId]/iterations",
      "/clients/[clientId]/comments",
      "/clients/[clientId]/angles",
      "/clients/[clientId]/creatives/landingpages",
      "/clients/[clientId]/settings",
      "/clients/[clientId]/knowledge"
    ],
    children: [
      { title: "creatives", href: "/clients/[clientId]" },
      { title: "iterations", href: "/clients/[clientId]/iterations" },
      { title: "clientProfile", href: "/clients/[clientId]/settings" },
      { title: "knowledgeBase", href: "/clients/[clientId]/knowledge" },
      { title: "settings", href: "/clients/[clientId]/meta/settings" }
    ]
  },
  {
    title: "competitors",
    href: "/clients/[clientId]/competitors/creatives",
    icon: Swords,
    children: [
      { title: "creatives", href: "/clients/[clientId]/competitors/creatives" },
      { title: "iterations", href: "/clients/[clientId]/competitors/iterations" },
      { title: "settings", href: "/clients/[clientId]/competitors/settings" }
    ]
  },
  {
    title: "predictionTool",
    href: "/clients/[clientId]/prediction-tool",
    icon: Sparkles,
    activeHrefs: [
      "/clients/[clientId]/prediction-tool"
    ],
    children: [
      { title: "analysis", href: "/clients/[clientId]/prediction-tool" },
      { title: "history", href: "/clients/[clientId]/prediction-tool/history" }
    ]
  },
  {
    title: "batches",
    href: "/clients/[clientId]/batches",
    icon: FolderKanban,
    children: [
      { title: "batches", href: "/clients/[clientId]/batches" },
      { title: "settings", href: "/clients/[clientId]/batches/settings" }
    ]
  },
  {
    title: "reports",
    href: "/reports",
    icon: FileText
  },
  {
    title: "settings",
    href: "/settings",
    icon: Settings
  },
];
