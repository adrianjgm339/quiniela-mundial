import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type TeamId = string;

type TeamRow = {
    teamId: string;
    groupCode: string;
    name: string;
    flagKey?: string | null;
    isPlaceholder?: boolean;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gf: number;
    ga: number;
    gd: number;
    points: number;
    needsManual: boolean;
};

type MatchRow = {
    groupCode: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
};

type Key = { pts: number; gd: number; gf: number };

@Injectable()
export class AdminGroupsService {
    constructor(private readonly prisma: PrismaService) { }

    private teamName(team: any, locale: string) {
        const t = team?.translations?.find((x: any) => x.locale === locale) ?? team?.translations?.[0];
        return t?.name ?? team?.id ?? '—';
    }

    // --- Sport/format detection (future-proof) ---
    private async getSeasonSportSlug(seasonId: string): Promise<string | null> {
        try {
            const s = await this.prisma.season.findUnique({
                where: { id: seasonId },
                select: {
                    competition: {
                        select: {
                            sport: { select: { slug: true } },
                        },
                    },
                },
            });
            return s?.competition?.sport?.slug ?? null;
        } catch {
            return null;
        }
    }

    private getGroupsFeaturesBySportSlug(sportSlug: string | null) {
        const slug = (sportSlug ?? "").toLowerCase();

        // fútbol (World Cup) => terceros + R32 slots
        if (slug === "futbol" || slug === "soccer") {
            return {
                sportSlug: slug || "futbol",
                groupRankingMode: "FIFA" as const,
                thirdPlacesEnabled: true,
                bracketR32Enabled: true,
            };
        }

        // béisbol (WBC) => NO terceros + NO R32 slots
        if (slug === "beisbol" || slug === "baseball") {
            return {
                sportSlug: slug || "beisbol",
                groupRankingMode: "WBC" as const,
                thirdPlacesEnabled: false,
                bracketR32Enabled: false,
            };
        }

        // default: “sin asumir” => se comporta como fútbol solo en standings,
        // pero NO fuerza terceros/bracket automáticamente.
        return {
            sportSlug: slug || "unknown",
            groupRankingMode: "FIFA" as const,
            thirdPlacesEnabled: false,
            bracketR32Enabled: false,
        };
    }

    private keyGlobal(row: TeamRow): Key {
        return { pts: row.points, gd: row.gd, gf: row.gf };
    }

    private keyH2H(stats: Map<TeamId, { pts: number; gf: number; ga: number }>, teamId: string): Key {
        const s = stats.get(teamId) ?? { pts: 0, gf: 0, ga: 0 };
        return { pts: s.pts, gd: s.gf - s.ga, gf: s.gf };
    }

