"use client";

import Script from "next/script";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { googleLogin as apiGoogleLogin, login as apiLogin } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const locale = params.locale ?? "es";

  const prefilledEmail = useMemo(() => {
    const e = searchParams.get("email") ?? "";
    return e.trim().toLowerCase();
  }, [searchParams]);

  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  const [googleReady, setGoogleReady] = useState(false);

  // Debug útil: confirma qué Client ID está usando realmente el frontend
  useEffect(() => {
    // OJO: esto imprime el ID completo en consola (solo dev)
    //console.log("GOOGLE_CLIENT_ID (frontend):", googleClientId);
  }, [googleClientId]);

  async function onGoogleCredential(idToken: string) {
    setError(null);
    setLoading(true);
    try {
      const data = await apiGoogleLogin(idToken);
      localStorage.setItem("token", data.token);
      router.push(`/${locale}/dashboard`);
    } catch {
      setError("No se pudo iniciar sesión con Google.");
    } finally {
      setLoading(false);
    }
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await apiLogin(email, password);
      localStorage.setItem("token", data.token);
      router.push(`/${locale}/dashboard`);
    } catch {
      setError("Credenciales inválidas.");
    } finally {
      setLoading(false);
    }
  }

  function onGoogleClick() {
    setError(null);

    // @ts-ignore
    const g = (window as any).google;
    if (!g?.accounts?.id) {
      setError("Google no está listo todavía.");
      return;
    }

    g.accounts.id.initialize({
      client_id: googleClientId,
      callback: (resp: any) => {
        if (resp?.credential) onGoogleCredential(resp.credential);
      },
    });

    g.accounts.id.prompt((notification: any) => {
      // Debug: por qué no muestra el prompt (si ocurre)
      // Verás razones como: "browser_not_supported", "suppressed_by_user", etc.
      console.log("[GSI prompt notification]", notification);
    });
  }

  return (
    <>
      {googleClientId ? (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={() => setGoogleReady(true)}
        />
      ) : null}

      <div className="relative z-0 min-h-[calc(100vh-64px)] bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center px-4 py-10">
        <div className="fixed inset-0 z-0 pointer-events-none">
          {/* Desktop */}
          <Image
            src="/login-bg/wbc-desktop.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="hidden md:block object-cover"
          />

          {/* Mobile */}
          <Image
            src="/login-bg/wbc-mobile.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="md:hidden object-cover"
          />

          {/* Overlay para legibilidad del card */}
          <div className="absolute inset-0 bg-[var(--background)]/70 dark:bg-black/50" />
        </div>
        {/*<div className="relative z-10 w-full max-w-[440px] rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-6"> comentado Adr */}
        <div className="relative z-10 w-full max-w-[440px] rounded-2xl border border-[var(--border)] bg-[var(--card)] dark:bg-[var(--card)] dark:bg-[#18181b] shadow-sm p-6">
          <h1 className="text-xl font-semibold text-[var(--foreground)] text-center">Iniciar sesión</h1>

          <form onSubmit={onLogin} className="mt-6 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--foreground)]">Email</span>
              <input
                type="email"
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--foreground)]">Clave</span>
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>

            {error ? (
              <div className="rounded-xl border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 p-3 text-sm text-[var(--destructive)]">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="h-10 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-foreground)] disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>

            {googleClientId ? (
              <button
                type="button"
                disabled={loading || !googleReady}
                onClick={onGoogleClick}
                className="h-10 rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
              >
                Continuar con Google
              </button>
            ) : null}

            <div className="mt-2 grid gap-2 justify-items-center">
              <button
                type="button"
                onClick={() => router.push(`/${locale}/register?email=${encodeURIComponent(email)}`)}
                disabled={loading}
                className="text-sm text-[var(--foreground)]/80 hover:underline disabled:opacity-50 w-fit inline-flex cursor-pointer"
              >
                No tengo cuenta → Registrarme
              </button>

              <button
                type="button"
                onClick={() => router.push(`/${locale}/forgot-password?email=${encodeURIComponent(email)}`)}
                disabled={loading}
                className="text-sm text-[var(--foreground)]/80 hover:underline disabled:opacity-50 w-fit inline-flex cursor-pointer"
              >
                Olvidé mi contraseña
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
