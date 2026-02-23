"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useTheme } from "./theme-provider";

function cycleTheme(t: "dark" | "light") {
    return t === "dark" ? "light" : "dark";
}

function themeLabel(t: "dark" | "light") {
    return t === "dark" ? "Oscuro" : "Claro";
}

function themeIcon(t: "dark" | "light") {
    return t === "dark" ? "🌙" : "☀️";
}

export function AppShell({ children }: { children: React.ReactNode }) {
    const { theme, setTheme } = useTheme();

    const pathname = usePathname() ?? "";
    const isAuthRoute =
        pathname.includes("/login") ||
        pathname.includes("/register") ||
        pathname.includes("/forgot-password") ||
        pathname.includes("/reset-password");

    return (
        <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
            {/* TopBar */}
            {isAuthRoute ? (
                <div className="fixed top-3 right-3 z-50">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setTheme(cycleTheme(theme))}
                        title={`Tema: ${themeLabel(theme)} (click para cambiar)`}
                    >
                        <span className="text-lg leading-none">{themeIcon(theme)}</span>
                        <span className="sr-only">Tema: {themeLabel(theme)}</span>
                    </Button>
                </div>
            ) : (
                <div className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]">
                    <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-end gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setTheme(cycleTheme(theme))}
                            title={`Tema: ${themeLabel(theme)} (click para cambiar)`}
                        >
                            <span className="text-lg leading-none">{themeIcon(theme)}</span>
                            <span className="sr-only">Tema: {themeLabel(theme)}</span>
                        </Button>
                    </div>
                </div>
            )}

            {/* Contenido */}
            <main className={isAuthRoute ? "w-full p-0" : "w-full bg-[var(--background)] text-[var(--foreground)] px-4 py-6"}>
                {isAuthRoute ? children : <div className="max-w-6xl mx-auto">{children}</div>}
            </main>
        </div>
    );
}
