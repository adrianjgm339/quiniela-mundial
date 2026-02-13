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

  // IDs crudos (importante para validaciones KO)
  homeTeamId: string;
  awayTeamId: string;

  homeTeam?: { id: string; name: string; flagKey?: string };
  awayTeam?: { id: string; name: string; flagKey?: string };

  resultConfirmed?: boolean;
  score?: { home: number | null; away: number | null };

  // KO: quién avanza y método (solo aplica KO)
  advanceTeamId?: string | null;
  advanceMethod?: 'ET' | 'PEN' | null;

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

type CatalogSport = {
  id: string;
  name: string;
  competitions: Array<{
    id: string;
    name: string;
    seasons: Array<{ id: string; name: string }>;
  }>;
};

function inferSportCompetitionFromSeason(cat: CatalogSport[], seasonId: string) {
  for (const s of cat ?? []) {
    for (const c of s.competitions ?? []) {
      const found = (c.seasons ?? []).some((se) => se.id === seasonId);
      if (found) return { sportId: s.id, competitionId: c.id };
    }
  }
  return { sportId: '', competitionId: '' };
}

const API_URL = 'http://localhost:3001';

type BracketSlotLite = {
  matchNo: number;
  slot: 'HOME' | 'AWAY';
  placeholderText?: string | null;
  teamId?: string | null;
  team?: { id: string; name?: string | null; flagKey?: string | null } | null;
};

type BracketSlotsResponse = {
  seasonId: string;
  slots: BracketSlotLite[];
};

function safeStr(x: any) {
  return (x ?? '')
    .toString()
    .replace(/°/g, 'º')   // 👈 clave: 2° -> 2º
    .replace(/\s+/g, ' ') // normaliza espacios
    .trim();
}

function teamDisplayName(team: any, locale: string) {

  if (!team) return '';

  const tr =
    team.translations?.find((t: any) => t?.locale === locale) ??
    team.translations?.find((t: any) => (t?.locale ?? '').startsWith(locale)) ??
    team.translations?.[0];

  return (
    tr?.name ??
    team.name ??
    team.displayName ??
    team.shortName ??
    team.code ??
    team.slug ??
    ''
  );
}

