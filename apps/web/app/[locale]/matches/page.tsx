'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getCatalog,
  getMatches,
  getMyLeagues,
  listPicks,
  setActiveSeason,
  upsertPick,
  type ApiMatch,
  type ApiPick,
  type ApiLeague,
  type CatalogSport,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { TeamWithFlag } from '@/components/team-with-flag';
import AiChatWidget from '../../components/AiChatWidget';

type MatchExtras = {
  phaseCode?: string | null;
  groupCode?: string | null;

  utcDateTime?: string | null;
  timeUtc?: string | null;
  kickoffUtc?: string | null;

  closeUtc?: string | null;
  closeMinutes?: number | null;
};

type TeamExtras = {
  flagKey?: string | null;
  isPlaceholder?: boolean | null;
};

type MatchWithExtras = ApiMatch &
  MatchExtras & {
    homeTeam?: (ApiMatch['homeTeam'] & TeamExtras) | null;
    awayTeam?: (ApiMatch['awayTeam'] & TeamExtras) | null;
  };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getErrorMessage(raw: unknown): string {
  if (raw instanceof Error) return raw.message;
  if (isRecord(raw) && typeof raw.message === 'string') return raw.message;
  return String(raw ?? '');
}

function parseTs(iso?: string | null) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function getCloseTs(m: MatchWithExtras) {
  // Preferimos closeUtc
  const close = parseTs(m.closeUtc);
  if (close) return close;

  // Fallback: utcDateTime/timeUtc/kickoffUtc - closeMinutes
  const start = parseTs(m.utcDateTime ?? m.timeUtc ?? m.kickoffUtc);
  const mins = typeof m.closeMinutes === 'number' ? m.closeMinutes : null;
  if (start && mins != null) return start - mins * 60_000;

  return null;
}

function formatLocalDateTime(locale: string, utcIso?: string | null) {
  const ts = parseTs(utcIso);
  if (!ts) return '';
  const d = new Date(ts);

  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(d);

  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);

  return `${date} · ${time}`;
}

