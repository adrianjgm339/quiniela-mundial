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
  getSeasonConcepts,
  type ApiScoringRule,
  type ApiScoringRuleDetail,
  type CatalogSport,
  type ApiLeague,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const controlBase =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm " +
  "text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] " +
  "disabled:opacity-60 disabled:cursor-not-allowed";
const controlSelect = controlBase;
const controlInput = controlBase;

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
  const [concepts, setConcepts] = useState<Array<{ code: string; label: string }>>(DEFAULT_CODES);

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
      const lsGlobalSeasonId = localStorage.getItem("activeSeasonId") ?? "";
      const lsAdminSeasonId = localStorage.getItem("admin_ctx_seasonId") ?? "";

      const sid =
        nextSeasonId !== undefined
          ? nextSeasonId
          : (lsGlobalSeasonId || (u.activeSeasonId ?? "") || lsAdminSeasonId || "");

      setSeasonId(sid);

      // Si el contexto global cambió, sincronizamos admin_ctx para no “arrastrar” otro evento.
      if (sid && sid !== lsAdminSeasonId) {
        localStorage.setItem("admin_ctx_seasonId", sid);
      }

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

      // 3.1) Conceptos por Evento (Season) para el panel de "Puntos"
      if (sid) {
        try {
          const conceptRows = await getSeasonConcepts(token, sid);

          const nextConcepts =
            (conceptRows ?? [])
              .filter((x: any) => x?.code)
              .map((x: any) => ({ code: x.code, label: (x.label ?? x.code) as string }));

          setConcepts(nextConcepts.length ? nextConcepts : DEFAULT_CODES);
        } catch {
          setConcepts(DEFAULT_CODES);
        }
      } else {
        setConcepts(DEFAULT_CODES);
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

      const order = new Map(concepts.map((x, i) => [x.code, i]));
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
        details: concepts.map((x) => ({ code: x.code, points: 0 })),
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
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold m-0">Admin · Reglas</h1>

          {seasonId ? (
            <Badge className="max-w-[520px] truncate">
              {activeSeasonLabel || seasonId}
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => router.push(`/${locale}/admin`)}>
            Volver
          </Button>

          <Button variant="secondary" size="sm" onClick={onRecompute} disabled={saving}>
            {saving ? "Procesando…" : "Recalcular Scoring"}
          </Button>
        </div>
      </div>

      {loading ? <p className="mt-4 text-sm text-[var(--muted)]">Cargando…</p> : null}

      {error ? (
        <Card className="mt-4 p-3">
          <div className="text-sm whitespace-pre-wrap">⚠️ {error}</div>
        </Card>
      ) : null}

      {msg ? (
        <Card className="mt-4 p-3">
          <div className="text-sm">{msg}</div>
        </Card>
      ) : null}

      {/* Contexto (Deporte → Competición → Evento → Liga) */}
      <Card className="mt-6 p-4">
        <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Contexto</div>

        <div className="mt-1 text-sm text-[var(--muted)]">
          Evento activo:{" "}
          <span className="font-semibold text-[var(--foreground)]">
            {activeSeasonLabel || (seasonId ? seasonId : "—")}
          </span>
        </div>

        <div className="mt-4 grid gap-3 max-w-xl">
          {/* Deporte */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--muted)]">Deporte</label>
            <select
              className={controlSelect}
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
            <label className="text-xs text-[var(--muted)]">Competición</label>
            <select
              className={controlSelect}
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
            <label className="text-xs text-[var(--muted)]">Evento</label>
            <select
              className={controlSelect}
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
            <label className="text-xs text-[var(--muted)]">Liga (opcional)</label>
            <select
              className={controlSelect}
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
              <div className="text-xs text-[var(--muted)] mt-1">
                No tienes ligas para este evento (o aún no cargaron).
              </div>
            )}
          </div>
        </div>
      </Card>

      {!seasonId ? (
        <Card className="mt-6 p-4">
          <div className="text-sm font-semibold">Selecciona un Evento</div>
          <div className="text-sm text-[var(--muted)] mt-1">
            Para administrar reglas, primero elige un <span className="font-medium text-[var(--foreground)]">Evento</span> en el bloque
            de Contexto.
          </div>
        </Card>
      ) : null}

      {seasonId && rules.length === 0 ? (
        <Card className="mt-6 p-4">
          <div className="text-sm font-semibold">Sin reglas para este evento</div>
          <div className="text-sm text-[var(--muted)] mt-1">
            Puedes crear una regla personalizada desde la columna izquierda.
          </div>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-[340px_1fr]">
        {/* LEFT */}
        <Card className="p-4 space-y-4">
          <div className="text-sm font-semibold">Reglas disponibles</div>

          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className={controlSelect}
          >
            {rules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} · {r.name}
              </option>
            ))}
          </select>

          <div className="text-xs text-[var(--muted)]">
            Seleccionada: <span className="font-mono text-[var(--foreground)]">{selected?.id ?? "—"}</span>
          </div>

          <div className="pt-3 border-t border-[var(--border)]">
            <div className="text-sm font-semibold">Crear regla</div>

            <div className="space-y-2 mt-2">
              {!seasonId ? (
                <div className="text-xs text-[var(--muted)]">
                  Selecciona un <span className="font-medium text-[var(--foreground)]">Evento</span> para habilitar la creación de reglas.
                </div>
              ) : null}
              <input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder='ID (ej: "R01")'
                disabled={!seasonId || creating}
                className={controlInput}
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre"
                disabled={!seasonId || creating}
                className={controlInput}
              />
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Descripción (opcional)"
                disabled={!seasonId || creating}
                className={controlInput}
              />

              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={onCreateRule}
                disabled={!seasonId || creating}
              >
                {creating ? "Creando…" : "Crear"}
              </Button>
            </div>
          </div>
        </Card>

        {/* RIGHT */}
        <Card className="p-4 space-y-4">
          {!seasonId ? (
            <div className="text-sm text-[var(--muted)]">
              Selecciona un evento en <span className="font-medium text-[var(--foreground)]">Contexto</span> para cargar y editar reglas.
            </div>
          ) : !editing ? (
            <div className="text-sm text-[var(--muted)]">Selecciona una regla para editar.</div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold">
                      Editando: <span className="font-mono">{editing.id}</span>
                    </div>

                    {isSystemRule ? (
                      <Badge>Sistema</Badge>
                    ) : (
                      <Badge>Editable</Badge>
                    )}
                  </div>

                  <div className="text-xs text-[var(--muted)] mt-1">{baselineHint}</div>
                </div>

                <Button
                  size="sm"
                  onClick={onSave}
                  disabled={saving || !canEditPoints}
                  className="shrink-0"
                >
                  {saving ? "Guardando…" : "Guardar"}
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-sm text-[var(--muted)]">Nombre</div>
                  <input
                    value={editing.name}
                    onChange={(e) => setEditing((p) => (p ? { ...p, name: e.target.value } : p))}
                    disabled={isSystemRule}
                    className={controlInput}
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-sm text-[var(--muted)]">Descripción</div>
                  <input
                    value={editing.description ?? ""}
                    onChange={(e) => setEditing((p) => (p ? { ...p, description: e.target.value } : p))}
                    className={controlInput}
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border)]">
                <div className="text-sm font-semibold mb-2">Puntos</div>

                {!canEditPoints ? (
                  <div className="text-xs text-[var(--muted)] mb-2">
                    Esta es una regla predefinida del sistema. Solo se puede visualizar. Para modificar puntos, crea una regla personalizada.
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                  {concepts.map((x) => {
                    const curr = editing.details.find((d) => d.code === x.code)?.points ?? 0;
                    return (
                      <div
                        key={x.code}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{x.label}</div>
                          <div className="text-xs text-[var(--muted)] font-mono">{x.code}</div>
                        </div>

                        <input
                          type="number"
                          value={curr}
                          onChange={(e) => setDetail(x.code, Number(e.target.value))}
                          disabled={!canEditPoints}
                          inputMode="numeric"
                          step={1}
                          className="w-24 text-right tabular-nums rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="text-xs text-[var(--muted)]">
                Nota: El Ranking de Liga usa la regla configurada en la liga. Los rankings Mundial/País usan la regla estándar del Evento (Season.defaultScoringRuleId).
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}