"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Theme = "dark" | "light";

type ThemeCtx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(t);
}

function resolveThemeFromStorage(raw: string | null): Theme {
  // Migración: si estaba en "system", resolvemos a dark/light
  if (raw === "system") {
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
    return prefersDark ? "dark" : "light";
  }

  return raw === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // ✅ Lazy init: resolvemos el tema en el primer render (sin setState en useEffect)
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    const raw = localStorage.getItem("qm_theme");
    return resolveThemeFromStorage(raw);
  });

  // ✅ Sin setState dentro del effect: solo sincronizamos efectos externos (DOM + storage)
  useEffect(() => {
    localStorage.setItem("qm_theme", theme);
    applyTheme(theme);
  }, [theme]);

  // ✅ Handler estable (evita recrear función y mantiene el value del context más estable)
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    // El effect se encarga de persistir y aplicar al DOM
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme must be used within ThemeProvider");
  return v;
}