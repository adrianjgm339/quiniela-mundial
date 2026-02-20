"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { register as apiRegister } from "@/lib/api";

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
      const data = await apiRegister(email, password, displayName);
      localStorage.setItem("token", data.token);
      router.push(`/${locale}/dashboard`);
    } catch {
      // Mensaje genérico (anti-enumeration + UX simple)
      setError("No se pudo crear la cuenta. Verifica los datos e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1>Crear cuenta</h1>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          Email
          <input
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Nombre a mostrar
          <input
            type="text"
            value={displayName}
            autoComplete="name"
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Clave
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error ? (
          <p style={{ color: "crimson", margin: 0 }}>{error}</p>
        ) : null}

        <button type="submit" disabled={loading}>
          {loading ? "Creando..." : "Crear cuenta"}
        </button>

        <button
          type="button"
          onClick={() => router.push(`/${locale}/login?email=${encodeURIComponent(email)}`)}
          disabled={loading}
          style={{ opacity: 0.9 }}
        >
          Ya tengo cuenta
        </button>
      </form>
    </div>
  );
}
