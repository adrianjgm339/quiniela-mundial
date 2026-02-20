import { Body, Controller, Get, Post, Patch, Param, Req, UseGuards, Query } from '@nestjs/common';
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
  create(
    @Req() req,
    @Body() body: { seasonId: string; name: string; scoringRuleId: string; joinPolicy?: 'PUBLIC' | 'PRIVATE' | 'APPROVAL' },
  ) {
    return this.leagues.createLeague(req.user.userId, body);
  }

  @Post('join')
  join(@Req() req, @Body() body: { joinCode: string }) {
    return this.leagues.joinByCode(req.user.userId, body);
  }

  @Get('public')
  publicLeagues(@Req() req, @Query('seasonId') seasonId: string) {
    return this.leagues.listPublicLeagues(req.user.userId, seasonId);
  }

  @Post(':leagueId/join-public')
  joinPublic(@Req() req, @Param('leagueId') leagueId: string) {
    return this.leagues.joinPublic(req.user.userId, leagueId);
  }

  @Get(':leagueId/access')
  access(@Req() req, @Param('leagueId') leagueId: string) {
    return this.leagues.getLeagueAccessSettings(req.user.userId, leagueId);
  }

  @Patch(':leagueId/access')
  updateAccess(
    @Req() req,
    @Param('leagueId') leagueId: string,
    @Body() body: { joinPolicy?: 'PUBLIC' | 'PRIVATE' | 'APPROVAL'; inviteEnabled?: boolean; rotateCode?: boolean },
  ) {
    return this.leagues.updateLeagueAccessSettings(req.user.userId, leagueId, body);
  }

  @Get(':leagueId/join-requests')
  joinRequests(@Req() req, @Param('leagueId') leagueId: string) {
    return this.leagues.listJoinRequests(req.user.userId, leagueId);
  }

  @Patch(':leagueId/join-requests/:requestId/decide')
  decideJoin(
    @Req() req,
    @Param('leagueId') leagueId: string,
    @Param('requestId') requestId: string,
    @Body() body: { approve: boolean; reason?: string },
  ) {
    return this.leagues.decideJoinRequest(req.user.userId, leagueId, requestId, body);
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
