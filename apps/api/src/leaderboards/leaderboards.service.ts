import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type Row = { userId: string; points: number; rank: number; displayName?: string | null };

@Injectable()
export class LeaderboardsService {
  constructor(private readonly prisma: PrismaService) {}

  private async attachNames(rows: Row[]) {
    const ids = Array.from(new Set(rows.map(r => r.userId)));
    if (!ids.length) return rows;

    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true },
    });

    const map = new Map(users.map(u => [u.id, u.displayName]));
    return rows.map(r => ({ ...r, displayName: map.get(r.userId) ?? null }));
  }

  async leagueLeaderboard(opts: { leagueId: string; viewerUserId: string; limit: number }) {
    const league = await this.prisma.league.findUnique({
      where: { id: opts.leagueId },
      select: { id: true, scoringRuleId: true, name: true, joinCode: true },
    });
    if (!league) throw new Error('League not found');

    // Si liga aún no tiene regla asignada, por ahora usamos B01 para que no quede vacío.
    const ruleId = league.scoringRuleId ?? 'B01';

    // 1) Top
    const top = await this.prisma.$queryRaw<Row[]>`
      WITH totals AS (
        SELECT p."userId" AS "userId", COALESCE(SUM(ps.points), 0)::int AS points
        FROM "PickScore" ps
        JOIN "Pick" p ON p.id = ps."pickId"
        JOIN "Match" m ON m.id = p."matchId"
        WHERE p."leagueId" = ${opts.leagueId}
          AND ps."ruleId" = ${ruleId}
          AND m."resultConfirmed" = true
        GROUP BY p."userId"
      ),
      ranked AS (
        SELECT "userId", points,
          DENSE_RANK() OVER (ORDER BY points DESC, "userId" ASC) AS rank
        FROM totals
      )
      SELECT "userId", points, rank::int AS rank
      FROM ranked
      ORDER BY rank ASC
      LIMIT ${opts.limit};
    `;

    // 2) Mi posición (aunque no esté en top)
    const meArr = await this.prisma.$queryRaw<Row[]>`
      WITH totals AS (
        SELECT p."userId" AS "userId", COALESCE(SUM(ps.points), 0)::int AS points
        FROM "PickScore" ps
        JOIN "Pick" p ON p.id = ps."pickId"
        JOIN "Match" m ON m.id = p."matchId"
        WHERE p."leagueId" = ${opts.leagueId}
          AND ps."ruleId" = ${ruleId}
          AND m."resultConfirmed" = true
        GROUP BY p."userId"
      ),
      ranked AS (
        SELECT "userId", points,
          DENSE_RANK() OVER (ORDER BY points DESC, "userId" ASC) AS rank
        FROM totals
      )
      SELECT "userId", points, rank::int AS rank
      FROM ranked
      WHERE "userId" = ${opts.viewerUserId}
      LIMIT 1;
    `;

    const topNamed = await this.attachNames(top);
    const meNamed = await this.attachNames(meArr);

    return {
      scope: 'LEAGUE',
      league: { id: league.id, name: league.name, joinCode: league.joinCode },
      ruleIdUsed: ruleId,
      top: topNamed,
      me: meNamed[0] ?? null,
    };
  }

  async worldLeaderboard(opts: { viewerUserId: string; limit: number }) {
    const B01 = 'B01';

    const top = await this.prisma.$queryRaw<Row[]>`
      WITH league_totals AS (
        SELECT p."userId" AS "userId", p."leagueId" AS "leagueId", COALESCE(SUM(ps.points),0)::int AS points
        FROM "PickScore" ps
        JOIN "Pick" p ON p.id = ps."pickId"
        JOIN "Match" m ON m.id = p."matchId"
        WHERE ps."ruleId" = ${B01}
          AND m."resultConfirmed" = true
        GROUP BY p."userId", p."leagueId"
      ),
      best AS (
        SELECT "userId", MAX(points)::int AS points
        FROM league_totals
        GROUP BY "userId"
      ),
      ranked AS (
        SELECT "userId", points,
          DENSE_RANK() OVER (ORDER BY points DESC, "userId" ASC) AS rank
        FROM best
      )
      SELECT "userId", points, rank::int AS rank
      FROM ranked
      ORDER BY rank ASC
      LIMIT ${opts.limit};
    `;

    const meArr = await this.prisma.$queryRaw<Row[]>`
      WITH league_totals AS (
        SELECT p."userId" AS "userId", p."leagueId" AS "leagueId", COALESCE(SUM(ps.points),0)::int AS points
        FROM "PickScore" ps
        JOIN "Pick" p ON p.id = ps."pickId"
        JOIN "Match" m ON m.id = p."matchId"
        WHERE ps."ruleId" = ${B01}
          AND m."resultConfirmed" = true
        GROUP BY p."userId", p."leagueId"
      ),
      best AS (
        SELECT "userId", MAX(points)::int AS points
        FROM league_totals
        GROUP BY "userId"
      ),
      ranked AS (
        SELECT "userId", points,
          DENSE_RANK() OVER (ORDER BY points DESC, "userId" ASC) AS rank
        FROM best
      )
      SELECT "userId", points, rank::int AS rank
      FROM ranked
      WHERE "userId" = ${opts.viewerUserId}
      LIMIT 1;
    `;

    return {
      scope: 'WORLD',
      ruleIdUsed: B01,
      bestMode: 'BEST_LEAGUE_TOTAL',
      top: await this.attachNames(top),
      me: (await this.attachNames(meArr))[0] ?? null,
    };
  }

  async countryLeaderboard(opts: { countryCode: string; viewerUserId: string; limit: number }) {
    const B01 = 'B01';

    const top = await this.prisma.$queryRaw<Row[]>`
      WITH league_totals AS (
        SELECT p."userId" AS "userId", p."leagueId" AS "leagueId", COALESCE(SUM(ps.points),0)::int AS points
        FROM "PickScore" ps
        JOIN "Pick" p ON p.id = ps."pickId"
        JOIN "Match" m ON m.id = p."matchId"
        WHERE ps."ruleId" = ${B01}
          AND m."resultConfirmed" = true
        GROUP BY p."userId", p."leagueId"
      ),
      best AS (
        SELECT lt."userId", MAX(lt.points)::int AS points
        FROM league_totals lt
        JOIN "User" u ON u.id = lt."userId"
        WHERE u."countryCode" = ${opts.countryCode}
        GROUP BY lt."userId"
      ),
      ranked AS (
        SELECT "userId", points,
          DENSE_RANK() OVER (ORDER BY points DESC, "userId" ASC) AS rank
        FROM best
      )
      SELECT "userId", points, rank::int AS rank
      FROM ranked
      ORDER BY rank ASC
      LIMIT ${opts.limit};
    `;

    const meArr = await this.prisma.$queryRaw<Row[]>`
      WITH league_totals AS (
        SELECT p."userId" AS "userId", p."leagueId" AS "leagueId", COALESCE(SUM(ps.points),0)::int AS points
        FROM "PickScore" ps
        JOIN "Pick" p ON p.id = ps."pickId"
        JOIN "Match" m ON m.id = p."matchId"
        WHERE ps."ruleId" = ${B01}
          AND m."resultConfirmed" = true
        GROUP BY p."userId", p."leagueId"
      ),
      best AS (
        SELECT lt."userId", MAX(lt.points)::int AS points
        FROM league_totals lt
        JOIN "User" u ON u.id = lt."userId"
        WHERE u."countryCode" = ${opts.countryCode}
        GROUP BY lt."userId"
      ),
      ranked AS (
        SELECT "userId", points,
          DENSE_RANK() OVER (ORDER BY points DESC, "userId" ASC) AS rank
        FROM best
      )
      SELECT "userId", points, rank::int AS rank
      FROM ranked
      WHERE "userId" = ${opts.viewerUserId}
      LIMIT 1;
    `;

    return {
      scope: 'COUNTRY',
      countryCode: opts.countryCode,
      ruleIdUsed: B01,
      bestMode: 'BEST_LEAGUE_TOTAL',
      top: await this.attachNames(top),
      me: (await this.attachNames(meArr))[0] ?? null,
    };
  }
}
