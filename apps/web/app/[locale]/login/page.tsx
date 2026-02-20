"use client";

import Script from "next/script";
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

  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  const [googleReady, setGoogleReady] = useState(false);

  // Debug útil: confirma qué Client ID está usando realmente el frontend
  useEffect(() => {
    // OJO: esto imprime el ID completo en consola (solo dev)
    console.log("GOOGLE_CLIENT_ID (frontend):", googleClientId);
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

  useEffect(() => {
    if (prefilledEmail) setStep(2);
  }, [prefilledEmail]);

  async function onContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const normalized = (email || "").trim().toLowerCase();
    setEmail(normalized);

    if (!normalized) {
      setError("Ingresa tu email.");
      return;
    }
    setStep(2);
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

      <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
        <h1>Iniciar sesión</h1>

        {/* Debug visual temporal */}
        <p style={{ opacity: 0.7, fontSize: 12, marginTop: 8 }}>
          Google Client ID: {googleClientId ? "OK" : "VACÍO"} | Script:{" "}
          {googleReady ? "OK" : "CARGANDO"}
        </p>

        {step === 1 ? (
          <form
            onSubmit={onContinue}
            style={{ display: "grid", gap: 12, marginTop: 12 }}
          >
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

            {error ? <p style={{ color: "crimson", margin: 0 }}>{error}</p> : null}

            <button type="submit">Continuar</button>
          </form>
        ) : (
          <form
            onSubmit={onLogin}
            style={{ display: "grid", gap: 12, marginTop: 12 }}
          >
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
              Clave
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            {error ? <p style={{ color: "crimson", margin: 0 }}>{error}</p> : null}

            <button type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </button>

            {googleClientId ? (
              <button
                type="button"
                disabled={loading || !googleReady}
                onClick={onGoogleClick}
                style={{ opacity: 0.95 }}
              >
                Continuar con Google
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={loading}
              style={{ opacity: 0.9 }}
            >
              Cambiar email
            </button>

            <div style={{ marginTop: 6 }}>
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/${locale}/register?email=${encodeURIComponent(email)}`
                  )
                }
                disabled={loading}
                style={{ opacity: 0.9 }}
              >
                No tengo cuenta → Registrarme
              </button>
            </div>

            <div style={{ marginTop: 6 }}>
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/${locale}/forgot-password?email=${encodeURIComponent(email)}`
                  )
                }
                disabled={loading}
                style={{ opacity: 0.9 }}
              >
                Olvidé mi contraseña
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
