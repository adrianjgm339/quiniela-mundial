import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // ajusta si tu PrismaService está en otra ruta

type Score = { home: number; away: number };
type RuleMap = Record<string, number>; // code -> points

function outcome(h: number, a: number) {
  if (h === a) return 'D';
  return h > a ? 'H' : 'A';
}

// Intenta detectar el marcador confirmado desde el objeto Match,
// sin depender del nombre exacto del campo (así evitamos errores).
function getMatchScore(m: any): Score | null {
  // 1) campos comunes
  if (typeof m.homeScore === 'number' && typeof m.awayScore === 'number') return { home: m.homeScore, away: m.awayScore };
  if (typeof m.scoreHome === 'number' && typeof m.scoreAway === 'number') return { home: m.scoreHome, away: m.scoreAway };

  // 2) si guardas algo tipo score JSON
  if (m.score && typeof m.score.home === 'number' && typeof m.score.away === 'number') return { home: m.score.home, away: m.score.away };

  // 3) si guardas scores como JSON (ajusta si aplica)
  // ejemplo: m.scores = { home: 1, away: 2 } o similar
  if (m.scores && typeof m.scores.home === 'number' && typeof m.scores.away === 'number') return { home: m.scores.home, away: m.scores.away };

  return null;
}

function computePoints(rule: RuleMap, pick: { homePred: number; awayPred: number }, score: Score): number {
  let pts = 0;

  const exact = pick.homePred === score.home && pick.awayPred === score.away;
  const resultOk = outcome(pick.homePred, pick.awayPred) === outcome(score.home, score.away);
  const diffOk = (pick.homePred - pick.awayPred) === (score.home - score.away);
  const homeOk = pick.homePred === score.home;
  const awayOk = pick.awayPred === score.away;

  // Códigos soportados (puedes expandir luego con KO_GANADOR_FINAL, etc.)
  if (exact) pts += rule['EXACTO'] ?? 0;
  if (!exact && resultOk) pts += rule['RESULTADO'] ?? 0; // evita sumar RESULTADO si ya fue EXACTO (si así lo quieres)
  if (diffOk) pts += rule['BONUS_DIF'] ?? 0;
  if (homeOk) pts += rule['GOLES_LOCAL'] ?? 0;
  if (awayOk) pts += rule['GOLES_VISITA'] ?? 0;

  return pts;
}

@Injectable()
export class ScoringService {
  constructor(private readonly prisma: PrismaService) {}

    async listRules() {
    return this.prisma.scoringRule.findMany({
      orderBy: { id: 'asc' },
      include: { details: { orderBy: { code: 'asc' } } },
    });
  }

  async getRule(id: string) {
    return this.prisma.scoringRule.findUnique({
      where: { id },
      include: { details: { orderBy: { code: 'asc' } } },
    });
  }

