import {
  Body,
  Controller,
  Get,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UpsertPickDto } from './dto/upsert-pick.dto';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PicksService } from './picks.service';

@Controller('picks')
@UseGuards(JwtAuthGuard)
export class PicksController {
  constructor(private readonly picks: PicksService) { }

  @Get()
  list(@Req() req: any, @Query('leagueId') leagueId: string) {
    const userId = req.user.userId ?? req.user.id ?? req.user.sub;
    return this.picks.list({ userId, leagueId });
  }

  @Get('others')
  othersForMatch(
    @Req() req: any,
    @Query('leagueId') leagueId: string,
    @Query('matchId') matchId: string,
  ) {
    const viewerUserId = req.user.userId ?? req.user.id ?? req.user.sub;
    return this.picks.othersForMatch({ viewerUserId, leagueId, matchId });
  }

  @Get('me/match-breakdown')
  myMatchBreakdown(
    @Req() req: any,
    @Query('leagueId') leagueId: string,
    @Query('matchId') matchId: string,
  ) {
    const userId = req.user.userId ?? req.user.id ?? req.user.sub;
    return this.picks.myMatchBreakdown({ userId, leagueId, matchId });
  }

  @Put()
  upsert(
    @Req() req: any,
    @Body()
    body: UpsertPickDto,
  ) {
    const userId = req.user.userId ?? req.user.id ?? req.user.sub;
    return this.picks.upsert({ userId, ...body });
  }
}
