import { Body, Controller, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { JwtAuthGuard } from '../auth/jwt.guard'; // ajusta si tu guard está en otra ruta

@Controller('scoring')
@UseGuards(JwtAuthGuard)
export class ScoringController {
  constructor(private readonly scoring: ScoringService) { }

  private assertAdmin(req: any) {
    if (req.user?.role !== 'ADMIN') throw new ForbiddenException('Admin only');
  }

  @Get('rules')
  async listRules(@Query('seasonId') seasonId?: string) {
    // lectura: cualquier usuario autenticado
    return this.scoring.listRules(seasonId || undefined);
  }

  @Get('concepts')
  async listConcepts(@Query('seasonId') seasonId?: string) {
    if (!seasonId) throw new NotFoundException('seasonId is required');
    return this.scoring.listSeasonConcepts(seasonId);
  }

  @Get('rules/:id')
  async getRule(@Param('id') id: string) {
    // lectura: cualquier usuario autenticado
    const rule = await this.scoring.getRule(id);
    if (!rule) throw new NotFoundException('Rule not found');
    return rule;
  }

  @Post('rules/custom')
  async createCustomRule(
    @Body()
    body: {
      seasonId: string;
      name: string;
      description?: string | null;
      details: Array<{ code: string; points: number }>;
    },
  ) {
    // Cualquier usuario autenticado puede crear una regla personalizada
    // (la restricción “solo admin de liga” la conectamos cuando implementemos roles por liga en UI/Configurar)
    return this.scoring.createCustomRule(body);
  }

  @Post('rules')
  async createRule(
    @Req() req: any,
    @Body()
    body: {
      id: string;
      name: string;
      description?: string | null;
      isGlobal?: boolean;
      details?: Array<{ code: string; points: number }>;
    },
  ) {
    this.assertAdmin(req);
    return this.scoring.createRule(body);
  }

  @Put('rules/:id')
  async updateRule(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string | null; isGlobal?: boolean },
  ) {
    this.assertAdmin(req);
    return this.scoring.updateRule(id, body);
  }

  @Put('rules/:id/details')
  async setRuleDetails(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { details: Array<{ code: string; points: number }> },
  ) {
    this.assertAdmin(req);
    return this.scoring.setRuleDetails(id, body.details);
  }


  @Post('recompute')
  async recompute(@Req() req: any, @Query('seasonId') seasonId?: string) {
    if (req.user?.role !== 'ADMIN') throw new ForbiddenException('Admin only');
    return this.scoring.recompute({ seasonId: seasonId || undefined });
  }

}