  async createRule(input: {
    id: string;
    name: string;
    description?: string | null;
    isGlobal?: boolean;
    details?: Array<{ code: string; points: number }>;
  }) {
    const id = input.id?.trim();
    if (!id) throw new Error('id requerido');

    // Regla global: en este proyecto SOLO B01 debería ser global
    if (input.isGlobal && id !== 'B01') {
      throw new Error('Solo B01 puede ser global (baseline).');
    }

    const details = (input.details ?? []).map((d) => ({
      code: String(d.code).trim(),
      points: Number(d.points),
    }));

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.scoringRule.create({
        data: {
          id,
          name: input.name,
          description: input.description ?? null,
          isGlobal: !!input.isGlobal,
        },
      });

      if (details.length) {
        await tx.scoringRuleDetail.createMany({
          data: details.map((d) => ({ ruleId: id, code: d.code, points: d.points })),
        });
      }

      return tx.scoringRule.findUnique({
        where: { id },
        include: { details: { orderBy: { code: 'asc' } } },
      });
    });
  }

  async updateRule(id: string, input: { name?: string; description?: string | null; isGlobal?: boolean }) {
    if (input.isGlobal && id !== 'B01') {
      throw new Error('Solo B01 puede ser global (baseline).');
    }

    return this.prisma.scoringRule.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isGlobal !== undefined ? { isGlobal: input.isGlobal } : {}),
      },
      include: { details: { orderBy: { code: 'asc' } } },
    });
  }

  async setRuleDetails(ruleId: string, details: Array<{ code: string; points: number }>) {
    const clean = details.map((d) => ({
      code: String(d.code).trim(),
      points: Number(d.points),
    }));

    // Validación básica
    for (const d of clean) {
      if (!d.code) throw new Error('code requerido');
      if (!Number.isFinite(d.points) || !Number.isInteger(d.points)) throw new Error(`points inválido para ${d.code}`);
    }

    // Reemplazo total (más simple y consistente)
    return this.prisma.$transaction(async (tx) => {
      await tx.scoringRuleDetail.deleteMany({ where: { ruleId } });

      if (clean.length) {
        await tx.scoringRuleDetail.createMany({
          data: clean.map((d) => ({ ruleId, code: d.code, points: d.points })),
        });
      }

      return tx.scoringRule.findUnique({
        where: { id: ruleId },
        include: { details: { orderBy: { code: 'asc' } } },
      });
    });
  }

  async recompute(opts: { seasonId?: string }) {
    const B01 = 'B01';

    // 1) Matches confirmados (trae todos los campos para no depender del nombre de score)
    const matches = await this.prisma.match.findMany({
      where: {
        ...(opts.seasonId ? { seasonId: opts.seasonId } : {}),
        resultConfirmed: true,
      },
    });

    const matchScoreById = new Map<string, Score>();
    for (const m of matches) {
      const sc = getMatchScore(m as any);
      if (sc) matchScoreById.set(m.id, sc);
    }

    const matchIds = Array.from(matchScoreById.keys());
    if (matchIds.length === 0) {
      return { ok: true, seasonId: opts.seasonId ?? null, picksProcessed: 0, note: 'No confirmed matches with score found' };
    }

    // 2) Picks en esos matches + liga (para saber su scoringRuleId)
    const picks = await this.prisma.pick.findMany({
      where: { matchId: { in: matchIds } },
      include: {
        league: { select: { id: true, scoringRuleId: true } },
      },
    });

    // 3) Conjunto de ruleIds a cargar (liga + B01)
    const ruleIds = new Set<string>([B01]);
    for (const p of picks) {
      const rid = p.league?.scoringRuleId;
      if (rid) ruleIds.add(rid);
    }

    // 4) Cargar detalles de reglas
    const details = await this.prisma.scoringRuleDetail.findMany({
      where: { ruleId: { in: Array.from(ruleIds) } },
      select: { ruleId: true, code: true, points: true },
    });

    const ruleMapById = new Map<string, RuleMap>();
    for (const d of details) {
      if (!ruleMapById.has(d.ruleId)) ruleMapById.set(d.ruleId, {});
      ruleMapById.get(d.ruleId)![d.code] = d.points;
    }

    // 5) Upsert PickScore para (regla liga) y B01
    let processed = 0;

    // Batches para no reventar transacciones gigantes
    const batchSize = 300;
    for (let i = 0; i < picks.length; i += batchSize) {
      const batch = picks.slice(i, i + batchSize);

      const tx: any[] = [];
      for (const p of batch) {
        const score = matchScoreById.get(p.matchId);
        if (!score) continue;

        const pickPred = { homePred: p.homePred, awayPred: p.awayPred };

        const leagueRuleId = p.league?.scoringRuleId || B01;

        const leagueRule = ruleMapById.get(leagueRuleId) ?? {};
        const globalRule = ruleMapById.get(B01) ?? {};

        const ptsLeague = computePoints(leagueRule, pickPred, score);
        const ptsGlobal = computePoints(globalRule, pickPred, score);

        // upsert league-rule score
        tx.push(
          this.prisma.pickScore.upsert({
            where: { pickId_ruleId: { pickId: p.id, ruleId: leagueRuleId } },
            create: { pickId: p.id, ruleId: leagueRuleId, points: ptsLeague },
            update: { points: ptsLeague },
          }),
        );

        // upsert B01 score
        tx.push(
          this.prisma.pickScore.upsert({
            where: { pickId_ruleId: { pickId: p.id, ruleId: B01 } },
            create: { pickId: p.id, ruleId: B01, points: ptsGlobal },
            update: { points: ptsGlobal },
          }),
        );

        processed++;
      }

      if (tx.length) await this.prisma.$transaction(tx);
    }

    return {
      ok: true,
      seasonId: opts.seasonId ?? null,
      confirmedMatchesWithScore: matchIds.length,
      picksProcessed: processed,
      rulesLoaded: Array.from(ruleIds),
    };
  }
}