function formatCountdown(ms: number) {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin <= 0) return '0m';

  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;

  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export default function MatchesPage() {
  const router = useRouter();
  const appliedLeaguesContextRef = useRef(false);
  const { locale } = useParams<{ locale: string }>();
  const [now, setNow] = useState(() => Date.now());

  const searchParams = useSearchParams();
  const phase = searchParams.get('phase') || '';
  const group = searchParams.get('group') || '';

  // Restaurar phase/group desde localStorage en entrada “limpia”
  useEffect(() => {
    const hasPhaseInUrl = searchParams.has('phase');
    const hasGroupInUrl = searchParams.has('group');
    if (hasPhaseInUrl || hasGroupInUrl) return;

    const savedPhase = localStorage.getItem('matchesPhase') || '';
    const savedGroup = localStorage.getItem('matchesGroup') || '';
    if (!savedPhase && !savedGroup) return;

    const params = new URLSearchParams(searchParams.toString());
    if (savedPhase) params.set('phase', savedPhase);
    if (savedGroup) params.set('group', savedGroup);

    const qs = params.toString();
    router.replace(`/${locale}/matches${qs ? `?${qs}` : ''}`);
  }, [locale, router, searchParams]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const [items, setItems] = useState<ApiMatch[]>([]);
  const [allItems, setAllItems] = useState<ApiMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [leagueConfirmed, setLeagueConfirmed] = useState(false);

  const [picksByMatchId, setPicksByMatchId] = useState<Record<string, ApiPick>>({});
  const [picksLeagueId, setPicksLeagueId] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<ApiLeague[]>([]);
  const [loadingPicks, setLoadingPicks] = useState(false);

  // Cascada Sport → Competition → Season (Evento)
  const [catalog, setCatalog] = useState<CatalogSport[]>([]);
  const [sportId, setSportId] = useState<string>('');
  const [competitionId, setCompetitionId] = useState<string>('');
  const [seasonId, setSeasonId] = useState<string>('');

  const competitionOptions = useMemo(() => {
    const s = catalog.find((x) => x.id === sportId);
    return s?.competitions ?? [];
  }, [catalog, sportId]);

  const seasonOptions = useMemo(() => {
    const c = competitionOptions.find((x) => x.id === competitionId);
    return c?.seasons ?? [];
  }, [competitionOptions, competitionId]);

  const inferSportCompetitionFromSeason = useCallback((sid: string, cat: CatalogSport[]) => {
    if (!sid) return { sportId: '', competitionId: '' };

    for (const s of cat ?? []) {
      for (const c of s.competitions ?? []) {
        const found = (c.seasons ?? []).some((se) => se.id === sid);
        if (found) return { sportId: s.id, competitionId: c.id };
      }
    }
    return { sportId: '', competitionId: '' };
  }, []);

  function isLocked(m: MatchWithExtras) {
    if (m.resultConfirmed) return true;
    if (!m.closeUtc) return false;

    const closeMs = new Date(m.closeUtc).getTime();
    if (Number.isNaN(closeMs)) return false;

    return Date.now() > closeMs;
  }

  // Liga “efectiva”: solo cuenta si existe y pertenece al evento actual
  const effectiveLeagueId = useMemo(() => {
    if (!leagueConfirmed) return null;
    if (!leagueId) return null;
    if (!seasonId) return null;

    const l = leagues.find((x) => x.id === leagueId);
    if (!l) return null;

    // Nota: ApiLeague en tu backend trae seasonId, si por types no lo trae, TS igual deja compilar por estructura.
    return (l as unknown as { seasonId?: string | null }).seasonId === seasonId ? leagueId : null;
  }, [leagueConfirmed, leagueId, seasonId, leagues]);

  useEffect(() => {
    if (!effectiveLeagueId) {
      setPicksByMatchId({});
      setPicksLeagueId(null);
      setLoadingPicks(false);
    }
  }, [effectiveLeagueId]);

  const visibleLeagues = useMemo(() => {
    if (!seasonId) return [];
    return leagues.filter((l) => (l as unknown as { seasonId?: string | null }).seasonId === seasonId);
  }, [leagues, seasonId]);

  // modal state
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ApiMatch | null>(null);
  const [homePred, setHomePred] = useState<string>('');
  const [koWinnerTeamId, setKoWinnerTeamId] = useState<string>(''); // '' | teamId
  const [awayPred, setAwayPred] = useState<string>('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Carga inicial: token + catálogo + ligas + handoff context
  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push(`/${locale}/login`);
      return;
    }

    setToken(t);

    void (async () => {
      try {
        setLoading(true);
        setError(null);

        // 1) Catálogo (Sport → Competition → Season)
        const cat = await getCatalog(locale);
        setCatalog(cat);

        // 2) Mis ligas
        const myLeagues = await getMyLeagues(t);
        setLeagues(myLeagues);

        // 3) Handoff /leagues -> /matches (si existe)
        const fromLeagues = localStorage.getItem('matches_ctx_fromLeagues') === '1';

        if (fromLeagues && !appliedLeaguesContextRef.current) {
          const sId = localStorage.getItem('matches_ctx_sportId') || '';
          const cId = localStorage.getItem('matches_ctx_competitionId') || '';
          const season = localStorage.getItem('matches_ctx_seasonId') || '';
          const lId = localStorage.getItem('matches_ctx_leagueId') || '';

          setSportId(sId);
          setCompetitionId(cId);
          setSeasonId(season);

          const leagueOk = myLeagues.some(
            (l) => l.id === lId && (l as unknown as { seasonId?: string | null }).seasonId === season,
          );

          if (leagueOk) {
            setLeagueId(lId);
            setLeagueConfirmed(true);
            localStorage.setItem('activeLeagueId', lId);
          } else {
            setLeagueId(null);
            setLeagueConfirmed(false);
            localStorage.removeItem('activeLeagueId');
          }

          if (season) localStorage.setItem('activeSeasonId', season);

          localStorage.removeItem('matches_ctx_fromLeagues');
          appliedLeaguesContextRef.current = true;
        } else if (!appliedLeaguesContextRef.current) {
          // Entrada limpia (NO vengo de /leagues)
          const activeSeasonId = localStorage.getItem('activeSeasonId') || '';

          if (activeSeasonId) {
            const inferred = inferSportCompetitionFromSeason(activeSeasonId, cat);
            setSportId(inferred.sportId);
            setCompetitionId(inferred.competitionId);
            setSeasonId(activeSeasonId);
          } else {
            setSportId('');
            setCompetitionId('');
            setSeasonId('');
          }

          localStorage.removeItem('activeLeagueId');
          setLeagueId(null);
          setLeagueConfirmed(false);
        }

        // Importante: no pedimos partidos aquí; los pedimos cuando haya seasonId.
        setAllItems([]);
        setItems([]);
        setPicksByMatchId({});
        setLoadingPicks(false);
      } catch (e: unknown) {
        setError(getErrorMessage(e) || 'Error cargando pantalla');
      } finally {
        setLoading(false);
      }
    })();
  }, [inferSportCompetitionFromSeason, locale, router]);

  // Cargar partidos cuando cambia seasonId
  useEffect(() => {
    if (!token) return;

    if (!seasonId) {
      // en transición (cambiando deporte/competición)
      return;
    }

    void (async () => {
      try {
        setLoading(true);
        setError(null);

        // Al cambiar evento, limpiamos phase/group
        localStorage.setItem('matchesPhase', '');
        localStorage.setItem('matchesGroup', '');
        router.replace(`/${locale}/matches`);

        await setActiveSeason(token, seasonId);

        const leaguesInSeason = leagues.filter((l) => (l as unknown as { seasonId?: string | null }).seasonId === seasonId);

        const keepRestoredLeague =
          appliedLeaguesContextRef.current &&
          leagueConfirmed &&
          leagueId &&
          leaguesInSeason.some((l) => l.id === leagueId);

        let nextLeagueId: string | null = null;

        if (keepRestoredLeague) {
          nextLeagueId = leagueId;
        } else {
          if (leaguesInSeason.length === 1) {
            nextLeagueId = leaguesInSeason[0].id;
          } else {
            nextLeagueId = null;
            localStorage.removeItem('activeLeagueId');
          }

          setLeagueId(nextLeagueId);
          setLeagueConfirmed(!!nextLeagueId);
        }

        if (nextLeagueId) localStorage.setItem('activeLeagueId', nextLeagueId);
        else if (!keepRestoredLeague) localStorage.removeItem('activeLeagueId');

        // Limpiar picks visibles mientras cambia liga/evento
        setPicksByMatchId({});
        setPicksLeagueId(null);

        const all = await getMatches(token, locale, { seasonId: seasonId || undefined });
        setAllItems(all);

        const data = await getMatches(token, locale, {
          seasonId: seasonId || undefined,
          phaseCode: undefined,
          groupCode: undefined,
        });
        setItems(data);
      } catch (e: unknown) {
        setError(getErrorMessage(e) || 'Error cargando partidos');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, seasonId, locale, router, leagues, leagueConfirmed, leagueId]);

  // Cargar picks cuando cambia la liga efectiva
  useEffect(() => {
    if (!token) return;

    if (!effectiveLeagueId) {
      setPicksByMatchId({});
      setLoadingPicks(false);
      return;
    }

    let cancelled = false;
    const requestedLeagueId = effectiveLeagueId;

    void (async () => {
      try {
        setLoadingPicks(true);
        setPicksByMatchId({});
        setPicksLeagueId(null);

        const picks = await listPicks(token, requestedLeagueId);
        if (cancelled) return;

        const onlyThisLeague = (Array.isArray(picks) ? picks : []).filter(
          (p: ApiPick) => p.leagueId === requestedLeagueId,
        );

        const map: Record<string, ApiPick> = {};
        for (const p of onlyThisLeague) map[p.matchId] = p;

        setPicksLeagueId(requestedLeagueId);
        setPicksByMatchId(map);
      } catch (e: unknown) {
        if (!cancelled) setError(getErrorMessage(e) || 'Error cargando picks');
      } finally {
        if (!cancelled) setLoadingPicks(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, effectiveLeagueId]);

  // Refetch cuando cambian filtros phase/group
  useEffect(() => {
    if (!token) return;
    if (!seasonId) return;

    void (async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await getMatches(token, locale, {
          seasonId: seasonId || undefined,
          phaseCode: phase || undefined,
          groupCode: group || undefined,
        });

        setItems(data);
      } catch (e: unknown) {
        setError(getErrorMessage(e) || 'Error aplicando filtros');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, seasonId, locale, phase, group]);

  const grouped = useMemo(() => {
    const map = new Map<string, ApiMatch[]>();
    for (const m of items) {
      if (!map.has(m.dateKey)) map.set(m.dateKey, []);
      map.get(m.dateKey)!.push(m);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const phaseOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of allItems as MatchWithExtras[]) {
      const pc = m.phaseCode ?? undefined;
      if (pc) set.add(pc);
    }
    return Array.from(set.values()).sort();
  }, [allItems]);

  const allGroupOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of allItems as MatchWithExtras[]) {
      const gc = m.groupCode ?? undefined;
      if (gc) set.add(gc);
    }
    return Array.from(set.values()).sort();
  }, [allItems]);

  const groupOptions = useMemo(() => {
    const base = phase ? (allItems as MatchWithExtras[]).filter((m) => (m.phaseCode ?? '') === phase) : (allItems as MatchWithExtras[]);
    const set = new Set<string>();
    for (const m of base) {
      const gc = m.groupCode ?? undefined;
      if (gc) set.add(gc);
    }
    return Array.from(set.values()).sort();
  }, [allItems, phase]);

  const showPhaseGroupFilters = phaseOptions.length > 0 || allGroupOptions.length > 0;

  // Si el grupo actual no existe para la fase actual, lo limpiamos
  useEffect(() => {
    if (!group) return;
    if (groupOptions.includes(group)) return;

    localStorage.setItem('matchesGroup', '');

    const params = new URLSearchParams(searchParams.toString());
    params.delete('group');

    const qs = params.toString();
    router.replace(`/${locale}/matches${qs ? `?${qs}` : ''}`);
  }, [group, groupOptions, locale, router, searchParams]);

  const selectedLocked = selected ? isLocked(selected as MatchWithExtras) : false;

  function openPickModal(match: ApiMatch) {
    setSaveError(null);
    setSelected(match);

    const existing = picksByMatchId[match.id];
    setHomePred(existing ? String(existing.homePred) : '');
    setAwayPred(existing ? String(existing.awayPred) : '');
    setKoWinnerTeamId(existing?.koWinnerTeamId ?? '');

    setOpen(true);
  }

  async function onSave() {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push(`/${locale}/login`);
      return;
    }
    if (!effectiveLeagueId) {
      setSaveError('No hay Liga activa. Selecciona una liga primero.');
      return;
    }
    if (!selected) return;

    const selectedMatch = selected as MatchWithExtras;

    if (isLocked(selectedMatch)) {
      setSaveError('Este partido ya está cerrado. No puedes modificar tu pronóstico.');
      return;
    }

    const hpRaw = homePred.trim();
    const apRaw = awayPred.trim();

    const hp = hpRaw === '' ? null : Number(hpRaw);
    const ap = apRaw === '' ? null : Number(apRaw);

    if (hp === null || ap === null || !Number.isFinite(hp) || !Number.isFinite(ap)) {
      setSaveError('Debes indicar el marcador (Local y Visitante).');
      return;
    }
    if (hp < 0 || ap < 0) {
      setSaveError('El marcador no puede ser negativo.');
      return;
    }

    const phaseCode = selectedMatch.phaseCode ?? '';
    const isKO = !!phaseCode && phaseCode !== 'F01';
    const isTie = hp === ap;

    if (isKO && isTie && !koWinnerTeamId) {
      setSaveError('KO: Como pronosticaste empate, debes indicar quién avanza (Local o Visitante).');
      return;
    }

    const finalKoWinnerTeamId = isKO && isTie ? koWinnerTeamId : null;

    setSaving(true);
    setSaveError(null);

    try {
      const pick = await upsertPick(t, {
        leagueId: effectiveLeagueId,
        matchId: selected.id,
        homePred: hp,
        awayPred: ap,
        koWinnerTeamId: finalKoWinnerTeamId,
      });

      setPicksByMatchId((prev) => ({ ...prev, [pick.matchId]: pick }));
      setOpen(false);
      setSelected(null);
    } catch (e: unknown) {
      setSaveError(getErrorMessage(e) || 'Error guardando pick');
    } finally {
      setSaving(false);
    }
  }

  function onChangeLeague(newLeagueId: string) {
    setLeagueId(newLeagueId);
    setLeagueConfirmed(true);
    localStorage.setItem('activeLeagueId', newLeagueId);

    setPicksByMatchId({});
    setPicksLeagueId(null);
    setSaveError(null);
  }

  const activeLeague = effectiveLeagueId ? leagues.find((l) => l.id === effectiveLeagueId) : null;

  const aiContext = useMemo(() => {
    const sel = selected as MatchWithExtras | null;

    return {
      page: 'matches',
      locale,
      token,
      sportId,
      competitionId,
      seasonId,
      phase,
      group,
      effectiveLeagueId,
      activeLeague: activeLeague ? { id: activeLeague.id, name: activeLeague.name, joinCode: activeLeague.joinCode } : null,
      selectedMatch: sel
        ? {
            id: sel.id,
            home: sel.homeTeam?.name ?? '',
            away: sel.awayTeam?.name ?? '',
            timeUtc: sel.timeUtc ?? null,
            utcDateTime: sel.utcDateTime ?? null,
            closeUtc: sel.closeUtc ?? null,
          }
        : null,
    };
  }, [activeLeague, competitionId, effectiveLeagueId, group, locale, phase, seasonId, selected, sportId, token]);

  const activeLeagueLabel = activeLeague ? `${activeLeague.name} · Código: ${activeLeague.joinCode}` : '—';

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <PageHeader
            title="Partidos"
            subtitle={
              <span className="text-[color:var(--muted)]">
                Liga activa: {activeLeagueLabel}
                {effectiveLeagueId && loadingPicks ? ' · Cargando picks…' : ''}
              </span>
            }
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    localStorage.setItem('matchesPhase', '');
                    localStorage.setItem('matchesGroup', '');

                    setSportId('');
                    setCompetitionId('');
                    setSeasonId('');
                    setLeagueId(null);
                    setLeagueConfirmed(false);
                    setPicksLeagueId(null);

                    localStorage.removeItem('activeSeasonId');
                    localStorage.removeItem('activeLeagueId');

                    setPicksByMatchId({});
                    setItems([]);
                    setAllItems([]);
                    setError(null);

                    router.replace(`/${locale}/matches`);
                  }}
                  title="Quitar filtros"
                >
                  Limpiar
                </Button>

                <Button variant="secondary" size="sm" onClick={() => router.push(`/${locale}/leagues`)} title="Gestionar ligas">
                  Ligas
                </Button>

                <Button variant="secondary" size="sm" onClick={() => router.push(`/${locale}/dashboard`)}>
                  Volver
                </Button>
              </div>
            }
          />

          {/* Cascada Sport → Competition → Event → League */}
          <Card className="p-4">
            <div className="grid grid-cols-1 gap-3">
              {/* Deporte */}
              <label className="text-sm text-[color:var(--muted)]">
                Deporte
                <select
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] disabled:opacity-50"
                  value={sportId}
                  onChange={(e) => {
                    const v = e.target.value;

                    setSportId(v);
                    setCompetitionId('');
                    setSeasonId('');
                    localStorage.removeItem('activeSeasonId');
                    localStorage.removeItem('activeLeagueId');

                    setLeagueId(null);
                    setLeagueConfirmed(false);
                    setPicksByMatchId({});
                    setPicksLeagueId(null);
                    setItems([]);
                    setAllItems([]);
                    setError(null);

                    localStorage.setItem('matchesPhase', '');
                    localStorage.setItem('matchesGroup', '');
                    router.replace(`/${locale}/matches`);
                  }}
                >
                  <option value="">Seleccionar deporte</option>
                  {catalog.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Competición */}
              <label className="text-sm text-[color:var(--muted)]">
                Competición
                <select
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] disabled:opacity-50 disabled:bg-[var(--background)] disabled:text-[color:var(--muted)]"
                  value={competitionId}
                  disabled={!sportId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCompetitionId(v);
                    setSeasonId('');
                    localStorage.removeItem('activeSeasonId');
                    localStorage.removeItem('activeLeagueId');

                    setLeagueId(null);
                    setLeagueConfirmed(false);
                    setPicksByMatchId({});
                    setPicksLeagueId(null);
                    setItems([]);
                    setAllItems([]);
                    setError(null);

                    localStorage.setItem('matchesPhase', '');
                    localStorage.setItem('matchesGroup', '');
                    router.replace(`/${locale}/matches`);
                  }}
                >
                  <option value="">Seleccionar competición</option>
                  {competitionOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Evento */}
              <label className="text-sm text-[color:var(--muted)]">
                Evento
                <select
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] disabled:opacity-50 disabled:bg-[var(--background)] disabled:text-[color:var(--muted)]"
                  value={seasonId}
                  disabled={!competitionId}
                  onChange={(e) => {
                    const v = e.target.value;

                    setSeasonId(v);
                    if (v) localStorage.setItem('activeSeasonId', v);
                    else localStorage.removeItem('activeSeasonId');

                    setLeagueId(null);
                    setLeagueConfirmed(false);
                    localStorage.removeItem('activeLeagueId');
                    setPicksByMatchId({});
                    setPicksLeagueId(null);
                    setLoadingPicks(false);
                    setItems([]);
                    setAllItems([]);
                    setError(null);

                    localStorage.setItem('matchesPhase', '');
                    localStorage.setItem('matchesGroup', '');
                    router.replace(`/${locale}/matches`);
                  }}
                >
                  <option value="">Seleccionar evento</option>
                  {seasonOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Liga */}
              <label className="text-sm text-[color:var(--muted)]">
                Liga
                <select
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] disabled:opacity-50 disabled:bg-[var(--background)] disabled:text-[color:var(--muted)]"
                  value={effectiveLeagueId ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      setLeagueId(null);
                      setLeagueConfirmed(false);
                      localStorage.removeItem('activeLeagueId');
                      setPicksByMatchId({});
                      setPicksLeagueId(null);
                      setSaveError(null);
                      return;
                    }
                    onChangeLeague(v);
                  }}
                  disabled={!seasonId || visibleLeagues.length === 0}
                  title="Selecciona la liga para la cual estás pronosticando"
                >
                  {!seasonId && <option value="">Selecciona evento primero</option>}
                  {seasonId && visibleLeagues.length === 0 && <option value="">Sin ligas en este evento</option>}
                  {seasonId && visibleLeagues.length > 1 && <option value="">Seleccionar</option>}
                  {seasonId &&
                    visibleLeagues.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.joinCode})
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </Card>

          {showPhaseGroupFilters && (
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <label className="text-sm text-[color:var(--muted)]">
                  Fase
                  <select
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
                    value={phase}
                    onChange={(e) => {
                      const p = e.target.value;
                      localStorage.setItem('matchesPhase', p);
                      if (p) localStorage.setItem('matchesGroup', '');

                      const params = new URLSearchParams(searchParams.toString());
                      if (p) params.set('phase', p);
                      else params.delete('phase');

                      localStorage.setItem('matchesGroup', '');
                      params.delete('group');

                      const qs = params.toString();
                      router.replace(`/${locale}/matches${qs ? `?${qs}` : ''}`);
                    }}
                    title="Filtrar por fase"
                  >
                    <option value="">Todas</option>
                    {phaseOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-[color:var(--muted)]">
                  Grupo
                  <select
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] disabled:opacity-50"
                    value={group}
                    disabled={!groupOptions.length}
                    onChange={(e) => {
                      const g = e.target.value;
                      localStorage.setItem('matchesGroup', g);

                      const params = new URLSearchParams(searchParams.toString());
                      if (g) params.set('group', g);
                      else params.delete('group');

                      const qs = params.toString();
                      router.replace(`/${locale}/matches${qs ? `?${qs}` : ''}`);
                    }}
                    title={
                      !allGroupOptions.length
                        ? 'Este evento no tiene grupos'
                        : !groupOptions.length
                          ? 'Esta fase no tiene grupos'
                          : 'Filtrar por grupo'
                    }
                  >
                    <option value="">Todos</option>
                    {groupOptions.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </Card>
          )}

          {loading && <Card className="p-4 text-[color:var(--muted)]">Cargando partidos…</Card>}

          {error && <Card className="p-4 border border-red-500/30">{error}</Card>}

          {!loading &&
            !error &&
            grouped.map(([dateKey, matches]) => (
              <Card key={dateKey} className="overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--border)] font-medium">{dateKey}</div>

                <div className="divide-y divide-[var(--border)]">
                  {matches.map((m0) => {
                    const m = m0 as MatchWithExtras;

                    const myPick = effectiveLeagueId && picksLeagueId === effectiveLeagueId ? picksByMatchId[m.id] : undefined;
                    const locked = isLocked(m);

                    const kickoffLabel = formatLocalDateTime(locale, m.utcDateTime ?? m.timeUtc ?? null);

                    const closeTs = getCloseTs(m);
                    const remainingMs = closeTs ? closeTs - now : null;
                    const hasPick = !!myPick;

                    return (
                      <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            <span className="inline-flex items-center gap-2 min-w-0">
                              <TeamWithFlag
                                name={m.homeTeam?.name ?? ''}
                                flagKey={m.homeTeam?.flagKey ?? null}
                                isPlaceholder={!!m.homeTeam?.isPlaceholder}
                              />
                              <span className="text-[color:var(--muted)]">vs</span>
                              <TeamWithFlag
                                name={m.awayTeam?.name ?? ''}
                                flagKey={m.awayTeam?.flagKey ?? null}
                                isPlaceholder={!!m.awayTeam?.isPlaceholder}
                              />
                            </span>
                          </div>

                          <div className="text-sm text-[color:var(--muted)] truncate">
                            {m.timeUtc} UTC · {m.venue ?? '—'}
                          </div>

                          {effectiveLeagueId && myPick && (
                            <div className="mt-1 text-sm text-[color:var(--accent)]">
                              Tu pick: {myPick.homePred} - {myPick.awayPred}
                              <span className="text-[color:var(--muted)]"> · {myPick.status}</span>
                            </div>
                          )}

                          <div className="text-xs text-[color:var(--muted)] mt-2">
                            <div>Hora local: {kickoffLabel || '—'}</div>
                            {closeTs ? (
                              locked ? (
                                <div className="text-red-500">Cerrado</div>
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
                            <div className="flex flex-col items-end">
                              <div className="text-[11px] text-[color:var(--muted)] leading-none mb-1">Resultado oficial del partido</div>
                              <div className="px-3 py-1 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm">
                                {m.score.home} - {m.score.away}
                              </div>
                            </div>
                          ) : (
                            <div className="px-3 py-1 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm text-[color:var(--muted)]">
                              {m.status}
                            </div>
                          )}

                          <Button
                            size="sm"
                            variant={locked ? 'outline' : 'primary'}
                            onClick={() => openPickModal(m)}
                            disabled={!effectiveLeagueId || locked || loadingPicks}
                            title={
                              !effectiveLeagueId
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
                            {locked ? 'Cerrado' : hasPick ? 'Editar' : 'Pronosticar'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}

          {!loading && !error && seasonId && items.length === 0 && (
            <Card className="p-4 text-[color:var(--muted)]">No hay partidos para este evento.</Card>
          )}

          {!loading && !error && seasonId && !effectiveLeagueId && visibleLeagues.length > 1 && (
            <Card className="p-4 text-[color:var(--muted)]">Selecciona una liga para ver/editar tus picks.</Card>
          )}
        </div>

        {/* Chatbot IA */}
        <AiChatWidget locale={locale} token={token} context={aiContext} />

        {/* MODAL */}
        {open && selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <Card className="w-full max-w-md p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-[color:var(--muted)]">Pronóstico</div>
                  <div className="text-lg font-semibold">
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <TeamWithFlag
                        name={(selected as MatchWithExtras).homeTeam?.name ?? ''}
                        flagKey={(selected as MatchWithExtras).homeTeam?.flagKey ?? null}
                        isPlaceholder={!!(selected as MatchWithExtras).homeTeam?.isPlaceholder}
                      />
                      <span className="text-[color:var(--muted)]">vs</span>
                      <TeamWithFlag
                        name={(selected as MatchWithExtras).awayTeam?.name ?? ''}
                        flagKey={(selected as MatchWithExtras).awayTeam?.flagKey ?? null}
                        isPlaceholder={!!(selected as MatchWithExtras).awayTeam?.isPlaceholder}
                      />
                    </span>
                  </div>
                  <div className="text-sm text-[color:var(--muted)] mt-1">
                    {selected.dateKey} · {selected.timeUtc} UTC
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setOpen(false);
                    setSelected(null);
                  }}
                >
                  X
                </Button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-sm text-[color:var(--muted)]">
                    <TeamWithFlag
                      name={(selected as MatchWithExtras).homeTeam?.name ?? ''}
                      flagKey={(selected as MatchWithExtras).homeTeam?.flagKey ?? null}
                      isPlaceholder={!!(selected as MatchWithExtras).homeTeam?.isPlaceholder}
                    />
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={homePred}
                    onChange={(e) => setHomePred(e.target.value)}
                    disabled={selectedLocked}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] disabled:opacity-50 disabled:bg-[var(--background)] disabled:text-[color:var(--muted)]"
                  />
                </div>

                <div>
                  <div className="text-sm text-[color:var(--muted)]">
                    <TeamWithFlag
                      name={(selected as MatchWithExtras).awayTeam?.name ?? ''}
                      flagKey={(selected as MatchWithExtras).awayTeam?.flagKey ?? null}
                      isPlaceholder={!!(selected as MatchWithExtras).awayTeam?.isPlaceholder}
                    />
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={awayPred}
                    onChange={(e) => setAwayPred(e.target.value)}
                    disabled={selectedLocked}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] disabled:opacity-50 disabled:bg-[var(--background)] disabled:text-[color:var(--muted)]"
                  />
                </div>

                {(() => {
                  const sel = selected as MatchWithExtras;
                  const phaseCode = sel.phaseCode ?? '';
                  const isKO = !!phaseCode && phaseCode !== 'F01';

                  return (
                    isKO &&
                    homePred.trim() !== '' &&
                    awayPred.trim() !== '' &&
                    Number(homePred) === Number(awayPred) && (
                      <Card className="mt-3 p-3">
                        <div className="text-sm font-medium text-[var(--foreground)]">KO: ¿Quién avanza?</div>
                        <div className="text-xs text-[color:var(--muted)] mt-1">
                          Como pronosticaste empate, debes elegir quién pasa a la siguiente fase.
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <select
                            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
                            value={koWinnerTeamId}
                            onChange={(e) => setKoWinnerTeamId(e.target.value)}
                          >
                            <option value="">— Selecciona —</option>
                            <option value={sel.homeTeam?.id ?? ''}>{sel.homeTeam?.name ?? 'Local'}</option>
                            <option value={sel.awayTeam?.id ?? ''}>{sel.awayTeam?.name ?? 'Visitante'}</option>
                          </select>

                          <Button type="button" size="sm" variant="secondary" onClick={() => setKoWinnerTeamId('')} title="Quitar selección">
                            Limpiar
                          </Button>
                        </div>
                      </Card>
                    )
                  );
                })()}
              </div>

              {selectedLocked && (
                <div className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/30 p-2 text-sm text-amber-200">
                  Este partido ya está cerrado. No puedes modificar tu pronóstico.
                </div>
              )}

              {saveError && (
                <div className="mt-3 rounded-lg border border-red-900 bg-red-950/50 p-2 text-sm text-red-200">{saveError}</div>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setOpen(false);
                    setSelected(null);
                  }}
                  disabled={saving}
                >
                  Cancelar
                </Button>

                <Button onClick={onSave} variant={selectedLocked ? 'outline' : 'primary'} size="sm" disabled={saving || selectedLocked}>
                  {selectedLocked ? 'Cerrado' : saving ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}