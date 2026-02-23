"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>("light");

    useEffect(() => {
        // init
        const raw = (localStorage.getItem("qm_theme") as any) || "light";

        // Migración: si estaba en "system", resolvemos a dark/light una vez y lo guardamos.
        const resolved: Theme =
            raw === "system"
                ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light")
                : (raw === "dark" ? "dark" : "light");

        localStorage.setItem("qm_theme", resolved);
        setThemeState(resolved);
        applyTheme(resolved);

    }, []);

    const setTheme = (t: Theme) => {
        localStorage.setItem("qm_theme", t);
        setThemeState(t);
        applyTheme(t);
    };

    const value = useMemo(() => ({ theme, setTheme }), [theme]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
    const v = useContext(Ctx);
    if (!v) throw new Error("useTheme must be used within ThemeProvider");
    return v;
}
