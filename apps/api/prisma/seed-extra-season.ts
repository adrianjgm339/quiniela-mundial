import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  /**
   * OBJETIVO:
   * - Encontrar el Season de Béisbol (ya existente)
   * - Crear/actualizar conceptos permitidos para ese Season
   * - Crear reglas predefinidas de Béisbol (BB01/BB02/BB03) con detalles
   * - Setear Season.defaultScoringRuleId = 'BB01'
   *
   * NOTA:
   * - No tocamos fútbol.
   * - Esto NO crea un season nuevo; busca el de béisbol por traducción ES.
   */

  // 1) Buscar Season de Béisbol por nombre (ES)
  const st = await prisma.seasonTranslation.findFirst({
    where: {
      locale: 'es',
      OR: [
        { name: { contains: 'Béisbol', mode: 'insensitive' } },
        { name: { contains: 'Beisbol', mode: 'insensitive' } },
      ],
    },
    select: { seasonId: true, name: true },
  });

  if (!st) {
    throw new Error(
      "No encontré un Season de béisbol por traducción ES (contiene 'Béisbol'/'Beisbol'). " +
      'Abre Prisma Studio > SeasonTranslation y confirma el nombre del evento.'
    );
  }

  const seasonId = st.seasonId;

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { translations: true },
  });

  if (!season) throw new Error('Season no existe (inconsistencia).');

  console.log('✅ Season Béisbol encontrado:', season.id, season.slug);
  console.log('✅ Nombre ES:', season.translations.find((t) => t.locale === 'es')?.name);

  // 2) Conceptos de Béisbol (por evento)
  const baseballConcepts = [
    { code: 'RESULTADO', label: 'Ganador' },
    { code: 'EXACTO', label: 'Marcador exacto' },
    { code: 'BONUS_DIF', label: 'Diferencia exacta' },
    { code: 'BONUS_BLANQUEADA', label: 'Blanqueada' },
    { code: 'BONUS_JUEGO_CERRADO', label: 'Juego cerrado (diff=1 + acierta ganador)' },
    { code: 'HITS', label: 'Hits' },
    { code: 'ERRORES', label: 'Errores' },
  ] as const;

  for (const c of baseballConcepts) {
    await prisma.seasonScoringConcept.upsert({
      where: { seasonId_code: { seasonId, code: c.code } },
      update: { label: c.label },
      create: { seasonId, code: c.code, label: c.label },
    });
  }

  console.log('✅ Conceptos Béisbol OK:', baseballConcepts.map((x) => x.code).join(', '));

  // 3) Reglas predefinidas de Béisbol para ese Season (visibles por defecto en /leagues)
  const predefinedRules = [
    {
      id: 'BB01',
      name: 'Regla Standard Béisbol (Principal)',
      description: 'Regla estándar principal para evento de béisbol',
      details: [
        { code: 'RESULTADO', points: 3 },
        { code: 'EXACTO', points: 6 },
        { code: 'BONUS_DIF', points: 2 },
        { code: 'BONUS_BLANQUEADA', points: 2 },
        { code: 'BONUS_JUEGO_CERRADO', points: 1 },
        { code: 'HITS', points: 2 },
        { code: 'ERRORES', points: 1 },
      ],
    },
    {
      id: 'BB02',
      name: 'Regla Agresiva (más peso a exactitud)',
      description: 'Regla agresiva: premia más el exacto y estadísticas',
      details: [
        { code: 'RESULTADO', points: 2 },
        { code: 'EXACTO', points: 8 },
        { code: 'BONUS_DIF', points: 3 },
        { code: 'BONUS_BLANQUEADA', points: 2 },
        { code: 'BONUS_JUEGO_CERRADO', points: 1 },
        { code: 'HITS', points: 3 },
        { code: 'ERRORES', points: 2 },
      ],
    },
    {
      id: 'BB03',
      name: 'Regla Conservadora (más peso a acertar ganador)',
      description: 'Regla conservadora: premia más acertar el ganador',
      details: [
        { code: 'RESULTADO', points: 4 },
        { code: 'EXACTO', points: 4 },
        { code: 'BONUS_DIF', points: 1 },
        { code: 'BONUS_BLANQUEADA', points: 1 },
        { code: 'BONUS_JUEGO_CERRADO', points: 1 },
        { code: 'HITS', points: 1 },
        { code: 'ERRORES', points: 1 },
      ],
    },
  ] as const;

  for (const r of predefinedRules) {
    await prisma.scoringRule.upsert({
      where: { id: r.id },
      update: {
        name: r.name,
        description: r.description,
        isGlobal: false,
        seasonId,
      },
      create: {
        id: r.id,
        name: r.name,
        description: r.description,
        isGlobal: false,
        seasonId,
      },
    });

    // Re-creamos detalles para evitar residuos
    await prisma.scoringRuleDetail.deleteMany({ where: { ruleId: r.id } });

    await prisma.scoringRuleDetail.createMany({
      data: r.details.map((d) => ({ ruleId: r.id, code: d.code, points: d.points })),
    });
  }

  console.log('✅ Reglas béisbol OK:', predefinedRules.map((x) => x.id).join(', '));

  // 4) Setear defaultScoringRuleId del Season
  await prisma.season.update({
    where: { id: seasonId },
    data: { defaultScoringRuleId: 'BB01' },
  });

  console.log('✅ Season.defaultScoringRuleId actualizado a BB01');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
