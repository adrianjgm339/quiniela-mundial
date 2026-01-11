'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getMatches, getMyLeagues, listPicks, upsertPick, type ApiMatch, type ApiPick, type ApiLeague,} from '@/lib/api';
import { useSearchParams } from "next/navigation";

export default function MatchesPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const [now, setNow] = useState(() => Date.now());
  const searchParams = useSearchParams();
  const phase = searchParams.get("phase") || "";
  const group = searchParams.get("group") || "";

  useEffect(() => {
  // Si ya viene phase en URL, no tocamos nada
    const hasPhaseInUrl = searchParams.has("phase");
    const hasGroupInUrl = searchParams.has("group");

    if (hasPhaseInUrl || hasGroupInUrl) return;

    const savedPhase = localStorage.getItem("matchesPhase") || "";
    const savedGroup = localStorage.getItem("matchesGroup") || "";

    if (!savedPhase && !savedGroup) return;

    const params = new URLSearchParams(searchParams.toString());
    if (savedPhase) params.set("phase", savedPhase);
    if (savedGroup && savedPhase === "F01") params.set("group", savedGroup);

    const qs = params.toString();
    router.replace(`/${locale}/matches${qs ? `?${qs}` : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);


  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000); // refresca cada 30s
    return () => clearInterval(t);
  }, []);

  const [items, setItems] = useState<ApiMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [picksByMatchId, setPicksByMatchId] = useState<Record<string, ApiPick>>({});

  const [token, setToken] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<ApiLeague[]>([]);
  const [loadingPicks, setLoadingPicks] = useState(false);

  // modal state
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ApiMatch | null>(null);
  const [homePred, setHomePred] = useState<number>(0);
  const [awayPred, setAwayPred] = useState<number>(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function isLocked(m: ApiMatch) {
    // Si el backend marca confirmado, bloqueamos
    if (m.resultConfirmed) return true;

    // Si tenemos closeUtc, bloqueamos cuando ya pasó
    if (!m.closeUtc) return false;

    const closeMs = new Date(m.closeUtc).getTime();
    if (Number.isNaN(closeMs)) return false;

    return Date.now() > closeMs;
  }

  function parseTs(iso?: string | null) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
  }

  function getCloseTs(m: any) {
  // Preferimos closeUtc
  const close = parseTs(m.closeUtc);
  if (close) return close;

  // Fallback: utcDateTime/timeUtc - closeMinutes (si lo tienes en el DTO)
  const start = parseTs(m.utcDateTime ?? m.timeUtc ?? m.kickoffUtc);
  const mins = typeof m.closeMinutes === "number" ? m.closeMinutes : null;
  if (start && mins != null) return start - mins * 60_000;

  return null;
  }

  function formatLocalDateTime(locale: string, utcIso?: string | null) {
  const ts = parseTs(utcIso);
  if (!ts) return "";
  const d = new Date(ts);

  // Sin timeZone => usa la zona horaria local del navegador del usuario
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

  function formatCountdown(ms: number) {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin <= 0) return "0m";

  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;

  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
  }

  useEffect(() => {
  const t = localStorage.getItem('token');
  if (!t) {
    router.push(`/${locale}/login`);
    return;
  }

  setToken(t);

  (async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargamos partidos (con filtros) y ligas en paralelo
      const [data, myLeagues] = await Promise.all([
        getMatches(t, locale, {
          phaseCode: phase || undefined,
          groupCode: group || undefined,
        }),
        getMyLeagues(t),
      ]);

      setItems(data);
      setLeagues(myLeagues);

      // Determinar liga activa válida
      let lid = localStorage.getItem('activeLeagueId');

      const exists = lid && myLeagues.some((l) => l.id === lid);
      if (!exists) {
        lid = myLeagues[0]?.id ?? null;
        if (!lid) {
          router.push(`/${locale}/leagues`);
          return;
        }
        localStorage.setItem('activeLeagueId', lid);
      }

      setLeagueId(lid);
    } catch (e: any) {
      setError(e?.message ?? 'Error cargando partidos');
    } finally {
      setLoading(false);
    }
  })();
  }, [locale, router, phase, group]);

  useEffect(() => {
  if (!token || !leagueId) return;

  (async () => {
    try {
      setLoadingPicks(true);

      const picks = await listPicks(token, leagueId);
      const map: Record<string, ApiPick> = {};
      for (const p of picks) map[p.matchId] = p;

      setPicksByMatchId(map);
    } catch (e: any) {
      setError(e?.message ?? 'Error cargando picks');
    } finally {
      setLoadingPicks(false);
    }
  })();
  }, [token, leagueId]);


  const grouped = useMemo(() => {
    const map = new Map<string, ApiMatch[]>();
    for (const m of items) {
      if (!map.has(m.dateKey)) map.set(m.dateKey, []);
      map.get(m.dateKey)!.push(m);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  function openPickModal(match: ApiMatch) {
    setSaveError(null);
    setSelected(match);

    const existing = picksByMatchId[match.id];
    setHomePred(existing?.homePred ?? 0);
    setAwayPred(existing?.awayPred ?? 0);

    setOpen(true);
  }

  async function onSave() {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push(`/${locale}/login`);
      return;
    }
    if (!leagueId) {
      setSaveError('No hay Liga activa. Ve a /leagues y selecciona una.');
      return;
    }
    if (!selected) return;

    // Bloqueo defensivo (por si el usuario fuerza el click)
    if (isLocked(selected)) {
      setSaveError('Este partido ya está cerrado. No puedes modificar tu pronóstico.');
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const pick = await upsertPick(token, {
        leagueId,
        matchId: selected.id,
        homePred: Number(homePred),
        awayPred: Number(awayPred),
      });

      setPicksByMatchId((prev) => ({ ...prev, [pick.matchId]: pick }));
      setOpen(false);
      setSelected(null);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Error guardando pick');
    } finally {
      setSaving(false);
    }
  }

  const selectedLocked = selected ? isLocked(selected) : false;

  function onChangeLeague(newLeagueId: string) {
  setLeagueId(newLeagueId);
  localStorage.setItem('activeLeagueId', newLeagueId);

  // Para no mostrar picks de la liga anterior mientras carga
  setPicksByMatchId({});
  }

  const activeLeague = leagueId ? leagues.find((l) => l.id === leagueId) : null;
  const activeLeagueLabel = activeLeague
  ? `${activeLeague.name} · Código: ${activeLeague.joinCode}`
  : "—";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Partidos</h1>
            <div className="mt-1 text-sm text-zinc-400">
              Liga activa: {activeLeagueLabel}
              {loadingPicks ? " · Cargando picks…" : ""}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              className="rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
              value={leagueId ?? ""}
              onChange={(e) => onChangeLeague(e.target.value)}
              disabled={leagues.length === 0}
              title="Selecciona la liga para la cual estás pronosticando"
            >
              {leagues.length === 0 && <option value="">Sin ligas</option>}
              {leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.joinCode})
                </option>
              ))}
            </select>

            <button
              onClick={() => {
                localStorage.setItem("matchesPhase", "");
                localStorage.setItem("matchesGroup", "");
                router.replace(`/${locale}/matches`);
              }}
              className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm"
              title="Quitar filtros"
            >
              Limpiar
            </button>
            
            <button
              onClick={() => router.push(`/${locale}/leagues`)}
              className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
              title="Gestionar ligas"
            >
              Ligas
            </button>

            <button
              onClick={() => router.push(`/${locale}/dashboard`)}
              className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
            >
              Volver
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-zinc-300">
            Fase
            <select
              className="rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
              value={phase}
              onChange={(e) => {
                const p = e.target.value;
                localStorage.setItem("matchesPhase", p);
                if (p !== "F01") localStorage.setItem("matchesGroup", "");

                const params = new URLSearchParams(searchParams.toString());

                if (p) params.set("phase", p);
                else params.delete("phase");

                // Solo hay grupos en F01
                if (p !== "F01") params.delete("group");

                const qs = params.toString();
                router.replace(`/${locale}/matches${qs ? `?${qs}` : ""}`);
              }}
              title="Filtrar por fase"
            >
              <option value="">Todas</option>
              <option value="F01">Fase de grupos</option>
              <option value="F02">16avos</option>
              <option value="F03">Octavos</option>
              <option value="F04">Cuartos</option>
              <option value="F05">Semifinal</option>
              <option value="F06">3er puesto</option>
              <option value="F07">Final</option>
            </select>
          </label>

          <label className="text-sm text-zinc-300">
            Grupo
            <select
              className="rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm disabled:opacity-50"
              value={group}
              disabled={phase !== "F01"}
              onChange={(e) => {
                const g = e.target.value;
                localStorage.setItem("matchesGroup", g);

                const params = new URLSearchParams(searchParams.toString());

                if (g) params.set("group", g);
                else params.delete("group");

                const qs = params.toString();
                router.replace(`/${locale}/matches${qs ? `?${qs}` : ""}`);
              }}
              title={phase !== "F01" ? "Disponible solo en fase de grupos" : "Filtrar por grupo"}
            >
              <option value="">Todos</option>
              {"ABCDEFGHIJKL".split("").map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-zinc-300">
            Cargando partidos…
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-4 text-red-200">
            {error}
          </div>
        )}

        {!loading &&
          !error &&
          grouped.map(([dateKey, matches]) => (
            <div
              key={dateKey}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-zinc-800 font-medium">{dateKey}</div>

              <div className="divide-y divide-zinc-800">
                {matches.map((m) => {
                  const myPick = picksByMatchId[m.id];
                  const locked = isLocked(m);
                  const kickoffLabel = formatLocalDateTime(
                    locale,
                    (m as any).utcDateTime ?? (m as any).timeUtc ?? null
                  );
                  const closeTs = getCloseTs(m);
                  const remainingMs = closeTs ? closeTs - now : null;
                  const hasPick = !!myPick;

                  return (
                    <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {m.homeTeam.name}{' '}
                          <span className="text-zinc-400">vs</span> {m.awayTeam.name}
                        </div>

                        <div className="text-sm text-zinc-400 truncate">
                          {m.timeUtc} UTC · {m.venue ?? '—'}
                        </div>

                        {myPick && (
                          <div className="mt-1 text-sm text-emerald-300">
                            Tu pick: {myPick.homePred} - {myPick.awayPred}
                            <span className="text-zinc-400"> · {myPick.status}</span>
                          </div>
                        )}
                        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
                          <div>Hora local: {kickoffLabel || "—"}</div>
                          {closeTs ? (
                            locked ? (
                              <div style={{ color: "#b00020" }}>Cerrado</div>
                            ) : (
                              <div>
                                Cierra en: <strong>{formatCountdown(Math.max(0, remainingMs ?? 0))}</strong>
                              </div>
                            )
                          ) : (
                            <div>Cierre: —</div>
                          )}
                        </div>

                      </div>

                      <div className="flex items-center gap-3">
                        {m.score ? (
                          <div className="px-3 py-1 rounded-lg bg-zinc-800 text-sm">
                            {m.score.home} - {m.score.away}
                          </div>
                        ) : (
                          <div className="px-3 py-1 rounded-lg bg-zinc-800 text-sm text-zinc-300">
                            {m.status}
                          </div>
                        )}

                        <button
                          className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium disabled:opacity-50"
                          onClick={() => openPickModal(m)}
                          disabled={!leagueId || locked || loadingPicks}
                          title={
                            !leagueId
                              ? 'Selecciona una liga primero'
                              : loadingPicks
                              ? 'Cargando picks de la liga...'
                              : locked
                              ? 'Partido cerrado. Pick bloqueado.'
                              : hasPick
                              ? 'Editar pronóstico'
                              : 'Pronosticar'
                          }
                        >
                          {locked ? "Cerrado" : hasPick ? "Editar" : "Pronosticar"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

        {!loading && !error && items.length === 0 && (
          <div className="text-zinc-400">No hay partidos para este evento.</div>
        )}
      </div>

      {/* MODAL */}
      {open && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-zinc-400">Pronóstico</div>
                <div className="text-lg font-semibold">
                  {selected.homeTeam.name} vs {selected.awayTeam.name}
                </div>
                <div className="text-sm text-zinc-400 mt-1">
                  {selected.dateKey} · {selected.timeUtc} UTC
                </div>
              </div>

              <button
                onClick={() => {
                  setOpen(false);
                  setSelected(null);
                }}
                className="rounded-lg bg-zinc-800 px-3 py-1 hover:bg-zinc-700"
              >
                X
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <div className="text-sm text-zinc-400">{selected.homeTeam.name}</div>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={homePred}
                  onChange={(e) => setHomePred(Number(e.target.value))}
                  disabled={selectedLocked}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 disabled:opacity-50"
                />
              </div>

              <div>
                <div className="text-sm text-zinc-400">{selected.awayTeam.name}</div>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={awayPred}
                  onChange={(e) => setAwayPred(Number(e.target.value))}
                  disabled={selectedLocked}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 disabled:opacity-50"
                />
              </div>
            </div>

            {selectedLocked && (
              <div className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/30 p-2 text-sm text-amber-200">
                Este partido ya está cerrado. No puedes modificar tu pronóstico.
              </div>
            )}

            {saveError && (
              <div className="mt-3 rounded-lg border border-red-900 bg-red-950/50 p-2 text-sm text-red-200">
                {saveError}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  setSelected(null);
                }}
                className="rounded-lg bg-zinc-800 px-3 py-2 hover:bg-zinc-700"
                disabled={saving}
              >
                Cancelar
              </button>

              <button
                onClick={onSave}
                className="rounded-lg bg-emerald-600 px-3 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-50"
                disabled={saving || selectedLocked}
              >
                {selectedLocked ? 'Cerrado' : saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
