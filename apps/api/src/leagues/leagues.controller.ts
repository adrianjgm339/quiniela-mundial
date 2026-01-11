import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { LeaguesService } from './leagues.service';

@Controller('leagues')
@UseGuards(JwtAuthGuard)
export class LeaguesController {
  constructor(private leagues: LeaguesService) {}

  @Get('mine')
  mine(@Req() req) {
    return this.leagues.myLeagues(req.user.userId);
  }

  @Post()
  create(@Req() req, @Body() body: { seasonId: string; name: string }) {
    return this.leagues.createLeague(req.user.userId, body);
  }

  @Post('join')
  join(@Req() req, @Body() body: { joinCode: string }) {
    return this.leagues.joinByCode(req.user.userId, body);
  }
}
