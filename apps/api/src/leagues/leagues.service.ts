import { BadRequestException, Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeaguesService {
  constructor(private prisma: PrismaService) {}

  async myLeagues(userId: string) {
    const rows = await this.prisma.leagueMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: {
        league: {
          select: {
            id: true,
            name: true,
            joinCode: true,
            seasonId: true,
            createdAt: true,
            createdById: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return rows.map((r) => r.league);
  }

  async createLeague(userId: string, input: { seasonId: string; name: string }) {
    const name = (input.name || '').trim();
    const seasonId = (input.seasonId || '').trim();
    if (!name || !seasonId) throw new BadRequestException('seasonId and name are required');

    // joinCode simple (luego lo hacemos más robusto)
    const joinCode = Math.random().toString(36).slice(2, 8).toUpperCase();

    const league = await this.prisma.league.create({
      data: {
        seasonId,
        name,
        joinCode,
        createdById: userId,
        members: {
          create: {
            userId,
            status: 'ACTIVE',
          },
        },
      },
      select: { id: true, name: true, joinCode: true, seasonId: true, createdAt: true, createdById: true },
    });

    return league;
  }

  async joinByCode(userId: string, input: { joinCode: string }) {
    const joinCode = (input.joinCode || '').trim().toUpperCase();
    if (!joinCode) throw new BadRequestException('joinCode is required');

    const league = await this.prisma.league.findUnique({ where: { joinCode } });
    if (!league) throw new NotFoundException('League not found');

    // upsert membership
    await this.prisma.leagueMember.upsert({
      where: { leagueId_userId: { leagueId: league.id, userId } },
      update: { status: 'ACTIVE' },
      create: { leagueId: league.id, userId, status: 'ACTIVE' },
    });

    return { ok: true, leagueId: league.id };
  }

  async setActiveLeague(userId: string, leagueId: string) {
    const membership = await this.prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('Not a member of this league');
    }

    // por ahora: guardamos en user un campo activo
    // si aún no existe activeLeagueId en schema, lo agregamos luego (pero por ahora seguimos con localStorage)
    return { ok: true };
  }
}
