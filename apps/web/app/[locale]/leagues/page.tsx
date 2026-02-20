'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  createLeague,
  getMyLeagues,
  joinLeagueByCode,
  listScoringRules,
  getScoringRule,
  me,
  setActiveSeason,
  getCatalog,
  getSeasonConcepts,
  type CatalogSport,
  type ApiLeague,
  type ApiScoringRule,
  type ApiScoringRuleDetail,
} from '@/lib/api';
import AiChatWidget from '../../components/AiChatWidget';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';
const NEW_LEAGUE = '__NEW__';

const joinPolicyLabel = (p?: string) => {
  switch ((p || '').toUpperCase()) {
    case 'PUBLIC':
      return 'Pública';
    case 'APPROVAL':
      return 'Con aprobación';
    case 'PRIVATE':
    default:
      return 'Privada';
  }
};

// Orden/labels UI (si un rule no trae algún code, lo mostramos en 0)
const DEFAULT_CONCEPTS: Array<{ code: string; label: string }> = [
  { code: 'EXACTO', label: 'EXACTO (marcador exacto)' },
  { code: 'RESULTADO', label: 'RESULTADO (ganador/empate)' },
  { code: 'BONUS_DIF', label: 'BONUS_DIF (diferencia de goles)' },
  { code: 'GOLES_LOCAL', label: 'GOLES_LOCAL (goles local)' },
  { code: 'GOLES_VISITA', label: 'GOLES_VISITA (goles visita)' },
  { code: 'KO_GANADOR_FINAL', label: 'KO_GANADOR_FINAL (KO: quién avanza)' },
];

function friendlyErrorMessage(raw: unknown) {
  const s = String((raw as any)?.message ?? raw ?? '');
  if (s.includes('League rules are locked') || s.includes('Tournament has started')) {
    return 'No se puede cambiar la regla porque el torneo ya inició.';
  }
  if (s.includes('Insufficient league role')) return 'No tienes permisos en esta liga para guardar la regla.';
  if (s.includes('Admin only')) return 'Solo un ADMIN del sistema puede realizar esta acción.';
  if (s.includes('Failed')) return 'Ocurrió un error. Intenta nuevamente.';
  return s || 'Ocurrió un error.';
}

function parseAndValidateCustomPoints(
  customPoints: Record<string, string>,
  concepts: Array<{ code: string; label: string }>
) {
  const details: Array<{ code: string; points: number }> = [];
  let hasPositive = false;

  for (const c of concepts) {
    const raw = (customPoints[c.code] ?? '').toString().trim();
    const n = Number(raw);

    if (raw === '' || !Number.isFinite(n)) throw new Error(`Puntos inválidos para "${c.label}".`);
    if (!Number.isInteger(n)) throw new Error(`No se permiten decimales en "${c.label}".`);
    if (n < 0) throw new Error(`No se permiten puntos negativos en "${c.label}".`);
    if (n > 0) hasPositive = true;

    details.push({ code: c.code, points: n });
  }

  if (!hasPositive) throw new Error('Debes asignar puntos (>0) a al menos 1 concepto.');
  return details;
}

function makePointsRecord(concepts: Array<{ code: string }>) {
  const rec: Record<string, string> = {};
  for (const c of concepts) rec[c.code] = '0';
  return rec;
}

function isCustomRuleId(id?: string | null) {
  if (!id) return false;
  return id.startsWith('C') || id.toLowerCase().includes('custom');
}