export default function AdminResultsPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [matches, setMatches] = useState<ApiMatchLite[]>([]);
  const [koNameByPlaceholder, setKoNameByPlaceholder] = useState<
    Record<string, { name: string; flagKey?: string | null }>
  >({});

  const [activeSeasonId, setActiveSeasonId] = useState<string>('');
  const [activeSeasonLabel, setActiveSeasonLabel] = useState<string>('');

  // Contexto (Deporte → Competición → Evento)
  const [catalog, setCatalog] = useState<CatalogSport[]>([]);
  const [sportId, setSportId] = useState<string>('');
  const [competitionId, setCompetitionId] = useState<string>('');
  const [seasonId, setSeasonId] = useState<string>(''); // evento seleccionado en esta pantalla

  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  // Reset KO (QA)
  const [resetMode, setResetMode] = useState<'' | 'future' | 'full' | 'groups' | 'all'>('');
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const [showDebug, setShowDebug] = useState(false);
  const [showPlaceholders, setShowPlaceholders] = useState<boolean>(false);

  // Estado editable por match
  const [draft, setDraft] = useState<
    Record<
      string,
      {
        homeScore: string;
        awayScore: string;
        resultConfirmed: boolean;

        // KO:
        advanceTeamId: string; // '' | teamId
        advanceMethod: '' | 'ET' | 'PEN';
      }
    >
  >({});

  const [showOnlyPending, setShowOnlyPending] = useState<boolean>(true);

  // Filtros (como en /matches)
  const [phaseFilter, setPhaseFilter] = useState<string>('ALL'); // ALL | F01 | F02...
  const [groupFilter, setGroupFilter] = useState<string>('ALL'); // ALL | A | B | ...

  // Filtro por fecha (rango) — usa closeUtc (fallback utcDateTime)
  const [dateFrom, setDateFrom] = useState<string>(''); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>(''); // YYYY-MM-DD

  const PHASE_LABEL_FOOTBALL: Record<string, string> = {
    ALL: 'Todas',
    F01: 'Fase de grupos',
    F02: '16avos',
    F03: 'Octavos',
    F04: 'Cuartos',
    F05: 'Semifinal',
    F06: '3er puesto',
    F07: 'Final',
  };

  // WBC / Béisbol (labels típicos; si llega una fase que no está aquí, cae al fallback fútbol)
  const PHASE_LABEL_BASEBALL: Record<string, string> = {
    ALL: 'Todas',
    F01: 'Fase de grupos',
    F02: 'Cuartos',
    F03: 'Semifinal',
    F04: 'Final',
  };

  const isBaseballContext = useMemo(() => {
    const name = (catalog.find((s) => s.id === sportId)?.name ?? '').toLowerCase();
    return name.includes('beisbol') || name.includes('béisbol');
  }, [catalog, sportId]);

  function phaseLabel(code: string) {
    const map = isBaseballContext ? PHASE_LABEL_BASEBALL : PHASE_LABEL_FOOTBALL;
    return map[code] ?? PHASE_LABEL_FOOTBALL[code] ?? code;
  }


  const PREV_PHASE: Record<string, string> = {
    F02: 'F01',
    F03: 'F02',
    F04: 'F03',
    F05: 'F04',
    F06: 'F05', // 3er puesto depende de semis
    F07: 'F05', // final depende de semis
  };

  const phaseStats = useMemo(() => {
    const map: Record<string, { total: number; confirmed: number }> = {};
    for (const m of matches) {
      const ph = m.phaseCode ?? 'UNK';
      if (!map[ph]) map[ph] = { total: 0, confirmed: 0 };
      map[ph].total += 1;
      if (m.resultConfirmed) map[ph].confirmed += 1;
    }
    return map;
  }, [matches]);

  function getPrevPhaseBlockInfo(phaseCode?: string) {
    const ph = phaseCode ?? '';
    const prev = PREV_PHASE[ph];
    if (!prev) return { blocked: false, msg: '' };

    const st = phaseStats[prev];
    if (!st) return { blocked: false, msg: '' };

    const pending = st.total - st.confirmed;
    if (pending <= 0) return { blocked: false, msg: '' };

    return {
      blocked: true,
      msg: `Bloqueado: faltan ${pending} partidos por confirmar en ${phaseLabel(prev)}.`,
    };
  }

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

  async function fetchCatalog(locale: string): Promise<CatalogSport[]> {
    const res = await fetch(`${API_URL}/catalog?locale=${encodeURIComponent(locale)}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // Nota: NO usamos /auth/active-season aquí.
  // Esta pantalla trabaja directo por seasonId (querystring) + localStorage admin_ctx_seasonId.

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
    const nextDraft: Record<
      string,
      { homeScore: string; awayScore: string; resultConfirmed: boolean; advanceTeamId: string; advanceMethod: '' | 'ET' | 'PEN' }
    > = {};

    for (const m of data) {
      const confirmed = !!m.resultConfirmed;

      const hs = confirmed ? m.score?.home : null;
      const as = confirmed ? m.score?.away : null;

      nextDraft[m.id] = {
        homeScore: hs === null || hs === undefined ? '' : String(hs),
        awayScore: as === null || as === undefined ? '' : String(as),
        resultConfirmed: confirmed,

        advanceTeamId: (m.advanceTeamId ?? '') || '',
        advanceMethod: (m.advanceMethod ?? '') as any,
      };
    }

    setDraft(nextDraft);
  }

  async function fetchBracketSlots(token: string, seasonId: string) {
    const res = await fetch(`${API_URL}/admin/groups/bracket-slots?seasonId=${encodeURIComponent(seasonId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());

    const data = (await res.json()) as BracketSlotsResponse;

    const map: Record<string, { name: string; flagKey?: string | null }> = {};
    for (const s of data.slots ?? []) {
      const ph = safeStr(s.placeholderText);
      const nm = safeStr(teamDisplayName(s.team, locale));
      if (ph && nm) map[ph] = { name: nm, flagKey: s.team?.flagKey ?? null };
    }

    setKoNameByPlaceholder(map);
  }

  async function updateMatchResult(
    token: string,
    matchId: string,
    body: {
      homeScore?: number;
      awayScore?: number;
      resultConfirmed?: boolean;
      advanceTeamId?: string;
      advanceMethod?: 'ET' | 'PEN';
    },
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

  async function resetKo(token: string, seasonId: string, mode: 'future' | 'full' | 'groups' | 'all') {
    const qs = new URLSearchParams();
    qs.set('seasonId', seasonId);
    qs.set('mode', mode);

    const res = await fetch(`${API_URL}/matches/admin/reset-ko?${qs.toString()}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const txt = await res.text();
      try {
        const j = JSON.parse(txt);
        throw new Error(j?.message || 'Error reseteando KO');
      } catch {
        throw new Error(txt || 'Error reseteando KO');
      }
    }
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

        const lsSeasonId = localStorage.getItem('admin_ctx_seasonId') ?? '';
        const sid = lsSeasonId || (me.activeSeasonId ?? '');
        setActiveSeasonId(sid);

        if (sid) {
          localStorage.setItem('admin_ctx_seasonId', sid);
        }

        const label =
          me.activeSeason?.name?.trim() ||
          (me.activeSeason?.year ? `Mundial ${me.activeSeason.year}` : '') ||
          '';

        setActiveSeasonLabel(label);

        // 1) Cargar catálogo para armar cascada Sport/Competition/Season
        const cat = await fetchCatalog(locale);
        setCatalog(cat);

        // 2) Inicializar selects en base al evento activo (sid)
        if (sid) {
          const inferred = inferSportCompetitionFromSeason(cat, sid);
          setSportId(inferred.sportId);
          setCompetitionId(inferred.competitionId);
          setSeasonId(sid);
        } else {
          setSportId('');
          setCompetitionId('');
          setSeasonId('');
        }

        await fetchMatches(token, sid || undefined);

        if (sid) {
          await fetchBracketSlots(token, sid);
        }

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

    // BÉISBOL: no se permite empate cuando se confirma resultado
    if (isBaseballContext && d.resultConfirmed && hs !== undefined && as !== undefined && hs === as) {
      setError('Béisbol: no se permite empate. Ajusta el marcador (debe existir ganador).');
      return;
    }

    // KO: si es fase KO (no F01) y hay empate, se debe indicar quién avanza
    const match = matches.find((x) => x.id === matchId);
    const isKO = (match?.phaseCode ?? '') !== 'F01';
    // IDs reales para validar avance en KO (fallback por si homeTeamId/awayTeamId vienen vacíos)
    const koHomeId = safeStr(match?.homeTeamId) || safeStr((match as any)?.homeTeam?.id);
    const koAwayId = safeStr(match?.awayTeamId) || safeStr((match as any)?.awayTeam?.id);

    if (isKO) {
      const bi = getPrevPhaseBlockInfo(match?.phaseCode);
      if (bi.blocked) {
        setError(bi.msg);
        return;
      }
    }

    if (isKO && d.resultConfirmed && hs !== undefined && as !== undefined && hs === as) {
      if (!koHomeId || !koAwayId) {
        setError('KO: No se puede confirmar empate porque faltan IDs reales de Home/Away en este match.');
        return;
      }

      if (!d.advanceTeamId) {
        setError('KO: Para confirmar un empate debes indicar quién avanza (Local o Visitante).');
        return;
      }

      if (d.advanceTeamId !== koHomeId && d.advanceTeamId !== koAwayId) {
        setError('KO: El equipo que avanza debe ser exactamente Home o Away de este partido.');
        return;
      }
    }

    try {
      setSavingId(matchId);
      setError(null);

      // Si ya no hay empate, limpiamos selección de avance en draft para evitar confusión visual
      if (isKO && !(d.resultConfirmed && hs !== undefined && as !== undefined && hs === as)) {
        d.advanceTeamId = '';
        d.advanceMethod = '';
      }

      await updateMatchResult(token, matchId, {
        homeScore: hs,
        awayScore: as,
        resultConfirmed: d.resultConfirmed,

        // Solo enviamos si el admin seleccionó algo (en empate KO)
        advanceTeamId: d.advanceTeamId ? d.advanceTeamId : undefined,
        advanceMethod: d.advanceMethod ? (d.advanceMethod as 'ET' | 'PEN') : undefined,
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

  async function onResetKo() {
    const token = getTokenOrRedirect();
    if (!token) return;

    if (!activeSeasonId) {
      setError('No hay season activa para resetear.');
      return;
    }

    if (!resetMode) {
      // NO default: si no eligió, no hacemos nada
      setError('Selecciona qué quieres resetear (grupos, KO futuro, KO completo o todo).');
      return;
    }

    try {
      setError(null);
      setResetMsg(null);
      setResetting(true);

      const r = await resetKo(token, activeSeasonId, resetMode);

      const modeLabel =
        resetMode === 'groups'
          ? 'Fase de grupos (F01)'
          : resetMode === 'future'
            ? 'KO futuras (F03–F07)'
            : resetMode === 'full'
              ? 'KO completo (F02–F07)'
              : 'TODO (F01–F07)';

      const phasesTxt =
        Array.isArray(r?.resetPhases) && r.resetPhases.length
          ? `Se limpiaron: ${r.resetPhases.join(', ')}.`
          : '';

      const restoredTxt =
        resetMode === 'groups'
          ? 'KO no fue modificado.'
          : `Placeholders KO restaurados: ${r?.restoredFuturePlaceholders ?? 0}.`;

      setResetMsg(
        `✅ Reset completado · ${resetMode} · placeholders restaurados: ${r?.restoredFuturePlaceholders ?? '—'} (saltados: ${(r as any)?.skippedBadExternalId ?? 0} ext inválidos, ${(r as any)?.skippedMissingTeams ?? 0} teams faltantes)`,
      );

      // refresca lista (y borra draft/estado se recalcula en fetchMatches)
      await fetchMatches(token, activeSeasonId || undefined);
    } catch (e: any) {
      setError(e?.message ?? 'Error reseteando KO');
    } finally {
      setResetting(false);
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

          <div className="flex items-center gap-2">
            <select
              value={resetMode}
              onChange={(e) => setResetMode(e.target.value as any)}
              disabled={resetting}
              className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 cursor-pointer disabled:opacity-60"
              title="Reset KO (QA)"
            >
              <option value="">— Reset —</option>
              <option value="groups">Limpiar fase de grupos (F01)</option>
              <option value="future">Limpiar KO futuras (F03–F07)</option>
              <option value="full">Limpiar KO completo (F02–F07)</option>
              <option value="all">Limpiar TODO (F01–F07)</option>
            </select>

            <button
              onClick={onResetKo}
              disabled={resetting || !resetMode}
              className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60"
              title="Ejecuta reset KO según selección"
            >
              {resetting ? 'Reseteando…' : 'Reset KO'}
            </button>
          </div>

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

      {(error || recomputeMsg || resetMsg) ? (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[min(1000px,calc(100vw-24px))] space-y-2">
          {error ? (
            <div className="p-3 rounded-lg border border-red-700 bg-red-950 text-red-200 text-sm flex items-start justify-between gap-3">
              <div className="whitespace-pre-wrap">{error}</div>
              <button
                onClick={() => setError(null)}
                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs"
              >
                Cerrar
              </button>
            </div>
          ) : null}

          {recomputeMsg ? (
            <div className="p-3 rounded-lg border border-emerald-700 bg-emerald-950 text-emerald-200 text-sm flex items-start justify-between gap-3">
              <div className="whitespace-pre-wrap">{recomputeMsg}</div>
              <button
                onClick={() => setRecomputeMsg(null)}
                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs"
              >
                Cerrar
              </button>
            </div>
          ) : null}

          {resetMsg ? (
            <div className="p-3 rounded-lg border border-sky-700 bg-sky-950 text-sky-200 text-sm flex items-start justify-between gap-3">
              <div className="whitespace-pre-wrap">{resetMsg}</div>
              <button
                onClick={() => setResetMsg(null)}
                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs"
              >
                Cerrar
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Contexto (Deporte → Competición → Evento) */}
      <div className="mt-4 w-full rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="text-sm font-semibold text-zinc-200">Contexto</div>

        <div className="mt-3 grid gap-3">
          {/* Deporte */}
          <div className="flex flex-col gap-1">
            <div className="text-sm opacity-80">Deporte:</div>
            <select
              value={sportId}
              onChange={(e) => {
                const v = e.target.value;
                setSportId(v);
                setCompetitionId('');
                setSeasonId('');
              }}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800"
            >
              <option value="">Seleccionar…</option>
              {catalog.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Competición */}
          <div className="flex flex-col gap-1">
            <div className="text-sm opacity-80">Competición:</div>
            <select
              value={competitionId}
              onChange={(e) => {
                const v = e.target.value;
                setCompetitionId(v);
                setSeasonId('');
              }}
              disabled={!sportId}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 disabled:opacity-60"
            >
              <option value="">Seleccionar…</option>
              {(catalog.find((s) => s.id === sportId)?.competitions ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Evento */}
          <div className="flex flex-col gap-1">
            <div className="text-sm opacity-80">Evento:</div>
            <select
              value={seasonId}
              onChange={async (e) => {
                const token = getTokenOrRedirect();
                if (!token) return;

                const next = e.target.value;
                setSeasonId(next);

                try {
                  setLoading(true);
                  setError(null);

                  const nextSeasonId = next;

                  // Persistimos contexto local (para que al recargar vuelva al último evento elegido)
                  if (nextSeasonId) localStorage.setItem('admin_ctx_seasonId', nextSeasonId);
                  else localStorage.removeItem('admin_ctx_seasonId');

                  // Este Admin trabaja directo por seasonId (NO llamamos /auth/active-season)
                  setActiveSeasonId(nextSeasonId);

                  // Label desde catálogo (sin depender de /auth/me)
                  const seasonName =
                    catalog
                      .find((s) => s.id === sportId)
                      ?.competitions?.find((c) => c.id === competitionId)
                      ?.seasons?.find((se) => se.id === nextSeasonId)
                      ?.name ?? '';

                  setActiveSeasonLabel(seasonName);

                  // Recargar listados del evento seleccionado
                  setMatches([]);
                  setDraft({});
                  setKoNameByPlaceholder({});

                  await fetchMatches(token, nextSeasonId || undefined);
                  if (nextSeasonId) await fetchBracketSlots(token, nextSeasonId);
                } catch (err: any) {
                  setError(err?.message ?? 'Error cambiando evento');
                } finally {
                  setLoading(false);
                }
              }}
              disabled={!sportId || !competitionId}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 disabled:opacity-60"
            >
              <option value="">Seleccionar…</option>
              {(
                catalog
                  .find((s) => s.id === sportId)
                  ?.competitions?.find((c) => c.id === competitionId)
                  ?.seasons ?? []
              ).map((se) => (
                <option key={se.id} value={se.id}>
                  {se.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

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

        {/* 2.5 línea: Toggle placeholders (QA) */}
        <div className="w-full">
          <label className="inline-flex items-center gap-2 text-sm opacity-80 cursor-pointer select-none">
            <input
              type="checkbox"
              className="cursor-pointer"
              checked={showPlaceholders}
              onChange={(e) => setShowPlaceholders(e.target.checked)}
            />
            Mostrar placeholders (modo pruebas / reset)
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
                    {phaseLabel(code)}
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
          const d = draft[m.id] ?? {
            homeScore: m.score?.home != null ? String(m.score.home) : '',
            awayScore: m.score?.away != null ? String(m.score.away) : '',
            resultConfirmed: !!m.resultConfirmed,
            advanceTeamId: m.advanceTeamId ?? '',
            advanceMethod: (m.advanceMethod ?? '') as any,
          };


          const rawHome = m.homeTeam?.name ?? 'Home';
          const rawAway = m.awayTeam?.name ?? 'Away';
          // 👇 IDs reales para KO (evita que "Avanza" se blanquee si homeTeamId/awayTeamId vienen vacíos)
          const homeId = safeStr(m.homeTeamId) || safeStr(m.homeTeam?.id);
          const awayId = safeStr(m.awayTeamId) || safeStr(m.awayTeam?.id);

          const homeResolved = koNameByPlaceholder[safeStr(rawHome)]?.name;
          const awayResolved = koNameByPlaceholder[safeStr(rawAway)]?.name;

          const displayHome = showPlaceholders ? rawHome : (homeResolved || rawHome);
          const displayAway = showPlaceholders ? rawAway : (awayResolved || rawAway);

          const title = `${displayHome} vs ${displayAway}`;

          const start = m.utcDateTime ? new Date(m.utcDateTime).toLocaleString() : '—';
          const close = m.closeUtc ? new Date(m.closeUtc).toLocaleString() : '—';
          const now = Date.now();
          const closeMs = m.closeUtc ? new Date(m.closeUtc).getTime() : null;
          const isClosed = closeMs !== null && closeMs <= now;

          const isKO = (m.phaseCode ?? '') !== 'F01';

          const blockInfo = getPrevPhaseBlockInfo(m.phaseCode);
          const blockedByPrevPhase = isKO && blockInfo.blocked;

          const hsNum = d.homeScore.trim() === '' ? null : Number(d.homeScore);
          const asNum = d.awayScore.trim() === '' ? null : Number(d.awayScore);

          const isTieDraft =
            hsNum !== null &&
            asNum !== null &&
            Number.isFinite(hsNum) &&
            Number.isFinite(asNum) &&
            hsNum === asNum;

          if (isBaseballContext && isKO && isTieDraft && (d.advanceTeamId || d.advanceMethod)) {
            // Béisbol no permite empate: no debería existir selección de avance en empate
            d.advanceTeamId = '';
            d.advanceMethod = '';
          }

          const showKOAdvance = isKO && isTieDraft && !isBaseballContext;

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

                <div className="grid items-center gap-4" style={{ gridTemplateColumns: "120px 52px 52px 120px auto auto" }}>
                  <div className="text-sm opacity-80 text-right truncate">{displayHome}</div>
                  <input
                    className="w-16 px-2 py-1 rounded bg-zinc-900 border border-zinc-800"
                    value={d.homeScore}
                    disabled={savingId === m.id || m.resultConfirmed || blockedByPrevPhase}
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
                    disabled={savingId === m.id || m.resultConfirmed || blockedByPrevPhase}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        [m.id]: { ...d, awayScore: e.target.value },
                      }))
                    }
                    inputMode="numeric"
                  />
                  <div className="text-sm opacity-80 text-left truncate pl-3">{displayAway}</div>

                  <div className="text-sm opacity-80 inline-flex items-center gap-2 whitespace-nowrap">
                    <input
                      type="checkbox"
                      className="cursor-pointer"
                      checked={d.resultConfirmed}
                      disabled={savingId === m.id || m.resultConfirmed || blockedByPrevPhase}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [m.id]: { ...d, resultConfirmed: e.target.checked },
                        }))
                      }
                    />
                    <span>Confirmado</span>
                  </div>

                  {showKOAdvance ? (
                    <div className="flex items-center gap-2" style={{ gridColumn: "1 / -1" }}>
                      <div className="text-sm opacity-80">Avanza</div>
                      <select
                        value={d.advanceTeamId ?? ''}
                        disabled={savingId === m.id || m.resultConfirmed || blockedByPrevPhase}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [m.id]: { ...d, advanceTeamId: e.target.value },
                          }))
                        }
                        className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 cursor-pointer"
                      >
                        <option value="">—</option>
                        {homeId ? (
                          <option value={homeId}>{homeResolved || rawHome || 'Local'}</option>
                        ) : (
                          <option value="" disabled>
                            (Local sin ID)
                          </option>
                        )}

                        {awayId ? (
                          <option value={awayId}>{awayResolved || rawAway || 'Visitante'}</option>
                        ) : (
                          <option value="" disabled>
                            (Visitante sin ID)
                          </option>
                        )}

                      </select>

                      <div className="text-sm opacity-70">por</div>
                      <select
                        value={d.advanceMethod}
                        disabled={savingId === m.id || m.resultConfirmed || blockedByPrevPhase}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [m.id]: { ...d, advanceMethod: e.target.value as any },
                          }))
                        }
                        className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 cursor-pointer"
                      >
                        <option value="">—</option>
                        <option value="ET">Prórroga</option>
                        <option value="PEN">Penales</option>
                      </select>
                    </div>
                  ) : null}

                  <button
                    onClick={() => onSaveMatch(m.id)}
                    disabled={savingId === m.id || m.resultConfirmed || blockedByPrevPhase}
                    style={showKOAdvance ? { gridColumn: "6", gridRow: "1" } : undefined}
                    className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 whitespace-nowrap"
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
                {blockedByPrevPhase ? (
                  <div className="mt-2 text-xs text-amber-300">
                    {blockInfo.msg}
                  </div>
                ) : null}
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