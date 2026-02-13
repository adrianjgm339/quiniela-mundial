import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { MatchesService } from './matches.service';
import { UpdateMatchResultDto } from './dto/update-match-result.dto';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matches: MatchesService) { }

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
    @Req() req: any,
    @Param('matchId') matchId: string,
    @Body() dto: UpdateMatchResultDto,
  ) {
    const role = req.user?.role;
    if (role !== 'ADMIN') {
      // seguridad: aunque peguen URL o llamen endpoint directo
      const { ForbiddenException } = require('@nestjs/common');
      throw new ForbiddenException('Admin only');
    }

    return this.matches.updateResult(matchId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/reset-ko')
  async resetKo(
    @Req() req: any,
    @Query('seasonId') seasonId?: string,
    @Query('mode') mode: 'full' | 'future' | 'groups' | 'all' = 'full',
  ) {
    const role = req.user?.role;
    if (role !== 'ADMIN') {
      const { ForbiddenException } = require('@nestjs/common');
      throw new ForbiddenException('Admin only');
    }

    if (!seasonId) {
      throw new BadRequestException('seasonId is required');
    }

    return this.matches.resetKo({ seasonId, mode });
  }

}
