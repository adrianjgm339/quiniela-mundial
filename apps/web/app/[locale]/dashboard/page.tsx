"use client";

import { useEffect, useState } from "react";
import { me } from "@/lib/api";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

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

  function readActiveSeasonFromLocalStorage(): ActiveSeason {
    const seasonId = localStorage.getItem("activeSeasonId") ?? "";
    if (!seasonId) return null;

    const seasonName = localStorage.getItem("activeSeasonName") ?? "";
    const seasonSlug = localStorage.getItem("activeSeasonSlug") ?? "";

    const competitionId = localStorage.getItem("activeCompetitionId") ?? "";
    const competitionName = localStorage.getItem("activeCompetitionName") ?? "";
    const competitionSlug = ""; // no lo guardamos hoy; no es crítico para mostrar

    const sportId = localStorage.getItem("activeSportId") ?? "";
    const sportName = localStorage.getItem("activeSportName") ?? "";
    const sportSlug = ""; // no lo guardamos hoy; no es crítico para mostrar

    return {
      id: seasonId,
      slug: seasonSlug,
      name: seasonName || "Evento",
      competition: {
        id: competitionId,
        slug: competitionSlug,
        name: competitionName || "Competición",
        sport: {
          id: sportId,
          slug: sportSlug,
          name: sportName || "Deporte",
        },
      },
    };
  }

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

    // 1) Primero reflejamos el evento elegido en /catalog (source of truth actual)
    const localActive = readActiveSeasonFromLocalStorage();
    if (localActive) {
      setActiveSeason(localActive);
    }

    // 2) Luego cargamos "me" para user, pero SIN pisar el evento si el usuario cambió en localStorage
    me(token, locale)
      .then((data) => {
        setUser(data);

        const localSeasonId = localStorage.getItem("activeSeasonId") ?? "";
        const serverActive = (data as any)?.activeSeason ?? null;

        // Solo usamos el activeSeason del backend si:
        // - no hay uno en localStorage, o
        // - coincide el mismo id (para enriquecer con slugs/objetos reales)
        if (!localSeasonId) {
          setActiveSeason(serverActive);
        } else if (serverActive?.id && serverActive.id === localSeasonId) {
          setActiveSeason(serverActive);
        }

        if ((data as any)?.countryCode) {
          localStorage.setItem("countryCode", (data as any).countryCode);
        }
      })

  }, [router, locale]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <PageHeader
          title="Dashboard"
          actions={
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/${locale}/catalog`)}
              >
                Cambiar evento
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/${locale}/leagues`)}
              >
                Ligas
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/${locale}/matches`)}
              >
                Partidos
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/${locale}/rankings`)}
              >
                Rankings
              </Button>

              {user?.role === "ADMIN" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push(`/${locale}/admin`)}
                >
                  Admin
                </Button>
              )}

              <Button variant="outline" size="sm" onClick={logout}>
                Cerrar sesión
              </Button>
            </div>
          }
        />

        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">
            Evento activo
          </div>

          <div className="mt-2 text-lg font-semibold text-[var(--foreground)]">
            {activeSeason?.name ?? "No seleccionado"}
          </div>

          <div className="mt-1 text-sm text-[color:var(--muted)]">
            {activeSeason
              ? `${activeSeason.competition.sport.name} · ${activeSeason.competition.name}`
              : ""}
          </div>
        </Card>

        {!user && !error && (
          <Card className="p-4 text-[color:var(--muted)]">Cargando usuario...</Card>
        )}

        {error && (
          <Card className="p-4 border border-[var(--border)]">
            <div className="font-semibold">Error</div>
            <div className="mt-1 text-[color:var(--muted)]">{error}</div>
          </Card>
        )}

        {user && (
          <Card className="p-4">
            <div className="grid gap-2 text-sm">
              <div>
                <span className="font-semibold">ID:</span>{" "}
                <span className="text-[color:var(--muted)]">{user.id}</span>
              </div>
              <div>
                <span className="font-semibold">Email:</span>{" "}
                <span className="text-[color:var(--muted)]">{user.email}</span>
              </div>
              <div>
                <span className="font-semibold">Nombre:</span>{" "}
                <span className="text-[color:var(--muted)]">{user.displayName}</span>
              </div>
              <div>
                <span className="font-semibold">Rol:</span>{" "}
                <span className="text-[color:var(--muted)]">{user.role}</span>
              </div>
              <div>
                <span className="font-semibold">Creado:</span>{" "}
                <span className="text-[color:var(--muted)]">
                  {new Date(user.createdAt).toLocaleString(locale)}
                </span>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
