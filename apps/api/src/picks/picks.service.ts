import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PickStatus } from '@prisma/client';

@Injectable()
export class PicksService {
  constructor(private prisma: PrismaService) { }

  async list(args: { userId: string; leagueId: string }) {
    const { userId, leagueId } = args;
    if (!leagueId) throw new BadRequestException('leagueId is required');

    const member = await this.prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
      select: { status: true },
    });
    if (!member || member.status !== 'ACTIVE')
      throw new ForbiddenException('Not a league member');

    return this.prisma.pick.findMany({
      where: { userId, leagueId },
      select: {
        id: true,
        leagueId: true,
        matchId: true,
        homePred: true,
        awayPred: true,
        status: true,
        updatedAt: true,
        koWinnerTeamId: true,
        predTotalHits: true,
        predTotalErrors: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async othersForMatch(args: {
    viewerUserId: string;
    leagueId: string;
    matchId: string;
  }) {
    const { viewerUserId, leagueId, matchId } = args;

    if (!leagueId || !matchId) {
      throw new BadRequestException('leagueId and matchId are required');
    }

    const member = await this.prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId: viewerUserId } },
      select: { status: true },
    });

    if (!member || member.status !== 'ACTIVE') {
      throw new ForbiddenException('Not a league member');
    }

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        seasonId: true,
        closeUtc: true,
        resultConfirmed: true,
      },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const canReveal =
      !!match.resultConfirmed ||
      (!!match.closeUtc && Date.now() > match.closeUtc.getTime());

    if (!canReveal) {
      return {
        locked: true,
        canReveal: false,
        resultConfirmed: false,
        leagueId,
        matchId,
        rows: [],
      };
    }

    const league = await this.prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, scoringRuleId: true },
    });

    if (!league) {
      throw new NotFoundException('League not found');
    }

    const season = await this.prisma.season.findUnique({
      where: { id: match.seasonId },
      select: { defaultScoringRuleId: true },
    });

    const ruleIdUsed = league.scoringRuleId ?? season?.defaultScoringRuleId ?? 'B01';

    const [ruleDetails, conceptLabels] = await Promise.all([
      this.prisma.scoringRuleDetail.findMany({
        where: { ruleId: ruleIdUsed },
        select: { code: true, points: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.seasonScoringConcept.findMany({
        where: { seasonId: match.seasonId },
        select: { code: true, label: true },
      }),
    ]);

    const labelMap = new Map(conceptLabels.map((x) => [x.code, x.label]));
    const template = ruleDetails.map((d) => ({
      code: d.code,
      label: labelMap.get(d.code) ?? d.code,
    }));

    const picks = await this.prisma.pick.findMany({
      where: {
        leagueId,
        matchId,
        userId: { not: viewerUserId },
      },
      select: {
        id: true,
        userId: true,
        homePred: true,
        awayPred: true,
        predTotalHits: true,
        predTotalErrors: true,
        status: true,
        updatedAt: true,
        user: {
          select: {
            displayName: true,
          },
        },
      },
      orderBy: [
        { user: { displayName: 'asc' } },
        { updatedAt: 'asc' },
      ],
    });

    if (!match.resultConfirmed) {
      return {
        locked: false,
        canReveal: true,
        resultConfirmed: false,
        leagueId,
        matchId,
        rows: picks.map((p) => ({
          userId: p.userId,
          displayName: p.user?.displayName ?? null,
          homePred: p.homePred,
          awayPred: p.awayPred,
          predTotalHits: p.predTotalHits ?? null,
          predTotalErrors: p.predTotalErrors ?? null,
          status: String(p.status),
          updatedAt: p.updatedAt.toISOString(),
          totalPoints: null,
          breakdown: template.map((t) => ({
            code: t.code,
            label: t.label,
            points: 0,
          })),
        })),
      };
    }

    const pickIds = picks.map((p) => p.id);

    const pickScores = pickIds.length
      ? await this.prisma.pickScore.findMany({
        where: {
          pickId: { in: pickIds },
          ruleId: ruleIdUsed,
        },
        select: {
          id: true,
          pickId: true,
          points: true,
        },
      })
      : [];

    const pickScoreIdByPickId = new Map(pickScores.map((ps) => [ps.pickId, ps.id]));
    const totalByPickId = new Map(pickScores.map((ps) => [ps.pickId, ps.points]));

    const details = pickScores.length
      ? await this.prisma.pickScoreDetail.findMany({
        where: { pickScoreId: { in: pickScores.map((ps) => ps.id) } },
        select: {
          pickScoreId: true,
          code: true,
          points: true,
        },
        orderBy: { code: 'asc' },
      })
      : [];

    const detailsByPickScoreId = new Map<string, Array<{ code: string; points: number }>>();
    for (const d of details) {
      const arr = detailsByPickScoreId.get(d.pickScoreId) ?? [];
      arr.push({ code: d.code, points: d.points });
      detailsByPickScoreId.set(d.pickScoreId, arr);
    }

    return {
      locked: false,
      canReveal: true,
      resultConfirmed: true,
      leagueId,
      matchId,
      rows: picks.map((p) => {
        const pickScoreId = pickScoreIdByPickId.get(p.id);
        const raw = pickScoreId ? detailsByPickScoreId.get(pickScoreId) ?? [] : [];
        const rawMap = new Map(raw.map((x) => [x.code, x.points]));

        return {
          userId: p.userId,
          displayName: p.user?.displayName ?? null,
          homePred: p.homePred,
          awayPred: p.awayPred,
          predTotalHits: p.predTotalHits ?? null,
          predTotalErrors: p.predTotalErrors ?? null,
          status: String(p.status),
          updatedAt: p.updatedAt.toISOString(),
          totalPoints: totalByPickId.get(p.id) ?? 0,
          breakdown: template.map((t) => ({
            code: t.code,
            label: t.label,
            points: rawMap.get(t.code) ?? 0,
          })),
        };
      }),
    };
  }

  async myMatchBreakdown(args: {
    userId: string;
    leagueId: string;
    matchId: string;
  }) {
    const { userId, leagueId, matchId } = args;

    if (!leagueId || !matchId) {
      throw new BadRequestException('leagueId and matchId are required');
    }

    const member = await this.prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
      select: { status: true },
    });

    if (!member || member.status !== 'ACTIVE') {
      throw new ForbiddenException('Not a league member');
    }

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        seasonId: true,
        resultConfirmed: true,
      },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const [league, season] = await Promise.all([
      this.prisma.league.findUnique({
        where: { id: leagueId },
        select: { scoringRuleId: true },
      }),
      this.prisma.season.findUnique({
        where: { id: match.seasonId },
        select: { defaultScoringRuleId: true },
      }),
    ]);

    const ruleIdUsed = league?.scoringRuleId ?? season?.defaultScoringRuleId ?? 'B01';

    const [ruleDetails, conceptLabels] = await Promise.all([
      this.prisma.scoringRuleDetail.findMany({
        where: { ruleId: ruleIdUsed },
        select: { code: true, points: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.seasonScoringConcept.findMany({
        where: { seasonId: match.seasonId },
        select: { code: true, label: true },
      }),
    ]);

    const labelMap = new Map(conceptLabels.map((x) => [x.code, x.label]));
    const template = ruleDetails.map((d) => ({
      code: d.code,
      label: labelMap.get(d.code) ?? d.code,
    }));

    if (!match.resultConfirmed) {
      return {
        available: false,
        leagueId,
        matchId,
        ruleIdUsed,
        totalPoints: 0,
        breakdown: template.map((t) => ({
          code: t.code,
          label: t.label,
          points: 0,
        })),
      };
    }

    const pick = await this.prisma.pick.findUnique({
      where: {
        leagueId_matchId_userId: {
          leagueId,
          matchId,
          userId,
        },
      },
      select: { id: true },
    });

    if (!pick) {
      return {
        available: true,
        leagueId,
        matchId,
        ruleIdUsed,
        totalPoints: 0,
        breakdown: template.map((t) => ({
          code: t.code,
          label: t.label,
          points: 0,
        })),
      };
    }

    const pickScore = await this.prisma.pickScore.findUnique({
      where: {
        pickId_ruleId: {
          pickId: pick.id,
          ruleId: ruleIdUsed,
        },
      },
      select: {
        id: true,
        points: true,
      },
    });

    if (!pickScore) {
      return {
        available: true,
        leagueId,
        matchId,
        ruleIdUsed,
        totalPoints: 0,
        breakdown: template.map((t) => ({
          code: t.code,
          label: t.label,
          points: 0,
        })),
      };
    }

    const details = await this.prisma.pickScoreDetail.findMany({
      where: { pickScoreId: pickScore.id },
      select: {
        code: true,
        points: true,
      },
      orderBy: { code: 'asc' },
    });

    const detailMap = new Map(details.map((d) => [d.code, d.points]));

    return {
      available: true,
      leagueId,
      matchId,
      ruleIdUsed,
      totalPoints: pickScore.points,
      breakdown: template.map((t) => ({
        code: t.code,
        label: t.label,
        points: detailMap.get(t.code) ?? 0,
      })),
    };
  }

  async upsert(args: {
    userId: string;
    leagueId: string;
    matchId: string;
    homePred: number;
    awayPred: number;
    koWinnerTeamId?: string | null;
    predTotalHits?: number;
    predTotalErrors?: number;
  }) {
    const {
      userId,
      leagueId,
      matchId,
      homePred,
      awayPred,
      koWinnerTeamId,
      predTotalHits,
      predTotalErrors,
    } = args;

    // ✅ Validación: match existe y no está cerrado
    const dbMatch = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        closeUtc: true,
        resultConfirmed: true,
        phaseCode: true,
        homeTeamId: true,
        awayTeamId: true,
      },
    });

    if (!dbMatch) {
      throw new BadRequestException('Match not found');
    }

    // (opcional recomendado) si ya está confirmado el resultado, se bloquea
    if (dbMatch.resultConfirmed) {
      throw new BadRequestException(
        'Match result already confirmed. Pick is locked.',
      );
    }

    // Bloqueo por cierre
    if (dbMatch.closeUtc && Date.now() > dbMatch.closeUtc.getTime()) {
      throw new BadRequestException(
        'Match is closed. You cannot edit this pick.',
      );
    }

    if (!leagueId || !matchId)
      throw new BadRequestException('leagueId and matchId are required');
    if (!Number.isInteger(homePred) || !Number.isInteger(awayPred)) {
      throw new BadRequestException('homePred and awayPred must be integers');
    }
    if (homePred < 0 || awayPred < 0 || homePred > 50 || awayPred > 50) {
      throw new BadRequestException('invalid score range');
    }

    if (predTotalHits !== undefined) {
      if (!Number.isInteger(predTotalHits))
        throw new BadRequestException('predTotalHits must be an integer');
      if (predTotalHits < 0 || predTotalHits > 100)
        throw new BadRequestException('invalid predTotalHits range');
    }

    if (predTotalErrors !== undefined) {
      if (!Number.isInteger(predTotalErrors))
        throw new BadRequestException('predTotalErrors must be an integer');
      if (predTotalErrors < 0 || predTotalErrors > 20)
        throw new BadRequestException('invalid predTotalErrors range');
    }

    // KO: si el usuario pronostica empate en fases KO, debe indicar quién avanza
    const isKO = dbMatch.phaseCode !== 'F01';
    const isTie = homePred === awayPred;

    let finalKoWinnerTeamId: string | null = null;

    if (isKO && isTie) {
      if (!koWinnerTeamId) {
        throw new BadRequestException(
          'KO: koWinnerTeamId es requerido cuando pronosticas empate',
        );
      }
      if (
        koWinnerTeamId !== dbMatch.homeTeamId &&
        koWinnerTeamId !== dbMatch.awayTeamId
      ) {
        throw new BadRequestException(
          'KO: koWinnerTeamId inválido (debe ser homeTeamId o awayTeamId)',
        );
      }
      finalKoWinnerTeamId = koWinnerTeamId;
    } else {
      // si NO es KO o NO es empate, no debe guardarse desempate
      finalKoWinnerTeamId = null;
    }

    const member = await this.prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
      select: { status: true },
    });
    if (!member || member.status !== 'ACTIVE')
      throw new ForbiddenException('Not a league member');

    let status: PickStatus = PickStatus.VALID;
    if (dbMatch.closeUtc && new Date() > new Date(dbMatch.closeUtc))
      status = PickStatus.LATE;

    return this.prisma.pick.upsert({
      where: { leagueId_matchId_userId: { leagueId, matchId, userId } },
      create: {
        leagueId,
        matchId,
        userId,
        homePred,
        awayPred,
        koWinnerTeamId: finalKoWinnerTeamId,
        status,
        predTotalHits,
        predTotalErrors,
      },
      update: {
        homePred,
        awayPred,
        koWinnerTeamId: finalKoWinnerTeamId,
        status,
        predTotalHits,
        predTotalErrors,
      },
      select: {
        id: true,
        leagueId: true,
        matchId: true,
        homePred: true,
        awayPred: true,
        koWinnerTeamId: true,
        status: true,
        updatedAt: true,
        predTotalHits: true,
        predTotalErrors: true,
      },
    });
  }
}
