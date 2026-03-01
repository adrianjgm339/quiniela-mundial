"use client";

import type { ReactNode } from "react";
import { useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useTheme } from "./theme-provider";

type Theme = "dark" | "light";

function cycleTheme(t: Theme) {
  return t === "dark" ? "light" : "dark";
}

function themeLabel(t: Theme) {
  return t === "dark" ? "Oscuro" : "Claro";
}

function themeIcon(t: Theme) {
  return t === "dark" ? "🌙" : "☀️";
}

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, setTheme } = useTheme();

  // ✅ Evita hydration mismatch: en SSR siempre será "light", pero en cliente puede ser "dark"
  // Renderizamos el toggle con contenido neutro hasta que el componente esté montado.
  function useIsMounted() {
    // Server: false  | Client: true
    return useSyncExternalStore(
      () => () => { }, // subscribe noop
      () => true,     // snapshot en client
      () => false     // snapshot en server
    );
  }

  const mounted = useIsMounted();

  const pathname = usePathname() ?? "";
  const isAuthRoute = useMemo(() => {
    return (
      pathname.includes("/login") ||
      pathname.includes("/register") ||
      pathname.includes("/forgot-password") ||
      pathname.includes("/reset-password")
    );
  }, [pathname]);

  const ThemeToggleButton = (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        // Si aún no está montado, no hacemos nada (evita estados raros)
        if (!mounted) return;
        setTheme(cycleTheme(theme));
      }}
      title={
        mounted
          ? `Tema: ${themeLabel(theme)} (click para cambiar)`
          : "Tema (cargando...)"
      }
      disabled={!mounted}
    >
      <span className="text-lg leading-none">
        {mounted ? themeIcon(theme) : "🌓"}
      </span>
      <span className="sr-only">
        {mounted ? `Tema: ${themeLabel(theme)}` : "Tema"}
      </span>
    </Button>
  );

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* TopBar */}
      {isAuthRoute ? (
        <div className="fixed top-3 right-3 z-50">{ThemeToggleButton}</div>
      ) : (
        <div className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-end gap-2">
            {ThemeToggleButton}
          </div>
        </div>
      )}

      {/* Contenido */}
      <main
        className={
          isAuthRoute
            ? "w-full p-0"
            : "w-full bg-[var(--background)] text-[var(--foreground)] px-4 py-6"
        }
      >
        {isAuthRoute ? children : <div className="max-w-6xl mx-auto">{children}</div>}
      </main>
    </div>
  );
}