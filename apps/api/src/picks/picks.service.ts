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
  constructor(private prisma: PrismaService) {}

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
