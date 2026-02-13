import { Body, Controller, Get, Post, Patch, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { LeaguesService } from './leagues.service';

@UseGuards(JwtAuthGuard)
@Controller('leagues')
export class LeaguesController {
  constructor(private leagues: LeaguesService) { }

  @Get('mine')
  mine(@Req() req) {
    return this.leagues.myLeagues(req.user.userId);
  }

  @Post()
  create(@Req() req, @Body() body: { seasonId: string; name: string; scoringRuleId: string }) {
    return this.leagues.createLeague(req.user.userId, body);
  }

  @Post('join')
  join(@Req() req, @Body() body: { joinCode: string }) {
    return this.leagues.joinByCode(req.user.userId, body);
  }

  @Patch(':leagueId/scoring-rule')
  setScoringRule(
    @Req() req,
    @Param('leagueId') leagueId: string,
    @Body() body: { scoringRuleId: string | null },
  ) {
    return this.leagues.setLeagueScoringRule(req.user.userId, leagueId, body.scoringRuleId ?? null);
  }

  @Patch(':leagueId/custom-rule')
  updateCustomRule(
    @Req() req,
    @Param('leagueId') leagueId: string,
    @Body()
    body: {
      name?: string;
      details: Array<{ code: string; points: number }>;
    },
  ) {
    return this.leagues.updateLeagueCustomRule(req.user.userId, leagueId, body);
  }

  @Get(':leagueId/members')
  members(@Req() req, @Param('leagueId') leagueId: string) {
    return this.leagues.listMembers(req.user.userId, leagueId);
  }

  @Patch(':leagueId/members/:userId/role')
  setMemberRole(
    @Req() req,
    @Param('leagueId') leagueId: string,
    @Param('userId') targetUserId: string,
    @Body() body: { role: 'ADMIN' | 'MEMBER' },
  ) {
    return this.leagues.setMemberRole(req.user.userId, leagueId, targetUserId, body.role);
  }

}
