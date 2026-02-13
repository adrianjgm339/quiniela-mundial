"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  me,
  getCatalog,
  getMyLeagues,
  listScoringRules,
  getScoringRule,
  updateScoringRule,
  setScoringRuleDetails,
  createScoringRule,
  recomputeScoring,
  type ApiScoringRule,
  type ApiScoringRuleDetail,
  type CatalogSport,
  type ApiLeague,
} from "@/lib/api";

const DEFAULT_CODES: Array<{ code: string; label: string }> = [
  { code: "EXACTO", label: "Marcador exacto" },
  { code: "RESULTADO", label: "Resultado (1X2)" },
  { code: "BONUS_DIF", label: "Diferencia de goles" },
  { code: "GOLES_LOCAL", label: "Acierta goles local" },
  { code: "GOLES_VISITA", label: "Acierta goles visita" },
  { code: "KO_GANADOR_FINAL", label: "KO: acierta quién avanza" },
];

const SYSTEM_RULE_IDS = new Set(["B01", "R01", "R02", "R03", "R04", "R05", 'BB01', 'BB02', 'BB03']);

function inferSportCompetitionFromSeason(catalog: CatalogSport[], seasonId: string) {
  for (const s of catalog ?? []) {
    for (const c of s.competitions ?? []) {
      const found = (c.seasons ?? []).some((se) => se.id === seasonId);
      if (found) return { sportId: s.id, competitionId: c.id };
    }
  }
  return { sportId: "", competitionId: "" };
}

function findSeasonName(catalog: CatalogSport[], seasonId: string) {
  for (const s of catalog ?? []) {
    for (const c of s.competitions ?? []) {
      const se = (c.seasons ?? []).find((x) => x.id === seasonId);
      if (se) return se.name ?? "";
    }
  }
  return "";
}


