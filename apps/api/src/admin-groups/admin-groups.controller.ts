import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AdminGroupsService } from './admin-groups.service';
import { Body, Patch, Post } from '@nestjs/common';
import { ManualGroupDto } from './dto/manual-group.dto';
import { ManualThirdsDto } from './dto/manual-thirds.dto';

@Controller('admin/groups')
export class AdminGroupsController {
  constructor(private readonly svc: AdminGroupsService) { }

  @UseGuards(JwtAuthGuard)
  @Get('standings')
  getStandings(
    @Req() req: any,
    @Query('seasonId') seasonId?: string,
    @Query('locale') locale: string = 'es',
  ) {
    const userId = req.user?.userId ?? req.user?.id ?? req.user?.sub;
    return this.svc.computeStandings({ userId, seasonId, locale });
  }

  @UseGuards(JwtAuthGuard)
  @Get('bracket-slots')
  async getBracketSlots(
    @Req() req: any,
    @Query('seasonId') seasonId: string,
    @Query('locale') locale: string = 'es',
  ) {
    const userId = req.user?.userId ?? req.user?.id ?? req.user?.sub;
    return this.svc.getBracketSlots({ userId, seasonId, locale });
  }

  @UseGuards(JwtAuthGuard)
  @Patch('bracket-slots/manual')
  async setBracketSlotManual(@Req() req: any, @Body() dto: any) {
    const userId = req.user?.userId ?? req.user?.id ?? req.user?.sub;
    return this.svc.setBracketSlotManual({ userId, dto });
  }

  @UseGuards(JwtAuthGuard)
  @Get('thirds')
  getThirds(
    @Req() req: any,
    @Query('seasonId') seasonId?: string,
    @Query('locale') locale: string = 'es',
  ) {
    const userId = req.user?.userId ?? req.user?.id ?? req.user?.sub;
    return this.svc.computeThirds({ userId, seasonId, locale });
  }

  @UseGuards(JwtAuthGuard)
  @Post('close')
  close(@Req() req: any, @Query('seasonId') seasonId?: string, @Query('locale') locale: string = 'es') {
    const userId = req.user?.userId ?? req.user?.id ?? req.user?.sub;
    return this.svc.closeGroups({ userId, seasonId, locale });
  }
  @UseGuards(JwtAuthGuard)
  @Post('resolve-ko-placeholders')
  resolveKoPlaceholders(
    @Req() req: any,
    @Query('seasonId') seasonId?: string,
    @Query('locale') locale: string = 'es',
  ) {
    const userId = req.user?.userId ?? req.user?.id ?? req.user?.sub;
    return this.svc.resolveKoPlaceholders({ userId, seasonId, locale });
  }

  @UseGuards(JwtAuthGuard)
  @Patch('standings/manual')
  setManualGroup(@Req() req: any, @Body() dto: ManualGroupDto) {
    const userId = req.user?.userId ?? req.user?.id ?? req.user?.sub;
    return this.svc.setManualGroupOrder({ userId, dto });
  }

  @UseGuards(JwtAuthGuard)
  @Patch('thirds/manual')
  setManualThirds(@Req() req: any, @Body() dto: ManualThirdsDto) {
    const userId = req.user?.userId ?? req.user?.id ?? req.user?.sub;
    return this.svc.setManualThirds({ userId, dto });
  }

}