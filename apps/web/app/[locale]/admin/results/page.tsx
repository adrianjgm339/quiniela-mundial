'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type ApiMatchLite = {
  id: string;
  utcDateTime?: string; // viene del API
  closeUtc?: string; // viene del API
  phaseCode?: string;
  groupCode?: string;
  venue?: string;

  homeTeam?: { name: string; flagKey?: string };
  awayTeam?: { name: string; flagKey?: string };

  resultConfirmed?: boolean;
  score?: { home: number | null; away: number | null };
};

type MeResponse = {
  id: string;
  role: string;
  activeSeasonId?: string | null;
  activeSeason?: {
    id?: string;
    name?: string | null;
    year?: number | null;
  } | null;
};

const API_URL = 'http://localhost:3001';

export default function AdminResultsPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [matches, setMatches] = useState<ApiMatchLite[]>([]);
  const [activeSeasonId, setActiveSeasonId] = useState<string>('');
  const [activeSeasonLabel, setActiveSeasonLabel] = useState<string>('');

  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  const [showDebug, setShowDebug] = useState(false);

  // Estado editable por match
  const [draft, setDraft] = useState<
    Record<string, { homeScore: string; awayScore: string; resultConfirmed: boolean }>
  >({});

  const [showOnlyPending, setShowOnlyPending] = useState<boolean>(true);

  // Filtros (como en /matches)
  const [phaseFilter, setPhaseFilter] = useState<string>('ALL'); // ALL | F01 | F02...
  const [groupFilter, setGroupFilter] = useState<string>('ALL'); // ALL | A | B | ...

  // Filtro por fecha (rango) — usa closeUtc (fallback utcDateTime)
  const [dateFrom, setDateFrom] = useState<string>(''); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>(''); // YYYY-MM-DD


  const PHASE_LABEL: Record<string, string> = {
    ALL: 'Todas',
    F01: 'Fase de grupos',
    F02: '16avos',
    F03: 'Octavos',
    F04: 'Cuartos',
    F05: 'Semifinal',
    F06: '3er puesto',
    F07: 'Final',
  };

  // Helpers
  const isGroupStage = phaseFilter === 'F01';

  const phaseOptions = useMemo(() => {
    const codes = Array.from(new Set(matches.map((m) => m.phaseCode).filter(Boolean))) as string[];
    // Orden deseado
    const order = ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07'];

    const key = (code: string) => {
      const idx = order.indexOf(code);
      return idx === -1 ? 999 : idx;
    };

    codes.sort((a, b) => key(a) - key(b));
    return ['ALL', ...codes];
  }, [matches]);

  const groupOptions = useMemo(() => {
    // Solo grupos cuando es fase de grupos
    if (!isGroupStage) return ['ALL'];
    const gs = matches
      .filter((m) => m.phaseCode === 'F01')
      .map((m) => m.groupCode)
      .filter(Boolean) as string[];
    const codes = Array.from(new Set(gs)).sort();
    return ['ALL', ...codes];
  }, [matches, isGroupStage]);

  const filteredMatches = useMemo(() => {
    let list = [...matches];

    // 1) Filtro Fase
    if (phaseFilter !== 'ALL') {
      list = list.filter((m) => (m.phaseCode ?? '') === phaseFilter);
    }

    // 2) Filtro Grupo (solo si fase grupos)
    if (phaseFilter === 'F01' && groupFilter !== 'ALL') {
      list = list.filter((m) => (m.groupCode ?? '') === groupFilter);
    }

    // 2.5) Filtro por fecha (rango, basado en closeUtc; fallback utcDateTime)
    if (dateFrom || dateTo) {
      const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
      const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

      list = list.filter((m) => {
        const key = m.closeUtc ?? m.utcDateTime;
        if (!key) return false;

        const ms = new Date(key).getTime();
        if (Number.isNaN(ms)) return false;

        if (fromMs !== null && ms < fromMs) return false;
        if (toMs !== null && ms > toMs) return false;

        return true;
      });
    }

    // 3) Orden natural por CIERRE (closeUtc)
    list.sort((a, b) => {
      const aKey = a.closeUtc ?? a.utcDateTime ?? '';
      const bKey = b.closeUtc ?? b.utcDateTime ?? '';
      return aKey.localeCompare(bKey);
    });

    // 4) Solo pendientes
    if (!showOnlyPending) return list;
    return list.filter((m) => !m.resultConfirmed);
  }, [matches, showOnlyPending, phaseFilter, groupFilter, dateFrom, dateTo]);

  function getTokenOrRedirect(): string | null {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push(`/${locale}/login`);
      return null;
    }
    return token;
  }

  async function fetchMe(token: string): Promise<MeResponse> {
    const res = await fetch(`${API_URL}/auth/me?locale=${encodeURIComponent(locale)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function fetchMatches(token: string, seasonId?: string) {
    const qs = new URLSearchParams();
    qs.set('locale', locale);
    if (seasonId) qs.set('seasonId', seasonId);

    const res = await fetch(`${API_URL}/matches?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as ApiMatchLite[];
    setMatches(data);

    // Inicializa draft:
    // - Si NO confirmado => inputs vacíos
    // - Si confirmado => usar score.home/score.away (incluye 0 si aplica)
    const nextDraft: Record<string, { homeScore: string; awayScore: string; resultConfirmed: boolean }> =
      {};

    for (const m of data) {
      const confirmed = !!m.resultConfirmed;

      const hs = confirmed ? m.score?.home : null;
      const as = confirmed ? m.score?.away : null;

      nextDraft[m.id] = {
        homeScore: hs === null || hs === undefined ? '' : String(hs),
        awayScore: as === null || as === undefined ? '' : String(as),
        resultConfirmed: confirmed,
      };
    }

    setDraft(nextDraft);
  }

  async function updateMatchResult(
    token: string,
    matchId: string,
    body: { homeScore?: number; awayScore?: number; resultConfirmed?: boolean },
  ) {
    const res = await fetch(`${API_URL}/matches/${matchId}/result`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function recomputeScoring(token: string) {
    const res = await fetch(`${API_URL}/scoring/recompute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  useEffect(() => {
    const token = getTokenOrRedirect();
    if (!token) return;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const me = await fetchMe(token);

        // Solo ADMIN
        if (me.role !== 'ADMIN') {
          router.push(`/${locale}/dashboard`);
          return;
        }

        const sid = me.activeSeasonId ?? '';
        setActiveSeasonId(sid);

        const label =
          me.activeSeason?.name?.trim() ||
          (me.activeSeason?.year ? `Mundial ${me.activeSeason.year}` : '') ||
          '';

        setActiveSeasonLabel(label);

        await fetchMatches(token, sid || undefined);
      } catch (e: any) {
        setError(e?.message ?? 'Error cargando datos');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  async function onSaveMatch(matchId: string) {
    const token = getTokenOrRedirect();
    if (!token) return;

    const d = draft[matchId];
    if (!d) return;

    // Validación mínima
    const hs = d.homeScore.trim() === '' ? undefined : Number(d.homeScore);
    const as = d.awayScore.trim() === '' ? undefined : Number(d.awayScore);

    if (hs !== undefined && (!Number.isInteger(hs) || hs < 0)) {
      setError('homeScore debe ser entero >= 0');
      return;
    }
    if (as !== undefined && (!Number.isInteger(as) || as < 0)) {
      setError('awayScore debe ser entero >= 0');
      return;
    }

    // Si marcas confirmado, exige ambos scores
    if (d.resultConfirmed && (hs === undefined || as === undefined)) {
      setError('Para confirmar el resultado debes colocar ambos scores.');
      return;
    }

    try {
      setSavingId(matchId);
      setError(null);

      await updateMatchResult(token, matchId, {
        homeScore: hs,
        awayScore: as,
        resultConfirmed: d.resultConfirmed,
      });

      // refresca lista
      await fetchMatches(token, activeSeasonId || undefined);
    } catch (e: any) {
      setError(e?.message ?? 'Error guardando resultado');
    } finally {
      setSavingId(null);
    }
  }

  async function onRecompute() {
    const token = getTokenOrRedirect();
    if (!token) return;

    try {
      setError(null);
      setRecomputeMsg(null);
      setRecomputing(true);

      const r = await recomputeScoring(token);

      setRecomputeMsg(
        `✅ Scoring recalculado: ${r.confirmedMatchesWithScore} partidos confirmados · ${r.picksProcessed} picks procesados.`,
      );

      // opcional: refrescar lista por si cambió algo
      await fetchMatches(token, activeSeasonId || undefined);
    } catch (e: any) {
      setError(e?.message ?? 'Error en recompute');
    } finally {
      setRecomputing(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-xl font-semibold mb-2">Admin · Resultados</div>
        <div className="opacity-80">Cargando…</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">Admin · Resultados</div>
          <div className="text-sm opacity-80">
            Season activa{activeSeasonLabel ? `: ${activeSeasonLabel}` : ''}
            {showDebug ? (
              <>
                {' · '}
                <span className="font-mono">{activeSeasonId || '(no definida)'}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">

          <button
            onClick={onRecompute}
            disabled={recomputing}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60"
          >
            {recomputing ? 'Recalculando…' : 'Recalcular Scoring'}
          </button>

          <button
            onClick={() => router.push(`/${locale}/rankings`)}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
          >
            Ver Rankings
          </button>

          <button
            onClick={() => router.push(`/${locale}/dashboard`)}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
          >
            Volver
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-3 rounded-lg border border-red-700 bg-red-950 text-red-200 text-sm">
          {error}
        </div>
      ) : null}

      {recomputeMsg ? (
        <div className="p-3 rounded-lg border border-emerald-700 bg-emerald-950 text-emerald-200 text-sm">
          {recomputeMsg}
        </div>
      ) : null}

      {/* ✅ BLOQUE DE FILTROS: 4 líneas SIEMPRE */}
      <div className="mt-4 w-full space-y-3">

        {/* 1ra línea */}
        <div className="w-full">
          <label className="inline-flex items-center gap-2 text-sm opacity-80 cursor-pointer select-none">
            <input
              type="checkbox"
              className="cursor-pointer"
              checked={showOnlyPending}
              onChange={(e) => setShowOnlyPending(e.target.checked)}
            />
            Mostrar solo pendientes (no confirmados)
          </label>
        </div>

        {/* 2da línea */}
        <div className="w-full">
          <label className="inline-flex items-center gap-2 text-sm opacity-80 cursor-pointer select-none">
            <input
              type="checkbox"
              className="cursor-pointer"
              checked={showDebug}
              onChange={(e) => setShowDebug(e.target.checked)}
            />
            Mostrar IDs de partidos
          </label>
        </div>

        {/* 3ra línea: Fase/Grupo izquierda + Limpiar y recargar derecha */}
        <div className="mt-2 w-full flex items-center gap-4">
          {/* Izquierda: que ocupe el espacio disponible */}
          <div className="flex flex-wrap items-center gap-4 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-sm opacity-80">Fase</div>
              <select
                value={phaseFilter}
                onChange={(e) => {
                  const v = e.target.value;
                  setPhaseFilter(v);
                  if (v !== "F01") setGroupFilter("ALL");
                }}
                className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 cursor-pointer"
              >
                {phaseOptions.map((code) => (
                  <option key={code} value={code}>
                    {PHASE_LABEL[code] ?? code}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-sm opacity-80">Grupo</div>
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                disabled={!isGroupStage}
                className={[
                  "px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800",
                  !isGroupStage ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                ].join(" ")}
              >
                {groupOptions.map((code) => (
                  <option key={code} value={code}>
                    {code === "ALL" ? "Todos" : code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Derecha: botón */}
          <button
            onClick={() => {
              setPhaseFilter("ALL");
              setGroupFilter("ALL");
              setShowOnlyPending(true);
              setDateFrom('');
              setDateTo('');

              const token = getTokenOrRedirect();
              if (!token) return;

              fetchMatches(token, activeSeasonId || undefined).catch((e) =>
                setError(e?.message ?? "Error recargando matches"),
              );
            }}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm cursor-pointer"
          >
            Limpiar y recargar
          </button>
        </div>

        {/* 4ta línea: Filtro por fecha */}
        <div className="w-full mt-2 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="text-sm opacity-80">Fecha (cierre)</div>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 cursor-pointer"
            />

            <div className="text-sm opacity-70">a</div>

            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 cursor-pointer"
            />

            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm"
            >
              Limpiar fecha
            </button>
          </div>
        </div>

      </div>

      <div className="space-y-3">
        {filteredMatches.map((m) => {
          const d = draft[m.id] ?? { homeScore: '', awayScore: '', resultConfirmed: false };

          const title = `${m.homeTeam?.name ?? 'Home'} vs ${m.awayTeam?.name ?? 'Away'}`;
          const start = m.utcDateTime ? new Date(m.utcDateTime).toLocaleString() : '—';
          const close = m.closeUtc ? new Date(m.closeUtc).toLocaleString() : '—';
          const now = Date.now();
          const closeMs = m.closeUtc ? new Date(m.closeUtc).getTime() : null;
          const isClosed = closeMs !== null && closeMs <= now;

          return (
            <div
              key={m.id}
              className={[
                'p-4 rounded-xl border bg-zinc-950',
                isClosed ? 'border-red-700/70' : 'border-zinc-800',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{title}</div>
                  <div className="text-xs opacity-70">
                    start: {start} · close: {close}
                    {isClosed ? <span className="ml-2 text-red-300">⛔ Cerrado</span> : null}
                    {showDebug ? (
                      <>
                        {' · '}id: <span className="font-mono">{m.id}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-sm opacity-80">Home</div>
                  <input
                    className="w-16 px-2 py-1 rounded bg-zinc-900 border border-zinc-800"
                    value={d.homeScore}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        [m.id]: { ...d, homeScore: e.target.value },
                      }))
                    }
                    inputMode="numeric"
                  />

                  <input
                    className="w-16 px-2 py-1 rounded bg-zinc-900 border border-zinc-800"
                    value={d.awayScore}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        [m.id]: { ...d, awayScore: e.target.value },
                      }))
                    }
                    inputMode="numeric"
                  />

                  <label className="text-sm opacity-80 ml-2">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={d.resultConfirmed}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [m.id]: { ...d, resultConfirmed: e.target.checked },
                        }))
                      }
                    />
                    Confirmado
                  </label>

                  <button
                    onClick={() => onSaveMatch(m.id)}
                    disabled={savingId === m.id}
                    className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60"
                  >
                    {savingId === m.id ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>

              <div className="mt-2 text-sm opacity-80">
                Estado actual: {m.resultConfirmed ? '✅ Confirmado' : '⏳ Pendiente'}{' '}
                {m.score?.home !== null &&
                  m.score?.home !== undefined &&
                  m.score?.away !== null &&
                  m.score?.away !== undefined
                  ? `· marcador: ${m.score.home}-${m.score.away}`
                  : ''}
              </div>
            </div>
          );
        })}

        {filteredMatches.length === 0 ? (
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-950 text-sm opacity-80">
            No hay partidos para mostrar con el filtro actual.
          </div>
        ) : null}
      </div>
    </div>
  );
}
