const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const sport = await prisma.sport.upsert({
    where: { slug: "soccer" },
    update: {},
    create: {
      slug: "soccer",
      translations: {
        create: [
          { locale: "es", name: "Fútbol" },
          { locale: "en", name: "Soccer" },
        ],
      },
    },
  });

  const competition = await prisma.competition.upsert({
    where: { slug: "fifa-world-cup" },
    update: { sportId: sport.id },
    create: {
      slug: "fifa-world-cup",
      sportId: sport.id,
      translations: {
        create: [
          { locale: "es", name: "Copa Mundial FIFA" },
          { locale: "en", name: "FIFA World Cup" },
        ],
      },
    },
  });

  await prisma.season.upsert({
    where: { slug: "world-cup-2026" },
    update: { competitionId: competition.id },
    create: {
      slug: "world-cup-2026",
      competitionId: competition.id,
      translations: {
        create: [
          { locale: "es", name: "Mundial 2026" },
          { locale: "en", name: "World Cup 2026" },
        ],
      },
    },
  });

    // ============================
  // SCORING RULES (B01 + R01-R05)
  // ============================
  const rules = [
    {
      id: "B01",
      name: "Básica Standard",
      description: "Regla universal para ranking mundial/local",
      isGlobal: true,
      details: [
        { code: "EXACTO", points: 3 },
        { code: "RESULTADO", points: 1 },
        { code: "BONUS_DIF", points: 0 },
        { code: "GOLES_LOCAL", points: 0 },
        { code: "GOLES_VISITA", points: 0 },
        { code: "KO_GANADOR_FINAL", points: 0 },
      ],
    },
    {
      id: "R01",
      name: "Clásica",
      description: "Exacto 3, Resultado 1",
      isGlobal: false,
      details: [
        { code: "EXACTO", points: 3 },
        { code: "RESULTADO", points: 1 },
        { code: "BONUS_DIF", points: 0 },
        { code: "GOLES_LOCAL", points: 0 },
        { code: "GOLES_VISITA", points: 0 },
        { code: "KO_GANADOR_FINAL", points: 0 },
      ],
    },
    {
      id: "R02",
      name: "Moderada",
      description: "Exacto 4, Resultado 2",
      isGlobal: false,
      details: [
        { code: "EXACTO", points: 4 },
        { code: "RESULTADO", points: 2 },
        { code: "BONUS_DIF", points: 0 },
        { code: "GOLES_LOCAL", points: 0 },
        { code: "GOLES_VISITA", points: 0 },
        { code: "KO_GANADOR_FINAL", points: 0 },
      ],
    },
    {
      id: "R03",
      name: "Agresiva",
      description: "Exacto 5, Resultado 2, Bonus Dif 1",
      isGlobal: false,
      details: [
        { code: "EXACTO", points: 5 },
        { code: "RESULTADO", points: 2 },
        { code: "BONUS_DIF", points: 1 },
        { code: "GOLES_LOCAL", points: 0 },
        { code: "GOLES_VISITA", points: 0 },
        { code: "KO_GANADOR_FINAL", points: 0 },
      ],
    },
    {
      id: "R04",
      name: "Pro Goles",
      description: "Exacto 4, Resultado 1, Goles Local 1, Goles Visita 1",
      isGlobal: false,
      details: [
        { code: "EXACTO", points: 4 },
        { code: "RESULTADO", points: 1 },
        { code: "BONUS_DIF", points: 0 },
        { code: "GOLES_LOCAL", points: 1 },
        { code: "GOLES_VISITA", points: 1 },
        { code: "KO_GANADOR_FINAL", points: 0 },
      ],
    },
    {
      id: "R05",
      name: "KO Final",
      description: "Exacto 4, Resultado 2, KO Ganador Final 1",
      isGlobal: false,
      details: [
        { code: "EXACTO", points: 4 },
        { code: "RESULTADO", points: 2 },
        { code: "BONUS_DIF", points: 0 },
        { code: "GOLES_LOCAL", points: 0 },
        { code: "GOLES_VISITA", points: 0 },
        { code: "KO_GANADOR_FINAL", points: 1 },
      ],
    },
  ];

  for (const r of rules) {
    await prisma.scoringRule.upsert({
      where: { id: r.id },
      update: {
        name: r.name,
        description: r.description,
        isGlobal: r.isGlobal,
      },
      create: {
        id: r.id,
        name: r.name,
        description: r.description,
        isGlobal: r.isGlobal,
      },
    });

    for (const d of r.details) {
      await prisma.scoringRuleDetail.upsert({
        where: { ruleId_code: { ruleId: r.id, code: d.code } },
        update: { points: d.points },
        create: { ruleId: r.id, code: d.code, points: d.points },
      });
    }
  }

  console.log("Seed OK: scoring rules (B01, R01-R05)");

  console.log("Seed OK: soccer / fifa-world-cup / world-cup-2026");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
