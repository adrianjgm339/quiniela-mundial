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

  // errores típicos del backend
  if (s.includes('Insufficient league role')) return 'No tienes permisos en esta liga para guardar la regla.';
  if (s.includes('Admin only')) return 'Solo un ADMIN del sistema puede realizar esta acción.';
  if (s.includes('Failed')) return 'Ocurrió un error. Intenta nuevamente.';
  return s || 'Ocurrió un error.';
}

function parseAndValidateCustomPoints(customPoints: Record<string, string>, concepts: Array<{ code: string; label: string }>) {
  const details: Array<{ code: string; points: number }> = [];

  let hasPositive = false;

  for (const c of concepts) {
    const raw = (customPoints[c.code] ?? '').toString().trim();
    const n = Number(raw);

    if (raw === '' || !Number.isFinite(n)) {
      throw new Error(`Puntos inválidos para "${c.label}".`);
    }
    if (!Number.isInteger(n)) {
      throw new Error(`No se permiten decimales en "${c.label}".`);
    }
    if (n < 0) {
      throw new Error(`No se permiten puntos negativos en "${c.label}".`);
    }
    if (n > 0) hasPositive = true;

    details.push({ code: c.code, points: n });
  }

  if (!hasPositive) {
    throw new Error('Debes asignar puntos (>0) a al menos 1 concepto.');
  }

  return details;
}

