import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { MatchesService } from './matches.service';
import { UpdateMatchResultDto } from './dto/update-match-result.dto';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @Req() req: any,
    @Query('locale') locale = 'es',
    @Query('seasonId') seasonId?: string,
    @Query('phaseCode') phaseCode?: string,
    @Query('groupCode') groupCode?: string,
  ) {
    const userId = req.user.userId ?? req.user.id ?? req.user.sub;
    return this.matches.list({
      userId,
      locale,
      seasonId,
      phaseCode,
      groupCode,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':matchId/result')
  updateResult(
    @Param('matchId') matchId: string,
    @Body() dto: UpdateMatchResultDto,
  ) {
    return this.matches.updateResult(matchId, dto);
  }
}
