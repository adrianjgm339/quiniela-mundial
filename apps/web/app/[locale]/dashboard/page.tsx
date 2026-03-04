"use client";

import { useEffect, useMemo, useState } from "react";
import {
  me,
  getMatches,
  getMyLeagues,
  getLeagueLeaderboard,
  getWorldLeaderboard,
  getMyPointsBreakdown,
  ApiPointsBreakdown,
  listPicks,
  type ApiMatch,
  type ApiLeague,
  type LeaderboardRow,
} from "@/lib/api";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { TeamWithFlag } from "@/components/team-with-flag";

type User = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: string;
};


type PickLite = {
  matchId: string;
  homePred: number;
  awayPred: number;
  koWinnerTeamId?: string | null;
};

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

type MeResponse = User & {
  activeSeason?: ActiveSeason | null;
  countryCode?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(obj: unknown, key: string): string | null {
  if (!isRecord(obj)) return null;
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

function getBool(obj: unknown, key: string): boolean {
  if (!isRecord(obj)) return false;
  return obj[key] === true;
}

function getTeamFlagKey(team: unknown): string | null {
  return getString(team, "flagKey");
}

function getTeamIsPlaceholder(team: unknown): boolean {
  return getBool(team, "isPlaceholder");
}



export default function DashboardPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [user, setUser] = useState<User | null>(null);
  const [activeSeason, setActiveSeason] = useState<ActiveSeason>(null);
  const [error, setError] = useState<string | null>(null);

  const [dashLoading, setDashLoading] = useState(false);

  // Datos para widgets
  const [myLeagues, setMyLeagues] = useState<ApiLeague[]>([]);
  const [matches, setMatches] = useState<ApiMatch[]>([]);

  // Rankings preview
  const [topTitle, setTopTitle] = useState<string>("Top 10");
  const [topRows, setTopRows] = useState<LeaderboardRow[]>([]);

  const [topScope, setTopScope] = useState<"LEAGUE" | "WORLD" | null>(null);
  const [activeLeagueId, setActiveLeagueId] = useState<string>("");
  const [picksLoading, setPicksLoading] = useState(false);
  const [pickByMatchId, setPickByMatchId] = useState<Record<string, PickLite>>({});
  const [myTopRow, setMyTopRow] = useState<LeaderboardRow | null>(null);

  const [pointsBreakdown, setPointsBreakdown] = useState<ApiPointsBreakdown | null>(null);
  const [pbLoading, setPbLoading] = useState(false);

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
    let cancelled = false;

    async function run() {
      if (!activeLeagueId) {
        setPickByMatchId({});
        return;
      }

      const t = localStorage.getItem("token");
      if (!t) {
        setPickByMatchId({});
        return;
      }

      setPicksLoading(true);
      try {
        const picks = await listPicks(t, activeLeagueId);
        if (cancelled) return;

        const map: Record<string, PickLite> = {};
        for (const p of picks) {
          // matchId es lo importante para el dashboard
          map[p.matchId] = p;
        }
        setPickByMatchId(map);
      } catch (e) {
        console.error("Dashboard listPicks error", e);
        if (!cancelled) setPickByMatchId({});
      } finally {
        if (!cancelled) setPicksLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [activeLeagueId]);

  async function applyActiveLeague(nextLeagueId: string) {
    setActiveLeagueId(nextLeagueId);

    if (nextLeagueId) localStorage.setItem("activeLeagueId", nextLeagueId);
    else localStorage.removeItem("activeLeagueId");

    // recargar SOLO el Top preview (no tumbar dashboard)
    const t = localStorage.getItem("token") || "";
    if (!t) return;

    const seasonId = localStorage.getItem("activeSeasonId") || "";

    try {
      if (nextLeagueId) {
        const lb = await getLeagueLeaderboard(t, nextLeagueId, 10);
        setTopScope("LEAGUE");
        setTopTitle(`Top 10 · ${lb.league.name}`);
        setTopRows(lb.top ?? []);
        setMyTopRow(lb.me ?? null);
        setPbLoading(true);
        try {
          const pb = await getMyPointsBreakdown(t, nextLeagueId);
          setPointsBreakdown(pb);
        } catch (e) {
          console.error("Dashboard points breakdown error", e);
          setPointsBreakdown(null);
        } finally {
          setPbLoading(false);
        }
      } else if (seasonId) {
        const wb = await getWorldLeaderboard(t, 10, seasonId);
        setTopScope("WORLD");
        setTopTitle("Top 10 · Mundial");
        setTopRows(wb.top ?? []);
        setMyTopRow(wb.me ?? null);
        setPointsBreakdown(null);
      } else {
        setTopScope(null);
        setTopTitle("Top 10");
        setTopRows([]);
        setMyTopRow(null);
        setPointsBreakdown(null);
      }
    } catch (e) {
      console.error("Dashboard applyActiveLeague error", e);
      // no mostramos error blocking: solo dejamos el último estado válido
    }
  }

  function toTitleCase(input: string) {
    const s = (input || "").trim().toLowerCase();
    if (!s) return "";
    return s.replace(/\p{L}[\p{L}\p{M}'’\-]*/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1));
  }

  function parseTs(iso?: string | null) {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
  }

  function formatLocalDateTime(locale: string, utcIso?: string | null) {
    const ts = parseTs(utcIso);
    if (!ts) return "—";
    const d = new Date(ts);

    const date = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "2-digit",
      month: "short",
    }).format(d);

    const time = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);

    return `${date} · ${time}`;
  }

  const leaguesInActiveSeason = useMemo(() => {
    if (!activeSeason?.id) return [];
    return myLeagues.filter((l) => l.seasonId === activeSeason.id);
  }, [myLeagues, activeSeason?.id]);

  const upcomingMatches = useMemo(() => {
    const now = Date.now();
    const list = (matches ?? [])
      .map((m) => ({ m, ts: parseTs(m.utcDateTime) ?? 0 }))
      .filter((x) => x.ts >= now)
      .sort((a, b) => a.ts - b.ts)
      .slice(0, 5)
      .map((x) => x.m);

    return list;
  }, [matches]);

  const progress = useMemo(() => {
    const total = matches.length;
    const confirmed = matches.filter((m) => !!m.resultConfirmed).length;
    const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0;
    return { total, confirmed, pct };
  }, [matches]);

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

    // Widgets del dashboard (ligas, partidos, top5)
    // Nota: se recarga cuando cambia activeSeason.id
    (async () => {
      try {
        setDashLoading(true);

        const t = localStorage.getItem("token") || "";
        if (!t) return;

        const seasonId = localStorage.getItem("activeSeasonId") || "";

        // 1) Mis ligas (para conteos + detectar liga activa)
        const leagues = await getMyLeagues(t);
        setMyLeagues(leagues);

        // 2) Partidos del evento activo (si existe)
        if (seasonId) {
          const ms = await getMatches(t, locale, { seasonId });
          setMatches(ms);
        } else {
          setMatches([]);
        }

        // 3) Top 10: preferimos Liga activa si existe; si no, Mundial
        const storedLeagueId = localStorage.getItem("activeLeagueId") || "";
        const activeLeagueOk = !!storedLeagueId && leagues.some((l) => l.id === storedLeagueId);

        // reflejar en state (para el selector)
        setActiveLeagueId(activeLeagueOk ? storedLeagueId : "");

        if (activeLeagueOk) {
          const lb = await getLeagueLeaderboard(t, storedLeagueId, 10);
          setTopScope("LEAGUE");
          setTopTitle(`Top 10 · ${lb.league.name}`);
          setTopRows(lb.top ?? []);
          setMyTopRow(lb.me ?? null);
          setPbLoading(true);
          try {
            const pb = await getMyPointsBreakdown(t, storedLeagueId);
            setPointsBreakdown(pb);
          } catch (e) {
            console.error("Dashboard points breakdown error", e);
            setPointsBreakdown(null);
          } finally {
            setPbLoading(false);
          }
        } else if (seasonId) {
          const wb = await getWorldLeaderboard(t, 10, seasonId);
          setTopScope("WORLD");
          setTopTitle("Top 10 · Mundial");
          setTopRows(wb.top ?? []);
          setMyTopRow(wb.me ?? null);
          setPointsBreakdown(null);
        } else {
          setTopScope(null);
          setTopTitle("Top 10");
          setTopRows([]);
          setMyTopRow(null);
          setPointsBreakdown(null);
        }
      } catch (e: unknown) {
        // No tumbamos dashboard por widgets
        console.error("Dashboard widgets error", e);
      } finally {
        setDashLoading(false);
      }
    })();

    // 2) Luego cargamos "me" para user, pero SIN pisar el evento si el usuario cambió en localStorage
    me(token, locale)
      .then((data) => {
        setUser(data);

        const localSeasonId = localStorage.getItem("activeSeasonId") ?? "";
        const dataMe = data as unknown as MeResponse;

        const serverActive = dataMe.activeSeason ?? null;

        // Solo usamos el activeSeason del backend si:
        // - no hay uno en localStorage, o
        // - coincide el mismo id (para enriquecer con slugs/objetos reales)
        if (!localSeasonId) {
          setActiveSeason(serverActive);
        } else if (serverActive?.id && serverActive.id === localSeasonId) {
          setActiveSeason(serverActive);
        }

        if (dataMe.countryCode) {
          localStorage.setItem("countryCode", dataMe.countryCode);
        }
      })

  }, [router, locale]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <PageHeader
          title="Dashboard"
          actions={
            <div className="flex flex-wrap gap-2 justify-end">

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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Evento activo */}
            <Card className="p-4 border-l-4 border-l-[color:var(--accent)]">
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs uppercase tracking-wide text-[color:var(--accent)] opacity-70">
                  Evento activo
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  className="text-[color:var(--accent)]"
                  onClick={() => router.push(`/${locale}/catalog`)}
                  title="Cambiar evento activo"
                >
                  Cambiar evento
                </Button>
              </div>

              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <div className="text-xl font-semibold text-[color:var(--accent)]">
                  {activeSeason?.name ?? "No seleccionado"}
                </div>

                {activeSeason?.id ? (
                  <span className="inline-flex items-center rounded-full border border-[color:var(--accent)] px-2 py-0.5 text-xs text-[color:var(--muted)]">
                    Activo
                  </span>
                ) : null}
              </div>

              <div className="mt-1 text-sm text-[color:var(--accent)] opacity-80">
                {activeSeason
                  ? `${activeSeason.competition.sport.name} · ${activeSeason.competition.name}`
                  : "Selecciona un evento para ver partidos, rankings y progreso."}
              </div>
            </Card>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card className="p-4">
                <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">Mis ligas</div>
                <div className="mt-2 text-2xl font-semibold">{leaguesInActiveSeason.length}</div>
                <div className="mt-1 text-sm text-[color:var(--muted)]">en este evento</div>
                <div className="mt-3">
                  <Button variant="secondary" size="sm" onClick={() => router.push(`/${locale}/leagues?view=my`)}>
                    Ir a mis ligas
                  </Button>
                </div>
              </Card>

              <Card className="p-4">
                <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">Resumen del evento</div>

                <div className="mt-2 text-2xl font-semibold leading-tight">Grupos</div>

                <div className="mt-1 text-sm text-[color:var(--muted)]">Posiciones y clasificados</div>

                <Button
                  className="mt-4 w-fit justify-start"
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push(`/${locale}/summary`)}
                >
                  Ir a resumen
                </Button>
              </Card>

              <Card className="p-4 md:col-span-2">
                <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">Progreso del torneo</div>
                <div className="mt-2 text-2xl font-semibold">{progress.pct}%</div>
                <div className="mt-1 text-sm text-[color:var(--muted)]">
                  {progress.confirmed}/{progress.total} confirmados
                </div>

                <div className="mt-3 h-2 rounded-full bg-[color:var(--border)] overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: `${progress.pct}%`,
                      background: "color-mix(in srgb, var(--primary) 70%, transparent)",
                    }}
                  />
                </div>
              </Card>
            </div>

            {/* Próximos partidos (lista compacta) */}
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)] font-medium flex items-center justify-between">
                <span>Próximos partidos</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!activeLeagueId}
                  title={!activeLeagueId ? "Selecciona una liga para completar tus pronósticos" : "Ir a Partidos para completar pronósticos"}
                  onClick={() => router.push(`/${locale}/matches`)}
                >
                  Completar pronósticos
                </Button>
              </div>

              <div className="divide-y divide-[var(--border)]">
                {dashLoading ? (
                  <div className="px-4 py-4 text-sm text-[color:var(--muted)]">Cargando…</div>
                ) : upcomingMatches.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-[color:var(--muted)]">
                    {activeSeason?.id ? "No hay partidos próximos." : "Selecciona un evento para ver la agenda."}
                  </div>
                ) : (
                  upcomingMatches.map((m) => (
                    <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          <span className="inline-flex items-center gap-2 min-w-0">
                            <TeamWithFlag
                              name={m.homeTeam?.name ?? ""}
                              flagKey={getTeamFlagKey(m.homeTeam)}
                              isPlaceholder={getTeamIsPlaceholder(m.homeTeam)}
                            />
                            <span className="text-[color:var(--muted)]">vs</span>
                            <TeamWithFlag
                              name={m.awayTeam?.name ?? ""}
                              flagKey={getTeamFlagKey(m.awayTeam)}
                              isPlaceholder={getTeamIsPlaceholder(m.awayTeam)}
                            />
                          </span>
                        </div>
                        <div className="text-sm text-[color:var(--muted)] truncate">
                          {formatLocalDateTime(locale, m.utcDateTime)} · {m.venue ?? "—"}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--muted)]">
                          {!activeLeagueId ? (
                            "Selecciona una liga para ver el estado de tus pronósticos."
                          ) : picksLoading ? (
                            "Cargando pronósticos…"
                          ) : pickByMatchId[m.id] ? (
                            <>
                              <span className="text-[color:var(--foreground)] font-medium">
                                Pronóstico: {pickByMatchId[m.id].homePred}–{pickByMatchId[m.id].awayPred}
                              </span>
                              {pickByMatchId[m.id].koWinnerTeamId ? (
                                <span className="ml-2">· KO: {pickByMatchId[m.id].koWinnerTeamId}</span>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-[color:var(--foreground)] font-medium">Partido aún sin pronóstico</span>
                          )}
                        </div>
                      </div>

                      <div className="mt-2">
                        <div className="text-[11px] text-[color:var(--muted)] text-center">
                          Probabilidad de victoria (próximamente)
                        </div>

                        <div className="mt-1 flex items-center justify-between text-[11px] text-[color:var(--muted)]">
                          <span className="truncate max-w-[45%]">{toTitleCase(m.homeTeam.name)}</span>
                          <span className="truncate max-w-[45%] text-right">{toTitleCase(m.awayTeam.name)}</span>
                        </div>

                        <div className="mt-1 flex justify-center">
                          <div className="h-2 w-[60%] overflow-hidden rounded-full border border-[var(--border)]">
                            {/* placeholder 50/50 */}
                            <div className="h-full flex">
                              <div className="h-full w-1/2 bg-[color:var(--accent)] opacity-40" />
                              <div className="h-full w-1/2 bg-[color:var(--muted)] opacity-40" />
                            </div>
                          </div>
                        </div>

                        <div className="mt-1 flex justify-center">
                          <div className="w-[60%] flex items-center justify-between text-[11px] text-[color:var(--muted)]">
                            <span>50%</span>
                            <span>50%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Top 10 Preview */}
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)] font-medium flex items-center justify-between">
                <span>{topTitle}</span>
                <Button variant="secondary" size="sm" onClick={() => router.push(`/${locale}/rankings`)}>
                  Abrir
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[color:var(--muted)]">
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left px-4 py-2 w-16">#</th>
                      <th className="text-left px-4 py-2">Jugador</th>
                      <th className="text-right px-4 py-2 w-28">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRows.map((r) => (
                      <tr key={r.userId} className="border-b border-[var(--border)]">
                        <td className="px-4 py-2">{r.rank}</td>
                        <td className="px-4 py-2">{r.displayName ?? r.userId.slice(0, 8)}</td>
                        <td className="px-4 py-2 text-right font-semibold">{r.points}</td>
                      </tr>
                    ))}

                    {topRows.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-[color:var(--muted)]">
                          Sin datos aún.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Columna derecha (perfil/estado) */}
          <div className="space-y-6">
            {!user && !error && (
              <Card className="p-4 text-[color:var(--muted)]">Cargando usuario…</Card>
            )}

            {error && (
              <Card className="p-4 border border-[var(--border)]">
                <div className="font-semibold">Error</div>
                <div className="mt-1 text-[color:var(--muted)]">{error}</div>
              </Card>
            )}

            {user && (
              <Card className="p-4">
                <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">
                  Resumen de liga
                </div>

                <div className="mt-3 grid gap-3 text-sm">
                  <div className="grid gap-1">
                    <div className="text-[color:var(--muted)]">Liga activa</div>

                    <select
                      value={activeLeagueId}
                      onChange={(e) => applyActiveLeague(e.target.value)}
                      disabled={!activeSeason?.id || leaguesInActiveSeason.length === 0}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] disabled:opacity-50"
                      title={
                        !activeSeason?.id
                          ? "Selecciona un evento para ver tus ligas"
                          : leaguesInActiveSeason.length === 0
                            ? "No tienes ligas en este evento"
                            : "Selecciona la liga activa para el dashboard"
                      }
                    >
                      <option value="">
                        {leaguesInActiveSeason.length ? "— (Mundial)" : "—"}
                      </option>
                      {leaguesInActiveSeason.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>

                    {!activeSeason?.id && (
                      <div className="text-xs text-[color:var(--muted)]">
                        Selecciona un evento (Cambiar evento) para ver tu resumen.
                      </div>
                    )}

                    {activeSeason?.id && leaguesInActiveSeason.length === 0 && (
                      <div className="text-xs text-[color:var(--muted)]">
                        No tienes ligas en este evento. Crea o únete desde “Ligas”.
                      </div>
                    )}

                    <div className="pt-2 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => router.push(`/${locale}/leagues`)}
                      >
                        Gestionar ligas
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const seasonId = localStorage.getItem("activeSeasonId") || "";
                          const qs = activeLeagueId
                            ? `?scope=league&leagueId=${encodeURIComponent(activeLeagueId)}`
                            : seasonId
                              ? `?scope=world&seasonId=${encodeURIComponent(seasonId)}`
                              : `?scope=world`;
                          router.push(`/${locale}/rankings${qs}`);
                        }}
                        title="Abre rankings en el scope actual (liga activa o mundial)"
                      >
                        Ver ranking
                      </Button>
                    </div>
                  </div>

                  <div className="border-t border-[var(--border)] pt-3 grid gap-2">
                    <div className="text-[color:var(--muted)]">
                      Tu posición {topScope === "LEAGUE" ? "en la liga" : topScope === "WORLD" ? "mundial" : ""}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-[color:var(--muted)]">Ranking</div>
                      <div className="font-semibold">{myTopRow?.rank ?? "—"}</div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-[color:var(--muted)]">Puntos</div>
                      <div className="font-semibold">{myTopRow?.points ?? "—"}</div>
                    </div>

                    <div className="border-t border-[var(--border)] pt-3 grid gap-2">
                      <div className="text-[color:var(--muted)]">Desglose por concepto</div>

                      {pbLoading ? (
                        <div className="text-xs text-[color:var(--muted)]">Cargando desglose…</div>
                      ) : !activeLeagueId ? (
                        <div className="text-xs text-[color:var(--muted)]">Selecciona una liga para ver el desglose.</div>
                      ) : !pointsBreakdown || pointsBreakdown.breakdown.length === 0 ? (
                        <div className="text-xs text-[color:var(--muted)]">Aún no hay puntos desglosados (requiere resultados confirmados).</div>
                      ) : (
                        <div className="grid gap-1">
                          {pointsBreakdown.breakdown.map((r) => (
                            <div key={r.code} className="flex items-center justify-between text-sm">
                              <span className="truncate text-[color:var(--muted)]">{r.label}</span>
                              <span className="font-semibold">{r.points}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="text-xs text-[color:var(--muted)]">
                      Usuario: {user.displayName} · {user.email}
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
