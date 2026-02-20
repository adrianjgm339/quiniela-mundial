'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import {
  getCatalog,
  getMatches,
  getMyLeagues,
  listPicks,
  setActiveSeason,
  upsertPick,
  type ApiLeague,
  type ApiMatch,
  type ApiPick,
  type CatalogSport,
} from '@/lib/api';
import AiChatWidget from '../../components/AiChatWidget';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { TeamWithFlag } from "@/components/team-with-flag";

export default function MatchesPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const appliedLeaguesContextRef = useRef(false);

  const [token, setToken] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const phase = searchParams.get('phase') || '';
  const group = searchParams.get('group') || '';

  const [catalog, setCatalog] = useState<CatalogSport[]>([]);
  const [sportId, setSportId] = useState('');
  const [competitionId, setCompetitionId] = useState('');
  const [seasonId, setSeasonId] = useState('');

  const [leagues, setLeagues] = useState<ApiLeague[]>([]);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [leagueConfirmed, setLeagueConfirmed] = useState(false);

  const [allItems, setAllItems] = useState<ApiMatch[]>([]);
  const [items, setItems] = useState<ApiMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [picksByMatchId, setPicksByMatchId] = useState<Record<string, ApiPick>>({});
  const [picksLeagueId, setPicksLeagueId] = useState<string | null>(null);
  const [loadingPicks, setLoadingPicks] = useState(false);

  // modal
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ApiMatch | null>(null);
  const [homePred, setHomePred] = useState<string>('');
  const [awayPred, setAwayPred] = useState<string>('');
  const [koWinnerTeamId, setKoWinnerTeamId] = useState<string>('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Persist phase/group si NO vienen en URL
  useEffect(() => {
    const hasPhaseInUrl = searchParams.has('phase');
    const hasGroupInUrl = searchParams.has('group');
    if (hasPhaseInUrl || hasGroupInUrl) return;

    const savedPhase = localStorage.getItem('matchesPhase') || '';
    const savedGroup = localStorage.getItem('matchesGroup') || '';

    const params = new URLSearchParams(searchParams.toString());
    if (savedPhase) params.set('phase', savedPhase);
    if (savedGroup) params.set('group', savedGroup);

    const qs = params.toString();
    router.replace(`/${locale}/matches${qs ? `?${qs}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function parseTs(iso?: string | null) {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
  }

  function getCloseTs(m: any) {
    const close = parseTs(m.closeUtc);
    if (close) return close;

    const start = parseTs(m.utcDateTime ?? m.timeUtc ?? m.kickoffUtc);
    const mins = typeof m.closeMinutes === 'number' ? m.closeMinutes : null;
    if (start && mins != null) return start - mins * 60_000;

    return null;
  }

  function isLocked(m: ApiMatch) {
    if ((m as any).resultConfirmed) return true;
    const closeTs = getCloseTs(m);
    return closeTs ? now >= closeTs : false;
  }

  function formatLocalDateTime(localeStr: string, utcIso?: string | null) {
    const ts = parseTs(utcIso);
    if (!ts) return '';
    const d = new Date(ts);

    const date = new Intl.DateTimeFormat(localeStr, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    }).format(d);

    const time = new Intl.DateTimeFormat(localeStr, {
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

  const competitionOptions = useMemo(() => {
    const s = catalog.find((x) => x.id === sportId);
    return s?.competitions ?? [];
  }, [catalog, sportId]);

  const seasonOptions = useMemo(() => {
    const c = competitionOptions.find((x) => x.id === competitionId);
    return c?.seasons ?? [];
  }, [competitionOptions, competitionId]);

  const visibleLeagues = useMemo(() => {
    if (!seasonId) return [];
    return leagues.filter((l: any) => l.seasonId === seasonId);
  }, [leagues, seasonId]);

  const effectiveLeagueId = useMemo(() => {
    if (!leagueConfirmed) return null;
    if (!leagueId) return null;
    if (!seasonId) return null;
    const l = leagues.find((x) => x.id === leagueId) as any;
    if (!l) return null;
    return l.seasonId === seasonId ? leagueId : null;
  }, [leagueConfirmed, leagueId, seasonId, leagues]);

  // bootstrap (catalog + myLeagues + restore ctx)
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

        const cat = await getCatalog(locale);
        setCatalog(cat);

        const myLeagues = await getMyLeagues(t);
        setLeagues(myLeagues);

        const fromLeagues = localStorage.getItem('matches_ctx_fromLeagues') === '1';

        if (fromLeagues && !appliedLeaguesContextRef.current) {
          const sId = localStorage.getItem('matches_ctx_sportId') || '';
          const cId = localStorage.getItem('matches_ctx_competitionId') || '';
          const season = localStorage.getItem('matches_ctx_seasonId') || '';
          const lId = localStorage.getItem('matches_ctx_leagueId') || '';

          setSportId(sId);
          setCompetitionId(cId);
          setSeasonId(season);

          const leagueOk = myLeagues.some((l: any) => l.id === lId && l.seasonId === season);

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
          // entrada limpia
          setSportId('');
          setCompetitionId('');
          setSeasonId('');
          localStorage.removeItem('activeSeasonId');
          localStorage.removeItem('activeLeagueId');
          setLeagueId(null);
          setLeagueConfirmed(false);
        }

        setAllItems([]);
        setItems([]);
        setPicksByMatchId({});
        setLoadingPicks(false);
      } catch (e: any) {
        setError(e?.message ?? 'Error cargando');
      } finally {
        setLoading(false);
      }
    })();
  }, [locale, router]);

  // al cambiar seasonId: setActiveSeason + cargar matches + elegir liga por UX
  useEffect(() => {
    if (!token) return;
    if (!seasonId) return;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // reset filtros (evita filtros colgados entre eventos)
        localStorage.setItem('matchesPhase', '');
        localStorage.setItem('matchesGroup', '');
        router.replace(`/${locale}/matches`);

        await setActiveSeason(token, seasonId);

        const leaguesInSeason = leagues.filter((l: any) => l.seasonId === seasonId);

        const keepRestoredLeague =
          appliedLeaguesContextRef.current && leagueConfirmed && leagueId && leaguesInSeason.some((l) => l.id === leagueId);

        let nextLeagueId: string | null = null;

        if (keepRestoredLeague) {
          nextLeagueId = leagueId!;
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

        // limpiar picks visibles
        setPicksByMatchId({});
        setPicksLeagueId(null);

        const all = await getMatches(token, locale, { seasonId });
        setAllItems(all);

        const data = await getMatches(token, locale, { seasonId, phaseCode: undefined, groupCode: undefined });
        setItems(data);
      } catch (e: any) {
        setError(e?.message ?? 'Error cargando partidos');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  // refetch de partidos por filtros
  useEffect(() => {
    if (!token) return;
    if (!seasonId) return;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await getMatches(token, locale, {
          seasonId,
          phaseCode: phase || undefined,
          groupCode: group || undefined,
        });

        setItems(data);
      } catch (e: any) {
        setError(e?.message ?? 'Error aplicando filtros');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, seasonId, locale, phase, group]);

  // cargar picks por liga efectiva
  useEffect(() => {
    if (!token) return;

    if (!effectiveLeagueId) {
      setPicksByMatchId({});
      setPicksLeagueId(null);
      setLoadingPicks(false);
      return;
    }

    let cancelled = false;
    const requestedLeagueId = effectiveLeagueId;

    (async () => {
      try {
        setLoadingPicks(true);
        setPicksByMatchId({});
        setPicksLeagueId(null);

        const picks = await listPicks(token, requestedLeagueId);

        if (cancelled) return;

        const onlyThisLeague = (Array.isArray(picks) ? picks : []).filter(
          (p: ApiPick) => (p as any).leagueId === requestedLeagueId
        );

        const map: Record<string, ApiPick> = {};
        for (const p of onlyThisLeague) map[(p as any).matchId] = p;

        setPicksLeagueId(requestedLeagueId);
        setPicksByMatchId(map);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Error cargando picks');
      } finally {
        if (!cancelled) setLoadingPicks(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, effectiveLeagueId]);

  const phaseOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of allItems) {
      const pc = (m as any).phaseCode as string | undefined;
      if (pc) set.add(pc);
    }
    return Array.from(set.values()).sort();
  }, [allItems]);

  const allGroupOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of allItems) {
      const gc = (m as any).groupCode as string | undefined;
      if (gc) set.add(gc);
    }
    return Array.from(set.values()).sort();
  }, [allItems]);

  const groupOptions = useMemo(() => {
    const base = phase ? allItems.filter((m) => ((m as any).phaseCode as string | undefined) === phase) : allItems;
    const set = new Set<string>();
    for (const m of base) {
      const gc = (m as any).groupCode as string | undefined;
      if (gc) set.add(gc);
    }
    return Array.from(set.values()).sort();
  }, [allItems, phase]);

  const showPhaseGroupFilters = phaseOptions.length > 0 || allGroupOptions.length > 0;

  useEffect(() => {
    if (!group) return;
    if (groupOptions.includes(group)) return;

    localStorage.setItem('matchesGroup', '');
    const params = new URLSearchParams(searchParams.toString());
    params.delete('group');
    const qs = params.toString();
    router.replace(`/${locale}/matches${qs ? `?${qs}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, groupOptions, locale]);

  function onChangeLeague(newLeagueId: string) {
    setLeagueId(newLeagueId);
    setLeagueConfirmed(true);
    localStorage.setItem('activeLeagueId', newLeagueId);

    setPicksByMatchId({});
    setPicksLeagueId(null);
    setSaveError(null);
  }

  function openPickModal(match: ApiMatch) {
    setSaveError(null);
    setSelected(match);

    const existing = picksByMatchId[(match as any).id];
    setHomePred(existing ? String((existing as any).homePred) : '');
    setAwayPred(existing ? String((existing as any).awayPred) : '');
    setKoWinnerTeamId((existing as any)?.koWinnerTeamId ?? '');

    setOpen(true);
  }

  async function onSave() {
    if (!token) {
      router.push(`/${locale}/login`);
      return;
    }
    if (!effectiveLeagueId) {
      setSaveError('No hay Liga activa. Selecciona una liga primero.');
      return;
    }
    if (!selected) return;

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

    const isKO = (selected as any).phaseCode && (selected as any).phaseCode !== 'F01';
    const isTie = hp === ap;

    if (isKO && isTie && !koWinnerTeamId) {
      setSaveError('KO: Como pronosticaste empate, debes indicar quién avanza (Local o Visitante).');
      return;
    }

    const finalKoWinnerTeamId = isKO && isTie ? koWinnerTeamId : null;

    try {
      setSaving(true);
      setSaveError(null);

      const saved = await upsertPick(token, {
        leagueId: effectiveLeagueId,
        matchId: (selected as any).id,
        homePred: hp,
        awayPred: ap,
        koWinnerTeamId: finalKoWinnerTeamId,
      });

      setPicksByMatchId((prev) => ({ ...prev, [(selected as any).id]: saved }));
      setOpen(false);
      setSelected(null);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Error guardando pick');
    } finally {
      setSaving(false);
    }
  }

  const activeLeague = effectiveLeagueId ? (leagues.find((l) => (l as any).id === effectiveLeagueId) as any) : null;

  const activeLeagueLabel = activeLeague ? `${activeLeague.name} · Código: ${activeLeague.joinCode}` : '—';

  const aiContext = useMemo(() => {
    const selectedPick = selected ? picksByMatchId[(selected as any).id] : null;

    return {
      page: 'matches',
      locale,
      filters: { sportId, competitionId, seasonId, phase, group },
      effectiveLeagueId,
      activeLeague: activeLeague
        ? { id: activeLeague.id, name: activeLeague.name, joinCode: activeLeague.joinCode }
        : null,
      selectedMatch: selected
        ? {
            id: (selected as any).id,
            phaseCode: (selected as any).phaseCode ?? null,
            groupCode: (selected as any).groupCode ?? null,
            utcDateTime: (selected as any).utcDateTime ?? (selected as any).timeUtc ?? null,
            closeUtc: (selected as any).closeUtc ?? null,
            homeTeamName: (selected as any).homeTeam?.name ?? null,
            awayTeamName: (selected as any).awayTeam?.name ?? null,
          }
        : null,
      selectedPick: selectedPick
        ? {
            homePred: (selectedPick as any).homePred,
            awayPred: (selectedPick as any).awayPred,
            koWinnerTeamId: (selectedPick as any).koWinnerTeamId ?? null,
            status: (selectedPick as any).status ?? null,
          }
        : null,
      nowUtc: new Date().toISOString(),
    };
  }, [
    locale,
    sportId,
    competitionId,
    seasonId,
    phase,
    group,
    effectiveLeagueId,
    activeLeague,
    selected,
    picksByMatchId,
  ]);

  const selectedLocked = selected ? isLocked(selected) : false;

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <PageHeader
            title="Partidos"
            subtitle={
              <span className="text-[color:var(--muted)]">
                Liga activa: {activeLeagueLabel}
                {effectiveLeagueId && loadingPicks ? " · Cargando picks…" : ""}
              </span>
            }
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    localStorage.setItem("matchesPhase", "");
                    localStorage.setItem("matchesGroup", "");

                    setSportId("");
                    setCompetitionId("");
                    setSeasonId("");
                    setLeagueId(null);
                    setLeagueConfirmed(false);
                    setPicksLeagueId(null);

                    localStorage.removeItem("activeSeasonId");
                    localStorage.removeItem("activeLeagueId");

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

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push(`/${locale}/leagues`)}
                  title="Gestionar ligas"
                >
                  Ligas
                </Button>

                <Button variant="secondary" size="sm" onClick={() => router.push(`/${locale}/dashboard`)}>
                  Volver
                </Button>
              </div>
            }
          />

          {/* Opción 2 — Cascada Sport → Competition → Event → League */}
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

                    // 1) Cambiar deporte y resetear cascada
                    setSportId(v);
                    setCompetitionId("");
                    setSeasonId("");
                    localStorage.removeItem("activeSeasonId");
                    localStorage.removeItem("activeLeagueId");

                    // 2) Limpiar selección dependiente y data visible (evita confusión)
                    setLeagueId(null);
                    setLeagueConfirmed(false);
                    setPicksByMatchId({});
                    setPicksLeagueId(null);
                    setItems([]);
                    setAllItems([]);
                    setError(null);

                    // 3) Limpiar filtros (URL + localStorage)
                    localStorage.setItem("matchesPhase", "");
                    localStorage.setItem("matchesGroup", "");
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
                    setSeasonId("");
                    localStorage.removeItem("activeSeasonId");
                    localStorage.removeItem("activeLeagueId");

                    setLeagueId(null);
                    setLeagueConfirmed(false);
                    setPicksByMatchId({});
                    setPicksLeagueId(null);
                    setItems([]);
                    setAllItems([]);
                    setError(null);

                    localStorage.setItem("matchesPhase", "");
                    localStorage.setItem("matchesGroup", "");
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

                    // 1) set evento
                    setSeasonId(v);
                    if (v) localStorage.setItem("activeSeasonId", v);
                    else localStorage.removeItem("activeSeasonId");

                    // 2) reset inmediato (evita que se vea data vieja / picks viejos)
                    setLeagueId(null);
                    setLeagueConfirmed(false);
                    localStorage.removeItem('activeLeagueId');
                    setPicksByMatchId({});
                    setPicksLeagueId(null);
                    setLoadingPicks(false);
                    setItems([]);
                    setAllItems([]);
                    setError(null);

                    // 3) reset filtros (URL + localStorage)
                    localStorage.setItem("matchesPhase", "");
                    localStorage.setItem("matchesGroup", "");
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
                  value={effectiveLeagueId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      setLeagueId(null);
                      setLeagueConfirmed(false);
                      localStorage.removeItem("activeLeagueId");
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
                      localStorage.setItem("matchesPhase", p);
                      if (p) localStorage.setItem("matchesGroup", "");

                      const params = new URLSearchParams(searchParams.toString());

                      if (p) params.set("phase", p);
                      else params.delete("phase");

                      // Al cambiar fase, limpiamos grupo para evitar inconsistencias entre eventos/fases
                      localStorage.setItem("matchesGroup", "");
                      params.delete("group");

                      const qs = params.toString();
                      router.replace(`/${locale}/matches${qs ? `?${qs}` : ""}`);
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
                      localStorage.setItem("matchesGroup", g);

                      const params = new URLSearchParams(searchParams.toString());

                      if (g) params.set("group", g);
                      else params.delete("group");

                      const qs = params.toString();
                      router.replace(`/${locale}/matches${qs ? `?${qs}` : ""}`);
                    }}
                    title={
                      !allGroupOptions.length
                        ? "Este evento no tiene grupos"
                        : !groupOptions.length
                          ? "Esta fase no tiene grupos"
                          : "Filtrar por grupo"
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

          {loading && (
            <Card className="p-4 text-[color:var(--muted)]">
              Cargando partidos…
            </Card>
          )}

          {error && (
            <Card className="p-4 border border-red-500/30">
              {error}
            </Card>
          )}

          {!loading &&
            !error &&
            grouped.map(([dateKey, matches]) => (
              <Card key={dateKey} className="overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--border)] font-medium">{dateKey}</div>

                <div className="divide-y divide-[var(--border)]">
                  {matches.map((m) => {
                    const myPick =
                      effectiveLeagueId && picksLeagueId === effectiveLeagueId
                        ? picksByMatchId[m.id]
                        : undefined;
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
                            <span className="inline-flex items-center gap-2 min-w-0">
                              <TeamWithFlag
                                name={m.homeTeam?.name ?? ""}
                                flagKey={(m.homeTeam as any)?.flagKey ?? null}
                                isPlaceholder={!!(m.homeTeam as any)?.isPlaceholder}
                              />
                              <span className="text-[color:var(--muted)]">vs</span>
                              <TeamWithFlag
                                name={m.awayTeam?.name ?? ""}
                                flagKey={(m.awayTeam as any)?.flagKey ?? null}
                                isPlaceholder={!!(m.awayTeam as any)?.isPlaceholder}
                              />
                            </span>
                          </div>

                          <div className="text-sm text-[color:var(--muted)] truncate">
                            {m.timeUtc} UTC · {m.venue ?? "—"}
                          </div>

                          {effectiveLeagueId && myPick && (
                            <div className="mt-1 text-sm text-[color:var(--accent)]">
                              Tu pick: {myPick.homePred} - {myPick.awayPred}
                              <span className="text-[color:var(--muted)]"> · {myPick.status}</span>
                            </div>
                          )}

                          <div className="text-xs text-[color:var(--muted)] mt-2">
                            <div>Hora local: {kickoffLabel || "—"}</div>
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
                              <div className="text-[11px] text-[color:var(--muted)] leading-none mb-1">
                                Resultado oficial del partido
                              </div>
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
                            variant={locked ? "outline" : "primary"}
                            onClick={() => openPickModal(m)}
                            disabled={!effectiveLeagueId || locked || loadingPicks}
                            title={
                              !effectiveLeagueId
                                ? "Selecciona una liga primero"
                                : loadingPicks
                                  ? "Cargando picks de la liga..."
                                  : locked
                                    ? "Partido cerrado. Pick bloqueado."
                                    : hasPick
                                      ? "Editar pronóstico"
                                      : "Pronosticar"
                            }
                          >
                            {locked ? "Cerrado" : hasPick ? "Editar" : "Pronosticar"}
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
            <Card className="p-4 text-[color:var(--muted)]">No hay partidos para este evento.</Card>
          )}

        </div>

        {/* MODAL */}
        {
          open && selected && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <Card className="w-full max-w-md p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-[color:var(--muted)]">Pronóstico</div>
                    <div className="text-lg font-semibold">
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <TeamWithFlag
                          name={selected.homeTeam?.name ?? ""}
                          flagKey={(selected.homeTeam as any)?.flagKey ?? null}
                          isPlaceholder={!!(selected.homeTeam as any)?.isPlaceholder}
                        />
                        <span className="text-[color:var(--muted)]">vs</span>
                        <TeamWithFlag
                          name={selected.awayTeam?.name ?? ""}
                          flagKey={(selected.awayTeam as any)?.flagKey ?? null}
                          isPlaceholder={!!(selected.awayTeam as any)?.isPlaceholder}
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

      {/* MODAL */}
      {open && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md">
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-[color:var(--muted)]">Pronóstico</div>
                  <div className="text-lg font-semibold text-[var(--foreground)]">
                    {(selected.homeTeam?.name ?? '')} vs {(selected.awayTeam?.name ?? '')}
                  </div>
                  <div className="text-sm text-[color:var(--muted)] mt-1">
                    {(selected as any).dateKey ?? '—'} · {(selected as any).timeUtc ?? '—'} UTC
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
                      name={selected.homeTeam?.name ?? ''}
                      flagKey={(selected.homeTeam as any)?.flagKey ?? null}
                      isPlaceholder={!!(selected.homeTeam as any)?.isPlaceholder}
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
                      name={selected.awayTeam?.name ?? ''}
                      flagKey={(selected.awayTeam as any)?.flagKey ?? null}
                      isPlaceholder={!!(selected.awayTeam as any)?.isPlaceholder}
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

                {((selected as any).phaseCode && (selected as any).phaseCode !== 'F01') &&
                homePred.trim() !== '' &&
                awayPred.trim() !== '' &&
                Number(homePred) === Number(awayPred) ? (
                  <Card className="mt-3 p-3 col-span-2">
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
                        <option value={selected.homeTeam.id}>{selected.homeTeam.name}</option>
                        <option value={selected.awayTeam.id}>{selected.awayTeam.name}</option>
                      </select>

                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setKoWinnerTeamId('')}
                        title="Quitar selección"
                      >
                        Limpiar
                      </Button>
                    </div>
                  </Card>
                ) : null}
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

                <Button
                  onClick={onSave}
                  variant={selectedLocked ? 'outline' : 'primary'}
                  size="sm"
                  disabled={saving || selectedLocked}
                >
                  {selectedLocked ? 'Cerrado' : saving ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Chatbot IA */}
      <AiChatWidget locale={locale} token={token} context={aiContext} />
    </div>
  );
}