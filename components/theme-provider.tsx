"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast, Toaster } from "sonner";
import type { Theme } from "@/lib/theme";

const ThemeContext = createContext<{ theme: Theme; saving: boolean; toggle: () => void } | null>(null);

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: React.ReactNode }) {
  const [theme, setTheme] = useState(initialTheme);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const t = useTranslations("topbar");

  useEffect(() => {
    applyTheme(theme);
  }, [theme, initialTheme]);

  async function toggle() {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      const response = await fetch("/api/user/theme", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }), signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error("saveError");
    } catch {
      setTheme(theme);
      applyTheme(theme);
      toast.error(t("themeSaveError"));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, saving, toggle }}>
      {children}
      <Toaster theme={theme} richColors position="top-right"
        offset={{ top: "80px", right: "24px" }} mobileOffset={{ top: "128px", right: "16px", left: "16px" }} />
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemeProvider is missing");
  return context;
}
