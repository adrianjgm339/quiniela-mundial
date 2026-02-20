"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "system" | "dark" | "light";

type ThemeCtx = {
    theme: Theme;
    setTheme: (t: Theme) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

function applyTheme(t: Theme) {
    const root = document.documentElement;
    root.classList.remove("dark", "light");

    if (t === "system") {
        const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
        root.classList.add(prefersDark ? "dark" : "light");
        return;
    }

    root.classList.add(t);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>("system");

    useEffect(() => {
        // init
        const saved = (localStorage.getItem("qm_theme") as Theme | null) || "system";
        setThemeState(saved);
        applyTheme(saved);

        // react to system changes only when theme=system
        const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
        if (!mq) return;

        const handler = () => {
            const current = (localStorage.getItem("qm_theme") as Theme | null) || "system";
            if (current === "system") applyTheme("system");
        };

        mq.addEventListener?.("change", handler);
        return () => mq.removeEventListener?.("change", handler);
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
