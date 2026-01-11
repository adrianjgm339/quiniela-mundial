import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMatchResultDto } from './dto/update-match-result.dto';

type ListArgs = {
  userId: string;
  locale: string;
  seasonId?: string;
  phaseCode?: string;
  groupCode?: string;
};

@Injectable()
export class MatchesService {
  constructor(private prisma: PrismaService) {}

  async list(args: ListArgs) {
    const { userId, locale, phaseCode, groupCode } = args;

    // 1) Determinar seasonId (query param o activeSeason del user)
    let seasonId = args.seasonId;

    if (!seasonId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { activeSeasonId: true },
      });
      seasonId = user?.activeSeasonId ?? undefined;
    }

    if (!seasonId) {
      throw new BadRequestException('No active season selected');
    }

    // 2) Traer matches con nombres traducidos de equipos
    const matches = await this.prisma.match.findMany({
      where: {
        seasonId,
        ...(phaseCode ? { phaseCode } : {}),
        ...(groupCode ? { groupCode } : {}),
      },
      orderBy: { utcDateTime: 'asc' },
      select: {
        id: true,
        externalId: true,
        phaseCode: true,
        groupCode: true,
        matchNumber: true,
        venue: true,
        utcDateTime: true,
        closeUtc: true,
        closeMinutes: true,
        status: true,
        statusRaw: true,
        resultConfirmed: true,
        homeScore: true,
        awayScore: true,
        homeTeam: {
          select: {
            id: true,
            externalId: true,
            flagKey: true,
            isPlaceholder: true,
            placeholderRule: true,
            translations: {
              where: { locale },
              select: { name: true },
            },
          },
        },
        awayTeam: {
          select: {
            id: true,
            externalId: true,
            flagKey: true,
            isPlaceholder: true,
            placeholderRule: true,
            translations: {
              where: { locale },
              select: { name: true },
            },
          },
        },
      },
    });

        // 3) DTO limpio para front (incluye dateKey para agrupar por fecha)
    return matches.map((m) => {
      const d = new Date(m.utcDateTime);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mi = String(d.getUTCMinutes()).padStart(2, '0');

      const dateKey = `${yyyy}-${mm}-${dd}`;
      const timeUtc = `${hh}:${mi}`;

      return {
        id: m.id,
        externalId: m.externalId,

        dateKey,
        timeUtc,

        phaseCode: m.phaseCode,
        groupCode: m.groupCode,
        matchNumber: m.matchNumber,
        venue: m.venue,

        utcDateTime: m.utcDateTime,
        closeUtc: m.closeUtc,
        closeMinutes: m.closeMinutes,

        status: m.status,
        statusRaw: m.statusRaw,
        resultConfirmed: m.resultConfirmed,

        score:
          m.homeScore != null && m.awayScore != null
            ? { home: m.homeScore, away: m.awayScore }
            : null,

        homeTeam: {
          id: m.homeTeam.id,
          externalId: m.homeTeam.externalId,
          name: m.homeTeam.translations[0]?.name ?? m.homeTeam.placeholderRule ?? '',
          flagKey: m.homeTeam.flagKey,
          isPlaceholder: m.homeTeam.isPlaceholder,
        },
        awayTeam: {
          id: m.awayTeam.id,
          externalId: m.awayTeam.externalId,
          name: m.awayTeam.translations[0]?.name ?? m.awayTeam.placeholderRule ?? '',
          flagKey: m.awayTeam.flagKey,
          isPlaceholder: m.awayTeam.isPlaceholder,
        },
      };
    });
  }
  async updateResult(matchId: string, dto: UpdateMatchResultDto) {
    return this.prisma.match.update({
      where: { id: matchId },
      data: {
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        resultConfirmed: dto.resultConfirmed,
      },
    });
  }

}
