"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    getCatalog,
    me,
    type CatalogSport,
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
import { Badge } from "@/components/ui/badge";


export default function AdminCatalogPage() {
    const router = useRouter();
    const params = useParams();
    const locale = String(params?.locale ?? "es");

    const [token, setToken] = useState<string>("");
    const [user, setUser] = useState<{ id: string; email: string; displayName: string; role: string } | null>(null);
    const [authError, setAuthError] = useState<string | null>(null);

    const [catalog, setCatalog] = useState<CatalogSport[]>([]);
    const [loadingCatalog, setLoadingCatalog] = useState(false);
    const [catalogError, setCatalogError] = useState<string | null>(null);

    const [rules, setRules] = useState<ApiScoringRule[]>([]);
    const [loadingRules, setLoadingRules] = useState(false);
    const [rulesError, setRulesError] = useState<string | null>(null);

    // Selección actual (para editar / borrar)
    const [selectedSportId, setSelectedSportId] = useState<string>("");
    const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>("");
    const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");

    // Edit: Sport
    const [editSportId, setEditSportId] = useState<string>("");
    const [sportSlug, setSportSlug] = useState("");
    const [sportName, setSportName] = useState("");

    // Edit: Competition
    const [editCompetitionId, setEditCompetitionId] = useState<string>("");
    const [competitionSlug, setCompetitionSlug] = useState("");
    const [competitionName, setCompetitionName] = useState("");
    const [competitionDefaultRuleId, setCompetitionDefaultRuleId] = useState<string>("");

    // Edit: Season
    const [editSeasonId, setEditSeasonId] = useState<string>("");
    const [seasonSlug, setSeasonSlug] = useState("");
    const [seasonName, setSeasonName] = useState("");
    const [seasonStartDate, setSeasonStartDate] = useState<string>("");
    const [seasonEndDate, setSeasonEndDate] = useState<string>("");
    const [seasonDefaultRuleId, setSeasonDefaultRuleId] = useState<string>("");

    // -------------------------
    // Bootstrap auth/token
    // -------------------------
    useEffect(() => {
        const t = localStorage.getItem("token") ?? "";
        setToken(t);
    }, []);

    useEffect(() => {
        if (!token) return;

        setAuthError(null);
        me(token, locale)
            .then((u) => {
                setUser({ id: u.id, email: u.email, displayName: u.displayName, role: u.role });
                if (u.role !== "ADMIN") {
                    setAuthError("No tienes permisos de administrador.");
                }
            })
            .catch((e: unknown) => {
                setAuthError(e instanceof Error ? e.message : "Error autenticando");
            });
    }, [token, locale]);

    const canAdmin = useMemo(() => user?.role === "ADMIN" && !authError, [user, authError]);

    // -------------------------
    // Load catalog + rules
    // -------------------------
    const reloadCatalog = useCallback(async () => {
        setLoadingCatalog(true);
        setCatalogError(null);
        try {
            const sports = await getCatalog(locale);
            setCatalog(sports);
        } catch (e: unknown) {
            setCatalogError(e instanceof Error ? e.message : "Error cargando catálogo");
        } finally {
            setLoadingCatalog(false);
        }
    }, [locale]);

    const reloadRules = async (seasonId?: string) => {
        if (!token) return;

        const sid = (seasonId ?? "").trim();
        if (!sid) {
            setRules([]);
            return;
        }

        setLoadingRules(true);
        setRulesError(null);
        try {
            const rr = await listScoringRules(token, sid);
            setRules(rr);
        } catch (e: unknown) {
            setRulesError(e instanceof Error ? e.message : "Error cargando reglas");
            setRules([]);
        } finally {
            setLoadingRules(false);
        }
    };

    useEffect(() => {
        reloadCatalog();
    }, [reloadCatalog]);

    // -------------------------
    // Helpers
    // -------------------------
    const closeAllEdits = () => {
        setEditSportId("");
        setSportSlug("");
        setSportName("");

        setEditCompetitionId("");
        setCompetitionSlug("");
        setCompetitionName("");
        setCompetitionDefaultRuleId("");

        setEditSeasonId("");
        setSeasonSlug("");
        setSeasonName("");
        setSeasonStartDate("");
        setSeasonEndDate("");
        setSeasonDefaultRuleId("");
    };

    const findSport = (sportId: string) => catalog.find((s) => s.id === sportId);
    const findCompetition = (sportId: string, competitionId: string) =>
        catalog
            .find((s) => s.id === sportId)
            ?.competitions?.find((c) => c.id === competitionId);

    const findSeason = (sportId: string, competitionId: string, seasonId: string) =>
        findCompetition(sportId, competitionId)?.seasons?.find((se) => se.id === seasonId);

    // -------------------------
    // Actions: Sport
    // -------------------------
    const onCreateSport = async () => {
        if (!token) return;
        if (!sportSlug.trim() || !sportName.trim()) return;

        try {
            await adminUpdateSport(token, editSportId, { es: sportName.trim(), en: sportName.trim(), slug: sportSlug.trim() });
            closeAllEdits();
            await reloadCatalog();
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : "Error creando sport");
        }
    };

    const onStartEditSport = (sportId: string) => {
        closeAllEdits();
        const s = findSport(sportId);
        if (!s) return;

        setEditSportId(s.id);
        setSportSlug(s.slug);
        setSportName(s.name);
        setSelectedSportId(s.id);
        setSelectedCompetitionId("");
        setSelectedSeasonId("");
    };

    const onSaveEditSport = async () => {
        if (!token || !editSportId) return;
        try {
            await adminUpdateSport(token, editSportId, { slug: sportSlug.trim(), name: sportName.trim() });
            closeAllEdits();
            await reloadCatalog();
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : "Error actualizando sport");
        }
    };

    const onDeleteSport = async (sportId: string) => {
        if (!token) return;
        if (!confirm("¿Seguro que quieres borrar este sport y todo su contenido?")) return;

        try {
            await adminDeleteSport(token, sportId);
            closeAllEdits();
            setSelectedSportId("");
            setSelectedCompetitionId("");
            setSelectedSeasonId("");
            await reloadCatalog();
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : "Error borrando sport");
        }
    };

    // -------------------------
    // Actions: Competition
    // -------------------------
    const onCreateCompetition = async () => {
        if (!token) return;
        if (!selectedSportId) return;
        if (!competitionSlug.trim() || !competitionName.trim()) return;

        try {
            await adminCreateCompetition(
                token,
                selectedSportId,
                { es: competitionName.trim(), en: competitionName.trim(), slug: competitionSlug.trim() }
            );
            closeAllEdits();
            await reloadCatalog();
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : "Error creando competition");
        }
    };

    const onStartEditCompetition = (sportId: string, competitionId: string) => {
        closeAllEdits();
        const c = findCompetition(sportId, competitionId);
        if (!c) return;

        setSelectedSportId(sportId);
        setSelectedCompetitionId(competitionId);
        setSelectedSeasonId("");

        setEditCompetitionId(c.id);
        setCompetitionSlug(c.slug);
        setCompetitionName(c.name);
        setCompetitionDefaultRuleId((c.defaultScoringRuleId ?? "") as string);
    };

    const onSaveEditCompetition = async () => {
        if (!token || !selectedSportId || !editCompetitionId) return;

        try {
            await adminUpdateCompetition(token, editCompetitionId, {
                es: competitionName.trim(),
                en: competitionName.trim(),
                slug: competitionSlug.trim(),
            });

            closeAllEdits();
            await reloadCatalog();
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : "Error actualizando competition");
        }
    };

    const onDeleteCompetition = async (competitionId: string) => {
        if (!token || !selectedSportId) return;
        if (!confirm("¿Seguro que quieres borrar esta competencia y todas sus temporadas?")) return;

        try {
            await adminDeleteCompetition(token, competitionId);
            closeAllEdits();
            setSelectedCompetitionId("");
            setSelectedSeasonId("");
            await reloadCatalog();
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : "Error borrando competition");
        }
    };

    // -------------------------
    // Actions: Season
    // -------------------------
    const onCreateSeason = async () => {
        if (!token || !selectedSportId || !selectedCompetitionId) return;
        if (!seasonSlug.trim() || !seasonName.trim()) return;

        try {
            await adminCreateSeason(
                token,
                selectedCompetitionId,
                { es: seasonName.trim(), en: seasonName.trim(), slug: seasonSlug.trim() },
                {
                    startDate: seasonStartDate.trim() ? seasonStartDate.trim() : null,
                    endDate: seasonEndDate.trim() ? seasonEndDate.trim() : null,
                },
                seasonDefaultRuleId.trim() ? seasonDefaultRuleId.trim() : undefined
            );

            closeAllEdits();
            await reloadCatalog();
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : "Error creando season");
        }
    };

    const onStartEditSeason = (seasonId: string) => {
        closeAllEdits();
        if (!selectedSportId || !selectedCompetitionId) return;

        const se = findSeason(selectedSportId, selectedCompetitionId, seasonId);
        if (!se) return;

        setEditSeasonId(se.id);
        setSeasonSlug(se.slug);
        setSeasonName(se.name);
        setSeasonStartDate((se.startDate ?? "") as string);
        setSeasonEndDate((se.endDate ?? "") as string);
        setSeasonDefaultRuleId((se.defaultScoringRuleId ?? "") as string);

        setSelectedSeasonId(se.id);
    };

    const onSaveEditSeason = async () => {
        if (!token || !selectedSportId || !selectedCompetitionId || !editSeasonId) return;

        try {
            await adminUpdateSeason(
                token,
                editSeasonId,
                { es: seasonName.trim(), en: seasonName.trim(), slug: seasonSlug.trim() },
                {
                    startDate: seasonStartDate.trim() ? seasonStartDate.trim() : null,
                    endDate: seasonEndDate.trim() ? seasonEndDate.trim() : null,
                },
                seasonDefaultRuleId.trim() ? seasonDefaultRuleId.trim() : undefined
            );

            closeAllEdits();
            await reloadCatalog();
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : "Error actualizando season");
        }
    };

    const onDeleteSeason = async (seasonId: string) => {
        if (!token) return;
        if (!confirm("¿Seguro que quieres borrar esta temporada?")) return;

        try {
            await adminDeleteSeason(token, seasonId);
            closeAllEdits();
            setSelectedSeasonId("");
            await reloadCatalog();
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : "Error borrando season");
        }
    };

    // -------------------------
    // Derived
    // -------------------------
    const sport = useMemo(
        () => catalog.find((s) => s.id === selectedSportId),
        [catalog, selectedSportId]
    );

    const competition = useMemo(() => {
        const s = catalog.find((x) => x.id === selectedSportId);
        return s?.competitions?.find((c) => c.id === selectedCompetitionId);
    }, [catalog, selectedSportId, selectedCompetitionId]);

    const competitions = useMemo(() => sport?.competitions ?? [], [sport]);
    const seasons = useMemo(() => competition?.seasons ?? [], [competition]);
    const rulesSeasonId = useMemo(() => {
        return (selectedSeasonId || seasons[0]?.id || "").trim();
    }, [selectedSeasonId, seasons]);

    useEffect(() => {
        if (!token) return;
        reloadRules(rulesSeasonId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, rulesSeasonId]);


    // -------------------------
    // Render
    // -------------------------
    if (!token) {
        return (
            <div className="p-6">
                <div className="text-sm text-[var(--muted)]">Cargando token...</div>
            </div>
        );
    }

    if (authError) {
        return (
            <div className="p-6 space-y-4">
                <div className="text-red-400 text-sm">{authError}</div>
                <Button variant="secondary" onClick={() => router.push(`/${locale}/dashboard`)}>
                    Ir al dashboard
                </Button>
            </div>
        );
    }

    if (!canAdmin) {
        return (
            <div className="p-6">
                <div className="text-sm text-[var(--muted)]">Validando permisos...</div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-xl font-semibold">Admin · Catálogo</div>
                    <div className="text-sm text-[var(--muted)]">
                        {user?.displayName} <Badge className="ml-2">{user?.role}</Badge>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => reloadCatalog()}>
                        Recargar
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => router.push(`/${locale}/admin`)}>
                        Volver
                    </Button>
                </div>
            </div>

            {(catalogError || rulesError) && (
                <div className="rounded-xl border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-200">
                    {catalogError ?? rulesError}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sports */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
                    <div className="font-semibold">Sports</div>

                    <div className="space-y-2">
                        <label className="text-xs text-[var(--muted)]">Seleccionar</label>
                        <select
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
                            value={selectedSportId}
                            onChange={(e) => {
                                setSelectedSportId(e.target.value);
                                setSelectedCompetitionId("");
                                setSelectedSeasonId("");
                                closeAllEdits();
                            }}
                            disabled={loadingCatalog}
                        >
                            <option value="">--</option>
                            {catalog.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name} ({s.slug})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-[var(--muted)]">Slug</label>
                        <input
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
                            value={sportSlug}
                            onChange={(e) => setSportSlug(e.target.value)}
                            placeholder="futbol"
                        />
                        <label className="text-xs text-[var(--muted)]">Nombre</label>
                        <input
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
                            value={sportName}
                            onChange={(e) => setSportName(e.target.value)}
                            placeholder="Fútbol"
                        />
                    </div>

                    <div className="flex gap-2">
                        {!editSportId ? (
                            <>
                                <Button size="sm" onClick={() => onCreateSport()} disabled={loadingCatalog}>
                                    Crear
                                </Button>
                                {selectedSportId && (
                                    <Button size="sm" variant="secondary" onClick={() => onStartEditSport(selectedSportId)}>
                                        Editar seleccionado
                                    </Button>
                                )}
                            </>
                        ) : (
                            <>
                                <Button size="sm" onClick={() => onSaveEditSport()} disabled={loadingCatalog}>
                                    Guardar
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => closeAllEdits()}>
                                    Cancelar
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => onDeleteSport(editSportId)}>
                                    Borrar
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {/* Competitions */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
                    <div className="font-semibold">Competencias</div>

                    <div className="space-y-2">
                        <label className="text-xs text-[var(--muted)]">Seleccionar</label>
                        <select
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
                            value={selectedCompetitionId}
                            onChange={(e) => {
                                setSelectedCompetitionId(e.target.value);
                                setSelectedSeasonId("");
                                closeAllEdits();
                            }}
                            disabled={loadingCatalog || !selectedSportId}
                        >
                            <option value="">--</option>
                            {competitions.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name} ({c.slug})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-[var(--muted)]">Slug</label>
                        <input
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
                            value={competitionSlug}
                            onChange={(e) => setCompetitionSlug(e.target.value)}
                            placeholder="mundial-2026"
                            disabled={!selectedSportId}
                        />
                        <label className="text-xs text-[var(--muted)]">Nombre</label>
                        <input
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
                            value={competitionName}
                            onChange={(e) => setCompetitionName(e.target.value)}
                            placeholder="Mundial 2026"
                            disabled={!selectedSportId}
                        />

                        <label className="text-xs text-[var(--muted)]">Default scoring rule</label>
                        <select
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
                            value={competitionDefaultRuleId}
                            onChange={(e) => setCompetitionDefaultRuleId(e.target.value)}
                            disabled={!selectedSportId || loadingRules}
                        >
                            <option value="">(sin default)</option>
                            {rules.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.code} · {r.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-2">
                        {!editCompetitionId ? (
                            <>
                                <Button size="sm" onClick={() => onCreateCompetition()} disabled={!selectedSportId || loadingCatalog}>
                                    Crear
                                </Button>
                                {selectedSportId && selectedCompetitionId && (
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => onStartEditCompetition(selectedSportId, selectedCompetitionId)}
                                        disabled={loadingCatalog}
                                    >
                                        Editar seleccionada
                                    </Button>
                                )}
                            </>
                        ) : (
                            <>
                                <Button size="sm" onClick={() => onSaveEditCompetition()} disabled={loadingCatalog}>
                                    Guardar
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => closeAllEdits()}>
                                    Cancelar
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => onDeleteCompetition(editCompetitionId)}>
                                    Borrar
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {/* Seasons */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
                    <div className="font-semibold">Temporadas</div>

                    <div className="space-y-2">
                        <label className="text-xs text-[var(--muted)]">Seleccionar</label>
                        <select
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
                            value={selectedSeasonId}
                            onChange={(e) => {
                                setSelectedSeasonId(e.target.value);
                                closeAllEdits();
                            }}
                            disabled={loadingCatalog || !selectedSportId || !selectedCompetitionId}
                        >
                            <option value="">--</option>
                            {seasons.map((se) => (
                                <option key={se.id} value={se.id}>
                                    {se.name} ({se.slug})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-[var(--muted)]">Slug</label>
                        <input
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
                            value={seasonSlug}
                            onChange={(e) => setSeasonSlug(e.target.value)}
                            placeholder="2026"
                            disabled={!selectedSportId || !selectedCompetitionId}
                        />
                        <label className="text-xs text-[var(--muted)]">Nombre</label>
                        <input
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
                            value={seasonName}
                            onChange={(e) => setSeasonName(e.target.value)}
                            placeholder="Temporada 2026"
                            disabled={!selectedSportId || !selectedCompetitionId}
                        />

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-[var(--muted)]">Start</label>
                                <input
                                    className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
                                    value={seasonStartDate}
                                    onChange={(e) => setSeasonStartDate(e.target.value)}
                                    placeholder="2026-01-01"
                                    disabled={!selectedSportId || !selectedCompetitionId}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-[var(--muted)]">End</label>
                                <input
                                    className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
                                    value={seasonEndDate}
                                    onChange={(e) => setSeasonEndDate(e.target.value)}
                                    placeholder="2026-12-31"
                                    disabled={!selectedSportId || !selectedCompetitionId}
                                />
                            </div>
                        </div>

                        <label className="text-xs text-[var(--muted)]">Default scoring rule</label>
                        <select
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2 text-sm"
                            value={seasonDefaultRuleId}
                            onChange={(e) => setSeasonDefaultRuleId(e.target.value)}
                            disabled={!selectedSportId || !selectedCompetitionId || loadingRules}
                        >
                            <option value="">(sin default)</option>
                            {rules.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.code} · {r.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-2">
                        {!editSeasonId ? (
                            <>
                                <Button
                                    size="sm"
                                    onClick={() => onCreateSeason()}
                                    disabled={!selectedSportId || !selectedCompetitionId || loadingCatalog}
                                >
                                    Crear
                                </Button>
                                {selectedSeasonId && (
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => onStartEditSeason(selectedSeasonId)}
                                        disabled={loadingCatalog}
                                    >
                                        Editar seleccionada
                                    </Button>
                                )}
                            </>
                        ) : (
                            <>
                                <Button size="sm" onClick={() => onSaveEditSeason()} disabled={loadingCatalog}>
                                    Guardar
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => closeAllEdits()}>
                                    Cancelar
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => onDeleteSeason(editSeasonId)}>
                                    Borrar
                                </Button>
                            </>
                        )}
                    </div>

                    {/* listado actual */}
                    {seasons.length > 0 && (
                        <div className="mt-4 space-y-2">
                            <div className="text-xs text-[var(--muted)]">Listado</div>
                            <div className="space-y-2">
                                {seasons.map((se) => (
                                    <button
                                        key={se.id}
                                        className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-3 hover:bg-[var(--muted)]/40 transition"
                                        onClick={() => {
                                            closeAllEdits();
                                            onStartEditSeason(se.id);
                                        }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="font-medium">{se.name}</div>
                                            {!!se.defaultScoringRuleId && (
                                                <Badge className="text-xs">
                                                    rule: {se.defaultScoringRuleId}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="text-xs text-[var(--muted)] font-mono">{se.id}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="text-xs text-[var(--muted)]">
                {loadingCatalog ? "Cargando catálogo..." : "OK"}
                {loadingRules ? " · Cargando reglas..." : ""}
            </div>
        </div>
    );
}