export default function AdminRulesPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rules, setRules] = useState<ApiScoringRule[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  const [user, setUser] = useState<any | null>(null);

  // Contexto (Deporte → Competición → Evento → Liga)
  const [catalog, setCatalog] = useState<CatalogSport[]>([]);
  const [sportId, setSportId] = useState<string>("");
  const [competitionId, setCompetitionId] = useState<string>("");
  const [seasonId, setSeasonId] = useState<string>(""); // evento seleccionado en esta pantalla
  const [activeSeasonLabel, setActiveSeasonLabel] = useState<string>("");

  const [allLeagues, setAllLeagues] = useState<ApiLeague[]>([]);
  const [leagueId, setLeagueId] = useState<string>(""); // opcional (mis ligas para ese evento)

  const leaguesForSeason = useMemo(() => {
    if (!seasonId) return [];
    return (allLeagues ?? []).filter((l) => l.seasonId === seasonId);
  }, [allLeagues, seasonId]);


  const [editing, setEditing] = useState<ApiScoringRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const selected = useMemo(() => rules.find((r) => r.id === selectedId) ?? null, [rules, selectedId]);

  function getTokenOrRedirect() {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace(`/${locale}/login`);
      return null;
    }
    return token;
  }

  async function loadAll(nextSeasonId?: string) {
    const token = getTokenOrRedirect();
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      // 1) Me (validar admin + fallback de activeSeasonId)
      const u = await me(token, locale);
      setUser(u);

      if (u?.role !== "ADMIN") {
        router.replace(`/${locale}/dashboard`);
        return;
      }

      // 2) Catálogo (para cascada)
      const cat = await getCatalog(locale);
      setCatalog(cat);

      // 3) SeasonId efectivo
      // Regla CLAVE: si nextSeasonId viene explícito (aunque sea ""), NO usamos fallbacks.
      // Esto evita que al cambiar Deporte/Competición vuelva a pisar con u.activeSeasonId.
      const lsSeasonId = localStorage.getItem("admin_ctx_seasonId") ?? "";
      const sid =
        nextSeasonId !== undefined
          ? nextSeasonId
          : (lsSeasonId || (u.activeSeasonId ?? "") || "");

      setSeasonId(sid);

      if (sid) {
        localStorage.setItem("admin_ctx_seasonId", sid);

        const inferred = inferSportCompetitionFromSeason(cat, sid);
        setSportId(inferred.sportId);
        setCompetitionId(inferred.competitionId);

        // Label desde catálogo (más estable que depender de u.activeSeason)
        setActiveSeasonLabel(findSeasonName(cat, sid));
      } else {
        // Importante: si no hay evento seleccionado, NO tocamos sportId/competitionId
        // porque el usuario puede estar seleccionándolos manualmente en la cascada.
        setActiveSeasonLabel("");
      }


      // 4) Mis ligas (para combo Liga)
      try {
        const mine = await getMyLeagues(token);
        setAllLeagues(mine);

        const lsLeagueId = localStorage.getItem("admin_ctx_leagueId") ?? "";
        const ok = sid ? mine.some((l) => l.id === lsLeagueId && l.seasonId === sid) : false;
        setLeagueId(ok ? lsLeagueId : "");
      } catch {
        setAllLeagues([]);
        setLeagueId("");
      }

      // 5) Reglas por Season (si hay sid, se lo pasamos)
      const list = await listScoringRules(token, sid || undefined);
      setRules(list);

      setSelectedId(list[0]?.id ?? "");
    } catch (e: any) {
      setError(e?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  useEffect(() => {
    (async () => {
      const token = getTokenOrRedirect();
      if (!token) return;
      if (!selectedId) return;

      setMsg(null);
      setError(null);

      try {
        const r = await getScoringRule(token, selectedId);
        setEditing(r);
      } catch (e: any) {
        setError(e?.message ?? "Error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function setDetail(code: string, points: number) {
    setEditing((prev) => {
      if (!prev) return prev;

      const exists = prev.details.find((d) => d.code === code);
      const details = exists
        ? prev.details.map((d) => (d.code === code ? { ...d, points } : d))
        : [...prev.details, { code, points }];

      const order = new Map(DEFAULT_CODES.map((x, i) => [x.code, i]));
      details.sort((a, b) => (order.get(a.code) ?? 999) - (order.get(b.code) ?? 999));

      return { ...prev, details };
    });
  }

  async function onSave() {
    const token = getTokenOrRedirect();
    if (!token) return;
    if (!editing) return;

    setSaving(true);
    setMsg(null);
    setError(null);

    try {
      await updateScoringRule(token, editing.id, {
        name: editing.name,
        description: editing.description ?? null,
        isGlobal: editing.isGlobal,
      });

      const cleanDetails: ApiScoringRuleDetail[] = editing.details.map((d) => ({
        code: d.code.trim(),
        points: Number(d.points),
      }));

      await setScoringRuleDetails(token, editing.id, cleanDetails);

      setMsg("✅ Regla guardada.");
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Error guardando");
    } finally {
      setSaving(false);
    }
  }

  async function onRecompute() {
    const token = getTokenOrRedirect();
    if (!token) return;

    setSaving(true);
    setMsg(null);
    setError(null);

    try {
      const res = await recomputeScoring(token, seasonId || undefined);
      setMsg(
        `✅ Recalculo listo. Matches confirmados: ${res.confirmedMatchesWithScore} · Picks procesados: ${res.picksProcessed}`,
      );
    } catch (e: any) {
      setError(e?.message ?? "Error recalculando");
    } finally {
      setSaving(false);
    }
  }

  async function onCreateRule() {
    const token = getTokenOrRedirect();
    if (!token) return;

    const id = newId.trim();
    const name = newName.trim();
    if (!id || !name) {
      setError("ID y Nombre son requeridos.");
      return;
    }

    if (SYSTEM_RULE_IDS.has(id)) {
      setError(`El ID "${id}" está reservado para reglas del sistema. Usa otro (ej: C01, M01, X01).`);
      return;
    }

    setCreating(true);
    setMsg(null);
    setError(null);

    try {
      await createScoringRule(token, {
        id,
        name,
        description: newDesc.trim() ? newDesc.trim() : null,
        isGlobal: false,
        details: DEFAULT_CODES.map((x) => ({ code: x.code, points: 0 })),
      });

      setNewId("");
      setNewName("");
      setNewDesc("");

      setMsg("✅ Regla creada.");
      await loadAll();
      setSelectedId(id);
    } catch (e: any) {
      setError(e?.message ?? "Error creando");
    } finally {
      setCreating(false);
    }
  }

  const isSystemRule = editing?.id ? SYSTEM_RULE_IDS.has(editing.id) : false;
  const canEditPoints = !!editing && !isSystemRule;

  const baselineHint = isSystemRule
    ? "Regla predefinida del sistema (solo lectura)."
    : "Esta regla puede asignarse a ligas (League.scoringRuleId) para el Ranking de Liga. Los rankings Mundial/País usan la regla estándar del Evento (Season.defaultScoringRuleId).";

  return (
    <div style={{ maxWidth: 980, margin: "40px auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Admin · Reglas</h1>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => router.push(`/${locale}/admin`)}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
          >
            Volver
          </button>

          <button
            onClick={onRecompute}
            disabled={saving}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60"
          >
            {saving ? "Procesando…" : "Recalcular Scoring"}
          </button>
        </div>
      </div>

      {loading ? <p style={{ marginTop: 16 }}>Cargando…</p> : null}

      {error ? (
        <div className="mt-4 p-3 rounded-lg border border-red-700 bg-red-950 text-red-200 text-sm whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      {msg ? (
        <div className="mt-4 p-3 rounded-lg border border-emerald-700 bg-emerald-950 text-emerald-200 text-sm">
          {msg}
        </div>
      ) : null}


      {/* Contexto (Deporte → Competición → Evento → Liga) */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="text-xs uppercase tracking-wider text-white/60">Contexto</div>

        <div className="mt-1 text-sm text-white/80">
          Evento activo:{" "}
          <span className="font-semibold text-white">{activeSeasonLabel || (seasonId ? seasonId : "—")}</span>
        </div>

        <div className="mt-4 grid gap-3 max-w-xl">
          {/* Deporte */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/60">Deporte</label>
            <select
              className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm"
              value={sportId}
              onChange={(e) => {
                const next = e.target.value;
                setSportId(next);
                setCompetitionId("");
                setSeasonId("");
                setActiveSeasonLabel("");
                localStorage.removeItem("admin_ctx_seasonId");

                setLeagueId("");
                localStorage.removeItem("admin_ctx_leagueId");

                // No recargamos todavía: las reglas se recargan al escoger Evento (seasonId)
                setRules([]);
              }}
            >
              <option value="">Seleccionar</option>
              {catalog.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Competición */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/60">Competición</label>
            <select
              className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm"
              value={competitionId}
              onChange={(e) => {
                const next = e.target.value;
                setCompetitionId(next);
                setSeasonId("");
                setActiveSeasonLabel("");
                localStorage.removeItem("admin_ctx_seasonId");

                setLeagueId("");
                localStorage.removeItem("admin_ctx_leagueId");

                // No recargamos todavía: las reglas se recargan al escoger Evento (seasonId)
                setRules([]);
              }}
              disabled={!sportId}
            >
              <option value="">Seleccionar</option>
              {(catalog.find((s) => s.id === sportId)?.competitions ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Evento */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/60">Evento</label>
            <select
              className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm"
              value={seasonId}
              onChange={(e) => {
                const next = e.target.value || "";
                setSeasonId(next);
                if (next) {
                  localStorage.setItem("admin_ctx_seasonId", next);
                  setActiveSeasonLabel(findSeasonName(catalog, next));
                } else {
                  localStorage.removeItem("admin_ctx_seasonId");
                  setActiveSeasonLabel("");
                }

                // liga depende de evento
                setLeagueId("");
                localStorage.removeItem("admin_ctx_leagueId");

                // recarga reglas por evento
                loadAll(next);
              }}
              disabled={!sportId || !competitionId}
            >
              <option value="">Seleccionar</option>
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

          {/* Liga (opcional) */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/60">Liga (opcional)</label>
            <select
              className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm"
              value={leagueId}
              onChange={(e) => {
                const next = e.target.value || "";
                setLeagueId(next);
                if (next) localStorage.setItem("admin_ctx_leagueId", next);
                else localStorage.removeItem("admin_ctx_leagueId");
              }}
              disabled={!seasonId}
            >
              <option value="">Seleccionar</option>
              {leaguesForSeason.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>

            {!!seasonId && leaguesForSeason.length === 0 && (
              <div className="text-xs text-white/50 mt-1">No tienes ligas para este evento (o aún no cargaron).</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[320px_1fr]">
        {/* LEFT */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-4">
          <div className="font-semibold">Reglas disponibles</div>

          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800"
          >
            {rules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} · {r.name}
              </option>
            ))}
          </select>

          <div className="text-xs opacity-70">
            Seleccionada: <span className="font-mono">{selected?.id ?? "—"}</span>
          </div>

          <div className="pt-2 border-t border-zinc-800">
            <div className="font-semibold">Crear regla</div>

            <div className="space-y-2 mt-2">
              <input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder='ID (ej: "R01")'
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800"
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800"
              />
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Descripción (opcional)"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800"
              />

              <button
                type="button"
                onClick={onCreateRule}
                disabled={creating}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60"
              >
                {creating ? "Creando…" : "Crear"}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-4">
          {!editing ? (
            <div className="text-sm opacity-70">Selecciona una regla para editar.</div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">
                    Editando: <span className="font-mono">{editing.id}</span>
                  </div>
                  <div className="text-xs opacity-70 mt-1">{baselineHint}</div>
                </div>

                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving || !canEditPoints}
                  className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60"
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-sm opacity-80">Nombre</div>
                  <input
                    value={editing.name}
                    onChange={(e) => setEditing((p) => (p ? { ...p, name: e.target.value } : p))}
                    disabled={isSystemRule}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800"
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-sm opacity-80">Descripción</div>
                  <input
                    value={editing.description ?? ""}
                    onChange={(e) => setEditing((p) => (p ? { ...p, description: e.target.value } : p))}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800">
                <div className="font-semibold mb-2">Puntos</div>

                {!canEditPoints ? (
                  <div className="text-xs opacity-70 mb-2">
                    Esta es una regla predefinida del sistema. Solo se puede visualizar. Para modificar puntos, crea una regla personalizada.
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                  {DEFAULT_CODES.map((x) => {
                    const curr = editing.details.find((d) => d.code === x.code)?.points ?? 0;
                    return (
                      <div
                        key={x.code}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900"
                      >
                        <div>
                          <div className="text-sm font-medium">{x.label}</div>
                          <div className="text-xs opacity-70 font-mono">{x.code}</div>
                        </div>

                        <input
                          type="number"
                          value={curr}
                          onChange={(e) => setDetail(x.code, Number(e.target.value))}
                          disabled={!canEditPoints}
                          className="w-24 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        />

                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="text-xs opacity-70">
                Nota: El Ranking de Liga usa la regla configurada en la liga. Los rankings Mundial/País usan la regla estándar del Evento (Season.defaultScoringRuleId).
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
