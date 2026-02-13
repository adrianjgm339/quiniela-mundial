"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { me } from "@/lib/api";

type User = {
    id: string;
    email: string;
    displayName: string;
    role: string;
    createdAt: string;
    activeSeasonId?: string | null;
    countryCode?: string;
    activeSeason?: null | {
        id: string;
        slug: string;
        name: string;
        competition: {
            id: string;
            slug: string;
            name: string;
            sport: { id: string; slug: string; name: string };
        };
    };
};

type AnyObj = Record<string, any>;

type StandingsResponse = {
    seasonId?: string;
    groups?: Array<{
        groupCode?: string;
        standings?: AnyObj[];
        isComplete?: boolean;
        confirmedMatches?: number;
        expectedMatches?: number;
    }>;
    meta?: any;
    // en caso de que tu API lo devuelva “flat”
    groupStandings?: AnyObj[];
};

type ThirdsResponse = {
    seasonId?: string;
    needsManualCut?: boolean;
    thirds?: AnyObj[];
    thirdPlaceRanking?: AnyObj[];
};

type BracketSlotsResponse = {
    seasonId?: string;
    slots?: AnyObj[]; // BracketSlot[] (include team)
    eligibleThirds?: AnyObj[]; // ThirdPlaceRanking[] (include team) solo isQualified=true
    meta?: any;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(init?.headers ?? {}),
        },
        cache: "no-store",
    });

    if (!res.ok) {
        let msg = `HTTP ${res.status}`;

        try {
            const data: any = await res.json().catch(() => null);

            if (data) {
                if (Array.isArray(data.message)) msg = data.message.join(" | ");
                else if (typeof data.message === "string") msg = data.message;
                else if (typeof data.error === "string") msg = data.error;
                else msg = JSON.stringify(data);
            } else {
                const txt = await res.text().catch(() => "");
                if (txt) msg = txt;
            }
        } catch {
            const txt = await res.text().catch(() => "");
            if (txt) msg = txt;
        }

        throw new Error(msg);
    }

    return (await res.json()) as T;
}

function safeText(v: any) {
    if (v === null || v === undefined) return "";
    return String(v);
}

function teamDisplayName(team: any, locale: string) {
    if (!team) return "";

    // soporte translations (lo típico del proyecto)
    const tr =
        team.translations?.find((t: any) => t?.locale === locale) ??
        team.translations?.find((t: any) => (t?.locale ?? "").startsWith(locale)) ??
        team.translations?.[0];

    return (
        tr?.name ??
        team.name ??
        team.displayName ??
        team.shortName ??
        team.code ??
        team.slug ??
        ""
    );
}

function pickTeamName(team: any, locale: string) {
    if (!team) return "";

    // Si tu Team tiene translations (muy probable en este proyecto)
    const tr =
        team.translations?.find((t: any) => t?.locale === locale) ??
        team.translations?.[0];

    return (
        tr?.name ??
        team.name ??
        team.displayName ??
        team.shortName ??
        team.code ??
        team.slug ??
        ""
    );
}

