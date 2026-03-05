'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { TeamWithFlag } from "@/components/team-with-flag";
import { Card } from '@/components/ui/card';

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

  homeTeam?: { id: string; name: string; flagKey?: string; isPlaceholder?: boolean; placeholderRule?: string | null };
  awayTeam?: { id: string; name: string; flagKey?: string; isPlaceholder?: boolean; placeholderRule?: string | null };

  resultConfirmed?: boolean;
  score?: { home: number | null; away: number | null };

  // Béisbol: stats oficiales (si el API los expone)
  homeHits?: number | null;
  awayHits?: number | null;
  homeErrors?: number | null;
  awayErrors?: number | null;

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

const RAW_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

const API_URL = RAW_API_BASE.replace(/\/+$/, '');

// (PRO) Tokens helpers (los vamos a usar)
const controlBase =
  'w-full px-3 py-2 rounded-lg text-sm border border-[color:var(--border)] bg-[color:var(--background)] text-[color:var(--foreground)] disabled:opacity-60';
const controlClickable = `${controlBase} cursor-pointer`;

const controlInput =
  'w-16 px-2 py-1 rounded text-sm border border-[color:var(--border)] bg-[color:var(--background)] text-[color:var(--foreground)] disabled:opacity-60';
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

function formatLocalDateTime(locale: string, iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';

  try {
    // Formato consistente tipo: 06/01/2026, 22:58
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

// ---- Strict typing helpers (lint-clean) ----
type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === 'object' && v !== null;
}

function getField<T extends string>(obj: unknown, key: T): unknown {
  if (!isRecord(obj)) return undefined;
  return obj[key];
}

function safeStr(x: unknown) {
  return (x ?? '')
    .toString()
    .replace(/°/g, 'º')   // 👈 clave: 2° -> 2º
    .replace(/\s+/g, ' ') // normaliza espacios
    .trim();
}

type TeamTranslation = { locale?: string | null; name?: string | null };
type TeamNameLike = {
  name?: string | null;
  displayName?: string | null;
  shortName?: string | null;
  code?: string | null;
  slug?: string | null;
  translations?: TeamTranslation[] | null;
};

function teamDisplayName(team: unknown, locale: string) {
  if (!team) return '';

  const translations = getField(team, 'translations');
  const arr = Array.isArray(translations) ? (translations as unknown[]) : [];

  const exact = arr.find((t) => {
    const loc = safeStr(getField(t, 'locale'));
    return loc === locale;
  });
  const prefix = arr.find((t) => {
    const loc = safeStr(getField(t, 'locale'));
    return loc.startsWith(locale);
  });
  const first = arr[0];

  const trName = safeStr(getField(exact ?? prefix ?? first, 'name'));

  const t = team as TeamNameLike;
  return (
    trName ||
    safeStr(t.name) ||
    safeStr(t.displayName) ||
    safeStr(t.shortName) ||
    safeStr(t.code) ||
    safeStr(t.slug) ||
    ''
  );
}

function errorMessage(e: unknown, fallback: string) {
  if (e instanceof Error) return e.message || fallback;
  const msg = safeStr(getField(e, 'message'));
  return msg || fallback;
}

type AdvanceMethod = '' | 'ET' | 'PEN';
function toAdvanceMethod(v: unknown): AdvanceMethod {
  const s = safeStr(v);
  return s === 'ET' || s === 'PEN' ? (s as AdvanceMethod) : '';
}

type ResetMode = '' | 'future' | 'full' | 'groups' | 'all';
function toResetMode(v: string): ResetMode {
  return v === '' || v === 'future' || v === 'full' || v === 'groups' || v === 'all' ? (v as ResetMode) : '';
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
        // Béisbol (oficial):
        homeHits: string;
        awayHits: string;
        homeErrors: string;
        awayErrors: string;

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
      {
        homeScore: string;
        awayScore: string;
        resultConfirmed: boolean;

        // Béisbol (oficial):
        homeHits: string;
        awayHits: string;
        homeErrors: string;
        awayErrors: string;

        // KO:
        advanceTeamId: string;
        advanceMethod: '' | 'ET' | 'PEN';
      }
    > = {};

    for (const m of data) {
      const confirmed = !!m.resultConfirmed;

      const hs = confirmed ? m.score?.home : null;
      const as = confirmed ? m.score?.away : null;
      const hh = confirmed ? (m.homeHits ?? null) : null;
      const ah = confirmed ? (m.awayHits ?? null) : null;
      const he = confirmed ? (m.homeErrors ?? null) : null;
      const ae = confirmed ? (m.awayErrors ?? null) : null;

      nextDraft[m.id] = {
        homeScore: hs === null || hs === undefined ? '' : String(hs),
        awayScore: as === null || as === undefined ? '' : String(as),
        resultConfirmed: confirmed,
        homeHits: hh === null || hh === undefined ? '' : String(hh),
        awayHits: ah === null || ah === undefined ? '' : String(ah),
        homeErrors: he === null || he === undefined ? '' : String(he),
        awayErrors: ae === null || ae === undefined ? '' : String(ae),

        advanceTeamId: (m.advanceTeamId ?? '') || '',
        advanceMethod: toAdvanceMethod(m.advanceMethod),
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
      // Béisbol: stats oficiales
      homeHits?: number;
      awayHits?: number;
      homeErrors?: number;
      awayErrors?: number;
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

  async function recomputeScoring(token: string, seasonId: string) {
    const qs = new URLSearchParams();
    qs.set('seasonId', seasonId);

    const res = await fetch(`${API_URL}/scoring/recompute?${qs.toString()}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  type ResetKoResponse = {
    resetPhases?: string[];
    restoredFuturePlaceholders?: number;
    skippedBadExternalId?: number;
    skippedMissingTeams?: number;
  };

  async function resetKo(
    token: string,
    seasonId: string,
    mode: Exclude<ResetMode, ''>,
  ): Promise<ResetKoResponse> {
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
        const j: unknown = JSON.parse(txt);
        throw new Error(safeStr(getField(j, 'message')) || 'Error reseteando KO');
      } catch {
        throw new Error(txt || 'Error reseteando KO');
      }
    }

    const raw: unknown = await res.json();

    const resetPhasesRaw = getField(raw, 'resetPhases');
    const resetPhases =
      Array.isArray(resetPhasesRaw) ? resetPhasesRaw.map((x) => safeStr(x)).filter(Boolean) : undefined;

    const restoredFuturePlaceholders = Number(getField(raw, 'restoredFuturePlaceholders'));
    const skippedBadExternalId = Number(getField(raw, 'skippedBadExternalId'));
    const skippedMissingTeams = Number(getField(raw, 'skippedMissingTeams'));

    return {
      resetPhases,
      restoredFuturePlaceholders: Number.isFinite(restoredFuturePlaceholders) ? restoredFuturePlaceholders : undefined,
      skippedBadExternalId: Number.isFinite(skippedBadExternalId) ? skippedBadExternalId : undefined,
      skippedMissingTeams: Number.isFinite(skippedMissingTeams) ? skippedMissingTeams : undefined,
    };
  }

  const loadData = useCallback(() => {
    const token = getTokenOrRedirect();
    if (!token) return;
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const me = await fetchMe(token);
        // Solo ADMIN
        if (me.role !== 'ADMIN') {
          router.push(`/${locale}/dashboard`);
          return;
        }
        const lsGlobalSeasonId = localStorage.getItem('activeSeasonId') ?? '';
        const lsAdminSeasonId = localStorage.getItem('admin_ctx_seasonId') ?? '';
        // Prioridad:
        // 1) contexto global (Catálogo) guardado en localStorage
        // 2) backend (/auth/me activeSeasonId)
        // 3) fallback: último evento usado en esta pantalla (admin_ctx)
        const sid = lsGlobalSeasonId || (me.activeSeasonId ?? '') || lsAdminSeasonId;
        setActiveSeasonId(sid);
        // Si el contexto global cambió, sincronizamos el admin_ctx para evitar "arrastrar" béisbol/fútbol viejos.
        if (sid && sid !== lsAdminSeasonId) {
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
        if (sid) {
          // Label exacto desde catálogo por seasonId
          let seasonName = '';
          for (const s of cat ?? []) {
            for (const c of s.competitions ?? []) {
              const se = (c.seasons ?? []).find((x) => x.id === sid);
              if (se?.name) {
                seasonName = se.name;
                break;
              }
            }
            if (seasonName) break;
          }
          if (seasonName) setActiveSeasonLabel(seasonName);
        }
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
      } catch (e: unknown) {
        setError(errorMessage(e, 'Error cargando datos'));
      } finally {
        setLoading(false);
      }
    })();
  }, [locale, router]);
  useEffect(() => {
    loadData();
  }, [loadData]);

  async function onSaveMatch(matchId: string) {
    const token = getTokenOrRedirect();
    if (!token) return;

    const d = draft[matchId];
    if (!d) return;

    // Validación mínima
    const hs = d.homeScore.trim() === '' ? undefined : Number(d.homeScore);
    const as = d.awayScore.trim() === '' ? undefined : Number(d.awayScore);

    const hh = d.homeHits.trim() === '' ? undefined : Number(d.homeHits);
    const ah = d.awayHits.trim() === '' ? undefined : Number(d.awayHits);
    const he = d.homeErrors.trim() === '' ? undefined : Number(d.homeErrors);
    const ae = d.awayErrors.trim() === '' ? undefined : Number(d.awayErrors);

    const validateNonNegInt = (val: number | undefined, label: string) => {
      if (val === undefined) return true;
      if (!Number.isInteger(val) || val < 0) {
        setError(`${label} debe ser entero >= 0`);
        return false;
      }
      return true;
    };

    // Solo validamos si vienen informados (por ahora NO obligamos a llenarlos)
    if (isBaseballContext) {
      if (!validateNonNegInt(hh, 'homeHits')) return;
      if (!validateNonNegInt(ah, 'awayHits')) return;
      if (!validateNonNegInt(he, 'homeErrors')) return;
      if (!validateNonNegInt(ae, 'awayErrors')) return;
    }

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
    const koHomeId = safeStr(match?.homeTeamId) || safeStr(match?.homeTeam?.id);
    const koAwayId = safeStr(match?.awayTeamId) || safeStr(match?.awayTeam?.id);

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
        // Béisbol: stats oficiales
        homeHits: isBaseballContext ? hh : undefined,
        awayHits: isBaseballContext ? ah : undefined,
        homeErrors: isBaseballContext ? he : undefined,
        awayErrors: isBaseballContext ? ae : undefined,
      });


      // refresca lista
      await fetchMatches(token, activeSeasonId || undefined);
    } catch (e: unknown) {
      setError(errorMessage(e, 'Error guardando resultado'));
    } finally {
      setSavingId(null);
    }
  }

  async function onRecompute() {
    const token = getTokenOrRedirect();
    if (!token) return;

    if (!activeSeasonId) {
      setError('No hay season activa para recalcular scoring.');
      return;
    }

    try {
      setError(null);
      setRecomputeMsg(null);
      setRecomputing(true);

      const r = await recomputeScoring(token, activeSeasonId);

      setRecomputeMsg(
        `✅ Scoring recalculado: ${r.confirmedMatchesWithScore} partidos confirmados · ${r.picksProcessed} picks procesados.`,
      );

      // opcional: refrescar lista por si cambió algo
      await fetchMatches(token, activeSeasonId || undefined);
    } catch (e: unknown) {
      setError(errorMessage(e, 'Error en recompute'));
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
        `✅ Reset completado · ${resetMode} · placeholders restaurados: ${r?.restoredFuturePlaceholders ?? '—'} (saltados: ${r?.skippedBadExternalId ?? 0} ext inválidos, ${r?.skippedMissingTeams ?? 0} teams faltantes)`,
      );

      // refresca lista (y borra draft/estado se recalcula en fetchMatches)
      await fetchMatches(token, activeSeasonId || undefined);
    } catch (e: unknown) {
      setError(errorMessage(e, 'Error reseteando KO'));
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
          <Button
            variant="secondary"
            size="sm"
            onClick={onRecompute}
            disabled={recomputing}
          >
            {recomputing ? 'Recalculando…' : 'Recalcular Scoring'}
          </Button>

          <div className="flex items-center gap-2">
            <select
              value={resetMode}
              onChange={(e) => setResetMode(toResetMode(e.target.value))}
              disabled={resetting}
              className={controlClickable}
              title="Reset KO (QA)"
            >
              <option value="">— Reset —</option>
              <option value="groups">Limpiar fase de grupos (F01)</option>
              <option value="future">Limpiar KO futuras (F03–F07)</option>
              <option value="full">Limpiar KO completo (F02–F07)</option>
              <option value="all">Limpiar TODO (F01–F07)</option>
            </select>

            <Button
              variant="secondary"
              size="sm"
              onClick={onResetKo}
              disabled={resetting || !resetMode}
              title="Ejecuta reset KO según selección"
            >
              {resetting ? 'Reseteando…' : 'Reset KO'}
            </Button>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/${locale}/rankings`)}
          >
            Ver Rankings
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              // Volver a la pantalla anterior real; si no hay historial, fallback a Admin
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
              } else {
                router.push(`/${locale}/admin`);
              }
            }}
          >
            Volver
          </Button>
        </div>
      </div>

      {(error || recomputeMsg || resetMsg) ? (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[min(1000px,calc(100vw-24px))] space-y-2">
          {error ? (
            <div className="p-3 rounded-lg border border-red-700 bg-red-950 text-red-200 text-sm flex items-start justify-between gap-3">
              <div className="whitespace-pre-wrap">{error}</div>
              <button
                onClick={() => setError(null)}
                className="px-2 py-1 rounded text-xs border border-[color:var(--border)] bg-[color:var(--background)] hover:bg-[color:var(--muted)]"
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
                className="px-2 py-1 rounded text-xs border border-[color:var(--border)] bg-[color:var(--background)] hover:bg-[color:var(--muted)]"
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
                className="px-2 py-1 rounded text-xs border border-[color:var(--border)] bg-[color:var(--background)] hover:bg-[color:var(--muted)]"
              >
                Cerrar
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Contexto (Deporte → Competición → Evento) */}
      <div className="text-sm font-semibold text-[color:var(--foreground)]">Contexto</div>

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
            className={controlClickable}
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
            className={controlClickable}
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
              } catch (err: unknown) {
                setError(errorMessage(err, 'Error cambiando evento'));
              } finally {
                setLoading(false);
              }
            }}
            disabled={!sportId || !competitionId}
            className={controlClickable}
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
                className={controlClickable}
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
                  controlBase,
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
          <Button
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
            variant="secondary"
            size="sm"
          >
            Limpiar y recargar
          </Button>
        </div>

        {/* 4ta línea: Filtro por fecha */}
        <div className="w-full mt-2 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="text-sm opacity-80">Fecha (cierre)</div>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={controlClickable}
            />

            <div className="text-sm opacity-70">a</div>

            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={controlClickable}
            />

            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="px-3 py-2 rounded-lg text-sm border border-[color:var(--border)] bg-[color:var(--background)] hover:bg-[color:var(--muted)]"
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
            homeHits: m.homeHits != null ? String(m.homeHits) : '',
            awayHits: m.awayHits != null ? String(m.awayHits) : '',
            homeErrors: m.homeErrors != null ? String(m.homeErrors) : '',
            awayErrors: m.awayErrors != null ? String(m.awayErrors) : '',
            advanceTeamId: m.advanceTeamId ?? '',
            advanceMethod: toAdvanceMethod(m.advanceMethod),
          };


          const rawHome = m.homeTeam?.name ?? 'Home';
          const rawAway = m.awayTeam?.name ?? 'Away';

          const homeIsPlaceholder = !!m.homeTeam?.isPlaceholder;
          const awayIsPlaceholder = !!m.awayTeam?.isPlaceholder;

          const homePlaceholder = safeStr(m.homeTeam?.placeholderRule);
          const awayPlaceholder = safeStr(m.awayTeam?.placeholderRule);

          // 👇 IDs reales para KO (evita que "Avanza" se blanquee si homeTeamId/awayTeamId vienen vacíos)
          const homeId = safeStr(m.homeTeamId) || safeStr(m.homeTeam?.id);
          const awayId = safeStr(m.awayTeamId) || safeStr(m.awayTeam?.id);

          const homeResolved = koNameByPlaceholder[safeStr(rawHome)]?.name;
          const awayResolved = koNameByPlaceholder[safeStr(rawAway)]?.name;

          const homeResolvedFlagKey = koNameByPlaceholder[safeStr(rawHome)]?.flagKey ?? null;
          const awayResolvedFlagKey = koNameByPlaceholder[safeStr(rawAway)]?.flagKey ?? null;

          // Flag “real” según el modo:
          // - showPlaceholders: si es placeholder => no bandera (null)
          // - si NO showPlaceholders: usar la resolución del bracket si existe, si no el flagKey del equipo base
          const displayHomeFlagKey = showPlaceholders
            ? (homeIsPlaceholder ? null : (m.homeTeam?.flagKey ?? null))
            : (homeResolvedFlagKey ?? m.homeTeam?.flagKey ?? null);

          const displayAwayFlagKey = showPlaceholders
            ? (awayIsPlaceholder ? null : (m.awayTeam?.flagKey ?? null))
            : (awayResolvedFlagKey ?? m.awayTeam?.flagKey ?? null);

          // Para que el componente pueda renderizar “placeholder style” solo cuando de verdad no hay flag disponible
          const displayHomeIsPlaceholder = !displayHomeFlagKey && homeIsPlaceholder;
          const displayAwayIsPlaceholder = !displayAwayFlagKey && awayIsPlaceholder;

          const displayHome = showPlaceholders
            ? (homeIsPlaceholder ? (homePlaceholder || rawHome) : rawHome)
            : (homeResolved || rawHome);

          const displayAway = showPlaceholders
            ? (awayIsPlaceholder ? (awayPlaceholder || rawAway) : rawAway)
            : (awayResolved || rawAway);

          const title = `${displayHome} vs ${displayAway}`;

          const start = formatLocalDateTime(locale, m.utcDateTime);
          const close = formatLocalDateTime(locale, m.closeUtc);
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
              data-closed={isClosed ? 'true' : 'false'}
              className={[
                'p-4 rounded-xl border bg-[color:var(--card)] border-[color:var(--border)]',
                // sutil “estado cerrado” sin rojos hardcodeados
                "data-[closed=true]:opacity-95",
              ].join(' ')}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold flex flex-wrap items-center gap-2" title={title}>
                    <TeamWithFlag
                      name={displayHome}
                      flagKey={displayHomeFlagKey}
                      isPlaceholder={displayHomeIsPlaceholder}
                    />
                    <span className="text-[color:var(--muted)]">vs</span>
                    <TeamWithFlag
                      name={displayAway}
                      flagKey={displayAwayFlagKey}
                      isPlaceholder={displayAwayIsPlaceholder}
                    />
                  </div>
                  <div className="text-xs opacity-70">
                    Inicio: {start} · Cierre: {close}
                    {isClosed ? (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-0.5 text-[11px] text-[color:var(--muted)]">
                        ⛔ Cerrado
                      </span>
                    ) : null}
                    {showDebug ? (
                      <>
                        {' · '}id: <span className="font-mono">{m.id}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="grid items-center gap-4" style={{ gridTemplateColumns: "minmax(140px,1fr) 56px 56px minmax(140px,1fr) minmax(140px,auto) auto" }}>
                  <div className="text-sm opacity-80 text-right truncate">
                    <span className="inline-flex justify-end">
                      <TeamWithFlag
                        name={displayHome}
                        flagKey={displayHomeFlagKey}
                        isPlaceholder={displayHomeIsPlaceholder}
                      />
                    </span>
                  </div>
                  <input
                    className={controlInput}
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
                    className={controlInput}
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
                  <div className="text-sm opacity-80 text-left truncate pl-3">
                    <span className="inline-flex justify-start">
                      <TeamWithFlag
                        name={displayAway}
                        flagKey={displayAwayFlagKey}
                        isPlaceholder={displayAwayIsPlaceholder}
                      />
                    </span>
                  </div>

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
                        className={controlClickable}
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
                            [m.id]: { ...d, advanceMethod: toAdvanceMethod(e.target.value) },
                          }))
                        }
                        className={controlClickable}
                      >
                        <option value="">—</option>
                        <option value="ET">Prórroga</option>
                        <option value="PEN">Penales</option>
                      </select>
                    </div>
                  ) : null}

                  {isBaseballContext ? (
                    <div
                      className="mt-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2"
                      style={{ gridColumn: "1 / -1" }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
                          Béisbol · Stats oficiales
                        </div>
                        <div className="text-[11px] text-[color:var(--muted)]">
                          Totales del juego = Local + Visitante (se usa en scoring)
                        </div>
                      </div>

                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        {/* Hits */}
                        <div className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2">
                          <div className="min-w-[72px] text-sm font-medium">Hits</div>
                          <div className="flex items-center gap-2">
                            <div className="text-xs opacity-70">L</div>
                            <input
                              className={controlInput}
                              value={d.homeHits}
                              disabled={savingId === m.id || m.resultConfirmed || blockedByPrevPhase}
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  [m.id]: { ...d, homeHits: e.target.value },
                                }))
                              }
                              inputMode="numeric"
                              placeholder="HL"
                              title="Hits Local"
                            />
                            <div className="text-xs opacity-70">V</div>
                            <input
                              className={controlInput}
                              value={d.awayHits}
                              disabled={savingId === m.id || m.resultConfirmed || blockedByPrevPhase}
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  [m.id]: { ...d, awayHits: e.target.value },
                                }))
                              }
                              inputMode="numeric"
                              placeholder="HV"
                              title="Hits Visitante"
                            />
                          </div>
                        </div>

                        {/* Errores */}
                        <div className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2">
                          <div className="min-w-[72px] text-sm font-medium">Errores</div>
                          <div className="flex items-center gap-2">
                            <div className="text-xs opacity-70">L</div>
                            <input
                              className={controlInput}
                              value={d.homeErrors}
                              disabled={savingId === m.id || m.resultConfirmed || blockedByPrevPhase}
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  [m.id]: { ...d, homeErrors: e.target.value },
                                }))
                              }
                              inputMode="numeric"
                              placeholder="EL"
                              title="Errores Local"
                            />
                            <div className="text-xs opacity-70">V</div>
                            <input
                              className={controlInput}
                              value={d.awayErrors}
                              disabled={savingId === m.id || m.resultConfirmed || blockedByPrevPhase}
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  [m.id]: { ...d, awayErrors: e.target.value },
                                }))
                              }
                              inputMode="numeric"
                              placeholder="EV"
                              title="Errores Visitante"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <Button
                    onClick={() => onSaveMatch(m.id)}
                    disabled={savingId === m.id || m.resultConfirmed || blockedByPrevPhase}
                    style={showKOAdvance ? { gridColumn: "6", gridRow: "1" } : undefined}
                    variant="secondary"
                    size="sm"
                    className="whitespace-nowrap"
                  >
                    {savingId === m.id ? 'Guardando…' : 'Guardar'}
                  </Button>
                </div>
              </div>

              <div className="mt-2 text-sm opacity-80">
                <span className="mr-2">Estado:</span>

                {m.resultConfirmed ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-0.5 text-[11px] text-[color:var(--accent)]">
                    ✅ Confirmado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-0.5 text-[11px] text-[color:var(--muted)]">
                    ⏳ Pendiente
                  </span>
                )}{' '}
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
          <Card className="p-4 text-sm text-[color:var(--muted)]">
            No hay partidos para mostrar con el filtro actual.
          </Card>
        ) : null}
      </div>
    </div >
  );
}