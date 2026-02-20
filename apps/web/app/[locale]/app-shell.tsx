"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { useTheme } from "./theme-provider";

function cycleTheme(t: "system" | "dark" | "light") {
    if (t === "system") return "dark";
    if (t === "dark") return "light";
    return "system";
}

function themeLabel(t: "system" | "dark" | "light") {
    if (t === "dark") return "Oscuro";
    if (t === "light") return "Claro";
    return "Sistema";
}

export function AppShell({ children }: { children: React.ReactNode }) {
    const { theme, setTheme } = useTheme();

    return (
        <div className="min-h-screen">
            {/* TopBar global */}
            <div
                className="sticky top-0 z-50 border-b"
                style={{
                    background: "var(--background)",
                    borderColor: "var(--border)",
                }}
            >
                <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-end gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setTheme(cycleTheme(theme))}
                        title={`Tema: ${themeLabel(theme)} (click para cambiar)`}
                    >
                        Tema: {themeLabel(theme)}
                    </Button>
                </div>
            </div>

            {/* Contenido */}
            <div className="max-w-6xl mx-auto px-4 py-6">{children}</div>
        </div>
    );
}