export default function AdminGroupsPage() {
    const router = useRouter();
    const { locale } = useParams<{ locale: string }>();

    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [lastOk, setLastOk] = useState<string | null>(null);

    const [standingsRaw, setStandingsRaw] = useState<StandingsResponse | null>(null);
    const [thirdsRaw, setThirdsRaw] = useState<ThirdsResponse | null>(null);
    const [bracketRaw, setBracketRaw] = useState<BracketSlotsResponse | null>(null);

    const features = useMemo(() => {
        const m =
            (standingsRaw as any)?.meta ??
            (thirdsRaw as any)?.meta ??
            (bracketRaw as any)?.meta ??
            null;

        // Future-proof: por defecto NO mostramos features “especiales”
        // a menos que el back las habilite explícitamente.
        return {
            sportSlug: m?.sportSlug ?? null,
            groupRankingMode: m?.groupRankingMode ?? null,
            thirdPlacesEnabled: m?.thirdPlacesEnabled === true,
            bracketR32Enabled: m?.bracketR32Enabled === true,
        };
    }, [standingsRaw, thirdsRaw, bracketRaw]);

    const thirdsEnabled = features.thirdPlacesEnabled;
    const bracketEnabled = features.bracketR32Enabled;

    const isWbc = String(features.groupRankingMode ?? "").toUpperCase() === "WBC";

    const fmtPct = (n: number) => {
        if (!Number.isFinite(n)) return "0.000";
        return n.toFixed(3);
    };

    // En WBC usamos won/lost + carreras (reusamos gf/ga) y calculamos W%
    const winPct = (r: any) => {
        const w = Number(r?.won ?? 0);
        const l = Number(r?.lost ?? 0);
        const den = w + l;
        return den > 0 ? w / den : 0;
    };

    const columns = useMemo(() => {
        if (isWbc) {
            return [
                { key: "played", label: "PJ", width: 56, align: "left" as const },
                { key: "won", label: "W", width: 56, align: "left" as const },
                { key: "lost", label: "L", width: 56, align: "left" as const },
                { key: "gf", label: "RS", width: 62, align: "left" as const }, // runs scored
                { key: "ga", label: "RA", width: 62, align: "left" as const }, // runs allowed
                { key: "winPct", label: "W%", width: 70, align: "left" as const },
            ];
        }

        // FIFA default (actual)
        return [
            { key: "played", label: "PJ", width: 56, align: "left" as const },
            { key: "won", label: "G", width: 56, align: "left" as const },
            { key: "drawn", label: "E", width: 56, align: "left" as const },
            { key: "lost", label: "P", width: 56, align: "left" as const },
            { key: "gf", label: "GF", width: 62, align: "left" as const },
            { key: "ga", label: "GC", width: 62, align: "left" as const },
            { key: "gd", label: "DG", width: 62, align: "left" as const },
            { key: "points", label: "Pts", width: 62, align: "left" as const },
        ];
    }, [isWbc]);

    // --- Manual overrides UI state ---
    const [openManualGroup, setOpenManualGroup] = useState<string | null>(null);
    const [manualGroupText, setManualGroupText] = useState<string>("");
    const [manualGroupReason, setManualGroupReason] = useState<string>("");
    const [manualGroupRows, setManualGroupRows] = useState<any[]>([]);

    const [openManualThirds, setOpenManualThirds] = useState<boolean>(false);
    const [manualThirdsSelected, setManualThirdsSelected] = useState<Record<string, boolean>>({});
    const [manualThirdsText, setManualThirdsText] = useState<string>("");
    const [manualThirdsReason, setManualThirdsReason] = useState<string>("");

    // ✅ UI Filter tipo "segmentación" (A-L) - multi-select
    const [groupFilterSet, setGroupFilterSet] = useState<Set<string>>(new Set()); // vacío = ALL

    // --- Bracket Slots UI state (Paso 6) ---
    const [bracketReason, setBracketReason] = useState<string>("");
    const [bracketPickByKey, setBracketPickByKey] = useState<Record<string, string>>({});

    const groups = useMemo(() => {
        // Caso A: API devuelve { groups: [{ groupCode, standings: [...] }] }
        if (standingsRaw?.groups?.length) return standingsRaw.groups as any[];

        // Caso B: API devuelve flat { groupStandings: [...] } → agrupamos por groupCode
        const flat = standingsRaw?.groupStandings;
        if (Array.isArray(flat) && flat.length) {
            const map = new Map<string, AnyObj[]>();
            for (const row of flat) {
                const gc = safeText(row.groupCode ?? row.group ?? row.group_code ?? "??");
                if (!map.has(gc)) map.set(gc, []);
                map.get(gc)!.push(row);
            }
            return Array.from(map.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([groupCode, standings]) => ({
                    groupCode,
                    standings,
                    // defaults defensivos si el API viene flat
                    isComplete: false,
                    confirmedMatches: 0,
                }));
        }

        return [];
    }, [standingsRaw]);

    const groupCodes = useMemo(() => {
        const codes = (groups ?? [])
            .map((g: any) => String(g.groupCode ?? "").trim())
            .filter(Boolean);

        return Array.from(new Set(codes)).sort((a, b) => a.localeCompare(b));
    }, [groups]);

    const visibleGroups = useMemo(() => {
        if (!groupFilterSet || groupFilterSet.size === 0) return groups ?? [];
        return (groups ?? []).filter((g: any) => groupFilterSet.has(String(g.groupCode ?? "")));
    }, [groups, groupFilterSet]);

    const closeInfo = useMemo(() => {
        const raw = (standingsRaw?.groups ?? []) as any[];

        const f = (standingsRaw as any)?.meta ?? null;
        if (f?.groupsClosed) return { canClose: false, msg: "Fase de grupos ya está cerrada." };

        if (!raw.length) return { canClose: false, msg: "Aún no hay grupos cargados." };

        const incomplete = raw
            .filter((g: any) => !g.isComplete)
            .map((g: any) => `${g.groupCode}(${g.confirmedMatches ?? 0}/${g.expectedMatches ?? 6})`);

        if (incomplete.length === 0) return { canClose: true, msg: "Todos los grupos completos." };

        return {
            canClose: false,
            msg: `No puedes cerrar: grupos incompletos: ${incomplete.join(", ")}`,
        };
    }, [standingsRaw]);

    const thirds = useMemo(() => {
        if (Array.isArray(thirdsRaw?.thirds)) return thirdsRaw!.thirds!;
        if (Array.isArray(thirdsRaw?.thirdPlaceRanking)) return thirdsRaw!.thirdPlaceRanking!;
        return [];
    }, [thirdsRaw]);

    const thirdsCutTieSet = useMemo(() => {
        const rows = (thirds ?? []).map((r: any) => ({
            teamId: safeText(r.teamId),
            points: Number(r.points ?? 0),
            gd: Number(r.gd ?? 0),
            gf: Number(r.gf ?? 0),
        }));

        if (rows.length < 9) return new Set<string>();

        const key = (x: any) => `${x.points}|${x.gd}|${x.gf}`;
        const map = new Map<string, { min: number; max: number; ids: Set<string> }>();

        rows.forEach((r, idx) => {
            const k = key(r);
            const cur = map.get(k) ?? { min: idx, max: idx, ids: new Set<string>() };
            cur.min = Math.min(cur.min, idx);
            cur.max = Math.max(cur.max, idx);
            cur.ids.add(r.teamId);
            map.set(k, cur);
        });

        for (const cur of map.values()) {
            if (cur.min <= 7 && cur.max >= 8) return cur.ids;
        }
        return new Set<string>();
    }, [thirds]);

    const isGroupStageComplete = useMemo(() => {
        const raw = (standingsRaw?.groups ?? []) as any[];
        return raw.length > 0 && raw.every((g: any) => !!g.isComplete);
    }, [standingsRaw]);

    const qualifiedThirdIds = useMemo(() => {
        const set = new Set<string>();
        for (const r of thirds as any[]) {
            if (r?.isQualified) {
                const id = String(r.teamId ?? "");
                if (id) set.add(id);
            }
        }
        return set;
    }, [thirds]);

    // --- Bracket slots derived ---
    const bracketSlots = useMemo(() => {
        return Array.isArray(bracketRaw?.slots) ? bracketRaw!.slots! : [];
    }, [bracketRaw]);

    const eligibleThirds = useMemo(() => {
        return Array.isArray(bracketRaw?.eligibleThirds) ? bracketRaw!.eligibleThirds! : [];
    }, [bracketRaw]);

    const bracketUsedTeamIds = useMemo(() => {
        const used = new Set<string>();
        for (const s of bracketSlots) {
            if (s?.teamId) used.add(String(s.teamId));
        }
        return used;
    }, [bracketSlots]);

    async function loadAll(tok: string) {
        setError(null);
        setLastOk(null);
        setLoading(true);

        try {
            const [s, t] = await Promise.all([
                apiFetch<StandingsResponse>(`/admin/groups/standings`, tok),
                apiFetch<ThirdsResponse>(`/admin/groups/thirds`, tok),
            ]);

            setStandingsRaw(s);
            setThirdsRaw(t);

            const seasonId = s?.seasonId ?? t?.seasonId ?? user?.activeSeasonId ?? "";

            // Importante: bracket NO debe tumbar toda la carga si falla.
            // Además, si el back indica bracket deshabilitado (ej: béisbol), no lo pedimos.
            const f = (s as any)?.meta ?? (t as any)?.meta ?? null;
            const bracketOk = f?.bracketR32Enabled !== false;

            if (seasonId && bracketOk) {
                try {
                    const b = await apiFetch<BracketSlotsResponse>(
                        `/admin/groups/bracket-slots?seasonId=${encodeURIComponent(seasonId)}`,
                        tok
                    );
                    setBracketRaw(b);
                } catch {
                    setBracketRaw(null);
                }
            } else {
                setBracketRaw(null);
            }

            setLastOk("Datos cargados.");
        } catch (e: any) {
            setError(e?.message ?? "Error cargando datos");
        } finally {
            setLoading(false);
        }
    }

    async function closeGroups() {
        if (!token) return;
        setBusy("Cerrando fase de grupos...");
        setError(null);
        setLastOk(null);

        try {
            const seasonId = standingsRaw?.seasonId ?? thirdsRaw?.seasonId ?? user?.activeSeasonId ?? "";
            if (!seasonId) {
                alert("No se pudo detectar seasonId.");
                return;
            }

            await apiFetch(`/admin/groups/close?seasonId=${encodeURIComponent(seasonId)}`, token, {
                method: "POST",
                body: JSON.stringify({}),
            });
            setLastOk("Fase de grupos cerrada. Re-cargando datos...");
            await loadAll(token);
        } catch (e: any) {
            setError(e?.message ?? "Error cerrando fase de grupos");
        } finally {
            setBusy(null);
        }
    }

    async function resolveKoPlaceholders() {
        if (!token) return;

        const seasonId = standingsRaw?.seasonId ?? thirdsRaw?.seasonId ?? user?.activeSeasonId ?? "";
        if (!seasonId) {
            alert("No se pudo detectar seasonId.");
            return;
        }

        setBusy("Reaplicando placeholders KO...");
        setError(null);
        setLastOk(null);

        try {
            await apiFetch(
                `/admin/groups/resolve-ko-placeholders?seasonId=${encodeURIComponent(seasonId)}`,
                token,
                { method: "POST", body: JSON.stringify({}) }
            );
            setLastOk("Placeholders KO reaplicados. Re-cargando datos...");
            await loadAll(token);
        } catch (e: any) {
            setError(e?.message ?? "Error reaplicando placeholders KO");
        } finally {
            setBusy(null);
        }
    }

    async function applyBracketSlot(matchNo: number, slot: "HOME" | "AWAY", teamId: string | null) {
        if (!token) return;

        const seasonId = standingsRaw?.seasonId ?? thirdsRaw?.seasonId ?? user?.activeSeasonId ?? "";
        if (!seasonId) {
            alert("No se pudo detectar seasonId.");
            return;
        }

        setBusy("Guardando slot del bracket...");
        setError(null);
        setLastOk(null);

        try {
            await apiFetch(`/admin/groups/bracket-slots/manual`, token, {
                method: "PATCH",
                body: JSON.stringify({
                    seasonId,
                    matchNo,
                    slot,
                    teamId,
                    reason: bracketReason?.trim() || undefined,
                }),
            });

            setLastOk("Slot actualizado.");
            await loadAll(token);
        } catch (e: any) {
            setError(e?.message ?? "Error guardando slot");
        } finally {
            setBusy(null);
        }
    }

    function parseIds(input: string): string[] {
        return input
            .split(/[\n, ]+/g)
            .map((x) => x.trim())
            .filter(Boolean);
    }

    async function applyManualGroupOrder(groupCode: string) {
        if (!token) return;

        const seasonId = standingsRaw?.seasonId ?? user?.activeSeasonId ?? "";
        const orderedTeamIds = parseIds(manualGroupText);

        if (!seasonId) {
            alert("No se pudo detectar seasonId.");
            return;
        }
        const expectedCount = manualGroupRows.length || 4; // fallback para no romper si algo raro pasa

        if (orderedTeamIds.length !== expectedCount) {
            alert(`Debes pegar exactamente ${expectedCount} IDs (uno por línea) en el orden final 1→${expectedCount}.`);
            return;
        }

        setBusy(`Aplicando orden manual en grupo ${groupCode}...`);
        setError(null);
        setLastOk(null);

        try {
            await apiFetch(`/admin/groups/standings/manual`, token, {
                method: "PATCH",
                body: JSON.stringify({
                    seasonId,
                    groupCode,
                    orderedTeamIds,
                    reason: manualGroupReason || "Manual group order",
                }),
            });

            setLastOk(`Manual aplicado en grupo ${groupCode}. Re-cargando datos...`);
            setOpenManualGroup(null);
            setManualGroupText("");
            setManualGroupReason("");
            await loadAll(token);
        } catch (e: any) {
            setError(e?.message ?? "Error aplicando manual del grupo");
        } finally {
            setBusy(null);
        }
    }

    async function applyManualThirds(qualifiedTeamIdsOverride?: string[]) {
        if (!token) return;

        const seasonId = thirdsRaw?.seasonId ?? standingsRaw?.seasonId ?? user?.activeSeasonId ?? "";
        const qualifiedTeamIds =
            qualifiedTeamIdsOverride && qualifiedTeamIdsOverride.length ? qualifiedTeamIdsOverride : parseIds(manualThirdsText);

        if (!seasonId) {
            alert("No se pudo detectar seasonId.");
            return;
        }
        if (qualifiedTeamIds.length !== 8) {
            alert(`Debes colocar exactamente 8 teamIds (los terceros clasificados). Actualmente: ${qualifiedTeamIds.length}`);
            return;
        }

        setBusy("Aplicando terceros manuales...");
        setError(null);
        setLastOk(null);

        try {
            await apiFetch(`/admin/groups/thirds/manual`, token, {
                method: "PATCH",
                body: JSON.stringify({
                    seasonId,
                    qualifiedTeamIds,
                    reason: manualThirdsReason || "Manual third-place cut",
                }),
            });

            setLastOk("Manual aplicado en terceros. Re-cargando datos...");
            setOpenManualThirds(false);
            setManualThirdsSelected({});
            setManualThirdsText("");
            setManualThirdsReason("");
            await loadAll(token);
        } catch (e: any) {
            setError(e?.message ?? "Error aplicando manual de terceros");
        } finally {
            setBusy(null);
        }
    }

    useEffect(() => {
        const tok = localStorage.getItem("token");
        if (!tok) {
            router.replace(`/${locale}/login`);
            return;
        }
        setToken(tok);

        me(tok, locale)
            .then((u: User) => {
                if (u?.role !== "ADMIN") {
                    router.replace(`/${locale}/dashboard`);
                    return;
                }
                setUser(u);
                if (u?.countryCode) localStorage.setItem("countryCode", u.countryCode);
                loadAll(tok);
            })
            .catch((err) => {
                setError(err?.message ?? "Error");
                localStorage.removeItem("token");
                router.replace(`/${locale}/login`);
            });
    }, [router, locale]);

    // ✅ “Editar manual” aunque needsManualCut=false (modo UX extra)
    const canEditThirdsManual = isGroupStageComplete && (thirds?.length ?? 0) > 0;

    // --- TERCEROS: lógica de corte manual (FIJOS vs EMPATE) ---
    const thirdsCutMeta = useMemo(() => {
        const list = (thirds ?? []) as any[];

        if (list.length === 0) {
            return {
                needs: false,
                cutoffKey: "",
                lockedIds: new Set<string>(),
                tieIds: new Set<string>(),
                slotsLeft: 8,
            };
        }

        const key = (x: any) => `${safeText(x?.points)}|${safeText(x?.gd)}|${safeText(x?.gf)}`;

        const map = new Map<string, { min: number; max: number; ids: Set<string> }>();
        list.forEach((x, idx) => {
            const k = key(x);
            const cur = map.get(k) ?? { min: idx, max: idx, ids: new Set<string>() };
            cur.min = Math.min(cur.min, idx);
            cur.max = Math.max(cur.max, idx);
            const id = safeText(x?.teamId);
            if (id) cur.ids.add(id);
            map.set(k, cur);
        });

        let cutoffKey = "";
        let tieMeta: { min: number; max: number; ids: Set<string> } | null = null;

        for (const [k, cur] of map.entries()) {
            if (cur.min <= 7 && cur.max >= 8) {
                cutoffKey = k;
                tieMeta = cur;
                break;
            }
        }

        if (!tieMeta) {
            return {
                needs: false,
                cutoffKey: "",
                lockedIds: new Set<string>(),
                tieIds: new Set<string>(),
                slotsLeft: 8,
            };
        }

        const firstTieIdx = tieMeta.min;

        const lockedIds = new Set<string>();
        for (let i = 0; i < firstTieIdx; i++) {
            const id = safeText(list[i]?.teamId);
            if (id) lockedIds.add(id);
        }

        const tieIds = new Set<string>(tieMeta.ids);
        const slotsLeft = Math.max(0, 8 - lockedIds.size);

        return { needs: true, cutoffKey, lockedIds, tieIds, slotsLeft };
    }, [thirds]);

    const selectedThirdsCount = useMemo(() => Object.values(manualThirdsSelected).filter(Boolean).length, [manualThirdsSelected]);

    const selectedTieCount = useMemo(() => {
        if (!thirdsCutMeta.needs) return 0;
        return Object.entries(manualThirdsSelected).filter(([id, v]) => v && thirdsCutMeta.tieIds.has(id)).length;
    }, [manualThirdsSelected, thirdsCutMeta]);

    const maxThirdsReached = useMemo(() => {
        if (!thirdsCutMeta.needs) return selectedThirdsCount >= 8;
        return selectedTieCount >= thirdsCutMeta.slotsLeft;
    }, [thirdsCutMeta.needs, selectedThirdsCount, selectedTieCount, thirdsCutMeta.slotsLeft]);

    const lockedOk = useMemo(() => {
        if (!thirdsCutMeta.needs) return true;
        for (const id of thirdsCutMeta.lockedIds) {
            if (!manualThirdsSelected[id]) return false;
        }
        return true;
    }, [manualThirdsSelected, thirdsCutMeta]);

    const thirdsSelectionValid = useMemo(() => {
        if (!thirdsCutMeta.needs) return selectedThirdsCount === 8;
        return lockedOk && selectedThirdsCount === 8 && selectedTieCount === thirdsCutMeta.slotsLeft;
    }, [thirdsCutMeta.needs, lockedOk, selectedThirdsCount, selectedTieCount, thirdsCutMeta.slotsLeft]);

    return (
        <div style={{ maxWidth: 980, margin: "40px auto", padding: 16, paddingRight: 36 }}>
            {/* Leyenda de colores (sticky) */}
            <div
                style={{
                    position: "sticky",
                    top: 10,
                    zIndex: 30,
                    marginTop: 14,
                    marginBottom: 12,
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(0,0,0,0.55)",
                    backdropFilter: "blur(6px)",
                }}
            >
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Clasificados o candidatos a clasificar</div>

                <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                            style={{
                                width: 22,
                                height: 14,
                                borderRadius: 4,
                                background: "rgba(16,185,129,0.22)",
                                border: "1px solid rgba(16,185,129,0.35)",
                            }}
                        />
                        <div style={{ fontSize: 13, opacity: 0.9 }}>
                            <b>Verde</b>: Clasifica directo (1º y 2º del grupo)
                        </div>
                    </div>

                    {thirdsEnabled && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                                style={{
                                    width: 22,
                                    height: 14,
                                    borderRadius: 4,
                                    background: "rgba(250,204,21,0.22)",
                                    border: "1px solid rgba(250,204,21,0.35)",
                                }}
                            />
                            <div style={{ fontSize: 13, opacity: 0.9 }}>
                                <b>Amarillo</b>: 3º puesto candidato a clasificar (top 8 mejores terceros)
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Admin · Fase de Grupos</h1>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>{user?.activeSeason?.name ?? "Evento activo: (no seleccionado)"}</div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <Link href={`/${locale}/admin`} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700">
                        Volver a Admin
                    </Link>

                    <button
                        type="button"
                        onClick={() => token && loadAll(token)}
                        disabled={!token || loading || !!busy}
                        className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60"
                    >
                        Refrescar
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            if (!closeInfo.canClose) {
                                alert(closeInfo.msg);
                                return;
                            }
                            if (
                                confirm(
                                    `¿Cerrar fase de grupos? Esto generará standings finales` +
                                    (thirdsEnabled ? " + ranking de terceros" : "") +
                                    (bracketEnabled ? " + bracket/slots" : "") +
                                    "."
                                )
                            ) {
                                closeGroups();
                            }
                        }}
                        disabled={!token || loading || !!busy || !closeInfo.canClose}
                        className="px-3 py-2 rounded-lg bg-red-900 hover:bg-red-800 disabled:opacity-60"
                    >
                        Cerrar fase de grupos
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            if (!confirm("¿Reaplicar placeholders KO? Esto intentará resolver equipos en fases KO usando standings actuales.")) return;
                            resolveKoPlaceholders();
                        }}
                        disabled={!token || loading || !!busy}
                        className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60"
                    >
                        Reaplicar placeholders KO
                    </button>

                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>{closeInfo.msg}</div>
                </div>
            </div>

            {(loading || busy) && <div style={{ marginTop: 14, opacity: 0.8 }}>{busy ?? "Cargando..."}</div>}

            {error && (
                <div style={{ marginTop: 16, background: "#ffe5e5", color: "#000", padding: 10, borderRadius: 8 }}>
                    {error}
                </div>
            )}

            {lastOk && !error && (
                <div style={{ marginTop: 16, background: "#e7ffe5", color: "#000", padding: 10, borderRadius: 8 }}>
                    {lastOk}
                </div>
            )}

            {/* STANDINGS */}
            <div
                style={{
                    marginTop: 18,
                    padding: 12,
                    paddingLeft: 16,
                    paddingRight: 16,
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    overflowX: "hidden",
                    overflowY: "visible",
                    boxSizing: "border-box",
                }}
            >
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Standings por Grupo</h2>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>seasonId: {standingsRaw?.seasonId ?? user?.activeSeasonId ?? "(?)"}</div>
                </div>

                {groups.length === 0 && !loading && (
                    <div style={{ marginTop: 10, opacity: 0.8 }}>
                        No hay standings para mostrar (¿ya hay resultados cargados? ¿ya ejecutaste “Cerrar fase de grupos”?).
                    </div>
                )}

                {/* ✅ Segmentación tipo Excel (multi-select) */}
                {groupCodes.length > 0 && (
                    <div
                        style={{
                            marginTop: 12,
                            padding: 12,
                            border: "1px solid rgba(255,255,255,0.14)",
                            borderRadius: 12,
                            background: "rgba(24,24,27,0.85)",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.9 }}>
                                Grupo <span style={{ fontWeight: 600, opacity: 0.75 }}>(multi-select)</span>
                            </div>

                            <div style={{ fontSize: 12, opacity: 0.75 }}>
                                Seleccionados: <b>{groupFilterSet.size === 0 ? "ALL" : groupFilterSet.size}</b>
                            </div>
                        </div>

                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                            <button
                                type="button"
                                onClick={() => setGroupFilterSet(new Set())}
                                style={{
                                    padding: "8px 12px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(9, 207, 85, 0.25)",
                                    background: groupFilterSet.size === 0 ? "rgba(34,197,94,0.95)" : "rgba(24,24,27,0.85)",
                                    color: "white",
                                    fontWeight: 800,
                                    fontSize: 13,
                                    lineHeight: "10px",
                                }}
                            >
                                ALL
                            </button>

                            {groupCodes.map((code) => {
                                const selected = groupFilterSet.has(code);

                                return (
                                    <button
                                        key={code}
                                        type="button"
                                        title="Click: toggle · Shift+Click: solo este"
                                        onClick={(e) => {
                                            if ((e as any).shiftKey) {
                                                setGroupFilterSet(new Set([code]));
                                                return;
                                            }

                                            setGroupFilterSet((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(code)) next.delete(code);
                                                else next.add(code);
                                                return next;
                                            });
                                        }}
                                        style={{
                                            minWidth: 40,
                                            padding: "6px 8px",
                                            borderRadius: 10,
                                            border: "1px solid rgba(9, 207, 85, 0.25)",
                                            background: selected ? "rgba(34,197,94,0.95)" : "rgba(24,24,27,0.85)",
                                            color: "white",
                                            fontWeight: 800,
                                            boxShadow: selected ? "0 0 0 2px rgba(34,197,94,0.16) inset" : "none",
                                            cursor: "pointer",
                                            fontSize: 13,
                                            lineHeight: "10px",
                                        }}
                                    >
                                        {code}
                                    </button>
                                );
                            })}

                            <button
                                type="button"
                                onClick={() => setGroupFilterSet(new Set())}
                                style={{
                                    padding: "8px 12px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(255,255,255,0.14)",
                                    background: "rgba(24,24,27,0.85)",
                                    color: "white",
                                    fontWeight: 800,
                                    marginLeft: 6,
                                    opacity: 0.9,
                                }}
                                title="Volver a ALL"
                            >
                                Limpiar
                            </button>
                        </div>

                        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                            Tip: <b>Shift+Click</b> = dejar solo 1 grupo (como Excel). Click normal = seleccionar varios.
                        </div>
                    </div>
                )}

                <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
                    {visibleGroups.map((g: any) => {
                        const groupCode = safeText(g.groupCode ?? "??");
                        const rows: AnyObj[] = Array.isArray(g.standings) ? g.standings : [];

                        const confirmed = Number(g.confirmedMatches ?? 0);
                        const expected = Number(g.expectedMatches ?? 6);

                        const isComplete = !!g.isComplete || (expected > 0 && confirmed >= expected);

                        const needsManualGroup = isComplete && rows.some((r: any) => !!r.needsManual);

                        const sorted = [...rows].sort((a, b) => {
                            const pa = a.posGroup ?? 999;
                            const pb = b.posGroup ?? 999;
                            if (pa !== pb) return pa - pb;

                            const pta = a.points ?? 0;
                            const ptb = b.points ?? 0;
                            if (ptb !== pta) return ptb - pta;

                            const gda = a.gd ?? 0;
                            const gdb = b.gd ?? 0;
                            if (gdb !== gda) return gdb - gda;

                            const gfa = a.gf ?? 0;
                            const gfb = b.gf ?? 0;
                            return gfb - gfa;
                        });

                        const headerRight = !isComplete
                            ? `Incompleto: ${confirmed}/${expected}`
                            : needsManualGroup
                                ? "Desempate: requiere manual"
                                : "OK";

                        return (
                            <div key={groupCode} style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                                    <div style={{ fontSize: 14, fontWeight: 700 }}>Grupo {groupCode}</div>
                                    <div style={{ fontSize: 12, opacity: 0.7, textAlign: "right", maxWidth: 320, whiteSpace: "normal" }}>{headerRight}</div>
                                </div>

                                <div
                                    style={{
                                        overflowX: "auto",
                                        marginTop: 8,
                                        paddingLeft: 10,
                                        paddingRight: 0,
                                        boxSizing: "border-box",
                                    }}
                                >
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
                                        <colgroup>
                                            {[
                                                <col key="pos" style={{ width: 52 }} />,   // Pos
                                                <col key="team" style={{ width: 260 }} />, // Equipo
                                                ...columns.map((c) => <col key={c.key} style={{ width: c.width }} />),
                                                <col key="manual" style={{ width: 60 }} />, // Manual (Adrián: puse 60 pero podría ser variable según el contenido, quizás auto con un max-width?)
                                                <col key="gutter" style={{ width: 18 }} />,  // gutter derecho real
                                            ]}
                                        </colgroup>
                                        <thead>
                                            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
                                                <th style={{ padding: "6px 8px" }}>Pos</th>
                                                <th style={{ padding: "6px 8px" }}>Equipo</th>
                                                {columns.map((c) => (
                                                    <th key={c.key} style={{ padding: "6px 8px" }}>
                                                        {c.label}
                                                    </th>
                                                ))}
                                                <th style={{ padding: "6px 8px" }}>Manual</th>
                                                <th style={{ padding: "6px 0" }} />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sorted.map((r, idx) => {
                                                const teamName =
                                                    r.team?.name ?? r.teamName ?? r.team?.displayName ?? r.name ?? safeText(r.teamId ?? r.team_id ?? "Equipo");

                                                const pos = Number(r.posGroup ?? idx + 1);
                                                const tid = safeText(r.teamId ?? "");

                                                const isQualifiedDirect = isGroupStageComplete && (pos === 1 || pos === 2);
                                                const isQualifiedAsThird = thirdsEnabled && isGroupStageComplete && pos === 3 && tid && qualifiedThirdIds.has(tid);

                                                const rowBg = isQualifiedDirect
                                                    ? "rgba(16,185,129,0.12)"
                                                    : isQualifiedAsThird
                                                        ? "rgba(250,204,21,0.14)"
                                                        : undefined;

                                                return (
                                                    <tr
                                                        key={safeText(r.teamId ?? idx)}
                                                        style={{
                                                            borderBottom: "1px solid rgba(255,255,255,0.08)",
                                                        }}
                                                    >
                                                        <td style={{ padding: "6px 8px", background: rowBg }}>{safeText(r.posGroup ?? idx + 1)}</td>
                                                        <td style={{ padding: "6px 8px", fontWeight: 600, background: rowBg }}>{teamName}</td>
                                                        {columns.map((c) => {
                                                            const val =
                                                                c.key === "winPct"
                                                                    ? fmtPct(winPct(r))
                                                                    : c.key === "played"
                                                                        ? (r.played ?? r.pj ?? "")
                                                                        : (r as any)[c.key];

                                                            return (
                                                                <td key={c.key} style={{ padding: "6px 8px", background: rowBg }}>
                                                                    {safeText(val ?? "")}
                                                                </td>
                                                            );
                                                        })}
                                                        <td
                                                            style={{
                                                                padding: "6px 8px",
                                                                fontSize: 12,
                                                                background: rowBg,
                                                                whiteSpace: "nowrap",
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                            }}
                                                        >
                                                            <span style={{ opacity: 0.8 }}>{r.manualOverride ? "override" : ""}</span>
                                                            {r.manualReason ? ` · ${safeText(r.manualReason)}` : ""}
                                                        </td>

                                                        <td style={{ padding: 0 }} />
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {needsManualGroup && (
                                    <div style={{ marginTop: 10, padding: 10, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10 }}>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                            <div style={{ fontSize: 13, fontWeight: 700, flex: "1 1 auto", minWidth: 0, whiteSpace: "normal" }}>
                                                Desempate manual requerido (Grupo {groupCode})
                                            </div>

                                            <button
                                                type="button"
                                                style={{ flexShrink: 0 }}
                                                className={
                                                    openManualGroup === groupCode
                                                        ? "px-3 py-2 rounded-lg bg-red-700 hover:bg-red-600"
                                                        : "px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600"
                                                }
                                                onClick={() => {
                                                    const willOpen = openManualGroup !== groupCode;

                                                    if (willOpen) {
                                                        const rowsSnap = [...sorted].map((x: any) => ({
                                                            teamId: safeText(x.teamId),
                                                            name: safeText(x.name ?? x.team?.name ?? x.teamName ?? "Equipo"),
                                                            needsManual: !!x.needsManual,
                                                        }));

                                                        setOpenManualGroup(groupCode);
                                                        setManualGroupRows(rowsSnap);
                                                        setManualGroupText(rowsSnap.map((x) => x.teamId).join("\n"));
                                                        setManualGroupReason("Campo informativo para indicar criterio de desempate");
                                                    } else {
                                                        setOpenManualGroup(null);
                                                        setManualGroupRows([]);
                                                        setManualGroupText("");
                                                        setManualGroupReason("");
                                                    }
                                                }}
                                            >
                                                {openManualGroup === groupCode ? "Cerrar" : "Abrir manual"}
                                            </button>
                                        </div>

                                        {openManualGroup === groupCode && (
                                            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                                                <div style={{ fontSize: 12, opacity: 0.8 }}>Reordena con las flechas el orden final (1→4). Luego aplica.</div>

                                                <div style={{ display: "grid", gap: 8 }}>
                                                    {manualGroupRows.map((row: any, i: number) => {
                                                        const label = safeText(row.name || "Equipo");

                                                        const canMove = !!row.needsManual;
                                                        const prev = i > 0 ? manualGroupRows[i - 1] : null;
                                                        const next = i < manualGroupRows.length - 1 ? manualGroupRows[i + 1] : null;

                                                        const upDisabled = i === 0 || !canMove || !prev?.needsManual;
                                                        const downDisabled = i === manualGroupRows.length - 1 || !canMove || !next?.needsManual;

                                                        return (
                                                            <div
                                                                key={row.teamId || i}
                                                                style={{
                                                                    display: "grid",
                                                                    gridTemplateColumns: "44px 1fr 110px",
                                                                    gap: 10,
                                                                    alignItems: "center",
                                                                    padding: "10px 12px",
                                                                    borderRadius: 10,
                                                                    border: "1px solid rgba(255,255,255,0.12)",
                                                                    background: canMove ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.04)",
                                                                    opacity: canMove ? 1 : 0.85,
                                                                }}
                                                            >
                                                                <div style={{ fontWeight: 900, opacity: 0.9 }}>#{i + 1}</div>

                                                                <div style={{ fontWeight: 800, fontSize: 16, display: "flex", gap: 8, alignItems: "center" }}>
                                                                    <span>{label}</span>
                                                                    <span
                                                                        style={{
                                                                            fontSize: 11,
                                                                            padding: "2px 8px",
                                                                            borderRadius: 999,
                                                                            border: "1px solid rgba(255,255,255,0.14)",
                                                                            opacity: 0.85,
                                                                        }}
                                                                    >
                                                                        {canMove ? "EMPATE" : "FIJO"}
                                                                    </span>
                                                                </div>

                                                                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                                                    <button
                                                                        type="button"
                                                                        className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60"
                                                                        disabled={upDisabled}
                                                                        onClick={() => {
                                                                            setManualGroupRows((prevRows) => {
                                                                                const copy = [...prevRows];
                                                                                if (i === 0) return prevRows;
                                                                                if (!copy[i]?.needsManual || !copy[i - 1]?.needsManual) return prevRows;

                                                                                const tmp = copy[i - 1];
                                                                                copy[i - 1] = copy[i];
                                                                                copy[i] = tmp;

                                                                                setManualGroupText(copy.map((x) => x.teamId).join("\n"));
                                                                                return copy;
                                                                            });
                                                                        }}
                                                                    >
                                                                        ↑
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60"
                                                                        disabled={downDisabled}
                                                                        onClick={() => {
                                                                            setManualGroupRows((prevRows) => {
                                                                                const copy = [...prevRows];
                                                                                if (i === copy.length - 1) return prevRows;
                                                                                if (!copy[i]?.needsManual || !copy[i + 1]?.needsManual) return prevRows;

                                                                                const tmp = copy[i + 1];
                                                                                copy[i + 1] = copy[i];
                                                                                copy[i] = tmp;

                                                                                setManualGroupText(copy.map((x) => x.teamId).join("\n"));
                                                                                return copy;
                                                                            });
                                                                        }}
                                                                    >
                                                                        ↓
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                <input
                                                    value={manualGroupReason}
                                                    onChange={(e) => setManualGroupReason(e.target.value)}
                                                    placeholder="Campo informativo para indicar criterio de desempate"
                                                    className="px-3 py-2 rounded-lg bg-zinc-800"
                                                />

                                                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                                    <button
                                                        type="button"
                                                        className="px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-60"
                                                        disabled={!token || loading || !!busy}
                                                        onClick={() => applyManualGroupOrder(groupCode)}
                                                    >
                                                        Aplicar manual (Grupo {groupCode})
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
                                                        onClick={() => {
                                                            setOpenManualGroup(null);
                                                            setManualGroupRows([]);
                                                            setManualGroupText("");
                                                            setManualGroupReason("");
                                                        }}
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {thirdsEnabled && (
                <>
                    {/* THIRDS */}
                    <div style={{ marginTop: 18, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Ranking global de terceros</h2>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>needsManualCut: {thirdsRaw?.needsManualCut ? "TRUE" : "false"}</div>
                        </div>

                        {thirds.length === 0 && !loading && (
                            <div style={{ marginTop: 10, opacity: 0.8 }}>No hay terceros para mostrar (¿ya ejecutaste “Cerrar fase de grupos”?).</div>
                        )}

                        <div style={{ overflowX: "auto", marginTop: 10 }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                    <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
                                        <th style={{ padding: "6px 8px" }}>Rank</th>
                                        <th style={{ padding: "6px 8px" }}>Equipo</th>
                                        <th style={{ padding: "6px 8px" }}>Pts</th>
                                        <th style={{ padding: "6px 8px" }}>DG</th>
                                        <th style={{ padding: "6px 8px" }}>GF</th>
                                        <th className="py-2 text-center" style={{ width: 110 }}>
                                            Clasifica
                                        </th>
                                        <th style={{ padding: "6px 8px" }}>Manual</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {thirds.map((r: any, idx: number) => {
                                        const teamName = r.team?.name ?? r.teamName ?? r.team?.displayName ?? r.name ?? safeText(r.teamId ?? "Equipo");

                                        return (
                                            <tr key={safeText(r.teamId ?? idx)} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                                <td style={{ padding: "6px 8px" }}>{safeText(r.rankGlobal ?? r.rank ?? idx + 1)}</td>
                                                <td style={{ padding: "6px 8px", fontWeight: 600 }}>{teamName}</td>
                                                <td style={{ padding: "6px 8px" }}>{safeText(r.points ?? "")}</td>
                                                <td style={{ padding: "6px 8px" }}>{safeText(r.gd ?? "")}</td>
                                                <td style={{ padding: "6px 8px" }}>{safeText(r.gf ?? "")}</td>

                                                <td className="py-2 text-center" style={{ width: 110, verticalAlign: "middle" }}>
                                                    <span style={{ fontSize: 15, lineHeight: "18px", display: "inline-block" }}>{r.isQualified ? "✅" : "❌"}</span>
                                                </td>

                                                <td style={{ padding: "6px 8px", fontSize: 12, opacity: 0.8 }}>
                                                    {thirdsCutTieSet.has(safeText(r.teamId)) && r.manualOverride ? "override" : ""}
                                                    {thirdsCutTieSet.has(safeText(r.teamId)) && r.manualReason ? ` · ${safeText(r.manualReason)}` : ""}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Manual thirds editor */}
                        {canEditThirdsManual && (
                            <div style={{ marginTop: 10, padding: 10, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                                        Corte manual Top 8 terceros{" "}
                                        {thirdsCutMeta.needs ? <span style={{ opacity: 0.8 }}>(empate en borde: requiere manual)</span> : null}
                                    </div>

                                    <button
                                        type="button"
                                        className={
                                            openManualThirds
                                                ? "px-3 py-2 rounded-lg bg-red-700 hover:bg-red-600"
                                                : "px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600"
                                        }
                                        onClick={() => {
                                            const willOpen = !openManualThirds;
                                            setOpenManualThirds(willOpen);

                                            if (willOpen) {
                                                const autoTop8 = (thirds ?? []).slice(0, 8).map((x: any) => safeText(x.teamId)).filter(Boolean);

                                                const init: Record<string, boolean> = {};
                                                for (const id of autoTop8) init[id] = true;

                                                // si hay empate, forzamos “fijos”
                                                if (thirdsCutMeta.needs) {
                                                    for (const id of thirdsCutMeta.lockedIds) init[id] = true;
                                                }

                                                setManualThirdsSelected(init);
                                                setManualThirdsText(autoTop8.join("\n"));
                                                setManualThirdsReason("Campo informativo para indicar criterio de desempate");
                                            } else {
                                                setManualThirdsSelected({});
                                                setManualThirdsText("");
                                                setManualThirdsReason("");
                                            }
                                        }}
                                    >
                                        {openManualThirds ? "Cerrar" : "Abrir manual"}
                                    </button>
                                </div>

                                {openManualThirds && (
                                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                            <div style={{ fontSize: 12, opacity: 0.8 }}>
                                                Seleccionados:{" "}
                                                <b>
                                                    {selectedThirdsCount}/8
                                                    {thirdsCutMeta.needs ? ` (en empate: ${selectedTieCount}/${thirdsCutMeta.slotsLeft})` : ""}
                                                </b>
                                            </div>

                                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                                <button
                                                    type="button"
                                                    className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60"
                                                    onClick={() => {
                                                        const autoTop8 = (thirds ?? []).slice(0, 8).map((x: any) => safeText(x.teamId)).filter(Boolean);

                                                        const next: Record<string, boolean> = {};
                                                        for (const id of autoTop8) next[id] = true;

                                                        if (thirdsCutMeta.needs) {
                                                            for (const id of thirdsCutMeta.lockedIds) next[id] = true;
                                                        }

                                                        setManualThirdsSelected(next);
                                                    }}
                                                >
                                                    Auto seleccionar top 8
                                                </button>

                                                <button
                                                    type="button"
                                                    className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60"
                                                    onClick={() => {
                                                        const next: Record<string, boolean> = {};
                                                        if (thirdsCutMeta.needs) {
                                                            for (const id of thirdsCutMeta.lockedIds) next[id] = true;
                                                        }
                                                        setManualThirdsSelected(next);
                                                    }}
                                                >
                                                    Limpiar
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{ display: "grid", gap: 6 }}>
                                            {(thirds ?? []).map((r: any, i: number) => {
                                                const id = safeText(r.teamId);
                                                const name = safeText(r.team?.name ?? r.teamName ?? r.team?.displayName ?? r.name ?? id);
                                                const inTie = thirdsCutMeta.needs && thirdsCutMeta.tieIds.has(id);
                                                const isLocked = thirdsCutMeta.needs && thirdsCutMeta.lockedIds.has(id);
                                                const checked = !!manualThirdsSelected[id];

                                                const disableByLimit =
                                                    thirdsCutMeta.needs
                                                        ? !checked && inTie && maxThirdsReached
                                                        : !checked && maxThirdsReached;

                                                const disabled = isLocked || disableByLimit;

                                                return (
                                                    <label
                                                        key={id || i}
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: 10,
                                                            padding: "8px 10px",
                                                            borderRadius: 10,
                                                            border: "1px solid rgba(255,255,255,0.12)",
                                                            opacity: disabled ? 0.65 : 1,
                                                            cursor: disabled ? "not-allowed" : "pointer",
                                                        }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            disabled={disabled}
                                                            onChange={() => {
                                                                setManualThirdsSelected((prev) => {
                                                                    const next = { ...prev };

                                                                    if (isLocked) {
                                                                        next[id] = true;
                                                                        return next;
                                                                    }

                                                                    const newVal = !prev[id];

                                                                    if (thirdsCutMeta.needs) {
                                                                        const inTieNow = thirdsCutMeta.tieIds.has(id);
                                                                        if (newVal && inTieNow) {
                                                                            const currentTie = Object.entries(prev).filter(
                                                                                ([tid, v]) => v && thirdsCutMeta.tieIds.has(tid)
                                                                            ).length;

                                                                            if (currentTie >= thirdsCutMeta.slotsLeft) return prev;
                                                                        }

                                                                        if (newVal && !inTieNow) {
                                                                            // no permitir seleccionar fuera del empate si hay empate
                                                                            return prev;
                                                                        }

                                                                        // no permitir desmarcar fijos
                                                                        if (!newVal && thirdsCutMeta.lockedIds.has(id)) return prev;
                                                                    } else {
                                                                        const currentCount = Object.values(prev).filter(Boolean).length;
                                                                        if (newVal && currentCount >= 8) return prev;
                                                                    }

                                                                    next[id] = newVal;
                                                                    return next;
                                                                });
                                                            }}
                                                        />

                                                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                                            <div style={{ fontWeight: 800, minWidth: 30 }}>{safeText(r.rankGlobal ?? r.rank ?? i + 1)}.</div>

                                                            <div style={{ fontWeight: 700 }}>{name}</div>

                                                            {thirdsCutMeta.needs && (
                                                                <>
                                                                    {isLocked ? (
                                                                        <span
                                                                            style={{
                                                                                fontSize: 11,
                                                                                padding: "2px 8px",
                                                                                borderRadius: 999,
                                                                                border: "1px solid rgba(255,255,255,0.14)",
                                                                                opacity: 0.85,
                                                                            }}
                                                                        >
                                                                            FIJO
                                                                        </span>
                                                                    ) : inTie ? (
                                                                        <span
                                                                            style={{
                                                                                fontSize: 11,
                                                                                padding: "2px 8px",
                                                                                borderRadius: 999,
                                                                                border: "1px solid rgba(255,255,255,0.14)",
                                                                                opacity: 0.85,
                                                                            }}
                                                                        >
                                                                            EMPATE
                                                                        </span>
                                                                    ) : (
                                                                        <span
                                                                            style={{
                                                                                fontSize: 11,
                                                                                padding: "2px 8px",
                                                                                borderRadius: 999,
                                                                                border: "1px solid rgba(255,255,255,0.14)",
                                                                                opacity: 0.5,
                                                                            }}
                                                                        >
                                                                            FUERA
                                                                        </span>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>

                                        <input
                                            value={manualThirdsReason}
                                            onChange={(e) => setManualThirdsReason(e.target.value)}
                                            placeholder="Campo informativo para indicar criterio de desempate"
                                            className="px-3 py-2 rounded-lg bg-zinc-800"
                                        />

                                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                            <button
                                                type="button"
                                                className="px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-60"
                                                disabled={!token || loading || !!busy || !thirdsSelectionValid}
                                                onClick={() => {
                                                    const picked = Object.entries(manualThirdsSelected)
                                                        .filter(([, v]) => v)
                                                        .map(([id]) => id);

                                                    if (picked.length !== 8) {
                                                        alert("Debes seleccionar exactamente 8 terceros.");
                                                        return;
                                                    }
                                                    applyManualThirds(picked);
                                                }}
                                            >
                                                Aplicar manual (Top 8)
                                            </button>

                                            <button
                                                type="button"
                                                className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
                                                onClick={() => {
                                                    setOpenManualThirds(false);
                                                    setManualThirdsSelected({});
                                                    setManualThirdsText("");
                                                    setManualThirdsReason("");
                                                }}
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}

            {bracketEnabled && (
                <>
                    {/* BRACKET · PASO 6 (Slots de terceros) */}
                    <div style={{ marginTop: 18, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Bracket · 16avos (slots de terceros)</h2>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                                seasonId: {safeText(standingsRaw?.seasonId ?? thirdsRaw?.seasonId ?? user?.activeSeasonId ?? "")}
                            </div>
                        </div>

                        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                            <button
                                type="button"
                                className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60"
                                disabled={!token || loading || !!busy}
                                onClick={() => token && loadAll(token)}
                            >
                                Refrescar bracket
                            </button>

                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <div style={{ fontSize: 12, opacity: 0.75 }}>Reason (opcional):</div>
                                <input
                                    value={bracketReason}
                                    onChange={(e) => setBracketReason(e.target.value)}
                                    placeholder="Ej: terceros definidos manualmente"
                                    style={{
                                        height: 34,
                                        padding: "0 10px",
                                        borderRadius: 8,
                                        border: "1px solid rgba(255,255,255,0.12)",
                                        background: "rgba(255,255,255,0.04)",
                                        width: 360,
                                        maxWidth: "100%",
                                    }}
                                />
                            </div>
                        </div>

                        {bracketSlots.length === 0 && !loading && (
                            <div style={{ marginTop: 10, opacity: 0.85 }}>
                                No hay slots para mostrar (¿existen en BD? ¿ya seedteaste BracketSlot para R32?).
                            </div>
                        )}

                        {bracketSlots.length > 0 && (
                            <div style={{ overflowX: "auto", marginTop: 10 }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
                                            <th style={{ padding: "6px 8px", width: 70 }}>Match</th>
                                            <th style={{ padding: "6px 8px", width: 70 }}>Slot</th>
                                            <th style={{ padding: "6px 8px" }}>Placeholder</th>
                                            <th style={{ padding: "6px 8px" }}>Asignación</th>
                                            <th style={{ padding: "6px 8px", width: 220 }}>Acciones</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {bracketSlots
                                            .slice()
                                            .sort(
                                                (a: any, b: any) =>
                                                    Number(a.matchNo ?? 999) - Number(b.matchNo ?? 999) ||
                                                    String(a.slot ?? "").localeCompare(String(b.slot ?? ""))
                                            )
                                            .map((s: any, idx: number) => {
                                                const matchNo = Number(s.matchNo ?? 0);
                                                const slot = String(s.slot ?? "").toUpperCase(); // HOME / AWAY esperado
                                                const slotOk = slot === "HOME" || slot === "AWAY";

                                                const key = `${matchNo}-${slot || idx}`;
                                                const currentTeamId = s.teamId ? String(s.teamId) : "";
                                                const isAutoAssigned = !!s.teamId && !s.manualOverride;
                                                const locked = isAutoAssigned;
                                                const pick = locked ? currentTeamId : (bracketPickByKey[key] ?? currentTeamId);

                                                const placeholder = s.placeholderText ?? s.sourceKey ?? "";
                                                const isThirdPlaceholder =
                                                    String(placeholder).includes("3º") ||
                                                    String(placeholder).includes("3°") ||
                                                    !!s.needsManual;

                                                // mostramos solo lo pendiente (terceros)
                                                if (!isThirdPlaceholder) return null;

                                                return (
                                                    <tr key={key} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                                        <td style={{ padding: "6px 8px", fontWeight: 800 }}>{safeText(matchNo)}</td>
                                                        <td style={{ padding: "6px 8px", fontWeight: 800 }}>{safeText(slot)}</td>
                                                        <td style={{ padding: "6px 8px", opacity: 0.9 }}>
                                                            {safeText(placeholder)}
                                                            {locked ? (
                                                                <span
                                                                    style={{
                                                                        marginLeft: 8,
                                                                        display: "inline-flex",
                                                                        alignItems: "center",
                                                                        padding: "2px 8px",
                                                                        borderRadius: 999,
                                                                        border: "1px solid rgba(255,255,255,0.14)",
                                                                        fontSize: 11,
                                                                        opacity: 0.9,
                                                                    }}
                                                                >
                                                                    AUTO
                                                                </span>
                                                            ) : null}
                                                        </td>

                                                        <td style={{ padding: "6px 8px" }}>
                                                            <select
                                                                value={pick}
                                                                disabled={!slotOk || locked}
                                                                onChange={(e) => {
                                                                    if (locked) return;
                                                                    const v = e.target.value;
                                                                    setBracketPickByKey((prev) => ({ ...prev, [key]: v }));
                                                                }}
                                                                style={{
                                                                    height: 34,
                                                                    borderRadius: 8,
                                                                    border: "1px solid rgba(0,0,0,0.20)",
                                                                    background: "#222222",       // 👈 fondo blanco para el dropdown
                                                                    color: "#ffffff",            // 👈 texto negro (valor seleccionado)
                                                                    padding: "0 10px",
                                                                    width: 360,
                                                                    maxWidth: "100%",
                                                                    opacity: slotOk ? (locked ? 0.78 : 1) : 0.6,
                                                                    cursor: locked ? "not-allowed" : "pointer",
                                                                }}

                                                            >
                                                                <option value="">(sin asignar)</option>

                                                                {currentTeamId &&
                                                                    !eligibleThirds.some((x: any) =>
                                                                        String(x.teamId ?? x.team?.id ?? "") === currentTeamId
                                                                    ) && (
                                                                        <option value={currentTeamId}>
                                                                            {teamDisplayName(s.team, locale) || s.team?.slug || currentTeamId}
                                                                        </option>
                                                                    )}

                                                                {eligibleThirds.map((t: any) => {
                                                                    const tid = String(t.teamId ?? t.team?.id ?? "");
                                                                    const labelRank = t.rankGlobal ?? t.rank ?? "";
                                                                    const name = teamDisplayName(t.team, locale) || t.team?.slug || tid;

                                                                    const usedElsewhere = bracketUsedTeamIds.has(tid) && tid !== currentTeamId;

                                                                    return (
                                                                        <option key={tid} value={tid} disabled={usedElsewhere}>
                                                                            {labelRank ? `${labelRank}. ` : ""}
                                                                            {name}
                                                                            {usedElsewhere ? " (ya usado)" : ""}
                                                                        </option>
                                                                    );
                                                                })}
                                                            </select>

                                                            {!slotOk && (
                                                                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                                                                    Slot inválido: se esperaba HOME/AWAY
                                                                </div>
                                                            )}

                                                            {locked && (
                                                                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                                                                    Asignado automáticamente — no se puede modificar.
                                                                </div>
                                                            )}
                                                        </td>

                                                        <td style={{ padding: "6px 8px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                                                            <button
                                                                type="button"
                                                                className="px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-60"
                                                                disabled={!token || loading || !!busy || !slotOk || locked}
                                                                onClick={() => applyBracketSlot(matchNo, slot as "HOME" | "AWAY", pick ? pick : null)}
                                                            >
                                                                Aplicar
                                                            </button>

                                                            <button
                                                                type="button"
                                                                className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60"
                                                                disabled={!token || loading || !!busy || !slotOk || locked}
                                                                onClick={() => {
                                                                    if (locked) return;
                                                                    setBracketPickByKey((prev) => ({ ...prev, [key]: "" }));
                                                                    applyBracketSlot(matchNo, slot as "HOME" | "AWAY", null);
                                                                }}
                                                            >
                                                                Limpiar
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>

                                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                                    Nota: el dropdown solo muestra terceros <b>elegibles</b> (isQualified=true) y bloquea duplicados.
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}