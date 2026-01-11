import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
    if (!member || member.status !== 'ACTIVE') throw new ForbiddenException('Not a league member');

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
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async upsert(args: { userId: string; leagueId: string; matchId: string; homePred: number; awayPred: number }) {
    const { userId, leagueId, matchId, homePred, awayPred } = args;

    // ✅ Validación: match existe y no está cerrado
    const dbMatch = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, closeUtc: true, resultConfirmed: true },
    });

    if (!dbMatch) {
      throw new BadRequestException('Match not found');
    }

    // (opcional recomendado) si ya está confirmado el resultado, se bloquea
    if (dbMatch.resultConfirmed) {
      throw new BadRequestException('Match result already confirmed. Pick is locked.');
    }

    // Bloqueo por cierre
    if (dbMatch.closeUtc && Date.now() > dbMatch.closeUtc.getTime()) {
      throw new BadRequestException('Match is closed. You cannot edit this pick.');
    }

    if (!leagueId || !matchId) throw new BadRequestException('leagueId and matchId are required');
    if (!Number.isInteger(homePred) || !Number.isInteger(awayPred)) {
      throw new BadRequestException('homePred and awayPred must be integers');
    }
    if (homePred < 0 || awayPred < 0 || homePred > 50 || awayPred > 50) {
      throw new BadRequestException('invalid score range');
    }

    const member = await this.prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
      select: { status: true },
    });
    if (!member || member.status !== 'ACTIVE') throw new ForbiddenException('Not a league member');

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, closeUtc: true },
    });
    if (!match) throw new NotFoundException('Match not found');

    let status: PickStatus = PickStatus.VALID;
    if (match.closeUtc && new Date() > new Date(match.closeUtc)) status = PickStatus.LATE;

    return this.prisma.pick.upsert({
      where: { leagueId_matchId_userId: { leagueId, matchId, userId } },
      create: { leagueId, matchId, userId, homePred, awayPred, status },
      update: { homePred, awayPred, status },
      select: { id: true, leagueId: true, matchId: true, homePred: true, awayPred: true, status: true, updatedAt: true },
    });
  }
}
