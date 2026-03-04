"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { TeamWithFlag } from "@/components/team-with-flag";

type AnyObj = Record<string, any>;

const controlBase =
    "h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-[var(--foreground)] outline-none " +
    "placeholder:text-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

const controlSelect = controlBase + " pr-9";

const chipBase = "rounded-xl border px-3 py-1.5 text-xs transition-colors";

// ✅ Chip activo en VERDE (como /groups vibe)
const chipOn = chipBase + " border-emerald-500/30 bg-emerald-500/10 text-emerald-600";
const chipOff = chipBase + " border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-[var(--foreground)]";

const tableWrap = "overflow-x-auto";
const tableBase = "w-full border-collapse text-sm";
const trHead = "text-left border-b border-[var(--border)]";
const thBase = "py-2 px-2 text-xs font-semibold text-[var(--muted)]";
const tdBase = "py-2 px-2 align-middle border-b border-[var(--border)]";

function safeText(v: unknown, fallback = ""): string {
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
    return fallback;
}

function getApiBase(): string {
    const a =
        process.env.NEXT_PUBLIC_API_BASE ??
        process.env.NEXT_PUBLIC_API_BASE_URL ??
        process.env.NEXT_PUBLIC_API_URL ??
        "";
    return a.replace(/\/+$/, "");
}

async function apiGet<T>(path: string, token?: string): Promise<T> {
    const base = getApiBase();
    const isAbsolute = path.startsWith("http");
    const cleanPath = path.startsWith("/") ? path : `/${path}`;

    // Si no hay base configurada, asumimos proxy Next: /api
    const localPath =
        cleanPath.startsWith("/api/") || cleanPath === "/api"
            ? cleanPath
            : cleanPath.startsWith("/catalog") || cleanPath.startsWith("/summary")
                ? `/api${cleanPath}`
                : cleanPath;

    const url = isAbsolute ? path : base ? `${base}${cleanPath}` : localPath;

    const res = await fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        cache: "no-store",
    });

    if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `HTTP ${res.status}`);
    }

    return (await res.json()) as T;
}

type StandingsResponse = {
    seasonId: string;
    meta?: AnyObj | null;
    groups: Array<{
        groupCode: string;
        expectedMatches?: number;
        confirmedMatches?: number;
        isComplete?: boolean;
        standings: AnyObj[];
    }>;
};

type ThirdsResponse = {
    seasonId: string;
    meta?: AnyObj | null;
    needsManualCut?: boolean;
    standings: AnyObj[];
};

type BracketResponse = {
    seasonId: string;
    meta?: AnyObj | null;
    slots?: AnyObj[];
};

type CatalogResponse = {
    sports: Array<{
        id: string;
        slug: string;
        name: string;
        competitions?: Array<{
            id: string;
            slug: string;
            name: string;
            seasons?: Array<{ id: string; slug: string; name: string }>;
        }>;
    }>;
};

