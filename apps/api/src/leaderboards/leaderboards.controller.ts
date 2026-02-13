import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { LeaderboardsService } from './leaderboards.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class LeaderboardsController {
  constructor(private readonly lbs: LeaderboardsService) { }

  // Ranking de una liga (regla de la liga)
  @Get('leagues/:leagueId/leaderboard')
  async leagueLeaderboard(
    @Req() req: any,
    @Param('leagueId') leagueId: string,
    @Query('limit') limit?: string,
  ) {
    return this.lbs.leagueLeaderboard({
      leagueId,
      viewerUserId: req.user.id,
      limit: limit ? Number(limit) : 50,
    });
  }

  // Ranking mundial (B01 + BEST_LEAGUE_TOTAL)
  @Get('leaderboards/world')
  async world(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('seasonId') seasonId?: string,
  ) {
    return this.lbs.worldLeaderboard({
      viewerUserId: req.user.id,
      limit: limit ? Number(limit) : 50,
      seasonId: seasonId || undefined,
    });
  }

  // Ranking local por país (B01 + BEST_LEAGUE_TOTAL + countryCode)
  @Get('leaderboards/country/:countryCode')
  async country(
    @Req() req: any,
    @Param('countryCode') countryCode: string,
    @Query('limit') limit?: string,
    @Query('seasonId') seasonId?: string,
  ) {
    return this.lbs.countryLeaderboard({
      countryCode: countryCode.toUpperCase(),
      viewerUserId: req.user.id,
      limit: limit ? Number(limit) : 50,
      seasonId: seasonId || undefined,
    });
  }
}
