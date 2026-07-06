"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const TRICKLE_INTERVAL_MS = 200;
const SAFETY_TIMEOUT_MS = 12000;
const HIDE_DELAY_MS = 250;

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const trickleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (trickleTimer.current) clearInterval(trickleTimer.current);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    trickleTimer.current = null;
    safetyTimer.current = null;
    hideTimer.current = null;
  }, []);

  const finish = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    clearTimers();
    setProgress(100);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, HIDE_DELAY_MS);
  }, [clearTimers]);

  const start = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    clearTimers();
    setVisible(true);
    setProgress(12);
    trickleTimer.current = setInterval(() => {
      setProgress((current) => (current >= 90 ? current : current + Math.max(0.5, (90 - current) * 0.08)));
    }, TRICKLE_INTERVAL_MS);
    safetyTimer.current = setTimeout(finish, SAFETY_TIMEOUT_MS);
  }, [clearTimers, finish]);

  useEffect(() => {
    finish();
  }, [pathname, searchParams, finish]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || !(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      start();
    }

    function onPopState() {
      start();
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [start]);

  useEffect(() => clearTimers, [clearTimers]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px]" aria-hidden>
      <div
        className="h-full bg-primary shadow-[0_0_10px_rgba(229,31,118,0.7)] transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