export default function EventSummaryPage() {
    const router = useRouter();
    const { locale: localeParam } = useParams<{ locale: string }>();
    const locale = localeParam ?? "es";

    const [token, setToken] = useState<string>("");
    const [catalog, setCatalog] = useState<CatalogResponse | null>(null);

    const [sportSlug, setSportSlug] = useState<string>("");
    const [competitionSlug, setCompetitionSlug] = useState<string>("");
    const [seasonSlug, setSeasonSlug] = useState<string>("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");

    const [standings, setStandings] = useState<StandingsResponse | null>(null);
    const [thirds, setThirds] = useState<AnyObj[] | null>(null);
    const [thirdsMeta, setThirdsMeta] = useState<ThirdsResponse | null>(null);

    const [bracketRaw, setBracketRaw] = useState<BracketResponse | null>(null);

    const [groupFilter, setGroupFilter] = useState<string>("ALL");

    useEffect(() => {
        try {
            const t = localStorage.getItem("token") || "";
            setToken(t);
        } catch {
            setToken("");
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        const run = async () => {
            setError("");
            try {
                const raw = await apiGet<unknown>("/catalog", token || undefined);
                if (!mounted) return;

                const sportsArr =
                    Array.isArray(raw)
                        ? raw
                        : Array.isArray((raw as AnyObj)?.sports)
                            ? (raw as AnyObj).sports
                            : Array.isArray((raw as AnyObj)?.data?.sports)
                                ? (raw as AnyObj).data.sports
                                : Array.isArray((raw as AnyObj)?.result?.sports)
                                    ? (raw as AnyObj).result.sports
                                    : Array.isArray((raw as AnyObj)?.catalog?.sports)
                                        ? (raw as AnyObj).catalog.sports
                                        : [];

                const normalized: CatalogResponse = { sports: sportsArr as CatalogResponse["sports"] };
                setCatalog(normalized);

                // pick defaults (first available)
                const s0 = normalized.sports?.[0];
                if (s0?.slug) setSportSlug(s0.slug);

                const c0 = s0?.competitions?.[0];
                if (c0?.slug) setCompetitionSlug(c0.slug);

                const e0 = c0?.seasons?.[0];
                if (e0?.slug) setSeasonSlug(e0.slug);
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Error cargando catálogo";
                if (!mounted) return;
                setError(msg);
            }
        };

        run();
        return () => {
            mounted = false;
        };
    }, [token]);

    const sports = catalog?.sports ?? [];

    const competitions = useMemo(() => {
        const s = sports.find((x) => x.slug === sportSlug);
        return s?.competitions ?? [];
    }, [sports, sportSlug]);

    const seasons = useMemo(() => {
        const c = competitions.find((x) => x.slug === competitionSlug);
        return c?.seasons ?? [];
    }, [competitions, competitionSlug]);

    const seasonId = useMemo(() => {
        const s = seasons.find((x) => x.slug === seasonSlug);
        return s?.id ?? "";
    }, [seasons, seasonSlug]);

    useEffect(() => {
        // keep comp/season in sync when sport changes
        const c = competitions?.[0];
        if (c?.slug && c.slug !== competitionSlug) {
            setCompetitionSlug(c.slug);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sportSlug]);

    useEffect(() => {
        // keep season in sync when competition changes
        const e = seasons?.[0];
        if (e?.slug && e.slug !== seasonSlug) {
            setSeasonSlug(e.slug);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [competitionSlug]);

    useEffect(() => {
        let mounted = true;
        const run = async () => {
            if (!sportSlug || !competitionSlug || !seasonSlug || !seasonId) return;

            setLoading(true);
            setError("");

            try {
                const qs = `?seasonId=${encodeURIComponent(seasonId)}`;

                const [st, th, br] = await Promise.all([
                    apiGet<StandingsResponse>(`/admin/groups/standings${qs}`, token || undefined),
                    apiGet<ThirdsResponse>(`/admin/groups/thirds${qs}`, token || undefined).catch(
                        () => null as unknown as ThirdsResponse
                    ),
                    apiGet<BracketResponse>(`/admin/groups/bracket-slots${qs}`, token || undefined).catch(
                        () => null as unknown as BracketResponse
                    ),
                ]);

                if (!mounted) return;

                setStandings(st ?? null);

                if (th && Array.isArray((th as AnyObj)?.standings)) {
                    setThirds((th as AnyObj).standings as AnyObj[]);
                    setThirdsMeta(th);
                } else {
                    setThirds(null);
                    setThirdsMeta(null);
                }

                if (br && (br as AnyObj)?.slots) {
                    setBracketRaw(br);
                } else {
                    setBracketRaw(null);
                }

                setGroupFilter("ALL");
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Error cargando resumen";
                if (!mounted) return;
                setError(msg);
                setStandings(null);
                setThirds(null);
                setThirdsMeta(null);
                setBracketRaw(null);
            } finally {
                if (!mounted) return;
                setLoading(false);
            }
        };

        run();
        return () => {
            mounted = false;
        };
    }, [sportSlug, competitionSlug, seasonSlug, seasonId, token]);

    const groupCodes = useMemo(() => {
        const codes = (standings?.groups ?? []).map((g) => safeText(g.groupCode, "")).filter(Boolean);
        return Array.from(new Set(codes)).sort();
    }, [standings]);

    const visibleGroups = useMemo(() => {
        const gs = standings?.groups ?? [];
        if (!gs.length) return [];
        if (!groupFilter || groupFilter === "ALL") return gs;
        return gs.filter((g) => safeText(g.groupCode, "") === groupFilter);
    }, [standings, groupFilter]);

    return (
        <div className="min-h-screen">
            <div className="mx-auto max-w-[980px] px-4 pb-12 pt-10 space-y-6">
                <PageHeader
                    title="Resumen del Evento"
                    subtitle="Solo lectura: posiciones de grupos, terceros (si aplica) y cruces (si aplica)."
                    actions={
                        <Button variant="secondary" size="sm" onClick={() => router.push(`/${locale}/dashboard`)}>
                            Volver
                        </Button>
                    }
                />

                {/* Contexto */}
                <Card className="p-4">
                    <div className="mb-3 text-sm font-medium">Contexto</div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div>
                            <div className="mb-1 text-xs text-[var(--muted)]">Deporte</div>
                            <select className={controlSelect} value={sportSlug} onChange={(e) => setSportSlug(e.target.value)}>
                                {sports.map((s) => (
                                    <option key={s.id} value={s.slug}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <div className="mb-1 text-xs text-[var(--muted)]">Competición</div>
                            <select
                                className={controlSelect}
                                value={competitionSlug}
                                onChange={(e) => setCompetitionSlug(e.target.value)}
                            >
                                {competitions.map((c) => (
                                    <option key={c.id} value={c.slug}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <div className="mb-1 text-xs text-[var(--muted)]">Evento</div>
                            <select className={controlSelect} value={seasonSlug} onChange={(e) => setSeasonSlug(e.target.value)}>
                                {seasons.map((s) => (
                                    <option key={s.id} value={s.slug}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {error ? (
                        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
                            {error}
                        </div>
                    ) : null}

                    {loading ? <div className="mt-3 text-sm text-[var(--muted)]">Cargando…</div> : null}
                </Card>

                {/* Filtro de grupos */}
                {groupCodes.length ? (
                    <Card className="p-4">
                        <div className="mb-2 text-sm font-medium">Filtrar grupos</div>
                        <div className="flex flex-wrap gap-2">
                            <button className={groupFilter === "ALL" ? chipOn : chipOff} onClick={() => setGroupFilter("ALL")}>
                                Todos
                            </button>

                            {groupCodes.map((gc) => (
                                <button
                                    key={gc}
                                    className={groupFilter === gc ? chipOn : chipOff}
                                    onClick={() => setGroupFilter(gc)}
                                >
                                    {gc}
                                </button>
                            ))}
                        </div>
                    </Card>
                ) : null}

                {/* Grupos */}
                {visibleGroups.length ? (
                    <div className="grid grid-cols-1 gap-4">
                        {visibleGroups.map((g) => {
                            const code = safeText(g.groupCode, "?");
                            const expected = Number(g.expectedMatches ?? 0);
                            const confirmed = Number(g.confirmedMatches ?? 0);
                            const isComplete =
                                typeof g.isComplete === "boolean" ? g.isComplete : expected > 0 ? confirmed >= expected : false;

                            return (
                                <Card key={code} className="p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-base font-semibold">Grupo {code}</div>
                                            <div className="text-xs text-[var(--muted)]">
                                                {isComplete ? "Cerrado" : "En progreso"} • Confirmados: {confirmed}/{expected || "—"}
                                            </div>
                                        </div>

                                        <span
                                            className={
                                                isComplete
                                                    ? "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600"
                                                    : "rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] text-[var(--muted)]"
                                            }
                                        >
                                            {isComplete ? "Completo" : "Parcial"}
                                        </span>
                                    </div>

                                    <div className={tableWrap}>
                                        <table className={tableBase}>
                                            <thead>
                                                <tr className={trHead}>
                                                    <th className={thBase}>Pos</th>
                                                    <th className={thBase}>Equipo</th>
                                                    <th className={`${thBase} text-right`}>PJ</th>
                                                    <th className={`${thBase} text-right`}>G</th>
                                                    <th className={`${thBase} text-right`}>E</th>
                                                    <th className={`${thBase} text-right`}>P</th>
                                                    <th className={`${thBase} text-right`}>GF</th>
                                                    <th className={`${thBase} text-right`}>GC</th>
                                                    <th className={`${thBase} text-right`}>DG</th>
                                                    <th className={`${thBase} text-right`}>Pts</th>
                                                </tr>
                                            </thead>

                                            <tbody>
                                                {(g.standings ?? []).map((r: AnyObj, idx: number) => {
                                                    const name =
                                                        safeText((r as AnyObj)?.name, "") ||
                                                        safeText((r as AnyObj)?.teamName, "") ||
                                                        safeText((r as AnyObj)?.team?.name, "") ||
                                                        "—";

                                                    const isPlaceholder =
                                                        (typeof (r as AnyObj)?.isPlaceholder === "boolean" &&
                                                            Boolean((r as AnyObj)?.isPlaceholder)) ||
                                                        (typeof (r as AnyObj)?.team?.isPlaceholder === "boolean" &&
                                                            Boolean((r as AnyObj)?.team?.isPlaceholder)) ||
                                                        /grupo|winner|loser|placeholder|qf|sf|final/i.test(name);

                                                    const needsManual = Boolean((r as AnyObj)?.needsManual);

                                                    const pos = Number(r.posGroup ?? r.pos ?? idx + 1);
                                                    const pj = Number(r.pj ?? r.played ?? 0);
                                                    const gW = Number(r.w ?? r.g ?? r.wins ?? 0);
                                                    const eD = Number(r.d ?? r.e ?? r.draws ?? 0);
                                                    const pL = Number(r.l ?? r.p ?? r.losses ?? 0);
                                                    const gf = Number(r.gf ?? r.goalsFor ?? 0);
                                                    const gc = Number(r.gc ?? r.goalsAgainst ?? 0);
                                                    const dg = Number(r.dg ?? r.diff ?? gf - gc);
                                                    const pts = Number(r.pts ?? r.points ?? 0);

                                                    return (
                                                        <tr key={`${code}-${idx}`} className="hover:bg-[var(--muted)]">
                                                            <td className={tdBase}>{pos}</td>

                                                            <td className={tdBase}>
                                                                <div className="flex items-center gap-2">
                                                                    <TeamWithFlag
                                                                        name={
                                                                            typeof (r as AnyObj)?.team?.name === "string"
                                                                                ? String((r as AnyObj).team.name)
                                                                                : name
                                                                        }
                                                                        flagKey={
                                                                            typeof (r as AnyObj)?.team?.flagKey === "string"
                                                                                ? String((r as AnyObj).team.flagKey)
                                                                                : typeof (r as AnyObj)?.flagKey === "string"
                                                                                    ? String((r as AnyObj).flagKey)
                                                                                    : null
                                                                        }
                                                                        isPlaceholder={
                                                                            (typeof (r as AnyObj)?.team?.isPlaceholder === "boolean" &&
                                                                                (r as AnyObj).team.isPlaceholder) ||
                                                                            isPlaceholder
                                                                        }
                                                                    />

                                                                    {needsManual ? (
                                                                        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600">
                                                                            Requiere desempate
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            </td>

                                                            <td className={`${tdBase} text-right`}>{pj}</td>
                                                            <td className={`${tdBase} text-right`}>{gW}</td>
                                                            <td className={`${tdBase} text-right`}>{eD}</td>
                                                            <td className={`${tdBase} text-right`}>{pL}</td>
                                                            <td className={`${tdBase} text-right`}>{gf}</td>
                                                            <td className={`${tdBase} text-right`}>{gc}</td>
                                                            <td className={`${tdBase} text-right`}>{dg}</td>
                                                            <td className={`${tdBase} text-right font-semibold`}>{pts}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                ) : (
                    <Card className="p-4 text-sm text-[var(--muted)]">No hay grupos para mostrar con el filtro actual.</Card>
                )}

                {/* Terceros (si aplica) */}
                {thirds?.length ? (
                    <Card className="p-4">
                        <div className="mb-3">
                            <div className="text-base font-semibold">Ranking de terceros</div>
                            <div className="text-xs text-[var(--muted)]">
                                {thirdsMeta?.needsManualCut
                                    ? "Requiere desempate manual para determinar los clasificados."
                                    : "Solo lectura."}
                            </div>
                        </div>

                        <div className={tableWrap}>
                            <table className={tableBase}>
                                <thead>
                                    <tr className={trHead}>
                                        <th className={thBase}>Pos</th>
                                        <th className={thBase}>Equipo</th>
                                        <th className={`${thBase} text-right`}>Pts</th>
                                        <th className={`${thBase} text-right`}>DG</th>
                                        <th className={`${thBase} text-right`}>GF</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {thirds.map((r: AnyObj, idx: number) => {
                                        const pos = Number(r.posThirds ?? r.pos ?? idx + 1);
                                        return (
                                            <tr key={`third-${idx}`} className="hover:bg-[var(--muted)]">
                                                <td className={tdBase}>{pos}</td>

                                                <td className={tdBase}>
                                                    <TeamWithFlag
                                                        name={
                                                            typeof (r as AnyObj)?.team?.name === "string"
                                                                ? String((r as AnyObj).team.name)
                                                                : safeText(r.name, "—")
                                                        }
                                                        flagKey={
                                                            typeof (r as AnyObj)?.team?.flagKey === "string"
                                                                ? String((r as AnyObj).team.flagKey)
                                                                : typeof (r as AnyObj)?.flagKey === "string"
                                                                    ? String((r as AnyObj).flagKey)
                                                                    : null
                                                        }
                                                        isPlaceholder={
                                                            (typeof (r as AnyObj)?.team?.isPlaceholder === "boolean" &&
                                                                (r as AnyObj).team.isPlaceholder) ||
                                                            (typeof (r as AnyObj)?.isPlaceholder === "boolean" && (r as AnyObj).isPlaceholder) ||
                                                            false
                                                        }
                                                    />
                                                </td>

                                                <td className={`${tdBase} text-right font-semibold`}>{Number(r.pts ?? 0)}</td>
                                                <td className={`${tdBase} text-right`}>{Number(r.dg ?? 0)}</td>
                                                <td className={`${tdBase} text-right`}>{Number(r.gf ?? 0)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                ) : null}

                {/* Bracket (si aplica) */}
                {Array.isArray(bracketRaw?.slots) && bracketRaw!.slots!.length ? (
                    <Card className="p-4">
                        <div className="mb-3">
                            <div className="text-base font-semibold">Cruces / Bracket</div>
                            <div className="text-xs text-[var(--muted)]">Solo lectura.</div>
                        </div>

                        <div className={tableWrap}>
                            <table className={tableBase}>
                                <thead>
                                    <tr className={trHead}>
                                        <th className={thBase}>Ronda</th>
                                        <th className={thBase}>Slot</th>
                                        <th className={thBase}>Equipo</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {(bracketRaw?.slots ?? []).map((s: AnyObj, idx: number) => {
                                        const round = safeText(s.round, safeText(s.stage, "—"));
                                        const slot = safeText(s.code, safeText(s.slot, safeText(s.id, String(idx + 1))));

                                        return (
                                            <tr key={`slot-${idx}`} className="hover:bg-[var(--muted)]">
                                                <td className={tdBase}>{safeText(round, "—")}</td>
                                                <td className={tdBase}>{safeText(slot, "—")}</td>

                                                <td className={tdBase}>
                                                    <TeamWithFlag
                                                        name={
                                                            typeof (s as AnyObj)?.team?.name === "string"
                                                                ? String((s as AnyObj).team.name)
                                                                : safeText(s.name, "—")
                                                        }
                                                        flagKey={
                                                            typeof (s as AnyObj)?.team?.flagKey === "string"
                                                                ? String((s as AnyObj).team.flagKey)
                                                                : typeof (s as AnyObj)?.flagKey === "string"
                                                                    ? String((s as AnyObj).flagKey)
                                                                    : null
                                                        }
                                                        isPlaceholder={
                                                            (typeof (s as AnyObj)?.team?.isPlaceholder === "boolean" &&
                                                                (s as AnyObj).team.isPlaceholder) ||
                                                            (typeof (s as AnyObj)?.isPlaceholder === "boolean" && (s as AnyObj).isPlaceholder) ||
                                                            false
                                                        }
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                ) : null}
            </div>
        </div>
    );
}