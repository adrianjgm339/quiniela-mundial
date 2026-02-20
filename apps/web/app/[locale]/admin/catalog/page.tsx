"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    getCatalog,
    me,
    type CatalogSport,
    adminCreateSport,
    adminUpdateSport,
    adminDeleteSport,
    adminCreateCompetition,
    adminUpdateCompetition,
    adminDeleteCompetition,
    adminCreateSeason,
    adminUpdateSeason,
    adminDeleteSeason,
    listScoringRules,
    type ApiScoringRule,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const controlBase =
    "w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm " +
    "text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] " +
    "disabled:opacity-60 disabled:cursor-not-allowed";
const controlInput = controlBase;
const controlSelect = controlBase;


type User = {
    id: string;
    email: string;
    displayName: string;
    role: string;
    createdAt: string;
};

type NamesById = Record<string, { es?: string; en?: string }>;

function getItemNames(map: NamesById, id: string) {
    return map[id] ?? {};
}

export default function AdminCatalogPage() {
    const router = useRouter();
    const { locale } = useParams<{ locale: string }>();

    const [user, setUser] = useState<User | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [sports, setSports] = useState<CatalogSport[]>([]);
    const [loadingCatalog, setLoadingCatalog] = useState(false);

    // Reglas disponibles (para defaultScoringRuleId por evento)
    const [ruleOptions, setRuleOptions] = useState<ApiScoringRule[]>([]);
    const [loadingRules, setLoadingRules] = useState(false);

    // Create Season: regla estándar obligatoria
    const [newSeasonDefaultRuleId, setNewSeasonDefaultRuleId] = useState<string>("B01");

    // Edit Season: regla estándar (la cargaremos desde catálogo/back cuando esté disponible)
    const [editSeasonDefaultRuleId, setEditSeasonDefaultRuleId] = useState<string>("B01");


    // 🔴 Importante: NO preseleccionar nada por defecto (como pediste)
    const [selectedSportId, setSelectedSportId] = useState<string | null>(null);
    const [selectedCompetitionId, setSelectedCompetitionId] = useState<string | null>(null);

    // Mapas para multi-idioma (ES/EN) por ID, para poder editar sin inventar
    const [namesBySportId, setNamesBySportId] = useState<NamesById>({});
    const [namesByCompetitionId, setNamesByCompetitionId] = useState<NamesById>({});
    const [namesBySeasonId, setNamesBySeasonId] = useState<NamesById>({});

    // Forms: Create
    const [newSportEs, setNewSportEs] = useState("");
    const [newSportEn, setNewSportEn] = useState("");

    const [newCompEs, setNewCompEs] = useState("");
    const [newCompEn, setNewCompEn] = useState("");

    const [newSeasonEs, setNewSeasonEs] = useState("");
    const [newSeasonEn, setNewSeasonEn] = useState("");

    // Forms: Edit (simple)
    const [editSportId, setEditSportId] = useState<string | null>(null);
    const [editSportEs, setEditSportEs] = useState("");
    const [editSportEn, setEditSportEn] = useState("");

    const [editCompetitionId, setEditCompetitionId] = useState<string | null>(null);
    const [editCompEs, setEditCompEs] = useState("");
    const [editCompEn, setEditCompEn] = useState("");

    const [editSeasonId, setEditSeasonId] = useState<string | null>(null);
    const [editSeasonEs, setEditSeasonEs] = useState("");
    const [editSeasonEn, setEditSeasonEn] = useState("");

    function closeAllEdits() {
        // Cerrar edición de deporte
        setEditSportId(null);
        setEditSportEs("");
        setEditSportEn("");

        // Cerrar edición de competición
        setEditCompetitionId(null);
        setEditCompEs("");
        setEditCompEn("");

        // Cerrar edición de evento (season)
        setEditSeasonId(null);
        setEditSeasonEs("");
        setEditSeasonEn("");
        setEditSeasonDefaultRuleId("B01");
    }

    // --- Guard ADMIN (mismo patrón que /admin)
    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            router.replace(`/${locale}/login`);
            return;
        }

        me(token, locale)
            .then((data: any) => {
                if (data?.role !== "ADMIN") {
                    router.replace(`/${locale}/dashboard`);
                    return;
                }
                setUser(data);
            })
            .catch((err) => {
                setError(err?.message ?? "Error");
                localStorage.removeItem("token");
                router.replace(`/${locale}/login`);
            });
    }, [router, locale]);

    // Helper: construir mapas de nombres ES/EN por id, usando el /catalog (read)
    function buildNameMaps(sportsLocale: CatalogSport[], localeKey: "es" | "en", prev?: { s: NamesById; c: NamesById; se: NamesById }) {
        const sMap: NamesById = { ...(prev?.s ?? {}) };
        const cMap: NamesById = { ...(prev?.c ?? {}) };
        const seMap: NamesById = { ...(prev?.se ?? {}) };

        for (const s of sportsLocale) {
            sMap[s.id] = { ...(sMap[s.id] ?? {}), [localeKey]: s.name };
            for (const c of s.competitions ?? []) {
                cMap[c.id] = { ...(cMap[c.id] ?? {}), [localeKey]: c.name };
                for (const se of c.seasons ?? []) {
                    seMap[se.id] = { ...(seMap[se.id] ?? {}), [localeKey]: se.name };
                }
            }
        }

        return { s: sMap, c: cMap, se: seMap };
    }

    async function reloadRules(seasonId?: string | null) {
        const token = localStorage.getItem("token");
        if (!token) return;

        // Si no hay evento (season) de contexto, no mostramos reglas
        if (!seasonId) {
            setRuleOptions([]);
            return;
        }

        setLoadingRules(true);
        try {
            // ✅ Clave: pedir reglas filtradas por el evento (igual que /admin/rules)
            const list = await listScoringRules(token, seasonId);
            setRuleOptions(list ?? []);

            // Mantener consistencia de selección en "Crear evento"
            if (list?.length && !list.some((r) => r.id === newSeasonDefaultRuleId)) {
                setNewSeasonDefaultRuleId(list[0].id);
            }

            // Mantener consistencia de selección en "Editar evento"
            if (list?.length && !list.some((r) => r.id === editSeasonDefaultRuleId)) {
                setEditSeasonDefaultRuleId(list[0].id);
            }
        } catch (e) {
            // no bloquea el catálogo si falla, pero idealmente debe cargar
            setRuleOptions([]);
        } finally {
            setLoadingRules(false);
        }
    }

    async function reloadCatalog() {
        setLoadingCatalog(true);
        setError(null);

        try {
            // 1) Catálogo en el locale actual (lo que se renderiza)
            const main = await getCatalog(locale);
            setSports(main ?? []);

            // 2) Multi-idioma: también cargar ES y EN para permitir editar nombres en ambos
            //    (si ya estamos en es/en, igual cargamos el otro)
            const needEs = locale !== "es";
            const needEn = locale !== "en";

            let maps = buildNameMaps(main ?? [], (locale === "en" ? "en" : "es") as "es" | "en");

            if (needEs) {
                const esCat = await getCatalog("es");
                maps = buildNameMaps(esCat ?? [], "es", maps);
            }
            if (needEn) {
                const enCat = await getCatalog("en");
                maps = buildNameMaps(enCat ?? [], "en", maps);
            }

            setNamesBySportId(maps.s);
            setNamesByCompetitionId(maps.c);
            setNamesBySeasonId(maps.se);

            // NO tocar selectedSportId/selectedCompetitionId (no defaults)
            // Solo si el seleccionado ya no existe, lo limpiamos.
            if (selectedSportId && !(main ?? []).some((s) => s.id === selectedSportId)) {
                setSelectedSportId(null);
                setSelectedCompetitionId(null);
            } else if (selectedSportId) {
                const s = (main ?? []).find((x) => x.id === selectedSportId);
                if (selectedCompetitionId && s && !s.competitions.some((c) => c.id === selectedCompetitionId)) {
                    setSelectedCompetitionId(null);
                }
            }
        } catch (e: any) {
            setError(e?.message ?? "Error cargando catálogo");
        } finally {
            setLoadingCatalog(false);
        }
    }

    // --- Cargar catálogo al entrar / cambiar locale
    useEffect(() => {
        reloadCatalog();
        reloadRules(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [locale]);

    const selectedSport = useMemo(() => {
        if (!selectedSportId) return null;
        return sports.find((s) => s.id === selectedSportId) ?? null;
    }, [sports, selectedSportId]);

    const competitions = useMemo(() => selectedSport?.competitions ?? [], [selectedSport]);

    const selectedCompetition = useMemo(() => {
        if (!selectedCompetitionId) return null;
        return competitions.find((c) => c.id === selectedCompetitionId) ?? null;
    }, [competitions, selectedCompetitionId]);

    const seasons = useMemo(() => selectedCompetition?.seasons ?? [], [selectedCompetition]);

    // seasonId "de contexto" para filtrar las reglas del dropdown en Catálogo.
    // - Si estoy editando un evento, filtro por ese evento.
    // - Si no, filtro por el primer evento de la competición seleccionada (si existe).
    const rulesSeasonId = useMemo(() => {
        if (editSeasonId) return editSeasonId;
        return seasons[0]?.id ?? null;
    }, [editSeasonId, seasons]);

    // Cada vez que cambie el evento de contexto, recargamos reglas filtradas por seasonId
    useEffect(() => {
        closeAllEdits();

        // Si no hay competición seleccionada o no hay season disponible, el combo queda vacío
        if (!selectedCompetitionId || !rulesSeasonId) {
            setRuleOptions([]);
            return;
        }
        reloadRules(rulesSeasonId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCompetitionId, rulesSeasonId]);

    // Reset competencia al cambiar deporte seleccionado
    useEffect(() => {
        closeAllEdits();

        if (!selectedSportId) {
            setSelectedCompetitionId(null);
            return;
        }
        if (selectedCompetitionId && competitions.some((c) => c.id === selectedCompetitionId)) return;
        setSelectedCompetitionId(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedSportId]);

    // ---------------------------
    // CRUD handlers (token required)
    // ---------------------------
    function getTokenOrFail(): string | null {
        const token = localStorage.getItem("token");
        if (!token) {
            setError("No hay token. Inicia sesión de nuevo.");
            router.replace(`/${locale}/login`);
            return null;
        }
        return token;
    }

    async function onCreateSport() {
        const token = getTokenOrFail();
        if (!token) return;

        setError(null);
        try {
            const names: any = {};
            if (newSportEs.trim()) names.es = newSportEs.trim();
            if (newSportEn.trim()) names.en = newSportEn.trim();

            if (!names.es && !names.en) {
                setError("Debes indicar al menos un nombre (ES o EN).");
                return;
            }

            await adminCreateSport(token, names);
            setNewSportEs("");
            setNewSportEn("");
            await reloadCatalog();
        } catch (e: any) {
            setError(e?.message ?? "Error creando deporte");
        }
    }

    async function onStartEditSport(id: string) {
        setEditSportId(id);
        const n = getItemNames(namesBySportId, id);
        setEditSportEs(n.es ?? "");
        setEditSportEn(n.en ?? "");
    }

    async function onSaveEditSport() {
        const token = getTokenOrFail();
        if (!token || !editSportId) return;

        setError(null);
        try {
            const names: any = {};
            if (editSportEs.trim()) names.es = editSportEs.trim();
            if (editSportEn.trim()) names.en = editSportEn.trim();

            if (!names.es && !names.en) {
                setError("Debes indicar al menos un nombre (ES o EN).");
                return;
            }

            await adminUpdateSport(token, editSportId, names);
            setEditSportId(null);
            setEditSportEs("");
            setEditSportEn("");
            await reloadCatalog();
        } catch (e: any) {
            setError(e?.message ?? "Error actualizando deporte");
        }
    }

    async function onDeleteSport(id: string) {
        const token = getTokenOrFail();
        if (!token) return;

        const ok = confirm("¿Seguro que deseas borrar este deporte? (Permitido por diseño)");
        if (!ok) return;

        setError(null);
        try {
            await adminDeleteSport(token, id);
            if (selectedSportId === id) {
                setSelectedSportId(null);
                setSelectedCompetitionId(null);
            }
            await reloadCatalog();
        } catch (e: any) {
            setError(e?.message ?? "Error borrando deporte");
        }
    }

    async function onCreateCompetition() {
        const token = getTokenOrFail();
        if (!token) return;

        if (!selectedSportId) {
            setError("Selecciona un deporte primero.");
            return;
        }

        setError(null);
        try {
            const names: any = {};
            if (newCompEs.trim()) names.es = newCompEs.trim();
            if (newCompEn.trim()) names.en = newCompEn.trim();

            if (!names.es && !names.en) {
                setError("Debes indicar al menos un nombre (ES o EN).");
                return;
            }

            await adminCreateCompetition(token, selectedSportId, names);
            setNewCompEs("");
            setNewCompEn("");
            await reloadCatalog();
        } catch (e: any) {
            setError(e?.message ?? "Error creando competición");
        }
    }

    async function onStartEditCompetition(id: string) {
        setEditCompetitionId(id);
        const n = getItemNames(namesByCompetitionId, id);
        setEditCompEs(n.es ?? "");
        setEditCompEn(n.en ?? "");
    }

    async function onSaveEditCompetition() {
        const token = getTokenOrFail();
        if (!token || !editCompetitionId) return;

        setError(null);
        try {
            const names: any = {};
            if (editCompEs.trim()) names.es = editCompEs.trim();
            if (editCompEn.trim()) names.en = editCompEn.trim();

            if (!names.es && !names.en) {
                setError("Debes indicar al menos un nombre (ES o EN).");
                return;
            }

            await adminUpdateCompetition(token, editCompetitionId, names);
            setEditCompetitionId(null);
            setEditCompEs("");
            setEditCompEn("");
            await reloadCatalog();
        } catch (e: any) {
            setError(e?.message ?? "Error actualizando competición");
        }
    }

    async function onDeleteCompetition(id: string) {
        const token = getTokenOrFail();
        if (!token) return;

        const ok = confirm("¿Seguro que deseas borrar esta competición? (Permitido por diseño)");
        if (!ok) return;

        setError(null);
        try {
            await adminDeleteCompetition(token, id);
            if (selectedCompetitionId === id) setSelectedCompetitionId(null);
            await reloadCatalog();
        } catch (e: any) {
            setError(e?.message ?? "Error borrando competición");
        }
    }

    async function onCreateSeason() {
        const token = getTokenOrFail();
        if (!token) return;

        if (!selectedCompetitionId) {
            setError("Selecciona una competición primero.");
            return;
        }

        setError(null);
        try {
            const names: any = {};
            if (newSeasonEs.trim()) names.es = newSeasonEs.trim();
            if (newSeasonEn.trim()) names.en = newSeasonEn.trim();

            if (!names.es && !names.en) {
                setError("Debes indicar al menos un nombre (ES o EN).");
                return;
            }

            if (!newSeasonDefaultRuleId) {
                setError("Debes seleccionar la regla estándar del evento (defaultScoringRuleId).");
                return;
            }

            await adminCreateSeason(token, selectedCompetitionId, names, undefined, newSeasonDefaultRuleId);
            setNewSeasonEs("");
            setNewSeasonEn("");
            setNewSeasonDefaultRuleId(ruleOptions.find((r) => r.id === "B01") ? "B01" : (ruleOptions[0]?.id ?? "B01"));
            await reloadCatalog();
        } catch (e: any) {
            setError(e?.message ?? "Error creando evento");
        }
    }

    async function onStartEditSeason(id: string) {
        setEditSeasonId(id);
        const n = getItemNames(namesBySeasonId, id);
        setEditSeasonEs(n.es ?? "");
        setEditSeasonEn(n.en ?? "");
        // Buscar el evento (season) dentro del catálogo ya cargado para leer su defaultScoringRuleId real
        let found: any = null;
        for (const s of sports) {
            for (const c of (s.competitions ?? [])) {
                const se = (c.seasons ?? []).find((x: any) => x.id === id);
                if (se) { found = se; break; }
            }
            if (found) break;
        }

        const realDefault = (found?.defaultScoringRuleId ?? "").trim();
        if (realDefault) {
            setEditSeasonDefaultRuleId(realDefault);
        } else {
            // fallback seguro
            setEditSeasonDefaultRuleId(ruleOptions.find((r) => r.id === "B01") ? "B01" : (ruleOptions[0]?.id ?? "B01"));
        }
    }

    async function onSaveEditSeason() {
        const token = getTokenOrFail();
        if (!token || !editSeasonId) return;

        setError(null);
        try {
            const names: any = {};
            if (editSeasonEs.trim()) names.es = editSeasonEs.trim();
            if (editSeasonEn.trim()) names.en = editSeasonEn.trim();

            if (!names.es && !names.en) {
                setError("Debes indicar al menos un nombre (ES o EN).");
                return;
            }

            if (!editSeasonDefaultRuleId) {
                setError("Debes seleccionar la regla estándar del evento (defaultScoringRuleId).");
                return;
            }

            await adminUpdateSeason(token, editSeasonId, names, undefined, editSeasonDefaultRuleId);

            setEditSeasonId(null);
            setEditSeasonEs("");
            setEditSeasonEn("");
            await reloadCatalog();
        } catch (e: any) {
            setError(e?.message ?? "Error actualizando evento");
        }
    }

    async function onDeleteSeason(id: string) {
        const token = getTokenOrFail();
        if (!token) return;

        const ok = confirm("¿Seguro que deseas borrar este evento? (Permitido por diseño)");
        if (!ok) return;

        setError(null);
        try {
            await adminDeleteSeason(token, id);
            await reloadCatalog();
        } catch (e: any) {
            setError(e?.message ?? "Error borrando evento");
        }
    }

    // ---------------------------
    // UI
    // ---------------------------
    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-xl font-semibold m-0">Admin · Catálogo</h1>
                    <div className="mt-1 text-sm text-[var(--muted)]">
                        Lectura desde API:{" "}
                        <span className="font-mono text-[var(--foreground)]">/catalog?locale={locale}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => reloadCatalog()}>
                        Recargar
                    </Button>

                    <Button variant="secondary" size="sm" onClick={() => router.push(`/${locale}/admin`)}>
                        Volver
                    </Button>
                </div>
            </div>

            {!user && !error && <p className="mt-4 text-sm text-[var(--muted)]">Cargando…</p>}

            {error ? (
                <Card className="mt-4 p-3">
                    <div className="text-sm whitespace-pre-wrap">⚠️ {error}</div>
                </Card>
            ) : null}

            {user && (
                <div style={{ marginTop: 18 }}>
                    {loadingCatalog ? (
                        <div className="text-sm text-[var(--muted)]">Cargando catálogo…</div>
                    ) : (
                        <div className="grid gap-4 lg:grid-cols-3">
                            {/* Deportes */}
                            <Card className="p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-semibold">Deportes</div>
                                    <Badge>{sports.length}</Badge>
                                </div>

                                {/* Create Sport */}
                                <Card className="mt-3 p-3">
                                    <div className="text-sm font-semibold mb-2">Crear deporte</div>
                                    <div style={{ display: "grid", gap: 8 }}>
                                        <input
                                            value={newSportEs}
                                            onChange={(e) => setNewSportEs(e.target.value)}
                                            placeholder="Nombre ES (ejm: Fútbol)"
                                            className={controlInput}
                                        />
                                        <input
                                            value={newSportEn}
                                            onChange={(e) => setNewSportEn(e.target.value)}
                                            placeholder="Nombre EN (ejm: Football)"
                                            className={controlInput}
                                        />
                                        <Button onClick={onCreateSport} variant="secondary" size="sm">
                                            Crear
                                        </Button>
                                    </div>
                                    <div className="mt-2 text-xs text-[var(--muted)]">Slug es automático en backend.</div>
                                </Card>

                                {/* Edit Sport */}
                                {editSportId && (
                                    <Card className="mt-3 p-3">
                                        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Editar deporte</div>
                                        <div style={{ display: "grid", gap: 8 }}>
                                            <input
                                                value={editSportEs}
                                                onChange={(e) => setEditSportEs(e.target.value)}
                                                placeholder="Nombre ES"
                                                className={controlInput}
                                            />
                                            <input
                                                value={editSportEn}
                                                onChange={(e) => setEditSportEn(e.target.value)}
                                                placeholder="Nombre EN"
                                                className={controlInput}
                                            />
                                            <div className="flex gap-2">
                                                <Button size="sm" onClick={onSaveEditSport}>
                                                    Guardar
                                                </Button>

                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => {
                                                        setEditSportId(null);
                                                        setEditSportEs("");
                                                        setEditSportEn("");
                                                    }}
                                                >
                                                    Cancelar
                                                </Button>
                                            </div>
                                        </div>
                                    </Card>
                                )}

                                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                                    {sports.map((s) => {
                                        const active = s.id === selectedSportId;
                                        const names = getItemNames(namesBySportId, s.id);
                                        return (
                                            <div
                                                key={s.id}
                                                className={`rounded-xl border border-[var(--border)] bg-[var(--card)] ${active ? "ring-2 ring-[var(--accent)]" : ""}`}
                                            >
                                                <button
                                                    onClick={() => {
                                                        setSelectedSportId(s.id);
                                                        // si cambias el sport, limpieza explícita de comp
                                                        setSelectedCompetitionId(null);
                                                    }}
                                                    className={`w-full text-left px-3 py-2 rounded-xl hover:bg-[var(--muted)] ${active ? "bg-[var(--muted)]" : ""}`}
                                                >
                                                    <div style={{ fontWeight: 700 }}>{s.name}</div>
                                                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                                                        {s.competitions?.length ?? 0} competición(es)
                                                    </div>

                                                    {(names.es || names.en) && (
                                                        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>
                                                            <div>ES: {names.es ?? "—"}</div>
                                                            <div>EN: {names.en ?? "—"}</div>
                                                        </div>
                                                    )}
                                                </button>

                                                <div style={{ display: "flex", gap: 8, marginTop: 10, padding: "0 12px 14px 12px" }}>
                                                    <Button size="sm" variant="secondary" onClick={() => onStartEditSport(s.id)}>
                                                        Editar
                                                    </Button>
                                                    <Button size="sm" variant="secondary" onClick={() => onDeleteSport(s.id)}>
                                                        Borrar
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {!sports.length && <div style={{ opacity: 0.75 }}>Sin deportes.</div>}
                                </div>
                            </Card>

                            {/* Competiciones */}
                            <Card className="p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-semibold">Competiciones</div>
                                    <Badge>{competitions.length}</Badge>
                                </div>

                                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.65 }}>
                                    {selectedSportId ? (
                                        <>Deporte seleccionado: <span style={{ opacity: 0.95 }}>{selectedSport?.name}</span></>
                                    ) : (
                                        <>Selecciona un deporte para gestionar competiciones.</>
                                    )}
                                </div>

                                {/* Create Competition */}
                                <Card className="mt-3 p-3">
                                    <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Crear competición</div>
                                    <div style={{ display: "grid", gap: 8 }}>
                                        <input
                                            value={newCompEs}
                                            onChange={(e) => setNewCompEs(e.target.value)}
                                            placeholder="Nombre ES (ejm: Copa Mundial FIFA)"
                                            className={controlInput}
                                            disabled={!selectedSportId}
                                        />
                                        <input
                                            value={newCompEn}
                                            onChange={(e) => setNewCompEn(e.target.value)}
                                            placeholder="Nombre EN (ejm: FIFA World Cup)"
                                            className={controlInput}
                                            disabled={!selectedSportId}
                                        />
                                        <Button onClick={onCreateCompetition} variant="secondary" size="sm" disabled={!selectedSportId}>
                                            Crear
                                        </Button>
                                    </div>
                                    <div className="mt-2 text-xs text-[var(--muted)]">Slug es automático en backend.</div>
                                </Card>

                                {/* Edit Competition */}
                                {editCompetitionId && (
                                    <Card className="mt-3 p-3">
                                        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Editar competición</div>
                                        <div style={{ display: "grid", gap: 8 }}>
                                            <input
                                                value={editCompEs}
                                                onChange={(e) => setEditCompEs(e.target.value)}
                                                placeholder="Nombre ES"
                                                className={controlInput}
                                            />
                                            <input
                                                value={editCompEn}
                                                onChange={(e) => setEditCompEn(e.target.value)}
                                                placeholder="Nombre EN"
                                                className={controlInput}
                                            />
                                            <div className="flex gap-2">
                                                <Button size="sm" onClick={onSaveEditCompetition}>
                                                    Guardar
                                                </Button>

                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => {
                                                        setEditCompetitionId(null);
                                                        setEditCompEs("");
                                                        setEditCompEn("");
                                                    }}
                                                >
                                                    Cancelar
                                                </Button>
                                            </div>
                                        </div>
                                    </Card>
                                )}

                                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                                    {competitions.map((c) => {
                                        const active = c.id === selectedCompetitionId;
                                        const names = getItemNames(namesByCompetitionId, c.id);

                                        return (
                                            <div
                                                key={c.id}
                                                className={`rounded-xl border border-[var(--border)] bg-[var(--card)] ${active ? "ring-2 ring-[var(--accent)]" : ""}`}
                                            >
                                                <button
                                                    onClick={() => setSelectedCompetitionId(c.id)}
                                                    className={`w-full text-left px-3 py-2 rounded-xl hover:bg-[var(--muted)] ${active ? "bg-[var(--muted)]" : ""}`}
                                                    disabled={!selectedSportId}
                                                >
                                                    <div style={{ fontWeight: 700 }}>{c.name}</div>
                                                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                                                        {c.seasons?.length ?? 0} evento(s)
                                                    </div>

                                                    {(names.es || names.en) && (
                                                        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>
                                                            <div>ES: {names.es ?? "—"}</div>
                                                            <div>EN: {names.en ?? "—"}</div>
                                                        </div>
                                                    )}
                                                </button>

                                                <div style={{ display: "flex", gap: 8, marginTop: 10, padding: "0 12px 14px 12px" }}>
                                                    <Button size="sm" variant="secondary" onClick={() => onStartEditCompetition(c.id)}>
                                                        Editar
                                                    </Button>
                                                    <Button size="sm" variant="secondary" onClick={() => onDeleteCompetition(c.id)}>
                                                        Borrar
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {!selectedSportId && <div style={{ opacity: 0.75 }}>Selecciona un deporte.</div>}
                                    {selectedSportId && !competitions.length && <div style={{ opacity: 0.75 }}>Sin competiciones.</div>}
                                </div>
                            </Card>

                            {/* Eventos (Season) */}
                            <Card className="p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-semibold">Eventos</div>
                                    <Badge>{seasons.length}</Badge>
                                </div>

                                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.65 }}>
                                    {selectedCompetitionId ? (
                                        <>Competición seleccionada: <span style={{ opacity: 0.95 }}>{selectedCompetition?.name}</span></>
                                    ) : (
                                        <>Selecciona una competición para gestionar eventos.</>
                                    )}
                                </div>

                                {/* Create Season */}
                                <Card className="mt-3 p-3">
                                    <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Crear evento</div>
                                    <div style={{ display: "grid", gap: 8 }}>
                                        <input
                                            value={newSeasonEs}
                                            onChange={(e) => setNewSeasonEs(e.target.value)}
                                            placeholder="Nombre ES (ejm: Mundial 2026)"
                                            className={controlInput}
                                            disabled={!selectedCompetitionId}
                                        />
                                        <input
                                            value={newSeasonEn}
                                            onChange={(e) => setNewSeasonEn(e.target.value)}
                                            placeholder="Nombre EN (ejm: World Cup 2026)"
                                            className={controlInput}
                                            disabled={!selectedCompetitionId}
                                        />
                                        <select
                                            value={newSeasonDefaultRuleId}
                                            onChange={(e) => setNewSeasonDefaultRuleId(e.target.value)}
                                            className={controlSelect}
                                            disabled={!selectedCompetitionId || loadingRules}
                                        >
                                            {loadingRules ? (
                                                <option value="">Cargando reglas...</option>
                                            ) : (
                                                <>
                                                    {ruleOptions.map((r) => (
                                                        <option key={r.id} value={r.id}>
                                                            {r.id} — {r.name}
                                                        </option>
                                                    ))}
                                                </>
                                            )}
                                        </select>
                                        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.65 }}>
                                            Regla estándar del evento (Ranking Mundial/País): <span style={{ opacity: 0.9 }}>{newSeasonDefaultRuleId || "—"}</span>
                                        </div>
                                        <Button onClick={onCreateSeason} variant="secondary" size="sm" disabled={!selectedCompetitionId}>
                                            Crear
                                        </Button>
                                    </div>
                                    <div className="mt-2 text-xs text-[var(--muted)]">Slug es automático en backend.</div>
                                </Card>

                                {/* Edit Season */}
                                {editSeasonId && (
                                    <Card className="mt-3 p-3">
                                        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Editar evento</div>
                                        <div style={{ display: "grid", gap: 8 }}>
                                            <input
                                                value={editSeasonEs}
                                                onChange={(e) => setEditSeasonEs(e.target.value)}
                                                placeholder="Nombre ES"
                                                className={controlInput}
                                            />
                                            <input
                                                value={editSeasonEn}
                                                onChange={(e) => setEditSeasonEn(e.target.value)}
                                                placeholder="Nombre EN"
                                                className={controlInput}
                                            />
                                            <select
                                                value={editSeasonDefaultRuleId}
                                                onChange={(e) => setEditSeasonDefaultRuleId(e.target.value)}
                                                className={controlSelect}
                                                disabled={loadingRules}
                                            >
                                                {loadingRules ? (
                                                    <option value="">Cargando reglas...</option>
                                                ) : (
                                                    <>
                                                        {ruleOptions.map((r) => (
                                                            <option key={r.id} value={r.id}>
                                                                {r.id} — {r.name}
                                                            </option>
                                                        ))}
                                                    </>
                                                )}
                                            </select>
                                            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.65 }}>
                                                Regla estándar del evento (Ranking Mundial/País): <span style={{ opacity: 0.9 }}>{editSeasonDefaultRuleId || "—"}</span>
                                            </div>
                                            <div style={{ display: "flex", gap: 8 }}>
                                                <Button size="sm" onClick={onSaveEditSeason}>
                                                    Guardar
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => {
                                                        setEditSeasonId(null);
                                                        setEditSeasonEs("");
                                                        setEditSeasonEn("");
                                                    }}
                                                >
                                                    Cancelar
                                                </Button>
                                            </div>
                                        </div>
                                    </Card>
                                )}

                                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                                    {seasons.map((ev) => {
                                        const names = getItemNames(namesBySeasonId, ev.id);

                                        return (
                                            <div key={ev.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
                                                <div className="px-3 py-2">
                                                    <div style={{ fontWeight: 700 }}>{ev.name}</div>
                                                    <div style={{ fontSize: 12, opacity: 0.7 }}>{ev.slug}</div>

                                                    {(names.es || names.en) && (
                                                        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>
                                                            <div>ES: {names.es ?? "—"}</div>
                                                            <div>EN: {names.en ?? "—"}</div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div style={{ display: "flex", gap: 8, marginTop: 10, padding: "0 12px 14px 12px" }}>
                                                    <Button size="sm" variant="secondary" onClick={() => onStartEditSeason(ev.id)}>
                                                        Editar
                                                    </Button>
                                                    <Button size="sm" variant="secondary" onClick={() => onDeleteSeason(ev.id)}>
                                                        Borrar
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {!selectedCompetitionId && <div style={{ opacity: 0.75 }}>Selecciona una competición.</div>}
                                    {selectedCompetitionId && !seasons.length && <div style={{ opacity: 0.75 }}>Sin eventos.</div>}
                                </div>
                            </Card>
                        </div>
                    )}

                    <div style={{ marginTop: 14, fontSize: 12, opacity: 0.65 }}>
                        Nota: Si intentas borrar un item con dependencias, el backend debería responder con error (integridad). Aquí lo mostramos tal cual.
                    </div>
                </div>
            )
            }
        </div >
    );
}