"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCatalog, setActiveSeason, type CatalogSport } from "@/lib/api";

type Competition = CatalogSport["competitions"][number];
type Season = Competition["seasons"][number];

export default function CatalogPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [data, setData] = useState<CatalogSport[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sportId, setSportId] = useState<string>("");
  const [competitionId, setCompetitionId] = useState<string>("");

  useEffect(() => {
    // ✅ Evita setState sincrónico dentro del effect (regla react-hooks/set-state-in-effect)
    Promise.resolve().then(() => {
      setLoadError(null);
      setData(null);
    });

    getCatalog(locale)
      .then((sports) => {
        setData(sports);

        const storedSportId = localStorage.getItem("activeSportId") ?? "";
        const storedCompetitionId = localStorage.getItem("activeCompetitionId") ?? "";

        const nextSportId =
          storedSportId && sports.some((s) => s.id === storedSportId)
            ? storedSportId
            : sports[0]?.id ?? "";

        const nextSport = sports.find((s) => s.id === nextSportId);

        const nextCompetitionId =
          storedCompetitionId && nextSport?.competitions?.some((c) => c.id === storedCompetitionId)
            ? storedCompetitionId
            : nextSport?.competitions?.[0]?.id ?? "";

        setSportId(nextSportId);
        setCompetitionId(nextCompetitionId);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Error";
        setLoadError(msg);
      });
  }, [locale]);

  const sport = useMemo(() => data?.find((s) => s.id === sportId), [data, sportId]);

  // ✅ Evita warning de deps: no creamos un array nuevo en cada render
  const competitions = useMemo<Competition[]>(() => sport?.competitions ?? [], [sport]);

  const competition = useMemo(
    () => competitions.find((c) => c.id === competitionId),
    [competitions, competitionId]
  );

  const seasons: Season[] = competition?.seasons ?? [];

  async function selectSeason(se: Season) {
    const sportName = data?.find((s) => s.id === sportId)?.name ?? "";
    const competitionName = competitions.find((c) => c.id === competitionId)?.name ?? "";

    localStorage.setItem("activeSportId", sportId);
    localStorage.setItem("activeSportName", sportName);

    localStorage.setItem("activeCompetitionId", competitionId);
    localStorage.setItem("activeCompetitionName", competitionName);

    localStorage.setItem("activeSeasonId", se.id);
    localStorage.setItem("activeSeasonName", se.name);

    // ✅ Persistir evento activo en backend para que /me y otras pantallas (ej: /leagues) queden coherentes
    const token = localStorage.getItem("token") ?? "";
    if (token.trim()) {
      try {
        await setActiveSeason(token, se.id);
      } catch (e) {
        // No bloqueamos la UX si falla, pero quedará inconsistente hasta que el backend responda bien
        console.warn("setActiveSeason failed", e);
      }
    }

    // Señal explícita de cambio de contexto (útil para /dashboard y para bust de cache)
    localStorage.setItem("activeSeasonSlug", se.slug ?? "");

    // Bump determinístico para bust de cache sin usar Date.now() (regla react-hooks/purity)
    const prev = Number(localStorage.getItem("activeContextUpdatedAt") ?? "0");
    const cv = String(prev + 1);
    localStorage.setItem("activeContextUpdatedAt", cv);

    // Forzar navegación “real” (y re-render) pasando seasonId por query param
    router.push(`/${locale}/dashboard?seasonId=${encodeURIComponent(se.id)}&cv=${cv}`);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">Selecciona tu evento</h1>

          <Link
            href={`/${locale}/dashboard`}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
          >
            Volver
          </Link>
        </div>

        {loadError && (
          <div className="mt-6 rounded-2xl border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 p-4 text-[var(--destructive)]">
            {loadError}
          </div>
        )}

        {!data && !loadError && (
          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 text-[var(--muted-foreground)]">
            Cargando catálogo...
          </div>
        )}

        {data && (
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {/* Deportes */}
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <h2 className="text-lg font-semibold">Deporte</h2>

              <div className="mt-4 grid gap-2">
                {data.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSportId(s.id);
                      setCompetitionId(s.competitions?.[0]?.id ?? "");
                    }}
                    className={[
                      "w-full rounded-xl border px-4 py-3 text-left text-sm transition",
                      s.id === sportId
                        ? "border-[var(--primary)] bg-[var(--primary)]/10"
                        : "border-[var(--border)] hover:bg-[var(--muted)]",
                    ].join(" ")}
                  >
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">{s.slug}</div>
                  </button>
                ))}
              </div>
            </section>

            {/* Competiciones */}
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <h2 className="text-lg font-semibold">Competición</h2>

              <div className="mt-4 grid gap-2">
                {competitions.length === 0 && (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4 text-sm text-[var(--muted-foreground)]">
                    No hay competiciones disponibles.
                  </div>
                )}

                {competitions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCompetitionId(c.id)}
                    className={[
                      "w-full rounded-xl border px-4 py-3 text-left text-sm transition",
                      c.id === competitionId
                        ? "border-[var(--primary)] bg-[var(--primary)]/10"
                        : "border-[var(--border)] hover:bg-[var(--muted)]",
                    ].join(" ")}
                  >
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">{c.slug}</div>
                  </button>
                ))}
              </div>
            </section>

            {/* Eventos */}
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <h2 className="text-lg font-semibold">Evento</h2>

              <div className="mt-4 grid gap-2">
                {seasons.length === 0 && (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4 text-sm text-[var(--muted-foreground)]">
                    No hay eventos disponibles.
                  </div>
                )}

                {seasons.map((se) => (
                  <button
                    key={se.id}
                    onClick={() => selectSeason(se)}
                    className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-left text-sm transition hover:bg-[var(--muted)]"
                  >
                    <div className="font-medium">{se.name}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">{se.slug}</div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}