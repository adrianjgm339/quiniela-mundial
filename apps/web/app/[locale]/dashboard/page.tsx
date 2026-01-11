"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { me } from "@/lib/api";
import { useRouter, useParams } from "next/navigation";


type User = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  type ActiveSeason = null | {
    id: string;
    slug: string;
    name: string;
    competition: {
      id: string;
      slug: string;
      name: string;
      sport: { id: string; slug: string; name: string };
    };
  };

  const [user, setUser] = useState<User | null>(null);
  const [activeSeason, setActiveSeason] = useState<ActiveSeason>(null);
  const [error, setError] = useState<string | null>(null);


  function logout() {
    localStorage.removeItem("token");
    router.push(`/${locale}/login`);
  }

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push(`/${locale}/login`);
      return;
    }

    me(token, locale)
      .then((data) => {
        setUser(data);
        setActiveSeason(data.activeSeason ?? null);
        if (data?.countryCode) {
          localStorage.setItem("countryCode", data.countryCode);
        }
      })
      .catch((err) => {
        setError(err?.message ?? "Error");
        localStorage.removeItem("token");
        router.push(`/${locale}/login`);
      });
      
  }, [router, locale]);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Dashboard</h1>

        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href={`/${locale}/catalog`}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
          >
            Cambiar evento
          </Link>

          <button
            onClick={() => router.push(`/${locale}/leagues`)}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
          >
            Ligas
          </button>

          <button
            onClick={() => router.push(`/${locale}/matches`)}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
          >
            Partidos
          </button>

          <button
            onClick={() => router.push(`/${locale}/rankings`)}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
          >
            Rankings
          </button>

          {user?.role === "ADMIN" && (
            <button
              onClick={() => router.push(`/${locale}/admin`)}
              className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
            >
              Admin
            </button>
          )}

          <button
            type="button"
            onClick={logout}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
          >
            Cerrar sesión
          </button>

        </div>
      </div>

      <div style={{ marginTop: 14, color: "rgba(255,255,255,0.75)" }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, opacity: 0.7 }}>
          Evento activo
        </div>

        <div style={{ marginTop: 6, fontSize: 16, fontWeight: 600 }}>
          {activeSeason?.name ?? "No seleccionado"}
        </div>

        <div style={{ marginTop: 2, fontSize: 13, opacity: 0.7 }}>
          {activeSeason
            ? `${activeSeason.competition.sport.name} · ${activeSeason.competition.name}`
            : ""}
        </div>
      </div>

      {!user && !error && <p style={{ marginTop: 16 }}>Cargando usuario...</p>}

      {error && (
        <div style={{ marginTop: 16, background: "#ffe5e5", color: "#000", padding: 10, borderRadius: 8 }}>
          {error}
        </div>
      )}

      {user && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 10,
          }}
        >
          <div>
            <b>ID:</b> {user.id}
          </div>
          <div>
            <b>Email:</b> {user.email}
          </div>
          <div>
            <b>Nombre:</b> {user.displayName}
          </div>
          <div>
            <b>Rol:</b> {user.role}
          </div>
          <div>
            <b>Creado:</b> {new Date(user.createdAt).toLocaleString(locale)}
          </div>
        </div>
      )}
    </div>
  );
}
