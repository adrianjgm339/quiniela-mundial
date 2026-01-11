"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  me,
  listScoringRules,
  getScoringRule,
  updateScoringRule,
  setScoringRuleDetails,
  createScoringRule,
  recomputeScoring,
  type ApiScoringRule,
  type ApiScoringRuleDetail,
} from "@/lib/api";

const DEFAULT_CODES: Array<{ code: string; label: string }> = [
  { code: "EXACTO", label: "Marcador exacto" },
  { code: "RESULTADO", label: "Resultado (1X2)" },
  { code: "BONUS_DIF", label: "Diferencia de goles" },
  { code: "GOLES_LOCAL", label: "Acierta goles local" },
  { code: "GOLES_VISITA", label: "Acierta goles visita" },
];

export default function AdminRulesPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rules, setRules] = useState<ApiScoringRule[]>([]);
  const [selectedId, setSelectedId] = useState<string>("B01");

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

  async function loadAll() {
    const token = getTokenOrRedirect();
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const u = await me(token, locale);
      if (u?.role !== "ADMIN") {
        router.replace(`/${locale}/dashboard`);
        return;
      }

      const list = await listScoringRules(token);
      setRules(list);

      const hasB01 = list.some((r) => r.id === "B01");
      setSelectedId(hasB01 ? "B01" : (list[0]?.id ?? "B01"));
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
      const res = await recomputeScoring(token);
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

    setCreating(true);
    setMsg(null);
    setError(null);

    try {
      await createScoringRule(token, {
        id,
        name,
        description: newDesc.trim() ? newDesc.trim() : null,
        isGlobal: id === "B01",
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

  const baselineHint =
    editing?.id === "B01"
      ? "B01 = Básica Standard. Se usa para Ranking Mundial/País (baseline global)."
      : "Esta regla se puede asignar a ligas (scoringRuleId). El baseline global sigue siendo B01.";

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
                  disabled={saving}
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
                          className="w-24 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {editing.id === "B01" ? (
                <div className="text-xs opacity-70">
                  Nota: B01 se recalcula en paralelo siempre (baseline). Rankings Mundial/País usan B01.
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
