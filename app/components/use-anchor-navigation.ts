"use client";

import { useEffect } from "react";

// offsetTop follows layout positions, ignoring the reveal animation transforms.
function layoutTop(element: HTMLElement) {
  let top = 0;
  let current: HTMLElement | null = element;
  while (current) {
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return top;
}

export default function useAnchorNavigation(closeMenu: () => void) {
  useEffect(() => {
    let frame = 0;
    let navigationVersion = 0;
    let disposed = false;
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = "manual";

    function resolveTarget(hash: string) {
      try {
        return document.getElementById(decodeURIComponent(hash.slice(1)));
      } catch {
        return null;
      }
    }

    function navigate(hash: string, smooth: boolean) {
      const target = hash ? resolveTarget(hash) : null;
      if (hash && !target) return;
      navigationVersion++;
      closeMenu();
      cancelAnimationFrame(frame);
      // Let React close the mobile menu before measuring the sticky header.
      frame = requestAnimationFrame(() => {
        const headerHeight = document.querySelector(".site-header")?.getBoundingClientRect().height ?? 0;
        const contentStart = target?.querySelector<HTMLElement>("[data-anchor-start]") ?? target;
        const top = !contentStart || hash === "#inicio" ? 0 : Math.max(0, layoutTop(contentStart) - headerHeight - 32);
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top, left: 0, behavior: smooth && !reducedMotion ? "smooth" : "instant" });
      });
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || !url.hash || !resolveTarget(url.hash)) return;
      event.preventDefault();
      if (url.hash !== location.hash) history.pushState(null, "", url.href);
      navigate(url.hash, true);
    }

    function restoreAnchor() {
      navigate(location.hash, false);
    }

    const initialVersion = navigationVersion;
    void document.fonts.ready.then(() => {
      if (!disposed && navigationVersion === initialVersion && location.hash) restoreAnchor();
    });

    document.addEventListener("click", handleClick, true);
    window.addEventListener("hashchange", restoreAnchor);
    window.addEventListener("popstate", restoreAnchor);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      history.scrollRestoration = previousRestoration;
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("hashchange", restoreAnchor);
      window.removeEventListener("popstate", restoreAnchor);
    };
  }, [closeMenu]);
}
