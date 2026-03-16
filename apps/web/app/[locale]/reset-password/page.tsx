"use client";

import Image from "next/image";
import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { resetPassword } from "@/lib/api";

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const locale = params.locale ?? "es";

  const tokenFromUrl = (searchParams.get("token") ?? "").trim();

  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token.trim()) return setError("Token requerido.");
    if (password.length < 6) return setError("La clave debe tener al menos 6 caracteres.");
    if (password !== password2) return setError("Las claves no coinciden.");

    setSubmitting(true);

    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo restablecer la contraseña.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative z-0 min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-10">
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

      <div className="relative z-10 w-full max-w-[440px] rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)] text-center">
          Restablecer contraseña
        </h1>

        {done ? (
          <div className="mt-6 grid gap-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-3 text-sm text-[var(--foreground)]">
              Listo. Ya puedes iniciar sesión con tu nueva contraseña.
            </div>

            <button
              type="button"
              onClick={() => router.push(`/${locale}/login`)}
              className="h-10 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-foreground)]"
            >
              Ir al login
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 grid gap-4">
            
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--foreground)]">Nueva clave</span>
              <input
                type="password"
                value={password}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--foreground)]">Confirmar clave</span>
              <input
                type="password"
                value={password2}
                autoComplete="new-password"
                onChange={(e) => setPassword2(e.target.value)}
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
              disabled={submitting}
              className="h-10 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-foreground)] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Guardando..." : "Guardar nueva clave"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}