export default function LeaguesPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [token, setToken] = useState<string | null>(null);

  const [meInfo, setMeInfo] = useState<any>(null);
  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(null);
  const [activeSeasonNameLabel, setActiveSeasonNameLabel] = useState<string>('Seleccionar');

  const [catalog, setCatalog] = useState<CatalogSport[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Filtros (Deporte -> Competición -> Evento/Season)
  const [selectedSportId, setSelectedSportId] = useState<string>('');
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>('');
  const [selectedSeasonFilterId, setSelectedSeasonFilterId] = useState<string>(''); // evento

  const [leagues, setLeagues] = useState<ApiLeague[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(true);

  const [concepts, setConcepts] = useState<Array<{ code: string; label: string }>>(DEFAULT_CONCEPTS);

  const [rules, setRules] = useState<ApiScoringRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);

  const [selectedLeagueId, setSelectedLeagueId] = useState<string>(''); // '' = "Seleccionar"
  const [selectedRuleId, setSelectedRuleId] = useState<string>(''); // '' = sin regla seleccionada
  const [selectedRule, setSelectedRule] = useState<ApiScoringRule | null>(null);
  const [loadingRuleDetails, setLoadingRuleDetails] = useState(false);

  // Crear liga
  const [newLeagueName, setNewLeagueName] = useState('');
  const [newJoinPolicy, setNewJoinPolicy] = useState<'PUBLIC' | 'PRIVATE' | 'APPROVAL'>('PRIVATE');
  const [newRuleMode, setNewRuleMode] = useState<'PREDEFINED' | 'CUSTOM'>('PREDEFINED');

  // Custom rule (crear)
  const [customRuleName, setCustomRuleName] = useState('');
  const [customPoints, setCustomPoints] = useState<Record<string, string>>(makePointsRecord(DEFAULT_CONCEPTS));

  // Custom rule (editar en liga existente)
  const [editPoints, setEditPoints] = useState<Record<string, string>>(makePointsRecord(DEFAULT_CONCEPTS));

  const [savingLeagueRule, setSavingLeagueRule] = useState(false);

  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // -------- helpers --------
  async function refreshLeagues(t: string) {
    const data = await getMyLeagues(t);
    setLeagues(data);
    return data;
  }

  async function loadRuleDetailsIfNeeded(t: string, ruleId: string) {
    if (!ruleId) {
      setSelectedRule(null);
      return;
    }
    setLoadingRuleDetails(true);
    try {
      const r = await getScoringRule(t, ruleId);
      setSelectedRule(r);

      // si es una custom rule de la liga y quieres editar, precargar puntos
      if (isCustomRuleId(ruleId)) {
        const rec: Record<string, string> = {};
        for (const c of concepts) {
          const pts = r?.details?.find((d: ApiScoringRuleDetail) => d.code === c.code)?.points ?? 0;
          rec[c.code] = String(pts);
        }
        setEditPoints(rec);
      }
    } finally {
      setLoadingRuleDetails(false);
    }
  }

  // -------- auth bootstrap --------
  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push(`/${locale}/login`);
      return;
    }
    setToken(t);

    (async () => {
      try {
        const m = await me(t, locale);
        setMeInfo(m);

        if (m?.activeSeason?.id) {
          setActiveSeasonId(m.activeSeason.id);
          setActiveSeasonNameLabel(m.activeSeason.name ?? 'Seleccionar');
          localStorage.setItem('activeSeasonId', m.activeSeason.id);
        } else {
          const lsSeason = localStorage.getItem('activeSeasonId');
          if (lsSeason) setActiveSeasonId(lsSeason);
        }
      } catch {
        // silencioso
      }
    })();
  }, [locale, router]);

  // -------- load catalog --------
  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        setLoadingCatalog(true);
        const cat = await getCatalog(locale);
        setCatalog(cat);
      } finally {
        setLoadingCatalog(false);
      }
    })();
  }, [token, locale]);

  // -------- load leagues --------
  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        setLoadingLeagues(true);
        await refreshLeagues(token);
      } catch (e: any) {
        setError(e?.message ?? 'Error cargando ligas');
      } finally {
        setLoadingLeagues(false);
      }
    })();
  }, [token]);

  // -------- load rules --------
  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        setLoadingRules(true);
        const list = await listScoringRules(token);
        setRules(list);
      } catch (e: any) {
        setError(e?.message ?? 'Error cargando reglas');
      } finally {
        setLoadingRules(false);
      }
    })();
  }, [token]);

  // -------- load concepts by season --------
  useEffect(() => {
    if (!token) return;
    if (!selectedSeasonFilterId) {
      setConcepts(DEFAULT_CONCEPTS);
      return;
    }

    (async () => {
      try {
        const c = await getSeasonConcepts(token, selectedSeasonFilterId);
        if (Array.isArray(c) && c.length > 0) {
          setConcepts(c);
          setCustomPoints(makePointsRecord(c));
          setEditPoints(makePointsRecord(c));
        } else {
          setConcepts(DEFAULT_CONCEPTS);
        }
      } catch {
        setConcepts(DEFAULT_CONCEPTS);
      }
    })();
  }, [token, selectedSeasonFilterId]);

  const sportOptions = useMemo(() => catalog ?? [], [catalog]);

  const competitionOptions = useMemo(() => {
    const s = catalog.find((x) => x.id === selectedSportId);
    return s?.competitions ?? [];
  }, [catalog, selectedSportId]);

  const seasonOptions = useMemo(() => {
    const c = competitionOptions.find((x) => x.id === selectedCompetitionId);
    return c?.seasons ?? [];
  }, [competitionOptions, selectedCompetitionId]);

  const filtersReady = !!selectedSportId && !!selectedCompetitionId && !!selectedSeasonFilterId;
  const eventSelected = !!selectedSeasonFilterId;

  const leaguesByEvent = useMemo(() => {
    if (!selectedSeasonFilterId) return [];
    return leagues.filter((l: any) => l.seasonId === selectedSeasonFilterId);
  }, [leagues, selectedSeasonFilterId]);

  const selectedLeague = useMemo(() => {
    if (!selectedLeagueId || selectedLeagueId === NEW_LEAGUE) return null;
    return leagues.find((x: any) => x.id === selectedLeagueId) as any;
  }, [leagues, selectedLeagueId]);

  const canSaveLeagueRule = useMemo(() => {
    // tu backend suele exponer myRole
    const role = selectedLeague?.myRole;
    return role === 'OWNER' || role === 'ADMIN';
  }, [selectedLeague]);

  const ruleOptionsForSelect = useMemo(() => {
    return rules ?? [];
  }, [rules]);

  const isEditingLeagueCustomRule = useMemo(() => {
    if (!selectedLeague) return false;
    return isCustomRuleId(selectedLeague.scoringRuleId);
  }, [selectedLeague]);

  // cuando cambia selectedRuleId, cargar detalle
  useEffect(() => {
    if (!token) return;
    if (!selectedRuleId) {
      setSelectedRule(null);
      return;
    }
    loadRuleDetailsIfNeeded(token, selectedRuleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedRuleId]);

  async function selectLeagueAndGoMatches(l: any) {
    localStorage.setItem('activeLeagueId', l.id);
    localStorage.setItem('activeLeagueName', l.name);

    // handoff para /matches (si tu socio lo usa)
    localStorage.setItem('matches_ctx_fromLeagues', '1');
    localStorage.setItem('matches_ctx_leagueId', l.id);
    localStorage.setItem('matches_ctx_seasonId', l.seasonId ?? '');
    localStorage.setItem('matches_ctx_sportId', selectedSportId ?? '');
    localStorage.setItem('matches_ctx_competitionId', selectedCompetitionId ?? '');

    router.push(`/${locale}/matches`);
  }

  async function onJoin() {
    if (!token) return;

    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setError('Escribe el código para unirte.');
      return;
    }

    setJoining(true);
    setError(null);
    setInfo(null);

    try {
      const res: any = await joinLeagueByCode(token, { joinCode: code });
      setJoinCode('');
      if (res?.pending) {
        setInfo('Solicitud enviada. Espera aprobación del ADMIN/OWNER.');
      } else {
        setInfo('Te uniste a la liga.');
      }

      const data = await refreshLeagues(token);

      if (res?.leagueId) {
        setSelectedLeagueId(res.leagueId);

        const joinedLeague = data?.find((l: any) => l.id === res.leagueId);
        if (joinedLeague?.seasonId) {
          const seasonId = joinedLeague.seasonId;

          let foundSportId = '';
          let foundCompetitionId = '';

          for (const s of catalog) {
            for (const c of s.competitions ?? []) {
              const matchSeason = (c.seasons ?? []).find((se: any) => se.id === seasonId);
              if (matchSeason) {
                foundSportId = s.id;
                foundCompetitionId = c.id;
                break;
              }
            }
            if (foundSportId) break;
          }

          setSelectedSportId(foundSportId);
          setSelectedCompetitionId(foundCompetitionId);
          setSelectedSeasonFilterId(seasonId);

          setActiveSeasonId(seasonId);
          localStorage.setItem('activeSeasonId', seasonId);

          await setActiveSeason(token, seasonId);
          const m = await me(token, locale);
          setMeInfo(m);
          setActiveSeasonNameLabel(m?.activeSeason?.name ?? 'Seleccionar');
        }
      }

      router.push(`/${locale}/matches`);
    } catch (e: any) {
      setError(friendlyErrorMessage(e));
    } finally {
      setJoining(false);
    }
  }

  async function onSaveLeagueRule() {
    if (!token) return;

    setSavingLeagueRule(true);
    setError(null);
    setInfo(null);

    try {
      if (!selectedLeagueId) {
        setError('Selecciona una liga o elige (CREAR NUEVA LIGA).');
        return;
      }

      // crear liga al guardar
      if (selectedLeagueId === NEW_LEAGUE) {
        if (!activeSeasonId) {
          setError('No hay un evento activo (Season). Ve al Dashboard y selecciona un evento.');
          return;
        }

        const name = newLeagueName.trim();
        if (!name) {
          setError('Escribe un nombre para la nueva liga.');
          return;
        }

        if (newRuleMode === 'CUSTOM') {
          const ruleName = customRuleName.trim();
          if (!ruleName) {
            setError('Debes indicar el nombre de la regla personalizada.');
            return;
          }

          const details = parseAndValidateCustomPoints(customPoints, concepts);

          // crear regla custom
          const resRule = await fetch(`${API_BASE}/scoring/rules/custom`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              seasonId: activeSeasonId,
              name: ruleName,
              description: null,
              details,
            }),
          });

          if (!resRule.ok) {
            const text = await resRule.text().catch(() => '');
            throw new Error(text || 'No se pudo crear la regla personalizada.');
          }

          const createdRule = await resRule.json();
          const ruleId = createdRule?.id as string | undefined;
          if (!ruleId) throw new Error('La regla personalizada no devolvió un ID.');

          const resCreate = await fetch(`${API_BASE}/leagues`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              seasonId: activeSeasonId,
              name,
              scoringRuleId: ruleId,
              joinPolicy: newJoinPolicy,
            }),
          });

          if (!resCreate.ok) {
            const text = await resCreate.text().catch(() => '');
            throw new Error(text || 'No se pudo crear la liga.');
          }

          const created = await resCreate.json();

          await refreshLeagues(token);
          setSelectedLeagueId(created.id);

          localStorage.setItem('activeLeagueId', created.id);
          localStorage.setItem('activeLeagueName', created.name);

          setNewLeagueName('');
          setCustomRuleName('');
          setCustomPoints(makePointsRecord(concepts));

          setInfo('Liga creada con regla personalizada correctamente.');
          return;
        }

        if (!selectedRuleId) {
          setError('Debes seleccionar una regla predefinida para crear la liga.');
          return;
        }

        // Crear liga YA con regla (obligatoria)
        const resCreate = await fetch(`${API_BASE}/leagues`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            seasonId: activeSeasonId,
            name,
            scoringRuleId: selectedRuleId,
            joinPolicy: newJoinPolicy,
          }),
        });

        if (!resCreate.ok) {
          const text = await resCreate.text().catch(() => '');
          throw new Error(text || 'No se pudo crear la liga.');
        }

        const created = await resCreate.json();

        await refreshLeagues(token);
        setSelectedLeagueId(created.id);

        localStorage.setItem('activeLeagueId', created.id);
        localStorage.setItem('activeLeagueName', created.name);

        setNewLeagueName('');
        setInfo('Liga creada y regla asignada correctamente.');
        return;
      }

      // liga existente
      if (!selectedRuleId) {
        setError('Selecciona una regla para guardar.');
        return;
      }

      if (!canSaveLeagueRule) {
        setError('Solo el ADMIN/OWNER de esta liga puede cambiar la regla.');
        return;
      }

      // editar custom rule sin cambiar scoringRuleId
      if (isEditingLeagueCustomRule && isCustomRuleId(selectedRuleId)) {
        const details = parseAndValidateCustomPoints(editPoints, concepts);

        const resCustom = await fetch(
          `${API_BASE}/leagues/${encodeURIComponent(selectedLeagueId)}/custom-rule`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ details }),
          }
        );

        if (!resCustom.ok) {
          const text = await resCustom.text().catch(() => '');
          throw new Error(text || 'No se pudo guardar la regla personalizada.');
        }

        const refreshed = await getScoringRule(token, selectedRuleId);
        setSelectedRule(refreshed);

        setInfo('Regla personalizada actualizada correctamente.');
        return;
      }

      const res = await fetch(`${API_BASE}/leagues/${encodeURIComponent(selectedLeagueId)}/scoring-rule`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scoringRuleId: selectedRuleId }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'No se pudo guardar la regla.');
      }

      await refreshLeagues(token);
      setInfo('Regla guardada para la liga.');
    } catch (e: any) {
      setError(friendlyErrorMessage(e));
    } finally {
      setSavingLeagueRule(false);
    }
  }

  const aiContext = useMemo(() => {
    return {
      page: 'leagues',
      locale,
      filters: {
        sportId: selectedSportId,
        competitionId: selectedCompetitionId,
        seasonId: selectedSeasonFilterId,
      },
      activeSeasonId,
      selectedLeagueId,
      selectedRuleId,
      leaguesCount: leaguesByEvent.length,
      nowUtc: new Date().toISOString(),
    };
  }, [
    locale,
    selectedSportId,
    selectedCompetitionId,
    selectedSeasonFilterId,
    activeSeasonId,
    selectedLeagueId,
    selectedRuleId,
    leaguesByEvent.length,
  ]);

  return (
    <div className="min-h-screen space-y-6">
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title="Ligas"
          subtitle={
            <span>
              Evento activo: <b>{activeSeasonNameLabel}</b>
            </span>
          }
          actions={
            <Button variant="secondary" onClick={() => router.push(`/${locale}/dashboard`)}>
              Volver
            </Button>
          }
        />

        {!token && (
          <Card className="p-4 text-[color:var(--muted)]">
            Cargando sesión…
          </Card>
        )}

        {!activeSeasonId && token && (
          <div className="rounded-2xl border border-amber-900/60 bg-amber-950/30 p-4 text-amber-200">
            No hay evento activo (Season) detectado. Ve al <b>Dashboard</b> y selecciona un evento.
          </div>
        )}

        {info && (
          <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/20 p-4 text-emerald-200">
            {info}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-4 text-red-200">
            {error}
          </div>
        )}

        {/* Gestión de ligas (unificado) */}
        <Card className="p-5">
          <div className="text-lg font-semibold">Gestionar ligas</div>
          <div className="text-sm text-[color:var(--muted)] mt-1">
            Unirte por código o seleccionar/crear liga y definir su regla.
          </div>

          {/* Unirse por código */}
          <div className="mt-4">
            <div className="text-sm text-[color:var(--muted)] mb-1">Unirse por código</div>
            <div className="flex flex-wrap gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Código (ej: ABC123)"
                className="flex-1 min-w-[220px] rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[color:var(--muted)] disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <Button
                onClick={onJoin}
                disabled={joining || !joinCode.trim()}
              >
                {joining ? 'Uniéndome…' : 'Unirme'}
              </Button>
            </div>
          </div>

          <div className="my-5 h-px bg-[var(--border)]" />

          {/* Filtros: Deporte -> Competición -> Evento */}
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-[color:var(--muted)] mb-1">Deporte</div>
              <select
                value={selectedSportId}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedSportId(v);
                  setSelectedCompetitionId('');
                  setSelectedSeasonFilterId('');
                }}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[color:var(--muted)]"
              >
                <option value="">Seleccionar</option>
                {sportOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-sm text-[color:var(--muted)] mb-1">Competición</div>
              <select
                value={selectedCompetitionId}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedCompetitionId(v);
                  setSelectedSeasonFilterId('');
                }}
                disabled={!selectedSportId}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] disabled:opacity-50"
              >
                <option value="">Seleccionar</option>
                {competitionOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-sm text-[color:var(--muted)] mb-1">Evento</div>
              <select
                value={selectedSeasonFilterId}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedSeasonFilterId(v);
                  const txt = e.target.selectedOptions?.[0]?.textContent?.trim();
                  if (txt) setActiveSeasonNameLabel(txt.replace(/\s*\(.*\)\s*$/, ''));
                }}
                disabled={!selectedCompetitionId}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] disabled:opacity-50"
              >
                <option value="">Seleccionar</option>
                {seasonOptions.map((se: any) => (
                  <option key={se.id} value={se.id}>
                    {se.name} ({se.slug})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!filtersReady && (
            <div className="mt-3 text-sm text-[color:var(--muted)]">
              Selecciona <b>Deporte</b>, <b>Competición</b> y <b>Evento</b> para habilitar la selección de liga.
            </div>
          )}

          <div className="my-5 h-px bg-[var(--border)]" />

          {/* Selección/creación de liga + reglas */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-[color:var(--muted)] mb-1">Liga</div>
              <select
                value={selectedLeagueId}
                onChange={(e) => {
                  const v = e.target.value;

                  setSelectedLeagueId(v);
                  setInfo(null);
                  setError(null);

                  if (v === NEW_LEAGUE) {
                    setNewRuleMode('PREDEFINED');
                    setNewLeagueName('');
                    setCustomRuleName('');
                    setCustomPoints(makePointsRecord(concepts));
                    setSelectedRuleId('');
                    setSelectedRule(null);
                  } else if (v === '') {
                    setSelectedRuleId('');
                    setSelectedRule(null);
                  } else {
                    const found: any = leagues.find((x: any) => x.id === v);
                    setSelectedRuleId(found?.scoringRuleId || '');
                  }
                }}
                disabled={!filtersReady}

                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] disabled:opacity-50"

              >
                <option value="">Seleccionar</option>
                <option value={NEW_LEAGUE}>(CREAR NUEVA LIGA)</option>
                {leaguesByEvent.map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.name} [{joinPolicyLabel((l as any).joinPolicy)}] {l.myRole ? `(${l.myRole})` : ''}
                  </option>
                ))}
              </select>

              {selectedLeagueId === NEW_LEAGUE && (
                <div className="mt-3">
                  <div className="text-sm text-[color:var(--muted)] mb-1">Nombre de la nueva liga</div>
                  <input
                    value={newLeagueName}
                    onChange={(e) => setNewLeagueName(e.target.value)}
                    placeholder="Ej: Liga de la Oficina"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[color:var(--muted)]"
                  />
                  <div className="mt-3">
                    <div className="text-sm text-[color:var(--muted)] mb-1">Tipo de liga</div>
                    <select
                      value={newJoinPolicy}
                      onChange={(e) => setNewJoinPolicy(e.target.value as any)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[color:var(--muted)]"
                    >
                      <option value="PRIVATE">Privada (solo con código)</option>
                      <option value="PUBLIC">Pública (cualquiera puede unirse)</option>
                      <option value="APPROVAL">Con aprobación (solicitud)</option>
                    </select>

                    <div className="mt-2 text-xs text-zinc-500">
                      Privada: requiere código · Pública: aparece en listado · Con aprobación: aparece y solicita al admin.
                    </div>
                  </div>
                </div>
              )}

              {selectedLeagueId === '' && (
                <div className="mt-3 text-sm text-[color:var(--muted)]">
                  Selecciona una liga para ver su regla, o elige <b>(CREAR NUEVA LIGA)</b>.
                </div>
              )}
            </div>

            <div>
              <div className="text-sm text-[color:var(--muted)] mb-1">Regla</div>

              {selectedLeagueId === NEW_LEAGUE && (
                <div className="mb-3 flex gap-2">
                  <Button
                    size="sm"
                    variant={newRuleMode === 'PREDEFINED' ? 'primary' : 'outline'}
                    onClick={() => setNewRuleMode('PREDEFINED')}
                  >
                    Predefinida
                  </Button>

                  <Button
                    size="sm"
                    variant={newRuleMode === 'CUSTOM' ? 'primary' : 'outline'}
                    onClick={() => setNewRuleMode('CUSTOM')}
                  >
                    Personalizada
                  </Button>
                </div>
              )}

              {(selectedLeagueId !== NEW_LEAGUE || newRuleMode === 'PREDEFINED') && (
                <select
                  value={selectedRuleId}
                  onChange={(e) => setSelectedRuleId(e.target.value)}
                  disabled={!filtersReady || !selectedLeagueId || selectedLeagueId === ''}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] disabled:opacity-50"
                >
                  <option value="">— Selecciona una regla —</option>
                  {ruleOptionsForSelect.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}

              {selectedLeagueId === NEW_LEAGUE && newRuleMode === 'CUSTOM' && (
                <Card className="p-3">
                  <div className="text-xs text-[color:var(--muted)] mb-2">
                    Regla personalizada por liga. Los conceptos y validaciones dependen del evento seleccionado.
                  </div>

                  <div className="text-sm text-[color:var(--muted)] mb-1">Nombre de la regla personalizada</div>
                  <input
                    value={customRuleName}
                    onChange={(e) => setCustomRuleName(e.target.value)}
                    placeholder="Ej: Mi regla pro"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[color:var(--muted)]"
                  />

                  <div className="mt-3 text-sm text-[color:var(--muted)] mb-2">Puntos por concepto</div>
                  <div className="space-y-2">
                    {concepts.map((c) => (
                      <div key={c.code} className="flex items-center justify-between gap-3">
                        <div className="text-sm text-[var(--foreground)]">{c.label}</div>
                        <input
                          value={customPoints[c.code] ?? '0'}
                          onChange={(e) => setCustomPoints((prev) => ({ ...prev, [c.code]: e.target.value }))}
                          className="w-24 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-right text-[var(--foreground)]"
                          inputMode="numeric"
                        />
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>

          {(selectedLeagueId && selectedLeagueId !== '' && (selectedLeagueId !== NEW_LEAGUE || newRuleMode === 'PREDEFINED')) && (
            <Card className="mt-5 p-3">
              <div className="text-sm font-semibold">Desglose</div>
              <div className="text-xs text-[color:var(--muted)] mt-1">
                {loadingRuleDetails ? 'Cargando detalle…' : selectedRule ? selectedRule.name : '—'}
              </div>

              <div className="mt-3 space-y-2">
                {concepts.map((c) => {
                  const pts = selectedRule?.details?.find((d: ApiScoringRuleDetail) => d.code === c.code)?.points ?? 0;
                  return (
                    <div key={c.code} className="flex items-center justify-between">
                      <div className="text-sm text-[var(--foreground)]">{c.label}</div>
                      {isEditingLeagueCustomRule ? (
                        <input
                          value={editPoints[c.code] ?? '0'}
                          onChange={(e) => setEditPoints((prev) => ({ ...prev, [c.code]: e.target.value }))}
                          className="w-24 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-right text-[var(--foreground)]"
                          inputMode="numeric"
                        />
                      ) : (
                        <div className="text-sm font-semibold">{pts}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <div className="mt-5 flex flex-wrap gap-2 items-center">
            {(() => {
              const saveDisabled =
                savingLeagueRule ||
                !filtersReady ||
                !eventSelected ||
                !selectedLeagueId ||
                selectedLeagueId === '' ||
                (selectedLeagueId !== NEW_LEAGUE && !canSaveLeagueRule) ||
                (selectedLeagueId === NEW_LEAGUE && !newLeagueName.trim()) ||
                (selectedLeagueId !== '' && selectedLeagueId !== NEW_LEAGUE && !selectedRuleId) ||
                (selectedLeagueId === NEW_LEAGUE && newRuleMode === 'PREDEFINED' && !selectedRuleId) ||
                (selectedLeagueId === NEW_LEAGUE && newRuleMode === 'CUSTOM' && !customRuleName.trim());

              return (
                <>
                  <Button
                    onClick={onSaveLeagueRule}
                    disabled={saveDisabled}
                  >
                    {savingLeagueRule ? 'Guardando…' : 'Guardar Liga/Regla'}
                  </Button>

                  {selectedLeagueId === NEW_LEAGUE && newRuleMode === 'CUSTOM' && (
                    <div className="text-sm text-amber-200">

                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </Card>

        {/* Mis ligas */}
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] font-medium flex items-center justify-between">
            <div>Mis ligas</div>
            <div className="text-sm text-[color:var(--muted)]">{leaguesByEvent.length} liga(s)</div>
          </div>

          {loadingLeagues ? (
            <div className="p-4 text-zinc-300">Cargando…</div>
          ) : leaguesByEvent.length === 0 ? (
            <div className="p-4 text-zinc-400">
              No tienes ligas para este evento. Cambia el filtro de <b>Evento</b> o crea/únete a una liga.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {leaguesByEvent.map((l: any) => (
                <div key={l.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      <span>{l.name}</span>
                      <Badge>
                        {joinPolicyLabel((l as any).joinPolicy)}
                      </Badge>
                    </div>
                    <div className="text-sm text-[color:var(--muted)]">
                      Código: <span className="text-zinc-200">{l.joinCode}</span>
                      {' · '}
                      Regla: <span className="text-zinc-200">{l.scoringRuleId ?? '—'}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {(l.myRole === 'OWNER' || l.myRole === 'ADMIN') && (
                      <Button
                        variant="secondary"
                        onClick={() => router.push(`/${locale}/leagues/${l.id}/settings`)}
                      >
                        Configurar
                      </Button>
                    )}

                    <Button onClick={() => selectLeagueAndGoMatches(l)}>
                      Entrar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <AiChatWidget locale={locale} token={token} context={aiContext} />
    </div>
  );
}