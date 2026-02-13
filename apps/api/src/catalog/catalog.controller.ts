import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CatalogService } from './catalog.service';

type NamesByLocale = Record<string, string>;

function assertAdmin(req: any) {
  if (!req?.user) throw new BadRequestException('No autenticado');
  if (req.user.role !== 'ADMIN') throw new BadRequestException('Solo ADMIN');
}

@Controller('catalog')
export class CatalogController {
  constructor(private catalog: CatalogService) { }

  // Público (usado por /[locale]/catalog)
  @Get()
  async getCatalog(@Query('locale') locale = 'es') {
    return this.catalog.getCatalog(locale);
  }

  // ---------------------------
  // ADMIN CRUD
  // ---------------------------

  @UseGuards(JwtAuthGuard)
  @Post('sports')
  async createSport(@Req() req: any, @Body() body: { names: NamesByLocale }) {
    assertAdmin(req);
    return this.catalog.createSport({ names: body.names });
  }

  @UseGuards(JwtAuthGuard)
  @Patch('sports/:id')
  async updateSport(@Req() req: any, @Param('id') id: string, @Body() body: { names: NamesByLocale }) {
    assertAdmin(req);
    return this.catalog.updateSport(id, { names: body.names });
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sports/:id')
  async deleteSport(@Req() req: any, @Param('id') id: string) {
    assertAdmin(req);
    return this.catalog.deleteSport(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('competitions')
  async createCompetition(
    @Req() req: any,
    @Body() body: { sportId: string; names: NamesByLocale },
  ) {
    assertAdmin(req);
    return this.catalog.createCompetition({ sportId: body.sportId, names: body.names });
  }

  @UseGuards(JwtAuthGuard)
  @Patch('competitions/:id')
  async updateCompetition(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { names: NamesByLocale },
  ) {
    assertAdmin(req);
    return this.catalog.updateCompetition(id, { names: body.names });
  }

  @UseGuards(JwtAuthGuard)
  @Delete('competitions/:id')
  async deleteCompetition(@Req() req: any, @Param('id') id: string) {
    assertAdmin(req);
    return this.catalog.deleteCompetition(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('seasons')
  async createSeason(
    @Req() req: any,
    @Body()
    body: {
      competitionId: string;
      names: NamesByLocale;
      startDate?: string | null;
      endDate?: string | null;
      defaultScoringRuleId?: string;
    },

  ) {
    assertAdmin(req);
    return this.catalog.createSeason({
      competitionId: body.competitionId,
      names: body.names,
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      defaultScoringRuleId: body.defaultScoringRuleId,
    });

  }

  @UseGuards(JwtAuthGuard)
  @Patch('seasons/:id')
  async updateSeason(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      names: NamesByLocale;
      startDate?: string | null;
      endDate?: string | null;
      defaultScoringRuleId?: string;
    },

  ) {
    assertAdmin(req);
    return this.catalog.updateSeason(id, {
      names: body.names,
      startDate: body.startDate,
      endDate: body.endDate,
      defaultScoringRuleId: body.defaultScoringRuleId,
    });

  }

  @UseGuards(JwtAuthGuard)
  @Delete('seasons/:id')
  async deleteSeason(@Req() req: any, @Param('id') id: string) {
    assertAdmin(req);
    return this.catalog.deleteSeason(id);
  }
}
