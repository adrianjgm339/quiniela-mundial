import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type LocaleNameMap = Record<string, string>;

function slugify(input: string) {
  return (input ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]+/g, '-') // non-alphanum -> -
    .replace(/(^-|-$)/g, '')
    .slice(0, 64);
}

async function ensureUniqueSlug(
  prisma: PrismaClient,
  model: 'sport' | 'competition' | 'season',
  baseSlug: string,
) {
  const safeBase = baseSlugifyFallback(baseSlug);
  let slug = safeBase;
  for (let i = 0; i < 50; i++) {
    // @ts-expect-error dynamic model access
    const exists = await prisma[model].findUnique({ where: { slug } });
    if (!exists) return slug;
    slug = `${safeBase}-${i + 2}`;
  }
  throw new BadRequestException('No se pudo generar un slug único');
}

function baseSlugifyFallback(baseSlug: string) {
  const s = slugify(baseSlug);
  return s && s.length ? s : `item-${Date.now()}`;
}

function pickBaseName(names: LocaleNameMap) {
  return (
    names?.es ||
    names?.en ||
    Object.values(names ?? {}).find((v) => !!v && v.trim()) ||
    ''
  ).trim();
}

function normalizeTranslations(names: LocaleNameMap) {
  const out: { locale: string; name: string }[] = [];
  for (const [locale, name] of Object.entries(names ?? {})) {
    const v = (name ?? '').trim();
    if (!v) continue;
    out.push({ locale: locale.trim(), name: v });
  }
  if (!out.length) throw new BadRequestException('Debe indicar al menos un nombre');
  return out;
}

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) { }

  async getCatalog(locale = 'es') {
    const sports = await this.prisma.sport.findMany({
      orderBy: { slug: 'asc' },
      include: {
        translations: true,
        competitions: {
          orderBy: { slug: 'asc' },
          include: {
            translations: true,
            seasons: {
              orderBy: { slug: 'asc' },
              include: { translations: true },
            },
          },
        },
      },
    });

    return sports.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.translations.find((t) => t.locale === locale)?.name ?? s.slug,
      competitions: s.competitions.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.translations.find((t) => t.locale === locale)?.name ?? c.slug,
        seasons: c.seasons.map((se) => ({
          id: se.id,
          slug: se.slug,
          name: se.translations.find((t) => t.locale === locale)?.name ?? se.slug,
          defaultScoringRuleId: se.defaultScoringRuleId,
        })),
      })),
    }));
  }

  // ---------------------------
  // CRUD SPORT
  // ---------------------------
  async createSport(input: { names: LocaleNameMap }) {
    const translations = normalizeTranslations(input.names);
    const baseName = pickBaseName(input.names);
    const slug = await ensureUniqueSlug(this.prisma, 'sport', baseName);

    return this.prisma.sport.create({
      data: {
        slug,
        translations: { create: translations },
      },
      include: { translations: true },
    });
  }

  async updateSport(id: string, input: { names: LocaleNameMap }) {
    const existing = await this.prisma.sport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Sport no encontrado');

    const translations = normalizeTranslations(input.names);

    return this.prisma.sport.update({
      where: { id },
      data: {
        translations: {
          deleteMany: {}, // replace all
          create: translations,
        },
      },
      include: { translations: true },
    });
  }

  async deleteSport(id: string) {
    // seguridad: solo permitir borrar si no hay temporadas con data “pesada”
    const sport = await this.prisma.sport.findUnique({
      where: { id },
      include: { competitions: { include: { seasons: true } } },
    });
    if (!sport) throw new NotFoundException('Sport no encontrado');

    const seasonIds = sport.competitions.flatMap((c) => c.seasons.map((s) => s.id));
    if (seasonIds.length) {
      const hasData = await this.prisma.season.findFirst({
        where: {
          id: { in: seasonIds },
          OR: [
            { leagues: { some: {} } },
            { matches: { some: {} } },
            { teams: { some: {} } },
            { bracketSlots: { some: {} } },
            { groupStandings: { some: {} } },
            { thirdPlaceRankings: { some: {} } },
          ],
        },
        select: { id: true },
      });
      if (hasData) {
        throw new BadRequestException(
          'No se puede borrar: la season tiene ligas/partidos/equipos o data de admin',
        );
      }
    }

    // borrado ordenado (sin depender de onDelete cascade)
    return this.prisma.$transaction(async (tx) => {
      if (seasonIds.length) {
        await tx.seasonTranslation.deleteMany({ where: { seasonId: { in: seasonIds } } });
        await tx.season.deleteMany({ where: { id: { in: seasonIds } } });
      }

      const competitionIds = sport.competitions.map((c) => c.id);
      if (competitionIds.length) {
        await tx.competitionTranslation.deleteMany({
          where: { competitionId: { in: competitionIds } },
        });
        await tx.competition.deleteMany({ where: { id: { in: competitionIds } } });
      }

      await tx.sportTranslation.deleteMany({ where: { sportId: id } });
      await tx.sport.delete({ where: { id } });

      return { ok: true };
    });
  }

  // ---------------------------
  // CRUD COMPETITION
  // ---------------------------
  async createCompetition(input: { sportId: string; names: LocaleNameMap }) {
    const sport = await this.prisma.sport.findUnique({ where: { id: input.sportId } });
    if (!sport) throw new BadRequestException('sportId inválido');

    const translations = normalizeTranslations(input.names);
    const baseName = pickBaseName(input.names);
    const slug = await ensureUniqueSlug(this.prisma, 'competition', baseName);

    return this.prisma.competition.create({
      data: {
        sportId: input.sportId,
        slug,
        translations: { create: translations },
      },
      include: { translations: true },
    });
  }

  async updateCompetition(id: string, input: { names: LocaleNameMap }) {
    const existing = await this.prisma.competition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Competición no encontrada');

    const translations = normalizeTranslations(input.names);

    return this.prisma.competition.update({
      where: { id },
      data: {
        translations: {
          deleteMany: {},
          create: translations,
        },
      },
      include: { translations: true },
    });
  }

  async deleteCompetition(id: string) {
    const comp = await this.prisma.competition.findUnique({
      where: { id },
      include: { seasons: true },
    });
    if (!comp) throw new NotFoundException('Competición no encontrada');

    const seasonIds = comp.seasons.map((s) => s.id);
    if (seasonIds.length) {
      const hasData = await this.prisma.season.findFirst({
        where: {
          id: { in: seasonIds },
          OR: [
            { leagues: { some: {} } },
            { matches: { some: {} } },
            { teams: { some: {} } },
            { bracketSlots: { some: {} } },
            { groupStandings: { some: {} } },
            { thirdPlaceRankings: { some: {} } },
          ],
        },
        select: { id: true },
      });
      if (hasData) {
        throw new BadRequestException(
          'No se puede borrar: la season tiene ligas/partidos/equipos o data de admin',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (seasonIds.length) {
        await tx.seasonTranslation.deleteMany({ where: { seasonId: { in: seasonIds } } });
        await tx.season.deleteMany({ where: { id: { in: seasonIds } } });
      }
      await tx.competitionTranslation.deleteMany({ where: { competitionId: id } });
      await tx.competition.delete({ where: { id } });
      return { ok: true };
    });
  }

  // ---------------------------
  // CRUD SEASON (evento)
  // ---------------------------
  async createSeason(input: {
    competitionId: string;
    names: LocaleNameMap;
    startDate?: string | null;
    endDate?: string | null;
    defaultScoringRuleId?: string;
  }) {

    const comp = await this.prisma.competition.findUnique({ where: { id: input.competitionId } });
    if (!comp) throw new BadRequestException('competitionId inválido');

    const translations = normalizeTranslations(input.names);
    const baseName = pickBaseName(input.names);
    const slug = await ensureUniqueSlug(this.prisma, 'season', baseName);

    const ruleId = (input.defaultScoringRuleId ?? '').trim();
    if (!ruleId) {
      throw new BadRequestException('defaultScoringRuleId es requerido');
    }

    const ruleExists = await this.prisma.scoringRule.findUnique({ where: { id: ruleId } });
    if (!ruleExists) {
      throw new BadRequestException(`defaultScoringRuleId inválido: ${ruleId}`);
    }

    return this.prisma.season.create({
      data: {
        competitionId: input.competitionId,
        slug,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        defaultScoringRuleId: ruleId,
        translations: { create: translations },
      },
      include: { translations: true },
    });
  }

  async updateSeason(
    id: string,
    input: {
      names: LocaleNameMap;
      startDate?: string | null;
      endDate?: string | null;
      defaultScoringRuleId?: string;
    },
  ) {
    const existing = await this.prisma.season.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Evento no encontrado');

    const translations = normalizeTranslations(input.names);

    let nextRuleId: string | undefined = undefined;

    if (input.defaultScoringRuleId !== undefined) {
      const ruleId = (input.defaultScoringRuleId ?? "").trim();
      if (!ruleId) throw new BadRequestException("defaultScoringRuleId no puede ser vacío");

      const ruleExists = await this.prisma.scoringRule.findUnique({ where: { id: ruleId } });
      if (!ruleExists) throw new BadRequestException(`defaultScoringRuleId inválido: ${ruleId}`);

      nextRuleId = ruleId;
    }

    return this.prisma.season.update({
      where: { id },
      data: {
        startDate: input.startDate !== undefined ? (input.startDate ? new Date(input.startDate) : null) : undefined,
        endDate: input.endDate !== undefined ? (input.endDate ? new Date(input.endDate) : null) : undefined,
        defaultScoringRuleId: nextRuleId,
        translations: {
          deleteMany: {},
          create: translations,
        },
      },
      include: { translations: true },
    });
  }

  async deleteSeason(id: string) {
    const season = await this.prisma.season.findUnique({
      where: { id },
      include: {
        leagues: { select: { id: true } },
        matches: { select: { id: true } },
        teams: { select: { id: true } },
        bracketSlots: { select: { id: true } },
        groupStandings: { select: { id: true } },
        thirdPlaceRankings: { select: { id: true } },
      },
    });
    if (!season) throw new NotFoundException('Evento no encontrado');

    const hasAny =
      season.leagues.length ||
      season.matches.length ||
      season.teams.length ||
      season.bracketSlots.length ||
      season.groupStandings.length ||
      season.thirdPlaceRankings.length;

    if (hasAny) {
      throw new BadRequestException(
        'No se puede borrar: la season tiene ligas/partidos/equipos o data de admin',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.seasonTranslation.deleteMany({ where: { seasonId: id } });
      await tx.season.delete({ where: { id } });
      return { ok: true };
    });
  }
}