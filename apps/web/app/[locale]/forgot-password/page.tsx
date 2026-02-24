"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const locale = params.locale ?? "es";

  const prefilledEmail = useMemo(() => {
    const e = searchParams.get("email") ?? "";
    return e.trim().toLowerCase();
  }, [searchParams]);

  const [email, setEmail] = useState(prefilledEmail);
  const [sent, setSent] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // UX segura: mensaje genérico (sin revelar si existe el correo)
    setSent(true);
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
          Recuperar contraseña
        </h1>

        {sent ? (
          <div className="mt-6 grid gap-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-3 text-sm text-[var(--foreground)]">
              Si el email existe, te enviaremos instrucciones para restablecer tu contraseña.
            </div>

            <button
              type="button"
              onClick={() => router.push(`/${locale}/login?email=${encodeURIComponent(email)}`)}
              className="h-10 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-foreground)]"
            >
              Volver al login
            </button>
          </div>
        ) : (
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

            <button
              type="submit"
              className="h-10 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-foreground)]"
            >
              Enviar instrucciones
            </button>

            <button
              type="button"
              onClick={() => router.push(`/${locale}/login?email=${encodeURIComponent(email)}`)}
              className="text-sm text-[var(--foreground)]/80 hover:underline w-fit mx-auto"
            >
              Volver al login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}