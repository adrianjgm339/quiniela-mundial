"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCatalog, type CatalogSport } from "@/lib/api";

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
    setLoadError(null);

    getCatalog(locale)
      .then((sports) => {
        setData(sports);

        const firstSportId = sports[0]?.id ?? "";
        const firstCompId = sports[0]?.competitions[0]?.id ?? "";

        setSportId(firstSportId);
        setCompetitionId(firstCompId);
      })
      .catch((e: any) => setLoadError(e?.message ?? "Error"));
  }, [locale]);

  const sport = useMemo(() => data?.find((s) => s.id === sportId), [data, sportId]);
  const competitions: Competition[] = sport?.competitions ?? [];

  const competition = useMemo(
    () => competitions.find((c) => c.id === competitionId),
    [competitions, competitionId]
  );

  const seasons: Season[] = competition?.seasons ?? [];

  function selectSeason(se: Season) {
    const sportName = data?.find((s) => s.id === sportId)?.name ?? "";
    const competitionName = competitions.find((c) => c.id === competitionId)?.name ?? "";
  
    localStorage.setItem("activeSportId", sportId);
    localStorage.setItem("activeSportName", sportName);
  
    localStorage.setItem("activeCompetitionId", competitionId);
    localStorage.setItem("activeCompetitionName", competitionName);
  
    localStorage.setItem("activeSeasonId", se.id);
    localStorage.setItem("activeSeasonName", se.name);
  
    router.push(`/${locale}/dashboard`);
  }
  

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">Selecciona tu evento</h1>

          <Link
            href={`/${locale}/dashboard`}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
          >
            Volver
          </Link>
        </div>

        {loadError && (
          <div className="mt-6 rounded-2xl border border-red-700 bg-red-950/40 p-4 text-red-200">
            {loadError}
          </div>
        )}

        {!data && !loadError && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 text-white/70">
            Cargando catálogo...
          </div>
        )}

        {data && (
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {/* Deportes */}
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-sm font-semibold text-white/80">Deporte</h2>
              <div className="mt-4 grid gap-2">
                {data.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSportId(s.id);
                      setCompetitionId(s.competitions[0]?.id ?? "");
                    }}
                    className={[
                      "w-full rounded-xl px-4 py-3 text-left transition",
                      s.id === sportId ? "bg-white/15" : "hover:bg-white/10",
                    ].join(" ")}
                  >
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-white/60">{s.competitions.length} competición(es)</div>
                  </button>
                ))}
              </div>
            </section>

            {/* Competiciones */}
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-sm font-semibold text-white/80">Competición</h2>
              <div className="mt-4 grid gap-2">
                {competitions.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCompetitionId(c.id)}
                    className={[
                      "w-full rounded-xl px-4 py-3 text-left transition",
                      c.id === competitionId ? "bg-white/15" : "hover:bg-white/10",
                    ].join(" ")}
                  >
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-white/60">{c.seasons.length} evento(s)</div>
                  </button>
                ))}

                {!competitions.length && (
                  <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
                    No hay competiciones aún.
                  </div>
                )}
              </div>
            </section>

            {/* Eventos (Seasons) */}
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-sm font-semibold text-white/80">Evento</h2>
              <div className="mt-4 grid gap-2">
                {seasons.map((se) => (
                  <button
                    key={se.id}
                    onClick={() => selectSeason(se)}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left hover:bg-white/10"
                  >
                    <div className="font-medium">{se.name}</div>
                    <div className="text-xs text-white/60">{se.slug}</div>
                  </button>
                ))}

                {!seasons.length && (
                  <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
                    No hay eventos aún.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        <p className="mt-8 text-sm text-white/50">
          Catálogo cargado desde API: <span className="text-white/70">/catalog?locale={locale}</span>
        </p>
      </div>
    </main>
  );
}
