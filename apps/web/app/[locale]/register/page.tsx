"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { register as apiRegister } from "@/lib/api";
import Image from "next/image";

export default function RegisterPage() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const locale = params.locale ?? "es";

  const prefilledEmail = useMemo(() => {
    const e = searchParams.get("email") ?? "";
    return e.trim().toLowerCase();
  }, [searchParams]);

  const [email, setEmail] = useState(prefilledEmail);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiRegister(email, password, displayName, locale);
      router.push(`/${locale}/login?registered=1&email=${encodeURIComponent(email.trim())}`);
    } catch {
      // Mensaje genérico (anti-enumeration + UX simple)
      setError("No se pudo crear la cuenta. Verifica los datos e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative z-0 min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-10">
      {/* Fondo WBC */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Image
          src="/login-bg/wbc-desktop.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="hidden md:block object-cover"
        />
        <Image
          src="/login-bg/wbc-mobile.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="md:hidden object-cover"
        />
        <div className="absolute inset-0 bg-[var(--background)]/70 dark:bg-black/50" />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-[440px] rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)] text-center">Crear cuenta</h1>

        <form onSubmit={onSubmit} className="mt-6 grid gap-4">
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
            <span className="text-sm font-medium text-[var(--foreground)]">Nombre a mostrar</span>
            <input
              type="text"
              value={displayName}
              autoComplete="name"
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-[var(--foreground)]">Clave</span>
            <input
              type="password"
              value={password}
              autoComplete="new-password"
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
            {loading ? "Creando..." : "Crear cuenta"}
          </button>

          <button
            type="button"
            onClick={() => router.push(`/${locale}/login?email=${encodeURIComponent(email)}`)}
            disabled={loading}
            className="text-sm text-[var(--foreground)]/80 hover:underline disabled:opacity-50 w-fit mx-auto"
          >
            Ya tengo cuenta
          </button>
        </form>
      </div>
    </div>
  );
}