function makePointsRecord(concepts: Array<{ code: string }>) {
  const rec: Record<string, string> = {};
  for (const c of concepts) rec[c.code] = '0';
  return rec;
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
  const isPredefinedRuleId = (id?: string | null) => !!id && /^(B|R)\d+/.test(id);
  // OJO: si tú no estás usando ids tipo R01..R05, ajusta el regex.
  const isPredefinedRule = (r: any) => !!r && (r.isGlobal === true || isPredefinedRuleId(r.id));

  const [loadingRules, setLoadingRules] = useState(false);

  const [selectedLeagueId, setSelectedLeagueId] = useState<string>(''); // '' = "Seleccionar"
  const [selectedRuleId, setSelectedRuleId] = useState<string>(''); // '' = sin regla seleccionada
  const [selectedRule, setSelectedRule] = useState<ApiScoringRule | null>(null);
  const [loadingRuleDetails, setLoadingRuleDetails] = useState(false);

  // Modo crear liga (solo aplica cuando selectedLeagueId === NEW_LEAGUE)
  const [newLeagueName, setNewLeagueName] = useState('');
  const [newJoinPolicy, setNewJoinPolicy] = useState<'PUBLIC' | 'PRIVATE' | 'APPROVAL'>('PRIVATE');
  const [newRuleMode, setNewRuleMode] = useState<'PREDEFINED' | 'CUSTOM'>('PREDEFINED');
  const [customRuleName, setCustomRuleName] = useState('');
  const [customPoints, setCustomPoints] = useState<Record<string, string>>(makePointsRecord(DEFAULT_CONCEPTS));

  // Edición de regla personalizada existente (cuando la liga ya existe)
  const [editPoints, setEditPoints] = useState<Record<string, string>>(makePointsRecord(DEFAULT_CONCEPTS));

  const [joining, setJoining] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  const [savingLeagueRule, setSavingLeagueRule] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // 1) token + /auth/me (incluye activeSeason)
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
        setActiveSeasonNameLabel(m?.activeSeason?.name ?? '—');
        const seasonId = m?.activeSeason?.id ?? m?.activeSeasonId ?? null;
        if (seasonId) {
          setActiveSeasonId(seasonId);
          localStorage.setItem('activeSeasonId', seasonId);

        }

      } catch {
        // si falla /auth/me, dejamos que la pantalla muestre el error luego
      }
    })();
  }, [locale, router]);

  // Catálogo (mismos datos que usa /catalog)
  useEffect(() => {
    (async () => {
      try {
        setLoadingCatalog(true);
        const cat = await getCatalog(locale);
        setCatalog(cat);
      } catch (e: any) {
        setError((prev) => prev ?? `No se pudo cargar el catálogo: ${friendlyErrorMessage(e)}`);
      } finally {
        setLoadingCatalog(false);
      }
    })();
  }, [locale]);

  // 2) cargar ligas
  async function refreshLeagues(tkn: string) {
    const data = await getMyLeagues(tkn);
    setLeagues(data);

    // No auto-seleccionamos nada: dejamos "Seleccionar" por defecto
    if (selectedLeagueId === NEW_LEAGUE) return data;

    // si la liga seleccionada ya no existe, limpiar selección
    if (selectedLeagueId && !data.some((x) => x.id === selectedLeagueId)) {
      setSelectedLeagueId('');
      setSelectedRuleId('');
      setSelectedRule(null);
    }

    return data;
  }

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        setLoadingLeagues(true);
        setError(null);
        await refreshLeagues(token);
      } catch (e: any) {
        setError(friendlyErrorMessage(e));
      } finally {
        setLoadingLeagues(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // 3) cargar reglas (para cualquier usuario debería ser lectura; si hoy está ADMIN-only, mostramos error amigable)
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        setLoadingRules(true);
        const data = await listScoringRules(token, selectedSeasonFilterId || undefined);
        setRules(data);
      } catch (e: any) {
        const msg = friendlyErrorMessage(e);
        setError((prev) => prev ?? `No se pudieron cargar las reglas: ${msg}`);
      } finally {
        setLoadingRules(false);
      }
    })();
  }, [token, selectedSeasonFilterId]);

  // 4) al cambiar liga seleccionada, ajustar selectedRuleId desde la liga (si existe)
  useEffect(() => {
    const league = leagues.find((l) => l.id === selectedLeagueId) as any;
    if (!league) return;
    const sr = league.scoringRuleId as string | undefined;
    if (sr) setSelectedRuleId(sr);
  }, [selectedLeagueId, leagues]);

  // 5) cargar detalle de la regla seleccionada
  useEffect(() => {
    if (!token) return;
    if (!selectedRuleId) return;

    (async () => {
      try {
        setLoadingRuleDetails(true);
        setSelectedRule(null);
        const data = await getScoringRule(token, selectedRuleId);
        setSelectedRule(data);
      } catch (e: any) {
        setError(friendlyErrorMessage(e));
      } finally {
        setLoadingRuleDetails(false);
      }
    })();
  }, [token, selectedRuleId]);

  const selectedLeague = useMemo(
    () => leagues.find((l) => l.id === selectedLeagueId) as any,
    [leagues, selectedLeagueId],
  );

  const myUserId = meInfo?.user?.id ?? meInfo?.id ?? null;
  const myLeagueRole = useMemo(() => {
    if (!selectedLeague) return null;

    // ✅ PRIORIDAD: rol real enviado por el backend para ESTA liga
    const role = selectedLeague?.myRole ?? selectedLeague?.role;
    if (role) return role;

    // Fallback (solo si el backend NO mandó myRole):
    if (myUserId && selectedLeague.createdById === myUserId) return 'OWNER';

    return 'MEMBER';
  }, [selectedLeague, myUserId]);

  // Valores reales (tomados de /auth/me, mismos que ves en "Selecciona tu evento")
  const sportOptions = useMemo(() => catalog ?? [], [catalog]);

  const competitionOptions = useMemo(() => {
    const s = sportOptions.find((x) => x.id === selectedSportId);
    return s?.competitions ?? [];
  }, [sportOptions, selectedSportId]);

  const seasonOptions = useMemo(() => {
    const c = competitionOptions.find((x) => x.id === selectedCompetitionId);
    return c?.seasons ?? [];
  }, [competitionOptions, selectedCompetitionId]);

  const filtersReady = !!selectedSportId && !!selectedCompetitionId && !!selectedSeasonFilterId;
  const eventSelected = !!selectedSeasonFilterId;

  // Mostrar solo ligas del evento seleccionado (si ya tienes seasonId en la liga)
  const leaguesByEvent = useMemo(() => {
    if (!selectedSeasonFilterId) return [];
    return leagues.filter((l: any) => l?.seasonId === selectedSeasonFilterId);
  }, [leagues, selectedSeasonFilterId]);


  // Al escoger evento aquí, lo dejamos como activeSeasonId para el createLeague
  useEffect(() => {
    if (!selectedSeasonFilterId) {
      setActiveSeasonId(null);
      setActiveSeasonNameLabel('Seleccionar');
      localStorage.removeItem('activeSeasonId');

      // Reset de selección
      setSelectedLeagueId('');
      setSelectedRuleId('');
      setSelectedRule(null);

      return;
    }

    setActiveSeasonId(selectedSeasonFilterId);
    localStorage.setItem('activeSeasonId', selectedSeasonFilterId);
    // Al cambiar evento, reseteamos selección de liga/regla
    setSelectedLeagueId('');
    setSelectedRuleId('');
    setSelectedRule(null);

    (async () => {
      if (!token) return;

      try {
        // 0) Cargar conceptos por evento (Season) para UI de reglas personalizadas
        const conceptRows = await getSeasonConcepts(token, selectedSeasonFilterId);
        const nextConcepts =
          (conceptRows ?? [])
            .filter((x) => x?.code)
            .map((x) => ({ code: x.code, label: (x.label ?? x.code) as string }));

        const finalConcepts = nextConcepts.length ? nextConcepts : DEFAULT_CONCEPTS;
        setConcepts(finalConcepts);

        // reset inputs de puntos según conceptos del evento
        const base = makePointsRecord(finalConcepts);
        setCustomPoints(base);
        setEditPoints(base);

        // 1) Persistimos en backend el evento activo

        // Si ya estamos en ese evento según /auth/me, no hace falta persistir otra vez
        const current = meInfo?.activeSeason?.id ?? meInfo?.activeSeasonId ?? null;
        if (current && current === selectedSeasonFilterId) return;
        await setActiveSeason(token, selectedSeasonFilterId);

        // 2) Refrescamos /auth/me para que TODO quede consistente
        const m = await me(token, locale);
        setMeInfo(m);
        setActiveSeasonNameLabel(m?.activeSeason?.name ?? '—');

        // 3) (Opcional pero recomendado) refrescar ligas
        await refreshLeagues(token);
      } catch (e: any) {
        setError(friendlyErrorMessage(e));
      }
    })();

  }, [selectedSeasonFilterId, token, locale]);

  // ------------------------------------------------------------
  // Reglas visibles en el combo:
  // - Crear nueva liga: solo predeterminadas
  // - Liga existente: predeterminadas + (si la liga usa custom) SOLO esa custom
  // ------------------------------------------------------------
  const isCustomRuleId = (id?: string | null) => !!id && id.startsWith('C');

  const predefinedRuleOptions = useMemo(() => {
    // Heurística: las custom creadas en backend usan ids tipo "C...."
    // Todo lo demás lo tratamos como "predeterminada" para el dropdown.
    return rules.filter((r: any) => !isCustomRuleId(r?.id));
  }, [rules]);

  const ruleOptionsForSelect = useMemo(() => {
    // 1) Crear nueva liga => solo predeterminadas
    if (selectedLeagueId === NEW_LEAGUE) return predefinedRuleOptions;

    // 2) Liga existente => predeterminadas + (si aplica) la custom de ESA liga
    const leagueRuleId: string | null | undefined = selectedLeague?.scoringRuleId;

    if (isCustomRuleId(leagueRuleId)) {
      const custom = rules.find((r: any) => r?.id === leagueRuleId);
      if (custom) {
        const merged = [...predefinedRuleOptions, custom];
        // por si acaso, evitamos duplicados por id
        const seen = new Set<string>();
        return merged.filter((r: any) => {
          if (!r?.id) return false;
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });
      }
    }

    return predefinedRuleOptions;
  }, [rules, predefinedRuleOptions, selectedLeagueId, selectedLeague?.scoringRuleId]);

  const canSaveLeagueRule = myLeagueRole === 'OWNER' || myLeagueRole === 'ADMIN';

  const leagueRuleId: string | null | undefined = selectedLeague?.scoringRuleId;
  const isLeagueCustomRule = isCustomRuleId(leagueRuleId);
  const isEditingLeagueCustomRule =
    selectedLeagueId !== '' &&
    selectedLeagueId !== NEW_LEAGUE &&
    canSaveLeagueRule &&
    isLeagueCustomRule &&
    selectedRuleId === leagueRuleId;

  // Cuando la regla seleccionada es la custom de la liga, copiamos sus puntos a inputs editables
  useEffect(() => {
    if (!selectedRule) return;
    if (!isEditingLeagueCustomRule) return;

    const next: Record<string, string> = { ...editPoints };
    for (const c of concepts) {
      const pts = selectedRule.details?.find((d: any) => d.code === c.code)?.points ?? 0;
      next[c.code] = String(pts);
    }
    setEditPoints(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRuleId, selectedRule, isEditingLeagueCustomRule]);

  const pointsByCode = useMemo(() => {
    const map = new Map<string, number>();
    const details: ApiScoringRuleDetail[] = selectedRule?.details ?? [];
    for (const d of details) map.set(d.code, d.points);
    return map;
  }, [selectedRule]);

  // Helper: inferir sportId/competitionId buscando el seasonId dentro del catálogo
  function inferSportCompetitionFromSeason(seasonId: string): { sportId: string; competitionId: string } {
    for (const s of catalog) {
      for (const c of s.competitions ?? []) {
        const found = (c.seasons ?? []).some((se: any) => se.id === seasonId);
        if (found) return { sportId: s.id, competitionId: c.id };
      }
    }
    return { sportId: '', competitionId: '' };
  }

  function selectLeagueAndGoMatches(l: ApiLeague) {
    // (A) Guardar "activos" tradicionales
    localStorage.setItem('activeLeagueId', l.id);
    localStorage.setItem('activeLeagueName', l.name);

    // (B) Guardar contexto para que /matches precargue selects
    localStorage.setItem('matches_ctx_fromLeagues', '1');

    // seasonId: prioridad al filtro UI, si no existe, usar el seasonId de la liga
    const seasonIdFromUi = selectedSeasonFilterId || (l as any)?.seasonId || '';

    // sport/competition: prioridad a filtros UI, si faltan, inferir desde catálogo con el seasonId
    let sportIdToSend = selectedSportId || '';
    let compIdToSend = selectedCompetitionId || '';

    if ((!sportIdToSend || !compIdToSend) && seasonIdFromUi) {
      const inferred = inferSportCompetitionFromSeason(seasonIdFromUi);
      sportIdToSend = sportIdToSend || inferred.sportId;
      compIdToSend = compIdToSend || inferred.competitionId;
    }

    localStorage.setItem('matches_ctx_sportId', sportIdToSend);
    localStorage.setItem('matches_ctx_competitionId', compIdToSend);
    localStorage.setItem('matches_ctx_seasonId', seasonIdFromUi);
    localStorage.setItem('matches_ctx_leagueId', l.id);

    // (C) Ir a partidos
    router.push(`/${locale}/matches`);
  }

  async function onJoin() {
    if (!token) return;
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setError('Escribe un código para unirte.');
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

        // Buscar la liga recién unida para obtener su seasonId
        const joinedLeague = data?.find((l) => l.id === res.leagueId);

        // Si existe seasonId, auto-setear filtros (Sport -> Competition -> Season)
        if (joinedLeague?.seasonId) {
          const seasonId = joinedLeague.seasonId;

          let foundSportId = '';
          let foundCompetitionId = '';

          // catalog es CatalogSport[] (array), NO catalog.sports
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

          // Set filtros UI (esto hará que la pantalla quede coherente con el código)
          setSelectedSportId(foundSportId);
          setSelectedCompetitionId(foundCompetitionId);
          setSelectedSeasonFilterId(seasonId);

          // Persistir evento activo en backend + localStorage (usa tu flujo actual)
          setActiveSeasonId(seasonId);
          localStorage.setItem('activeSeasonId', seasonId);

          // Actualiza backend (/auth/active-season) y refresca /me (con locale)
          await setActiveSeason(token, seasonId);
          const m = await me(token, locale);
          setMeInfo(m);
          setActiveSeasonNameLabel(m?.activeSeason?.name ?? 'Seleccionar');
        }
      }
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
      // 1) Validar selección
      if (!selectedLeagueId) {
        setError('Selecciona una liga o elige (CREAR NUEVA LIGA).');
        return;
      }

      // 2) Crear nueva liga SOLO al guardar
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

          // Validaciones de puntos (UI)
          let details: Array<{ code: string; points: number }>;
          try {
            details = parseAndValidateCustomPoints(customPoints, concepts);
          } catch (err: any) {
            setError(String(err?.message || err));
            return;
          }

          // 1) Crear regla personalizada en backend
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

      // 3) Liga existente: asignar regla (requiere selectedRuleId)
      if (!selectedRuleId) {
        setError('Selecciona una regla para guardar.');
        return;
      }

      // Permisos: solo OWNER/ADMIN de la liga puede cambiar la regla
      if (!canSaveLeagueRule) {
        setError('Solo el ADMIN/OWNER de esta liga puede cambiar la regla.');
        return;
      }

      // ✅ Si la liga tiene una regla personalizada (custom) y estás editándola,
      // guardamos los puntos en la regla (sin cambiar scoringRuleId)
      if (isEditingLeagueCustomRule && isCustomRuleId(selectedRuleId)) {
        let details: Array<{ code: string; points: number }>;
        try {
          details = parseAndValidateCustomPoints(editPoints, concepts);
        } catch (err: any) {
          setError(String(err?.message || err));
          return;
        }

        const resCustom = await fetch(`${API_BASE}/leagues/${encodeURIComponent(selectedLeagueId)}/custom-rule`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            // name: selectedRule?.name, // opcional si luego quieres permitir editar nombre
            details,
          }),
        });

        if (!resCustom.ok) {
          const text = await resCustom.text().catch(() => '');
          throw new Error(text || 'No se pudo guardar la regla personalizada.');
        }

        // refrescar detalle visible
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
            {/* Deporte */}
            <div>
              <div className="text-sm text-[color:var(--muted)] mb-1">Deporte</div>
              <select
                value={selectedSportId}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedSportId(v);
                  // reset cascada
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

            {/* Competición */}
            <div>
              <div className="text-sm text-[color:var(--muted)] mb-1">Competición</div>
              <select
                value={selectedCompetitionId}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedCompetitionId(v);
                  // reset cascada
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

            {/* Evento */}
            <div>
              <div className="text-sm text-[color:var(--muted)] mb-1">Evento</div>
              <select
                value={selectedSeasonFilterId}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedSeasonFilterId(v);

                  // UI inmediata: el texto visible del option seleccionado
                  const txt = e.target.selectedOptions?.[0]?.textContent?.trim();
                  if (txt) setActiveSeasonNameLabel(txt.replace(/\s*\(.*\)\s*$/, '')); // quita "(slug)" si viene
                }}
                disabled={!selectedCompetitionId}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] disabled:opacity-50"
              >
                <option value="">Seleccionar</option>
                {seasonOptions.map((se) => (

                  <option key={se.id} value={se.id}>
                    {se.name} ({se.slug})
                  </option>
                ))}

              </select>
            </div>
          </div>

          {/* Hint */}
          {!filtersReady && (
            <div className="mt-3 text-sm text-[color:var(--muted)]">
              Selecciona <b>Deporte</b>, <b>Competición</b> y <b>Evento</b> para habilitar la selección de liga.
            </div>
          )}

          <div className="my-5 h-px bg-[var(--border)]" />

          {/* Selección/creación de liga + reglas */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Liga */}
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
                    const found = leagues.find((x: any) => x.id === v) as any;
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

            {/* Regla */}
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

              {/* Predefinida (nuevo o existente) */}
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

              {/* Personalizada (solo UI por ahora) */}
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

          {/* Detalle de regla (si hay seleccionada predefinida) */}
          {(selectedLeagueId && selectedLeagueId !== '' && (selectedLeagueId !== NEW_LEAGUE || newRuleMode === 'PREDEFINED')) && (
            <Card className="mt-5 p-3">
              <div className="text-sm font-semibold">Desglose</div>
              <div className="text-xs text-[color:var(--muted)] mt-1">
                {loadingRuleDetails ? 'Cargando detalle…' : selectedRule ? selectedRule.name : '—'}
              </div>

              <div className="mt-3 space-y-2">
                {concepts.map((c) => {
                  const pts =
                    selectedRule?.details?.find((d: ApiScoringRuleDetail) => d.code === c.code)?.points ?? 0;
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

          {/* Guardar */}
          <div className="mt-5 flex flex-wrap gap-2 items-center">
            {(() => {
              const saveDisabled =
                savingLeagueRule ||
                !filtersReady ||
                !eventSelected ||
                !selectedLeagueId ||
                selectedLeagueId === '' ||

                // ✅ liga existente: si NO eres OWNER/ADMIN de la liga, deshabilitar
                (selectedLeagueId !== NEW_LEAGUE && !canSaveLeagueRule) ||

                // crear nueva liga: requiere nombre
                (selectedLeagueId === NEW_LEAGUE && !newLeagueName.trim()) ||

                // liga existente requiere regla
                (selectedLeagueId !== '' && selectedLeagueId !== NEW_LEAGUE && !selectedRuleId) ||

                // crear nueva con predefinida requiere regla
                (selectedLeagueId === NEW_LEAGUE && newRuleMode === 'PREDEFINED' && !selectedRuleId) ||

                // crear nueva con personalizada requiere nombre de regla
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
            <div className="p-4 text-zinc-400">No tienes ligas para este evento. Cambia el filtro de <b>Evento</b> o crea/únete a una liga.</div>
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
    </div>
  );
}