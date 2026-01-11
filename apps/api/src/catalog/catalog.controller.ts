import { Controller, Get, Query } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller("catalog")
export class CatalogController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getCatalog(@Query("locale") locale = "es") {
    const sports = await this.prisma.sport.findMany({
      orderBy: { slug: "asc" },
      include: {
        translations: true,
        competitions: {
          orderBy: { slug: "asc" },
          include: {
            translations: true,
            seasons: {
              orderBy: { slug: "asc" },
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
        })),
      })),
    }));
  }
}
