'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { useSearchParams } from "next/navigation";

export default function MatchesPage() {
  const router = useRouter();
  const appliedLeaguesContextRef = useRef(false);
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
    if (savedGroup) params.set("group", savedGroup);

    const qs = params.toString();
    router.replace(`/${locale}/matches${qs ? `?${qs}` : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);


  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000); // refresca cada 30s
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

  // Opción 2: filtros Sport → Competition → Season (Evento) igual que /leagues
  const [catalog, setCatalog] = useState<CatalogSport[]>([]);
  const [sportId, setSportId] = useState<string>("");
  const [competitionId, setCompetitionId] = useState<string>("");
  const [seasonId, setSeasonId] = useState<string>("");

  // Liga "efectiva": solo cuenta si existe y pertenece al evento actual
  const effectiveLeagueId = useMemo(() => {
    // 🔒 Candado: si el usuario no ha confirmado liga, no hay liga efectiva.
    if (!leagueConfirmed) return null;

    if (!leagueId) return null;
    if (!seasonId) return null;

    const l = leagues.find((x) => x.id === leagueId);
    if (!l) return null;
    return l.seasonId === seasonId ? leagueId : null;
  }, [leagueConfirmed, leagueId, seasonId, leagues]);

  useEffect(() => {
    // Si NO hay liga efectiva (no existe o no pertenece al evento actual),
    // entonces NO debe quedar ningún pick “visible” en pantalla.
    if (!effectiveLeagueId) {
      setPicksByMatchId({});
      setPicksLeagueId(null);
      setLoadingPicks(false);
    }

  }, [effectiveLeagueId]);

  const visibleLeagues = useMemo(() => {
    if (!seasonId) return [];
    return leagues.filter((l) => l.seasonId === seasonId);
  }, [leagues, seasonId]);


  const competitionOptions = useMemo(() => {
    const s = catalog.find((x) => x.id === sportId);
    return s?.competitions ?? [];
  }, [catalog, sportId]);

  const seasonOptions = useMemo(() => {
    const c = competitionOptions.find((x) => x.id === competitionId);
    return c?.seasons ?? [];
  }, [competitionOptions, competitionId]);

  // modal state
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ApiMatch | null>(null);
  const [homePred, setHomePred] = useState<string>('');
  const [koWinnerTeamId, setKoWinnerTeamId] = useState<string>(""); // '' | teamId
  const [awayPred, setAwayPred] = useState<string>('');
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

        // 1) Catálogo (Sport → Competition → Season)
        const cat = await getCatalog(locale);
        setCatalog(cat);

        // 2) Mis ligas
        const myLeagues = await getMyLeagues(t);
        setLeagues(myLeagues);

        // 3) Handoff /leagues -> /matches (si existe)
        const fromLeagues = localStorage.getItem("matches_ctx_fromLeagues") === "1";

        if (fromLeagues && !appliedLeaguesContextRef.current) {
          const sId = localStorage.getItem("matches_ctx_sportId") || "";
          const cId = localStorage.getItem("matches_ctx_competitionId") || "";
          const season = localStorage.getItem("matches_ctx_seasonId") || "";
          const lId = localStorage.getItem("matches_ctx_leagueId") || "";

          setSportId(sId);
          setCompetitionId(cId);
          setSeasonId(season);

          // Validar liga contra mis ligas y el evento
          const leagueOk = myLeagues.some((l) => l.id === lId && l.seasonId === season);

          if (leagueOk) {
            setLeagueId(lId);
            setLeagueConfirmed(true);
            localStorage.setItem("activeLeagueId", lId);
          } else {
            setLeagueId(null);
            setLeagueConfirmed(false);
            localStorage.removeItem("activeLeagueId");
          }

          // Persistir season activo para consistencia
          if (season) localStorage.setItem("activeSeasonId", season);

          // Limpiar flag para que NO sea limitativo
          localStorage.removeItem("matches_ctx_fromLeagues");

          appliedLeaguesContextRef.current = true;
        } else if (!appliedLeaguesContextRef.current) {
          // ENTRADA LIMPIA (si NO vengo de /leagues)
          setSportId("");
          setCompetitionId("");
          setSeasonId("");

          localStorage.removeItem("activeSeasonId");
          localStorage.removeItem("activeLeagueId");

          setLeagueId(null);
          setLeagueConfirmed(false);
        }

        // 6) IMPORTANTÍSIMO: en el load inicial NO pedimos partidos.
        //    Los partidos se cargan únicamente cuando hay seasonId (ver useEffect([seasonId])).
        setAllItems([]);
        setItems([]);
        setPicksByMatchId({});
        setLoadingPicks(false);

      } catch (e: any) {
        setError(e?.message ?? 'Error cargando partidos');
      } finally {
        setLoading(false);
      }
    })();
  }, [locale, router]);

  useEffect(() => {
    if (!token) return;

    if (!seasonId) {
      // Estamos en transición (ej: cambiando deporte/competición).
      // No recargues ni resetees nada que pueda sobrescribir sportId.
      return;
    }

    (async () => {

      try {
        setLoading(true);
        setError(null);

        // Al cambiar evento, limpiamos phase/group (evita “filtros raros”)
        localStorage.setItem("matchesPhase", "");
        localStorage.setItem("matchesGroup", "");

        // reset URL sin query
        router.replace(`/${locale}/matches`);

        // Season activo en backend
        if (seasonId) {
          await setActiveSeason(token, seasonId);
        }

        // Elegir liga válida dentro del season
        const leaguesInSeason = seasonId ? leagues.filter((l) => l.seasonId === seasonId) : [];

        // Si venimos de /leagues con una liga ya confirmada y válida, NO la pisamos
        const keepRestoredLeague =
          appliedLeaguesContextRef.current &&
          leagueConfirmed &&
          leagueId &&
          leaguesInSeason.some((l) => l.id === leagueId);

        let nextLeagueId: string | null = null;

        if (keepRestoredLeague) {
          nextLeagueId = leagueId;
        } else {
          // UX: si hay más de 1 liga, obligar a escoger SIEMPRE
          if (leaguesInSeason.length === 1) {
            nextLeagueId = leaguesInSeason[0].id;
          } else {
            nextLeagueId = null;
            localStorage.removeItem("activeLeagueId");
          }

          setLeagueId(nextLeagueId);
          setLeagueConfirmed(!!nextLeagueId);
        }

        if (nextLeagueId) {
          localStorage.setItem("activeLeagueId", nextLeagueId);
        } else if (!keepRestoredLeague) {
          localStorage.removeItem("activeLeagueId");
        }

        // Limpiar picks visibles mientras cambia liga/evento
        setPicksByMatchId({});
        setPicksLeagueId(null);

        // Partidos del season
        const all = await getMatches(token, locale, { seasonId: seasonId || undefined });
        setAllItems(all);

        const data = await getMatches(token, locale, {
          seasonId: seasonId || undefined,
          phaseCode: undefined,
          groupCode: undefined,
        });
        setItems(data);

      } catch (e: any) {
        setError(e?.message ?? "Error cargando partidos");
      } finally {
        setLoading(false);
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  useEffect(() => {
    if (!token) return;

    // Si no hay liga efectiva, no hay picks que cargar
    if (!effectiveLeagueId) {
      setPicksByMatchId({});
      setLoadingPicks(false);
      return;
    }

    let cancelled = false;
    const requestedLeagueId = effectiveLeagueId;

    (async () => {
      try {
        setLoadingPicks(true);

        // Limpia picks visibles inmediatamente al cambiar de liga
        setPicksByMatchId({});
        setPicksLeagueId(null);

        const picks = await listPicks(token, requestedLeagueId);
        if (cancelled) return;

        // SAFETY: aunque el back devuelva picks de otras ligas,
        // aquí solo tomamos los del leagueId solicitado.
        const onlyThisLeague = (Array.isArray(picks) ? picks : []).filter(
          (p: ApiPick) => p.leagueId === requestedLeagueId
        );

        const map: Record<string, ApiPick> = {};

        for (const p of onlyThisLeague) map[p.matchId] = p;
        setPicksLeagueId(requestedLeagueId);
        setPicksByMatchId(map);

      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Error cargando picks");
      } finally {
        if (!cancelled) setLoadingPicks(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, effectiveLeagueId]);

  // Refetch de partidos cuando cambian filtros (phase/group)
  // Importante: separado del effect inicial para no sobrescribir Sport/Competition/Season.
  useEffect(() => {
    if (!token) return;
    if (!seasonId) return;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await getMatches(token, locale, {
          seasonId: seasonId || undefined,
          phaseCode: phase || undefined,
          groupCode: group || undefined,
        });

        setItems(data);
      } catch (e: any) {
        setError(e?.message ?? "Error aplicando filtros de partidos");
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
    for (const m of allItems) {
      const pc = (m as any).phaseCode as string | undefined;
      if (pc) set.add(pc);
    }
    return Array.from(set.values()).sort();
  }, [allItems]);

  // Todos los grupos del evento (season) sin importar fase:
  // esto sirve para decidir si mostramos el filtro "Grupo" en UI.
  const allGroupOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of allItems) {
      const gc = (m as any).groupCode as string | undefined;
      if (gc) set.add(gc);
    }
    return Array.from(set.values()).sort();
  }, [allItems]);

  // Grupos disponibles según la fase seleccionada (data-driven)
  const groupOptions = useMemo(() => {
    const base = phase
      ? allItems.filter((m) => ((m as any).phaseCode as string | undefined) === phase)
      : allItems;

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

    // Si el grupo guardado/URL no existe para la fase actual, lo limpiamos (evita inconsistencias)
    localStorage.setItem("matchesGroup", "");

    const params = new URLSearchParams(searchParams.toString());
    params.delete("group");

    const qs = params.toString();
    router.replace(`/${locale}/matches${qs ? `?${qs}` : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, groupOptions, locale]);

  function openPickModal(match: ApiMatch) {
    setSaveError(null);
    setSelected(match);

    const existing = picksByMatchId[match.id];
    setHomePred(existing ? String(existing.homePred) : '');
    setAwayPred(existing ? String(existing.awayPred) : '');
    setKoWinnerTeamId(existing?.koWinnerTeamId ?? "");

    setOpen(true);
  }

  async function onSave() {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push(`/${locale}/login`);
      return;
    }
    if (!effectiveLeagueId) {
      setSaveError('No hay Liga activa. Selecciona una liga primero.');
      return;
    }
    if (!selected) return;

    // Bloqueo defensivo (por si el usuario fuerza el click)
    if (isLocked(selected)) {
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

    const isKO = (selected as any).phaseCode && (selected as any).phaseCode !== "F01";
    const isTie = hp === ap;

    if (isKO && isTie && !koWinnerTeamId) {
      setSaveError("KO: Como pronosticaste empate, debes indicar quién avanza (Local o Visitante).");
      return;
    }

    // Si no es empate o no es KO, no debe quedar desempate guardado
    const finalKoWinnerTeamId = isKO && isTie ? koWinnerTeamId : null;

    if (hp === null || ap === null || !Number.isFinite(hp) || !Number.isFinite(ap)) {
      setSaveError('Debes indicar el marcador (Local y Visitante).');
      return;
    }
    if (hp < 0 || ap < 0) {
      setSaveError('El marcador no puede ser negativo.');
      return;
    }

    if (isKO && isTie && !koWinnerTeamId) {
      setSaveError("KO: Como pronosticaste empate, debes indicar quién avanza (Local o Visitante).");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const pick = await upsertPick(token, {
        leagueId: effectiveLeagueId,
        matchId: selected.id,
        homePred: hp,
        awayPred: ap,
        koWinnerTeamId: finalKoWinnerTeamId,
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
    setLeagueConfirmed(true); // ✅ el usuario la eligió manualmente
    localStorage.setItem("activeLeagueId", newLeagueId);

    // Evita mostrar picks viejos mientras recarga (UI inmediato)
    setPicksByMatchId({});
    setPicksLeagueId(null);
    setSaveError(null);

    // Importante: cambiar de liga NO debe resetear fase/grupo ni hacer router.replace.
    // Los partidos son del evento (season), lo que cambia son los picks.
  }


  const activeLeague = effectiveLeagueId
    ? leagues.find((l) => l.id === effectiveLeagueId)
    : null;

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
              {effectiveLeagueId && loadingPicks ? " · Cargando picks…" : ""}
            </div>
          </div>

          <div className="flex items-center gap-2">

            <button
              onClick={() => {
                // 1) Limpia filtros phase/group
                localStorage.setItem("matchesPhase", "");
                localStorage.setItem("matchesGroup", "");

                // 2) Limpia selección principal (entrada limpia)
                setSportId("");
                setCompetitionId("");
                setSeasonId("");
                setLeagueId(null);
                setLeagueConfirmed(false);
                setPicksLeagueId(null);

                // 3) Limpia persistencias
                localStorage.removeItem("activeSeasonId");
                localStorage.removeItem("activeLeagueId");

                // 4) Limpia data visible
                setPicksByMatchId({});
                setItems([]);
                setAllItems([]);
                setError(null);

                // 5) Limpia URL
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

        {/* Opción 2 — Cascada Sport → Competition → Event → League */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="grid grid-cols-1 gap-3">
            {/* Deporte */}
            <label className="text-sm text-zinc-300">
              Deporte
              <select
                className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
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
            <label className="text-sm text-zinc-300">
              Competición
              <select
                className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm disabled:opacity-50"
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
            <label className="text-sm text-zinc-300">
              Evento
              <select
                className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm disabled:opacity-50"
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
                  localStorage.removeItem("activeLeagueId");
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
            <label className="text-sm text-zinc-300">
              Liga
              <select
                className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm disabled:opacity-50"
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
        </div>

        {showPhaseGroupFilters && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-zinc-300">
              Fase
              <select
                className="rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
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

            <label className="text-sm text-zinc-300">
              Grupo
              <select
                className="rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm disabled:opacity-50"
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
        )}

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
                          {m.homeTeam.name}{' '}
                          <span className="text-zinc-400">vs</span> {m.awayTeam.name}
                        </div>

                        <div className="text-sm text-zinc-400 truncate">
                          {m.timeUtc} UTC · {m.venue ?? '—'}
                        </div>

                        {effectiveLeagueId && myPick && (
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
                          <div className="flex flex-col items-end">
                            <div className="text-[11px] text-zinc-400 leading-none mb-1">
                              Resultado oficial del partido
                            </div>
                            <div className="px-3 py-1 rounded-lg bg-zinc-800 text-sm">
                              {m.score.home} - {m.score.away}
                            </div>
                          </div>
                        ) : (
                          <div className="px-3 py-1 rounded-lg bg-zinc-800 text-sm text-zinc-300">
                            {m.status}
                          </div>
                        )}

                        <button
                          className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium disabled:opacity-50"
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
                          {locked ? "Cerrado" : hasPick ? "Editar" : "Pronosticar"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

        {!loading && !error && seasonId && items.length === 0 && (
          <div className="text-zinc-400">No hay partidos para este evento.</div>
        )}

        {!loading && !error && seasonId && !effectiveLeagueId && visibleLeagues.length > 1 && (
          <div className="text-zinc-400">Selecciona una liga para ver/editar tus pronósticos.</div>
        )}

      </div>

      {/* MODAL */}
      {
        open && selected && (
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
                    onChange={(e) => setHomePred(e.target.value)}
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
                    onChange={(e) => setAwayPred(e.target.value)}
                    disabled={selectedLocked}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 disabled:opacity-50"
                  />
                </div>

                {((selected as any).phaseCode && (selected as any).phaseCode !== "F01") &&
                  homePred.trim() !== "" &&
                  awayPred.trim() !== "" &&
                  Number(homePred) === Number(awayPred) ? (
                  <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                    <div className="text-sm text-zinc-300 font-medium">KO: ¿Quién avanza?</div>
                    <div className="text-xs text-zinc-400 mt-1">
                      Como pronosticaste empate, debes elegir quién pasa a la siguiente fase.
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <select
                        className="rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
                        value={koWinnerTeamId}
                        onChange={(e) => setKoWinnerTeamId(e.target.value)}
                      >
                        <option value="">— Selecciona —</option>
                        <option value={selected.homeTeam.id}>{selected.homeTeam.name}</option>
                        <option value={selected.awayTeam.id}>{selected.awayTeam.name}</option>
                      </select>

                      <button
                        type="button"
                        className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm"
                        onClick={() => setKoWinnerTeamId("")}
                        title="Quitar selección"
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>
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
        )
      }
    </div >
  );
}