    private compareKeyDesc(a: Key, b: Key) {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.gd !== a.gd) return b.gd - a.gd;
        if (b.gf !== a.gf) return b.gf - a.gf;
        return 0;
    }

    private computeH2HStats(teamIds: string[], matches: MatchRow[]) {
        const set = new Set(teamIds);
        const stats = new Map<TeamId, { pts: number; gf: number; ga: number }>();
        for (const id of teamIds) stats.set(id, { pts: 0, gf: 0, ga: 0 });

        for (const m of matches) {
            if (!set.has(m.homeTeamId) || !set.has(m.awayTeamId)) continue;

            const home = stats.get(m.homeTeamId)!;
            const away = stats.get(m.awayTeamId)!;

            home.gf += m.homeScore;
            home.ga += m.awayScore;
            away.gf += m.awayScore;
            away.ga += m.homeScore;

            if (m.homeScore > m.awayScore) {
                home.pts += 3;
            } else if (m.homeScore < m.awayScore) {
                away.pts += 3;
            } else {
                home.pts += 1;
                away.pts += 1;
            }
        }

        return stats;
    }

    /**
     * Orden FIFA grupo:
     * 1) pts global
     * 2) H2H entre empatados: pts, GD, GF
     * 3) reaplicar H2H solo a los que sigan empatados
     * 4) fallback global: GD, GF
     * 5) si aún no decide => needsManual
     */
    private orderGroupFifa(rows: TeamRow[], matches: MatchRow[]): TeamRow[] {
        // 1) ordenar por puntos global
        const base = [...rows].sort((a, b) => this.compareKeyDesc(this.keyGlobal(a), this.keyGlobal(b)));

        // resolver empates por bloques con misma cantidad de puntos
        const out: TeamRow[] = [];
        let i = 0;

        while (i < base.length) {
            const pts = base[i].points;
            const tied = base.slice(i).filter((r) => r.points === pts);
            const tiedLen = tied.length;
            if (tiedLen <= 1) {
                out.push(base[i]);
                i += 1;
                continue;
            }

            // tomamos solo el bloque contiguo con esos pts
            const block = base.slice(i, i + tiedLen);

            const resolved = this.resolveTieBlock(block, matches);
            out.push(...resolved.ordered);
            i += tiedLen;

            // si quedaron irresolubles, marcar needsManual
            for (const id of resolved.unresolvedTeamIds) {
                const r = out.find((x) => x.teamId === id);
                if (r) r.needsManual = true;
            }
        }

        return out;
    }

    private orderGroupWbc(rows: TeamRow[], matches: MatchRow[]) {
        const winPct = (r: TeamRow) => {
            const g = (r.won ?? 0) + (r.lost ?? 0) + (r.drawn ?? 0);
            return g > 0 ? (r.won ?? 0) / g : 0;
        };

        // Base: por W% desc
        const base = [...rows].sort((a, b) => winPct(b) - winPct(a));

        // Resolver empates por W% en bloques
        let i = 0;
        const out: TeamRow[] = [];
        while (i < base.length) {
            let j = i + 1;
            while (j < base.length && Math.abs(winPct(base[j]) - winPct(base[i])) < 1e-12) j++;

            const block = base.slice(i, j);
            if (block.length === 1) {
                out.push(block[0]);
            } else {
                out.push(...this.resolveTieBlockWbc(block, matches));
            }
            i = j;
        }
        return out;
    }

    private resolveTieBlockWbc(block: TeamRow[], matches: MatchRow[]) {
        const ids = new Set(block.map((b) => b.teamId));

        // matches sólo entre empatados
        const h2h = matches.filter((m) => ids.has(m.homeTeamId) && ids.has(m.awayTeamId));

        const wins = new Map<string, number>();
        const losses = new Map<string, number>();
        const runsAllowed = new Map<string, number>();
        const games = new Map<string, number>();

        for (const t of block) {
            wins.set(t.teamId, 0);
            losses.set(t.teamId, 0);
            runsAllowed.set(t.teamId, 0);
            games.set(t.teamId, 0);
        }

        for (const m of h2h) {
            const h = m.homeTeamId;
            const a = m.awayTeamId;

            games.set(h, (games.get(h) ?? 0) + 1);
            games.set(a, (games.get(a) ?? 0) + 1);

            // runs allowed (WBC criterio 2 usa RA / defensive outs; aquí aproximamos outs = 27 por juego)
            runsAllowed.set(h, (runsAllowed.get(h) ?? 0) + (m.awayScore ?? 0));
            runsAllowed.set(a, (runsAllowed.get(a) ?? 0) + (m.homeScore ?? 0));

            if ((m.homeScore ?? 0) > (m.awayScore ?? 0)) {
                wins.set(h, (wins.get(h) ?? 0) + 1);
                losses.set(a, (losses.get(a) ?? 0) + 1);
            } else if ((m.homeScore ?? 0) < (m.awayScore ?? 0)) {
                wins.set(a, (wins.get(a) ?? 0) + 1);
                losses.set(h, (losses.get(h) ?? 0) + 1);
            } else {
                // raro en béisbol; lo tratamos neutro
            }
        }

        const n = block.length;

        // 1) Head-to-head: “barrió” (ganó a todos) o “perdió todo”
        const swept = block.find((t) => (wins.get(t.teamId) ?? 0) === (n - 1));
        const sweptByAll = block.find((t) => (losses.get(t.teamId) ?? 0) === (n - 1));

        // Si alguien barrió, va arriba; si alguien perdió todo, va abajo.
        // Lo resolvemos recursivo para permitir “sub-empates”.
        if (swept || sweptByAll) {
            const middle = block.filter((t) => t.teamId !== swept?.teamId && t.teamId !== sweptByAll?.teamId);
            const resolvedMiddle = middle.length <= 1 ? middle : this.resolveTieBlockWbc(middle, matches);

            const out: TeamRow[] = [];
            if (swept) out.push(swept);
            out.push(...resolvedMiddle);
            if (sweptByAll) out.push(sweptByAll);
            return out;
        }

        // 2) Runs Allowed Quotient (aprox): RA / (games * 27). Menor es mejor.
        const raQ = (teamId: string) => {
            const g = games.get(teamId) ?? 0;
            if (g <= 0) return Number.POSITIVE_INFINITY;
            const outsApprox = g * 27;
            return (runsAllowed.get(teamId) ?? 0) / outsApprox;
        };

        const sorted = [...block].sort((a, b) => raQ(a.teamId) - raQ(b.teamId));

        // Si todavía hay empates exactos por raQ, marcamos needsManual
        for (let i = 0; i < sorted.length;) {
            let j = i + 1;
            while (j < sorted.length && Math.abs(raQ(sorted[j].teamId) - raQ(sorted[i].teamId)) < 1e-12) j++;

            if (j - i > 1) {
                for (let k = i; k < j; k++) (sorted[k] as any).needsManual = true;
            }
            i = j;
        }

        return sorted;
    }

    private resolveTieBlock(block: TeamRow[], matches: MatchRow[]) {
        // Aplica H2H en el bloque, luego recursión en sub-empates, luego fallback global
        const teamIds = block.map((x) => x.teamId);

        const h2h = this.computeH2HStats(teamIds, matches);
        const withH2H = [...block].sort((a, b) => this.compareKeyDesc(this.keyH2H(h2h, a.teamId), this.keyH2H(h2h, b.teamId)));

        // agrupar por llave H2H para detectar sub-empates
        const groups = new Map<string, TeamRow[]>();
        for (const r of withH2H) {
            const k = this.keyH2H(h2h, r.teamId);
            const key = `${k.pts}|${k.gd}|${k.gf}`;
            const arr = groups.get(key) ?? [];
            arr.push(r);
            groups.set(key, arr);
        }

        const ordered: TeamRow[] = [];
        const unresolved = new Set<string>();

        for (const [, g] of groups) {
            if (g.length === 1) {
                ordered.push(g[0]);
                continue;
            }

            // 3) reaplicar H2H solo entre los que siguen empatados
            const subIds = g.map((x) => x.teamId);
            const subH2H = this.computeH2HStats(subIds, matches);
            const subSorted = [...g].sort((a, b) => this.compareKeyDesc(this.keyH2H(subH2H, a.teamId), this.keyH2H(subH2H, b.teamId)));

            // Ver si subSorted ya separa; si no, aplicar fallback global (GD, GF)
            const stillTiedGroups = new Map<string, TeamRow[]>();
            for (const r of subSorted) {
                const kk = this.keyH2H(subH2H, r.teamId);
                const key2 = `${kk.pts}|${kk.gd}|${kk.gf}`;
                const arr2 = stillTiedGroups.get(key2) ?? [];
                arr2.push(r);
                stillTiedGroups.set(key2, arr2);
            }

            for (const [, gg] of stillTiedGroups) {
                if (gg.length === 1) {
                    ordered.push(gg[0]);
                    continue;
                }

                // 4) fallback global entre los que siguen empatados: GD, GF
                const fb = [...gg].sort((a, b) => {
                    // NO usamos puntos aquí porque ya están empatados en puntos global y en H2H
                    if (b.gd !== a.gd) return b.gd - a.gd;
                    if (b.gf !== a.gf) return b.gf - a.gf;
                    return 0;
                });

                ordered.push(...fb);

                // 5) si aún empatados exactos tras fallback => manual
                const first = fb[0];
                const sameAll = fb.every((x) => x.gd === first.gd && x.gf === first.gf);
                if (sameAll) {
                    for (const x of fb) unresolved.add(x.teamId);
                }
            }
        }

        return { ordered, unresolvedTeamIds: [...unresolved] };
    }

    private async resolveSeasonId(userId: string, seasonId?: string) {
        const sid = (seasonId ?? '').trim();
        if (sid) return sid;

        const u = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { activeSeasonId: true },
        });
        if (!u?.activeSeasonId) throw new BadRequestException('seasonId is required (no active season)');
        return u.activeSeasonId;
    }

    async computeStandings(args: { userId: string; seasonId?: string; locale: string }) {
        const seasonId = await this.resolveSeasonId(args.userId, args.seasonId);
        const locale = args.locale;

        // --- future-proof: features por deporte/formato ---
        const sportSlug = await this.getSeasonSportSlug(seasonId);
        const meta = this.getGroupsFeaturesBySportSlug(sportSlug);

        // groupsClosed: si ya existen standings persistidos para la season, consideramos cerrada la fase de grupos
        const groupsClosed = (await this.prisma.groupStanding.count({ where: { seasonId } })) > 0;
        (meta as any).groupsClosed = groupsClosed;

        // single round-robin por defecto (future-proof para la mayoría de deportes en grupos)
        const expectedMatchesForTeams = (n: number) => {
            if (!Number.isFinite(n) || n <= 1) return 0;
            return (n * (n - 1)) / 2;
        };

        const matches = await this.prisma.match.findMany({
            where: {
                seasonId,
                phaseCode: 'F01',
                resultConfirmed: true,
                homeScore: { not: null },
                awayScore: { not: null },
                groupCode: { not: null },
            },
            select: {
                groupCode: true,
                homeTeamId: true,
                awayTeamId: true,
                homeScore: true,
                awayScore: true,
                homeTeam: { select: { id: true, translations: true, groupCode: true } },
                awayTeam: { select: { id: true, translations: true, groupCode: true } },
            },
        });

        // agrupar matches por groupCode
        const byGroup = new Map<string, MatchRow[]>();
        const teamsByGroup = new Map<string, Map<string, { id: string; name: string }>>();

        for (const m of matches) {
            const g = m.groupCode!;
            const arr = byGroup.get(g) ?? [];
            arr.push({
                groupCode: g,
                homeTeamId: m.homeTeamId,
                awayTeamId: m.awayTeamId,
                homeScore: m.homeScore!,
                awayScore: m.awayScore!,
            });
            byGroup.set(g, arr);

            const tm = teamsByGroup.get(g) ?? new Map();
            tm.set(m.homeTeamId, { id: m.homeTeamId, name: this.teamName(m.homeTeam, locale) });
            tm.set(m.awayTeamId, { id: m.awayTeamId, name: this.teamName(m.awayTeam, locale) });
            teamsByGroup.set(g, tm);
        }

        // Detectar groupCodes reales desde Team (future-proof: fútbol A-L, béisbol A-E, etc.)
        const teamGroupRows = await this.prisma.team.findMany({
            where: { seasonId, groupCode: { not: null }, isPlaceholder: false },
            select: { groupCode: true },
            distinct: ['groupCode'],
        });

        const groupCodes =
            teamGroupRows.length > 0
                ? teamGroupRows
                    .map((x) => String(x.groupCode ?? '').trim().toUpperCase())
                    .filter(Boolean)
                    .sort((a, b) => a.localeCompare(b))
                : 'ABCDEFGHIJKL'.split('');

        const result: any[] = [];

        for (const groupCode of groupCodes) {
            // Inicializar equipos del grupo desde Team table (para no depender de que haya matches ya)
            const groupTeams = await this.prisma.team.findMany({
                where: { seasonId, groupCode },
                select: { id: true, translations: true, groupCode: true, isPlaceholder: true, flagKey: true },
            });

            const rowsMap = new Map<string, TeamRow>();
            for (const t of groupTeams) {
                rowsMap.set(t.id, {
                    teamId: t.id,
                    groupCode,
                    name: this.teamName(t, locale),
                    flagKey: (t as any).flagKey ?? null,
                    isPlaceholder: !!(t as any).isPlaceholder,
                    played: 0,
                    won: 0,
                    drawn: 0,
                    lost: 0,
                    gf: 0,
                    ga: 0,
                    gd: 0,
                    points: 0,
                    needsManual: false,
                });
            }

            const gMatches = byGroup.get(groupCode) ?? [];
            for (const m of gMatches) {
                const home = rowsMap.get(m.homeTeamId);
                const away = rowsMap.get(m.awayTeamId);
                if (!home || !away) continue;

                home.played += 1;
                away.played += 1;
                home.gf += m.homeScore;
                home.ga += m.awayScore;
                away.gf += m.awayScore;
                away.ga += m.homeScore;

                if (m.homeScore > m.awayScore) {
                    home.won += 1;
                    away.lost += 1;
                    home.points += 3;
                } else if (m.homeScore < m.awayScore) {
                    away.won += 1;
                    home.lost += 1;
                    away.points += 3;
                } else {
                    home.drawn += 1;
                    away.drawn += 1;
                    home.points += 1;
                    away.points += 1;
                }
            }

            for (const r of rowsMap.values()) r.gd = r.gf - r.ga;

            const ordered =
                meta.groupRankingMode === "WBC"
                    ? this.orderGroupWbc([...rowsMap.values()], gMatches)
                    : this.orderGroupFifa([...rowsMap.values()], gMatches);

            // asignar posiciones 1..4
            ordered.forEach((r, idx) => {
                // NO definimos pos final si hay needsManual dentro de un empate irresoluble:
                // igual damos pos provisional para UI, pero se marca needsManual
                (r as any).posGroup = idx + 1;
            });

            // ✅ expectedMatches para F01 debe contar TODOS los equipos del grupo (incluye placeholders),
            // porque en fase de grupos los placeholders tipo “REPECHAJE …” SÍ participan y generan partidos.
            const teamCount = groupTeams.length;

            // expectedMatches: single round-robin => n*(n-1)/2
            const expectedMatches = teamCount > 1 ? (teamCount * (teamCount - 1)) / 2 : 0;

            result.push({
                groupCode,
                expectedMatches,
                isComplete: expectedMatches > 0 ? gMatches.length === expectedMatches : false,
                confirmedMatches: gMatches.length,
                standings: ordered,
            });
        }

        return { seasonId, meta, groups: result };
    }

    async computeThirds(args: { userId: string; seasonId?: string; locale: string }) {
        const standings = await this.computeStandings(args);

        const meta = (standings as any)?.meta ?? null;

        // Si el deporte no usa terceros (ej: béisbol), devolvemos vacío future-proof
        if (meta && meta.thirdPlacesEnabled === false) {
            return {
                seasonId: standings.seasonId,
                meta,
                needsManualCut: false,
                thirds: [],
            };
        }

        const thirds = standings.groups
            .map((g: any) => {
                const third = (g.standings ?? []).find((x: any) => x.posGroup === 3);
                return third
                    ? {
                        groupCode: g.groupCode,
                        teamId: third.teamId,
                        name: third.name,
                        flagKey: (third as any).flagKey ?? null,
                        isPlaceholder: !!(third as any).isPlaceholder,
                        points: third.points,
                        gd: third.gd,
                        gf: third.gf,
                        ga: third.ga,
                        fromGroupNeedsManual: !!third.needsManual,
                    }
                    : null;
            })
            .filter(Boolean) as any[];

        thirds.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.gd !== a.gd) return b.gd - a.gd;
            if (b.gf !== a.gf) return b.gf - a.gf;
            return 0;
        });

        // detectar empate total en el corte 8/9 (pts, gd, gf iguales)
        let needsManualCut = false;
        let cutoffKey = '';
        const key = (t: any) => `${t.points}|${t.gd}|${t.gf}`;

        if (thirds.length >= 9) {
            const k8 = thirds[7];
            const k9 = thirds[8];
            needsManualCut = k8.points === k9.points && k8.gd === k9.gd && k8.gf === k9.gf;
            if (needsManualCut) cutoffKey = key(k8);
        }

        // Base: orden live + auto-top8
        const rankedBase = thirds.map((t, idx) => ({
            ...t,
            rankGlobal: idx + 1,
            isQualified: idx < 8,
            // ✅ si hay empate en el corte, marcamos TODOS los que comparten la key del 8vo
            needsManual: !!cutoffKey && key(t) === cutoffKey,
            manualOverride: false,
            manualReason: null,
        }));

        // ✅ Si existe ThirdPlaceRanking persistido (POST /admin/groups/close),
        // solo respetamos isQualified persistido cuando ya hubo override manual.
        // Antes de override, NO debemos mezclar ranking live con isQualified viejo.
        let ranked = rankedBase;
        try {
            const persisted = await this.prisma.thirdPlaceRanking.findMany({
                where: { seasonId: standings.seasonId },
                select: {
                    teamId: true,
                    isQualified: true,
                    needsManual: true,
                    manualOverride: true,
                    manualReason: true,
                },
            });

            if (persisted.length > 0) {
                const map = new Map<string, any>(persisted.map((p: any) => [String(p.teamId), p]));
                const anyOverride = persisted.some((p: any) => !!p.manualOverride || !!p.manualReason);

                if (anyOverride) {
                    ranked = rankedBase.map((r: any) => {
                        const p = map.get(String(r.teamId));
                        if (!p) return r;
                        return {
                            ...r,
                            // ⚠️ NO sobreescribimos rankGlobal desde DB (evita “ranking loco”)
                            isQualified: !!p.isQualified,
                            needsManual: !!p.needsManual,
                            manualOverride: !!p.manualOverride,
                            manualReason: p.manualReason ?? null,
                        };
                    });

                    // Si ya hubo override manual, el corte manual ya quedó resuelto
                    needsManualCut = false;
                } else {
                    // Si NO hay override manual, usamos cálculo live (auto-top8)
                    ranked = rankedBase;
                }
            }
        } catch {
            // fallback a cálculo live si la tabla aún no existe o falla
        }

        return {
            seasonId: standings.seasonId,
            meta,
            needsManualCut,
            thirds: ranked,
        };
    }

    private async assertSystemAdmin(userId: string) {
        const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
        if (!u) throw new BadRequestException('User not found');
        if (u.role !== 'ADMIN') throw new BadRequestException('Only ADMIN can perform this action');
    }

    async resolveKoPlaceholders(args: { userId: string; seasonId?: string; locale: string }) {
        // Recalcula standings (usa resultados confirmados) y reaplica placeholders KO.
        const standings = await this.computeStandings(args);
        const seasonId = standings.seasonId;

        const res = await this.applyGroupPlaceholdersToKOMatches({
            seasonId,
            groups: standings.groups,
        });

        return { seasonId, updated: (res as any)?.updated ?? 0 };
    }

    async closeGroups(args: { userId: string; seasonId?: string; locale: string }) {
        const standings = await this.computeStandings(args);

        // ✅ Guard: no permitir cierre si no están TODOS los grupos completos
        const incomplete = (standings.groups as any[])
            .filter((g: any) => !g.isComplete)
            .map((g: any) => ({
                groupCode: g.groupCode,
                confirmedMatches: g.confirmedMatches,
                expectedMatches: g.expectedMatches ?? null,
            }));

        if (incomplete.length > 0) {
            throw new BadRequestException(
                `Cannot close group stage: incomplete groups: ${incomplete
                    .map((x) => `${x.groupCode}(${x.confirmedMatches}/${x.expectedMatches ?? "?"})`)
                    .join(', ')}`,
            );
        }

        const meta = (standings as any)?.meta ?? null;

        const thirds = meta?.thirdPlacesEnabled === false
            ? { seasonId: standings.seasonId, needsManualCut: false, thirds: [] }
            : await this.computeThirds(args);

        const seasonId = standings.seasonId;

        // Persist GroupStanding
        const groupUpserts: any[] = [];
        for (const g of standings.groups as any[]) {
            for (const r of g.standings as any[]) {
                groupUpserts.push(
                    this.prisma.groupStanding.upsert({
                        where: { seasonId_groupCode_teamId: { seasonId, groupCode: g.groupCode, teamId: r.teamId } },
                        create: {
                            seasonId,
                            groupCode: g.groupCode,
                            teamId: r.teamId,
                            played: r.played,
                            won: r.won,
                            drawn: r.drawn,
                            lost: r.lost,
                            gf: r.gf,
                            ga: r.ga,
                            gd: r.gd,
                            points: r.points,
                            posGroup: r.posGroup ?? null,
                            needsManual: !!r.needsManual,
                            manualOverride: false,
                            manualReason: null,
                        },
                        update: {
                            played: r.played,
                            won: r.won,
                            drawn: r.drawn,
                            lost: r.lost,
                            gf: r.gf,
                            ga: r.ga,
                            gd: r.gd,
                            points: r.points,
                            posGroup: r.posGroup ?? null,
                            needsManual: !!r.needsManual,
                            // No pisamos manualOverride si ya lo puso un admin
                            manualReason: undefined,
                        },
                    }),
                );
            }
        }

        // Persist ThirdPlaceRanking (solo si hay terceros)
        const thirdUpserts: any[] = [];
        for (const t of thirds.thirds as any[]) {
            thirdUpserts.push(
                this.prisma.thirdPlaceRanking.upsert({
                    where: { seasonId_teamId: { seasonId, teamId: t.teamId } },
                    create: {
                        seasonId,
                        teamId: t.teamId,
                        groupCode: t.groupCode,
                        points: t.points,
                        gd: t.gd,
                        gf: t.gf,
                        ga: t.ga,
                        rankGlobal: t.rankGlobal ?? null,
                        isQualified: !!t.isQualified,
                        needsManual: !!t.needsManual,
                        manualOverride: false,
                        manualReason: null,
                    },
                    update: {
                        points: t.points,
                        gd: t.gd,
                        gf: t.gf,
                        ga: t.ga,
                        rankGlobal: t.rankGlobal ?? null,
                        isQualified: !!t.isQualified,
                        needsManual: !!t.needsManual,
                    },
                }),
            );
        }

        await this.prisma.$transaction([...groupUpserts, ...thirdUpserts]);

        // 3) Seed de BracketSlots (R32) solo si el deporte lo usa (fútbol)
        let bracketSeed: any = { created: 0, skipped: true, reason: "bracket disabled for this sport" };

        if (meta?.bracketR32Enabled !== false) {
            bracketSeed = await this.ensureR32BracketSlotsFromMatches({
                seasonId,
                groups: standings.groups as any[],
            });

            await this.applyR32BracketSlotsToMatches({ seasonId });
        }

        // ✅ NUEVO: resolver placeholders de KO (cualquier fase != F01) para cualquier evento
        // Esto cubre eventos como Béisbol (QF/SF/F) donde no existe bracket R32.
        const koResolved = await this.applyGroupPlaceholdersToKOMatches({
            seasonId,
            groups: standings.groups,
        });

        // Resumen útil para UI
        const needsManualGroups = (standings.groups as any[])
            .filter((g: any) => (g.standings ?? []).some((r: any) => r.needsManual))
            .map((g: any) => g.groupCode);

        const completeGroups = (standings.groups as any[]).filter((g: any) => g.isComplete).map((g: any) => g.groupCode);

        return {
            seasonId,
            meta,
            completeGroups,
            needsManualGroups,
            needsManualThirdsCut: !!thirds.needsManualCut,
            saved: {
                groupStandings: groupUpserts.length,
                thirdRankings: thirdUpserts.length,
            },
            bracketSeed,
        };
    }

    async setManualGroupOrder(args: { userId: string; dto: { seasonId: string; groupCode: string; orderedTeamIds: string[]; reason?: string } }) {
        await this.assertSystemAdmin(args.userId);

        const { seasonId, groupCode } = args.dto;
        const orderedTeamIds = (args.dto.orderedTeamIds ?? []).map((x) => String(x));
        if (!seasonId || !groupCode) throw new BadRequestException('seasonId and groupCode are required');
        // expectedCount dinámico (ej: fútbol 4, béisbol WBC 5, etc.)
        const teamsInGroup = await this.prisma.team.findMany({
            where: { seasonId, groupCode, isPlaceholder: false },
            select: { id: true },
        });
        const expectedCount = teamsInGroup.length;

        if (expectedCount <= 0) {
            throw new BadRequestException(`No teams found for seasonId=${seasonId} groupCode=${groupCode}`);
        }

        if (orderedTeamIds.length !== expectedCount) {
            throw new BadRequestException(`orderedTeamIds must have exactly ${expectedCount} teamIds`);
        }

        // Validar que esos teams pertenecen a ese grupo/season y NO son placeholders
        const teams = await this.prisma.team.findMany({
            where: { seasonId, groupCode, isPlaceholder: false },
            select: { id: true },
        });
        const validIds = new Set(teams.map((t) => t.id));
        for (const id of orderedTeamIds) {
            if (!validIds.has(id)) throw new BadRequestException(`teamId not in group ${groupCode}: ${id}`);
        }

        // Asegurar filas en GroupStanding (si no se ha hecho close aún)
        // Creamos si faltan, con valores en 0; luego el close los actualizará.
        const existing = await this.prisma.groupStanding.findMany({
            where: { seasonId, groupCode },
            select: { teamId: true },
        });
        const existingSet = new Set(existing.map((x) => x.teamId));
        const creates: any[] = [];
        for (const id of orderedTeamIds) {
            if (!existingSet.has(id)) {
                creates.push(
                    this.prisma.groupStanding.create({
                        data: {
                            seasonId,
                            groupCode,
                            teamId: id,
                            posGroup: null,
                            needsManual: true,
                            manualOverride: false,
                        },
                    }),
                );
            }
        }

        const updates: any[] = [];
        for (let i = 0; i < orderedTeamIds.length; i++) {
            updates.push(
                this.prisma.groupStanding.update({
                    where: { seasonId_groupCode_teamId: { seasonId, groupCode, teamId: orderedTeamIds[i] } },
                    data: {
                        posGroup: i + 1,
                        needsManual: false,
                        manualOverride: true,
                        manualReason: args.dto.reason ?? 'Manual group order',
                    },
                }),
            );
        }

        await this.prisma.$transaction([...creates, ...updates]);

        return { seasonId, groupCode, manualApplied: true };
    }

    // ✅ NUEVO: Resolver placeholders en matches KO (fase != F01) usando standings (1º/2º del grupo)
    // Esto NO depende de BracketSlot/R32. Sirve para béisbol u otros eventos con KO distinto.
    private async applyGroupPlaceholdersToKOMatches(opts: {
        seasonId: string;
        groups: Array<{
            groupCode: string;
            entries: Array<{ pos: number; teamId: string }>;
        }>;
    }): Promise<{ updated: number }> {
        // Map: "A" => { pos1: teamId, pos2: teamId }
        const posMap = new Map<string, { pos1?: string; pos2?: string }>();

        for (const g of opts.groups as any[]) {
            const m: { pos1?: string; pos2?: string } = {};

            // Caso A: formato "entries" (pos, teamId)
            if (Array.isArray(g?.entries)) {
                for (const e of g.entries) {
                    const p = Number(e?.pos);
                    const tid = String(e?.teamId ?? "");
                    if (!tid) continue;
                    if (p === 1) m.pos1 = tid;
                    if (p === 2) m.pos2 = tid;
                }
            }

            // Caso B: formato "standings" (posGroup, teamId) -> ES EL QUE VIENE DE computeStandings()
            if (Array.isArray(g?.standings)) {
                for (const r of g.standings) {
                    const p = Number(r?.posGroup);
                    const tid = String(r?.teamId ?? "");
                    if (!tid) continue;
                    if (p === 1) m.pos1 = tid;
                    if (p === 2) m.pos2 = tid;
                }
            }

            posMap.set(String(g.groupCode ?? "").trim().toUpperCase(), m);
        }

        const resolveFromPlaceholderRule = (rule?: string | null): string | null => {
            if (!rule) return null;

            // formatos esperados:
            // "A-1", "A1", "A_1", "A:1", "1A"
            const s = rule.trim().toUpperCase();

            let group: string | null = null;
            let pos: number | null = null;

            // A-1 / A1 / A_1 / A:1
            const m1 = s.match(/^([A-Z])\s*[-_:]?\s*([12])$/);
            if (m1) {
                group = m1[1];
                pos = Number(m1[2]);
            }

            // 1A
            if (!group || !pos) {
                const m2 = s.match(/^([12])\s*([A-Z])$/);
                if (m2) {
                    pos = Number(m2[1]);
                    group = m2[2];
                }
            }

            // "1ro Grupo A" / "2do Grupo B" / "1º Grupo C" / "1er Grupo D"
            if (!group || !pos) {
                const m3 = s.match(/^([12])\s*(?:º|°|O|RO|DO|ER)?\s*GRUPO\s*([A-Z])$/);
                if (m3) {
                    pos = Number(m3[1]);
                    group = m3[2];
                }
            }

            if (!group || !pos) return null;

            const map = posMap.get(group);
            if (!map) return null;

            if (pos === 1) return map.pos1 ?? null;
            if (pos === 2) return map.pos2 ?? null;
            return null;
        };

        // KO matches: fase != F01 y algún team placeholder
        const koMatches = await this.prisma.match.findMany({
            where: {
                seasonId: opts.seasonId,
                phaseCode: { not: "F01" },
                OR: [
                    { homeTeam: { isPlaceholder: true } },
                    { awayTeam: { isPlaceholder: true } },
                ],
            },
            select: {
                id: true,
                homeTeamId: true,
                awayTeamId: true,
                homeTeam: { select: { id: true, isPlaceholder: true, placeholderRule: true } },
                awayTeam: { select: { id: true, isPlaceholder: true, placeholderRule: true } },
            },
        });

        let updated = 0;

        for (const m of koMatches) {
            let newHomeId = m.homeTeamId;
            let newAwayId = m.awayTeamId;

            if (m.homeTeam?.isPlaceholder) {
                const resolved = resolveFromPlaceholderRule(m.homeTeam.placeholderRule);
                if (resolved) newHomeId = resolved;
            }

            if (m.awayTeam?.isPlaceholder) {
                const resolved = resolveFromPlaceholderRule(m.awayTeam.placeholderRule);
                if (resolved) newAwayId = resolved;
            }

            if (newHomeId !== m.homeTeamId || newAwayId !== m.awayTeamId) {
                await this.prisma.match.update({
                    where: { id: m.id },
                    data: {
                        homeTeamId: newHomeId,
                        awayTeamId: newAwayId,
                    },
                });
                updated += 1;
            }
        }

        return { updated };
    }

    private async ensureR32BracketSlotsFromMatches(args: {
        seasonId: string;
        groups: any[];
    }) {
        const { seasonId, groups } = args;

        // Si ya existen slots R32, no tocar (evita pisar manual overrides)
        const existing = await this.prisma.bracketSlot.count({
            where: { seasonId, round: "R32" },
        });

        if (existing > 0) {
            return { created: 0, skipped: true, existing };
        }

        // Detectar phaseCode KO que tenga 16 matches (Round of 32)
        const phaseCounts = await this.prisma.match.groupBy({
            by: ["phaseCode"],
            where: { seasonId, groupCode: null },
            _count: { _all: true },
        });

        const r32Phase = phaseCounts.find((x) => x._count._all === 16)?.phaseCode;

        if (!r32Phase) {
            throw new BadRequestException(
                `Cannot seed BracketSlot(R32): no KO phase with 16 matches found for seasonId=${seasonId}.`
            );
        }

        const koMatches = await this.prisma.match.findMany({
            where: { seasonId, groupCode: null, phaseCode: r32Phase },
            include: { homeTeam: true, awayTeam: true },
            orderBy: [{ matchNumber: "asc" }, { id: "asc" }],
        });

        // Mapa para resolver 1º/2º de cada grupo desde standings ya calculados
        // groups: [{ groupCode, standings:[{teamId,posGroup,...}] }]
        const posMap = new Map<string, string>(); // key: "A-1" => teamId
        for (const g of groups ?? []) {
            const code = String(g.groupCode ?? "").toUpperCase();
            const rows = Array.isArray(g.standings) ? g.standings : [];
            for (const r of rows) {
                const pos = Number(r.posGroup);
                const tid = r.teamId ? String(r.teamId) : "";
                if (!code || !tid || !Number.isFinite(pos)) continue;
                if (pos === 1 || pos === 2) posMap.set(`${code}-${pos}`, tid);
            }
        }

        const resolveFromPlaceholderRule = (team: any) => {
            const isPlaceholder = !!team?.isPlaceholder;
            const rule = (team?.placeholderRule ?? "").trim();

            // Si NO es placeholder, queda resuelto por sí mismo
            if (!isPlaceholder) {
                return {
                    teamId: String(team.id),
                    placeholderText: null as string | null,
                    needsManual: false,
                };
            }

            // Placeholder sin regla: no sabemos resolver
            if (!rule) {
                return {
                    teamId: null as string | null,
                    placeholderText: null as string | null,
                    needsManual: true,
                };
            }

            // Regla tipo: "1º Grupo A" / "1ro Grupo A" / "2do Grupo B"
            const m = rule.match(/^([12])\s*(?:º|o|ro|do|er)?\s*Grupo\s*([A-L])$/i);
            if (m) {
                const pos = Number(m[1]);
                const groupCode = String(m[2]).toUpperCase();
                const resolved = posMap.get(`${groupCode}-${pos}`) ?? null;

                return {
                    teamId: resolved,
                    placeholderText: rule,
                    // si resolvió, no necesita manual
                    needsManual: !resolved,
                };
            }

            // Todo lo demás (p.ej. terceros combos "3º Grupo A/B/C...")
            return {
                teamId: null as string | null,
                placeholderText: rule,
                needsManual: true,
            };
        };

        // Crear 2 slots por match
        const data: any[] = [];

        for (const m of koMatches) {
            const matchNo = m.matchNumber;
            if (matchNo == null) {
                throw new BadRequestException(
                    `Cannot seed BracketSlot(R32): KO match without matchNumber. matchId=${m.id}`
                );
            }

            const home = resolveFromPlaceholderRule(m.homeTeam);
            const away = resolveFromPlaceholderRule(m.awayTeam);

            data.push({
                seasonId,
                round: "R32",
                matchNo,
                slot: "HOME",
                placeholderText: home.placeholderText,
                teamId: home.teamId,
                needsManual: home.needsManual,
                manualOverride: false,
                manualReason: null,
            });

            data.push({
                seasonId,
                round: "R32",
                matchNo,
                slot: "AWAY",
                placeholderText: away.placeholderText,
                teamId: away.teamId,
                needsManual: away.needsManual,
                manualOverride: false,
                manualReason: null,
            });
        }

        await this.prisma.bracketSlot.createMany({ data });

        return {
            created: data.length,
            skipped: false,
            phaseCodeUsed: r32Phase,
            matches: koMatches.length,
        };
    }

    async setManualThirds(args: {
        userId: string;
        dto: { seasonId: string; qualifiedTeamIds: string[]; reason?: string };
    }) {
        await this.assertSystemAdmin(args.userId);

        const seasonId = String(args.dto.seasonId || '');
        const qualified = (args.dto.qualifiedTeamIds ?? []).map((x) => String(x));

        if (!seasonId) throw new BadRequestException('seasonId is required');
        if (qualified.length !== 8) throw new BadRequestException('qualifiedTeamIds must have exactly 8 teamIds');

        // 1) Calcular terceros "live" (orden correcto) y sincronizar thirdPlaceRanking
        const computed = await this.computeThirds({ userId: args.userId, seasonId, locale: 'es' });
        const computedThirds = (computed.thirds ?? []) as any[];
        const computedIds = computedThirds.map((t) => String(t.teamId));

        if (computedIds.length === 0) {
            throw new BadRequestException('No third-place teams found from live standings for this seasonId.');
        }

        // Detectar el bloque de empate REAL del corte 8/9 por clave pts|gd|gf (independiente del override previo)
        const key = (t: any) => `${t.points}|${t.gd}|${t.gf}`;
        let cutoffKey: string | null = null;
        if (computedThirds.length >= 9) {
            const k8 = key(computedThirds[7]);
            const k9 = key(computedThirds[8]);
            if (k8 === k9) cutoffKey = k8;
        }
        const tieIds = new Set<string>(
            cutoffKey ? computedThirds.filter((t) => key(t) === cutoffKey).map((t) => String(t.teamId)) : [],
        );

        // Eliminar filas viejas que ya no pertenecen a los terceros live
        await this.prisma.thirdPlaceRanking.deleteMany({
            where: { seasonId, teamId: { notIn: computedIds } },
        });

        // Upsert de todos los terceros live (12 normalmente)
        const syncUpserts = computedThirds.map((t: any) =>
            this.prisma.thirdPlaceRanking.upsert({
                where: { seasonId_teamId: { seasonId, teamId: String(t.teamId) } },
                create: {
                    seasonId,
                    teamId: String(t.teamId),
                    groupCode: t.groupCode,
                    points: t.points,
                    gd: t.gd,
                    gf: t.gf,
                    ga: t.ga,
                    rankGlobal: t.rankGlobal ?? null,
                    isQualified: !!t.isQualified, // auto-top8 mientras no haya override
                    needsManual: !!t.needsManual,
                    manualOverride: false,
                    manualReason: null,
                },
                update: {
                    groupCode: t.groupCode,
                    points: t.points,
                    gd: t.gd,
                    gf: t.gf,
                    ga: t.ga,
                    rankGlobal: t.rankGlobal ?? null,
                    // ⚠️ no pisamos manualOverride/manualReason aquí; lo hace el apply manual de abajo
                    needsManual: !!t.needsManual,
                },
            }),
        );

        await this.prisma.$transaction(syncUpserts);

        // 2) Validar que los IDs existan en thirdPlaceRanking
        const thirds = await this.prisma.thirdPlaceRanking.findMany({
            where: { seasonId },
            select: { teamId: true },
        });

        const thirdSet = new Set(thirds.map((t) => String(t.teamId)));
        for (const id of qualified) {
            if (!thirdSet.has(id)) throw new BadRequestException(`teamId is not in thirdPlaceRanking: ${id}`);
        }

        // 3) Reglas: si hay empate en el corte, solo se puede decidir dentro del bloque empatado
        if (tieIds.size > 0) {
            // Fijos: todos los que NO están en el empate y que están por encima del corte (rank <= 8) deben quedar clasificados
            const fixedAutoQualified = new Set<string>(
                computedThirds
                    .slice(0, 8)
                    .filter((t) => !tieIds.has(String(t.teamId)))
                    .map((t) => String(t.teamId)),
            );

            for (const id of fixedAutoQualified) {
                if (!qualified.includes(id)) {
                    throw new BadRequestException(`Cannot exclude fixed auto-qualified teamId: ${id}`);
                }
            }

            // Solo permitir cambios dentro del empate: los seleccionados extra (aparte de fijos) deben estar dentro del empate
            for (const id of qualified) {
                if (!fixedAutoQualified.has(id) && !tieIds.has(id)) {
                    throw new BadRequestException(`Invalid selection outside tie block: ${id}`);
                }
            }
        }

        // 4) Aplicar manual:
        // - isQualified según lista
        // - needsManual se apaga
        // - manualOverride/manualReason SOLO para equipos del empate (tieIds)
        const reason = args.dto.reason ?? null;

        const updates: any[] = [];
        for (const t of thirds) {
            const id = String(t.teamId);
            const inTie = tieIds.has(id);

            updates.push(
                this.prisma.thirdPlaceRanking.update({
                    where: { seasonId_teamId: { seasonId, teamId: id } },
                    data: {
                        isQualified: qualified.includes(id),
                        needsManual: false,
                        manualOverride: inTie, // ✅ SOLO empate
                        manualReason: inTie ? reason : null,
                    },
                }),
            );
        }

        await this.prisma.$transaction(updates);

        return { seasonId, manualApplied: true, qualifiedTeamIds: qualified, tieCount: tieIds.size };
    }

    // ============================
    // Auto-asignación de 3ros (como Excel)
    // ============================

    private isThirdComboPlaceholder(placeholderText: string | null | undefined): boolean {
        const raw = (placeholderText ?? '').trim();
        return /^3º\s*Grupo\s*[A-L]/i.test(raw);
    }

    private parseAllowedGroupsFromPlaceholder(placeholderText: string | null | undefined): string[] {
        const raw = (placeholderText ?? '').trim();
        if (!raw) return [];

        // Soporta: "3º Grupo A/B/C/D/F"
        const m = raw.match(/3º\s*Grupo\s*([A-L](?:\s*\/\s*[A-L])*)/i);
        if (!m) return [];

        const part = m[1] ?? '';
        return part
            .split('/')
            .map((x) => String(x).trim().toUpperCase())
            .filter((x) => /^[A-L]$/.test(x));
    }

    private async autoAssignThirdsToBracketSlots(args: {
        seasonId: string;
        slots: any[];
        eligibleThirds: any[]; // ThirdPlaceRanking (top8) ordenados
    }): Promise<{ updatedCount: number; unresolvedCount: number }> {
        const { seasonId, slots, eligibleThirds } = args;

        if (!Array.isArray(slots) || slots.length === 0) return { updatedCount: 0, unresolvedCount: 0 };
        if (!Array.isArray(eligibleThirds) || eligibleThirds.length === 0) return { updatedCount: 0, unresolvedCount: 0 };

        // Evitar duplicados: todo teamId ya usado en cualquier slot R32
        const used = new Set<string>();
        for (const s of slots) {
            const tid = s?.teamId ? String(s.teamId) : '';
            if (tid) used.add(tid);
        }

        // Candidatos: placeholders de terceros combo sin resolver y sin override manual
        const candidates = slots
            .filter((s: any) => {
                const isCombo = this.isThirdComboPlaceholder(s?.placeholderText);
                const hasTeam = !!s?.teamId;
                const hasManual = !!s?.manualOverride; // no pisar lo que el admin tocó
                return isCombo && !hasTeam && !hasManual;
            })
            .sort((a: any, b: any) => {
                const ma = Number(a.matchNo ?? 9999);
                const mb = Number(b.matchNo ?? 9999);
                if (ma !== mb) return ma - mb;
                return String(a.slot ?? '').localeCompare(String(b.slot ?? ''));
            });

        if (candidates.length === 0) return { updatedCount: 0, unresolvedCount: 0 };

        const updates: any[] = [];
        let unresolved = 0;

        for (const slot of candidates) {
            const allowed = this.parseAllowedGroupsFromPlaceholder(slot.placeholderText);
            if (allowed.length === 0) {
                unresolved++;
                continue;
            }

            // Busca el primer tercero disponible que cumpla el set permitido
            const pick = eligibleThirds.find((t: any) => {
                const tid = String(t?.teamId ?? '');
                const grp = String(t?.groupCode ?? '').toUpperCase();
                if (!tid || !grp) return false;
                if (used.has(tid)) return false;
                return allowed.includes(grp);
            });

            if (!pick) {
                unresolved++;
                continue;
            }

            const pickedTeamId = String(pick.teamId);
            used.add(pickedTeamId);

            updates.push(
                this.prisma.bracketSlot.update({
                    where: { id: slot.id },
                    data: {
                        teamId: pickedTeamId,
                        needsManual: false,
                        manualOverride: false,
                        manualReason: null,
                    },
                }),
            );
        }

        if (updates.length > 0) {
            await this.prisma.$transaction(updates);
        }

        return { updatedCount: updates.length, unresolvedCount: unresolved };
    }

    private async applyR32BracketSlotsToMatches(args: { seasonId: string; matchNo?: number }) {
        const { seasonId, matchNo } = args;

        // Traemos slots R32 (uno por HOME/AWAY) con teamId (si ya está resuelto) y placeholderText (para revertir si está null)
        const slots = await this.prisma.bracketSlot.findMany({
            where: {
                seasonId, round: 'R32',
                ...(typeof matchNo === 'number' ? { matchNo } : {}),
            },
            select: {
                matchNo: true,
                slot: true, // HOME | AWAY
                teamId: true,
                placeholderText: true,
            },
            orderBy: [{ matchNo: 'asc' }, { slot: 'asc' }],
        });

        if (!slots.length) return;

        // Para los slots que aún no tienen teamId, necesitamos el Team placeholder correspondiente (por placeholderRule)
        const placeholderTexts = Array.from(
            new Set(
                slots
                    .filter((s) => !s.teamId && !!s.placeholderText)
                    .map((s) => (s.placeholderText ?? '').trim())
                    .filter(Boolean),
            ),
        );

        const placeholderTeams = placeholderTexts.length
            ? await this.prisma.team.findMany({
                where: {
                    seasonId,
                    isPlaceholder: true,
                    placeholderRule: { in: placeholderTexts },
                },
                select: { id: true, placeholderRule: true },
            })
            : [];

        const placeholderMap = new Map<string, string>(); // placeholderText -> placeholderTeamId
        for (const t of placeholderTeams) {
            if (t.placeholderRule) placeholderMap.set(t.placeholderRule.trim(), t.id);
        }

        // Agrupar slots por matchNo
        const byMatch = new Map<number, { home?: any; away?: any }>();
        for (const s of slots) {
            const k = s.matchNo;
            if (!byMatch.has(k)) byMatch.set(k, {});
            const obj = byMatch.get(k)!;
            if (s.slot === 'HOME') obj.home = s;
            if (s.slot === 'AWAY') obj.away = s;
        }

        // Aplicar a Match (matchNumber == bracketSlot.matchNo)
        const ops: any[] = [];
        for (const [mNo, pair] of byMatch.entries()) {
            const data: any = {};

            // HOME
            if (pair.home?.teamId) {
                data.homeTeamId = pair.home.teamId;
            } else if (pair.home?.placeholderText) {
                const pid = placeholderMap.get((pair.home.placeholderText ?? '').trim());
                if (pid) data.homeTeamId = pid;
            }

            // AWAY
            if (pair.away?.teamId) {
                data.awayTeamId = pair.away.teamId;
            } else if (pair.away?.placeholderText) {
                const pid = placeholderMap.get((pair.away.placeholderText ?? '').trim());
                if (pid) data.awayTeamId = pid;
            }

            // Si no hay nada que aplicar, skip
            if (!Object.keys(data).length) continue;

            ops.push(
                this.prisma.match.updateMany({
                    where: { seasonId, matchNumber: mNo },
                    data,
                }),
            );
        }

        if (ops.length) {
            await this.prisma.$transaction(ops);
        }
    }

    async getBracketSlots(args: { userId: string; seasonId: string; locale?: string }) {
        await this.assertSystemAdmin(args.userId);

        const { seasonId } = args;

        const sportSlug = await this.getSeasonSportSlug(seasonId);
        const meta = this.getGroupsFeaturesBySportSlug(sportSlug);

        if (meta.bracketR32Enabled === false) {
            return {
                seasonId,
                meta,
                slots: [],
                eligibleThirds: [],
                autoAssigned: { updatedCount: 0, unresolvedCount: 0 },
            };
        }

        const slots0 = await this.prisma.bracketSlot.findMany({
            where: { seasonId, round: 'R32' },
            include: {
                team: {
                    include: {
                        translations: true, // 👈 clave para nombres por locale
                    },
                },
            },
            orderBy: [{ matchNo: 'asc' }, { slot: 'asc' }],
        });

        // También devolvemos los terceros elegibles (top8) para poblar dropdown en UI
        const thirds = await this.prisma.thirdPlaceRanking.findMany({
            where: { seasonId },
            include: {
                team: {
                    include: {
                        translations: true, // 👈 clave para nombres por locale
                    },
                },
            },
            orderBy: [{ rankGlobal: 'asc' }],
        });

        const eligibleThirds = (thirds ?? []).filter((t: any) => !!t.isQualified);

        // 3) Auto-asignación (NO pisa overrides manuales)
        const auto = await this.autoAssignThirdsToBracketSlots({
            seasonId,
            slots: slots0,
            eligibleThirds,
        });

        // 4) Si hubo cambios, releer para devolver ya actualizado
        const slots =
            auto.updatedCount > 0
                ? await this.prisma.bracketSlot.findMany({
                    where: { seasonId, round: 'R32' },
                    include: {
                        team: {
                            include: {
                                translations: true,
                            },
                        },
                    },
                    orderBy: [{ matchNo: 'asc' }, { slot: 'asc' }],
                })
                : slots0;

        return {
            seasonId,
            meta,
            slots,
            eligibleThirds,
            // opcional para QA (si no lo quieres, lo quitamos del return)
            autoAssigned: auto,
        };
    }

    async setBracketSlotManual(args: {
        userId: string;
        dto: {
            seasonId: string;
            matchNo: number;
            slot: 'HOME' | 'AWAY';
            teamId: string | null;
            reason?: string;
        };
    }) {

        await this.assertSystemAdmin(args.userId);
        const { dto } = args;
        const { seasonId, matchNo, slot, teamId } = dto;
        const reason = (dto.reason ?? '').trim() || null;

        const current = await this.prisma.bracketSlot.findFirst({
            where: { seasonId, round: 'R32', matchNo, slot },
        });

        if (!current) {
            throw new BadRequestException(
                `BracketSlot not found: seasonId=${seasonId}, matchNo=${matchNo}, slot=${slot}`
            );
        }

        // Solo permitir manual si era needsManual o si ya estaba en override (para editar)
        if (!current.needsManual && !current.manualOverride) {
            throw new BadRequestException(
                `This slot does not allow manual override (needsManual=false). matchNo=${matchNo} slot=${slot}`
            );
        }

        // Validar que el teamId (si viene) sea realmente un tercero clasificado
        if (teamId) {
            const ok = await this.prisma.thirdPlaceRanking.findFirst({
                where: { seasonId, teamId, isQualified: true },
            });
            if (!ok) {
                throw new BadRequestException(
                    `teamId is not an eligible qualified third: ${teamId}`
                );
            }

            // Evitar duplicados: ese teamId no puede estar usado en otro slot R32
            const usedElsewhere = await this.prisma.bracketSlot.findFirst({
                where: {
                    seasonId,
                    round: 'R32',
                    teamId,
                    NOT: { id: current.id },
                },
            });
            if (usedElsewhere) {
                throw new BadRequestException(
                    `teamId already used in another slot: ${teamId}`
                );
            }
        }

        await this.prisma.bracketSlot.update({
            where: { id: current.id },
            data: {
                teamId,
                needsManual: !teamId, // si se limpió, vuelve a pendiente
                manualOverride: true,
                manualReason: reason,
            },
        });

        await this.applyR32BracketSlotsToMatches({ seasonId, matchNo });

        return { ok: true };
    }
}