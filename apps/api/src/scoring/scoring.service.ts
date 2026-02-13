import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // ajusta si tu PrismaService está en otra ruta

type Score = { home: number; away: number };
type RuleMap = Record<string, number>; // code -> points

function genCustomRuleId() {
  // Ej: "C250114-3F8K2" (C + yymmdd + sufijo)
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const suffix = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  return `C${yy}${mm}${dd}-${suffix}`;
}

function validateCustomDetails(details: Array<{ code: string; points: number }>) {
  if (!Array.isArray(details) || details.length === 0) throw new BadRequestException('details requerido');

  let hasPositive = false;

  for (const d of details) {
    const code = String(d.code || '').trim();
    const points = Number(d.points);

    if (!code) throw new BadRequestException('code requerido');
    if (!Number.isFinite(points) || !Number.isInteger(points))
      throw new BadRequestException(`points inválido para ${code}`);
    if (points < 0) throw new BadRequestException(`points no puede ser negativo (${code})`);
    if (points > 0) hasPositive = true;
  }

  if (!hasPositive) throw new BadRequestException('Debes asignar puntos (>0) a al menos 1 concepto.');
}

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

  // KO_GANADOR_FINAL (solo KO):
  // Requiere:
  // - Match: homeTeamId/awayTeamId + advanceTeamId (cuando empate real)
  // - Pick:  koWinnerTeamId (cuando empate pronosticado)
  // Lo activamos cuando existan esos campos (ver pasos DB/API/UI).
  // if (isKnockout && predictedAdvanceTeamId && actualAdvanceTeamId && predictedAdvanceTeamId === actualAdvanceTeamId) {
  //   pts += rule['KO_GANADOR_FINAL'] ?? 0;
  // }

  return pts;
}

function computeKoGanadorFinal(rule: RuleMap, match: any, pick: any, score: Score): number {
  const koPts = rule['KO_GANADOR_FINAL'] ?? 0;
  if (!koPts) return 0; // si la regla no lo tiene o es 0, no hace nada

  // Solo KO (según tu convención: fase != F01)
  const phaseCode = match?.phaseCode;
  if (!phaseCode || phaseCode === 'F01') return 0;

  const homeTeamId = match?.homeTeamId;
  const awayTeamId = match?.awayTeamId;
  if (!homeTeamId || !awayTeamId) return 0;

  // Actual advance (real)
  const actualAdvanceTeamId =
    score.home === score.away
      ? match?.advanceTeamId
      : score.home > score.away
        ? homeTeamId
        : awayTeamId;

  // Predicted advance (usuario)
  const predictedAdvanceTeamId =
    pick.homePred === pick.awayPred
      ? pick?.koWinnerTeamId
      : pick.homePred > pick.awayPred
        ? homeTeamId
        : awayTeamId;

  if (!actualAdvanceTeamId || !predictedAdvanceTeamId) return 0;

  return actualAdvanceTeamId === predictedAdvanceTeamId ? koPts : 0;
}

@Injectable()
export class ScoringService {
  constructor(private readonly prisma: PrismaService) { }

  async listRules(seasonId?: string) {
    const rules = await this.prisma.scoringRule.findMany({
      where: seasonId ? { seasonId } : undefined,
      orderBy: { id: 'asc' },
      include: { details: true },
    });

    // Si hay seasonId, ordenamos detalles según el orden de conceptos del evento
    if (seasonId) {
      const concepts = await this.prisma.seasonScoringConcept.findMany({
        where: { seasonId },
        // IMPORTANTE: como no hay campo "order", usamos el orden de inserción (id)
        // (y lo garantizamos re-seedeando siempre en el orden correcto)
        orderBy: { id: 'asc' },
        select: { code: true },
      });

      const idx = new Map<string, number>();
      concepts.forEach((c, i) => idx.set(c.code, i));

      for (const r of rules) {
        r.details.sort((a, b) => {
          const ia = idx.has(a.code) ? idx.get(a.code)! : 9999;
          const ib = idx.has(b.code) ? idx.get(b.code)! : 9999;
          return ia - ib;
        });
      }
    }

    return rules;
  }

  async getRule(id: string) {
    return this.prisma.scoringRule.findUnique({
      where: { id },
      include: { details: true },
    });
  }

  async listSeasonConcepts(seasonId: string) {
    const sid = (seasonId || '').trim();
    if (!sid) throw new BadRequestException('seasonId requerido');

    const rows = await this.prisma.seasonScoringConcept.findMany({
      where: { seasonId: sid },
      orderBy: { id: 'asc' },
      select: { code: true, label: true },
    });

    return rows;
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
        include: { details: true },
      });
    });
  }

  async createCustomRule(input: {
    name: string;
    description?: string | null;
    details: Array<{ code: string; points: number }>;
  }) {
    const name = (input.name || '').trim();
    if (!name) throw new BadRequestException('name requerido');

    const details = (input.details ?? []).map((d) => ({
      code: String(d.code).trim(),
      points: Number(d.points),
    }));

    validateCustomDetails(details);

    // id automático y único
    let id = genCustomRuleId();
    for (let i = 0; i < 10; i++) {
      const exists = await this.prisma.scoringRule.findUnique({ where: { id } });
      if (!exists) break;
      id = genCustomRuleId();
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.scoringRule.create({
        data: {
          id,
          name,
          description: input.description ?? null,
          isGlobal: false,
        },
      });

      await tx.scoringRuleDetail.createMany({
        data: details.map((d) => ({ ruleId: id, code: d.code, points: d.points })),
      });

      return tx.scoringRule.findUnique({
        where: { id },
        include: { details: true },
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
      include: { details: true },
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
        include: { details: true },
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
    const matchById = new Map<string, any>();

    for (const m of matches) {
      matchById.set(m.id, m as any);

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

        let ptsLeague = computePoints(leagueRule, pickPred, score);
        let ptsGlobal = computePoints(globalRule, pickPred, score);

        const match = matchById.get(p.matchId);
        if (match) {
          ptsLeague += computeKoGanadorFinal(leagueRule, match, p, score);
          ptsGlobal += computeKoGanadorFinal(globalRule, match, p, score);
        }

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
