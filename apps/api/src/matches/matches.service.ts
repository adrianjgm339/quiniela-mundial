import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMatchResultDto } from './dto/update-match-result.dto';

type ListArgs = {
  userId: string;
  locale: string;
  seasonId?: string;
  phaseCode?: string;
  groupCode?: string;
};

const PREV_PHASE: Record<string, string> = {
  F02: 'F01', // 16avos depende de grupos
  F03: 'F02', // 8vos depende de 16avos
  F04: 'F03', // 4tos depende de 8vos
  F05: 'F04', // semis depende de 4tos
  F06: 'F05', // 3er puesto depende de semis
  F07: 'F05', // final depende de semis
};

function isAnyResultFieldPresent(dto: UpdateMatchResultDto) {
  return (
    dto.homeScore !== undefined ||
    dto.awayScore !== undefined ||
    dto.resultConfirmed !== undefined ||
    dto.advanceTeamId !== undefined ||
    dto.advanceMethod !== undefined
  );
}

@Injectable()
export class MatchesService {
  constructor(private prisma: PrismaService) { }

  async list(args: ListArgs) {
    const { userId, locale, phaseCode, groupCode } = args;

    // 1) Determinar seasonId (query param o activeSeason del user)
    let seasonId = args.seasonId;

    // Traemos el user una sola vez para saber si hay que persistir
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { activeSeasonId: true },
    });

    // Si no viene seasonId por query, usar el del user
    if (!seasonId) {
      seasonId = user?.activeSeasonId ?? undefined;
    }

    // Fallback robusto si aún no hay seasonId
    if (!seasonId) {
      // 1) Preferir season desde el calendario cargado (match más reciente)
      const lastMatch = await this.prisma.match.findFirst({
        orderBy: { utcDateTime: 'desc' },
        select: { seasonId: true },
      });

      // 2) Si no hay matches, tomar cualquier season existente
      const anySeason = !lastMatch?.seasonId
        ? await this.prisma.season.findFirst({ select: { id: true } })
        : null;

      seasonId = lastMatch?.seasonId ?? anySeason?.id ?? undefined;
    }

    if (!seasonId) {
      throw new BadRequestException('No active season selected');
    }

    // ✅ CLAVE: Persistir SIEMPRE si el user aún no tiene activeSeasonId
    // (incluso si seasonId vino por query param)
    if (!user?.activeSeasonId) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { activeSeasonId: seasonId },
      });
    }

    // 2) Traer matches con nombres traducidos de equipos
    const matches = await this.prisma.match.findMany({
      where: {
        seasonId,
        ...(phaseCode ? { phaseCode } : {}),
        ...(groupCode ? { groupCode } : {}),
      },
      orderBy: { utcDateTime: 'asc' },
      select: {
        id: true,
        externalId: true,
        phaseCode: true,
        groupCode: true,
        matchNumber: true,
        venue: true,
        utcDateTime: true,
        closeUtc: true,
        closeMinutes: true,
        status: true,
        statusRaw: true,
        resultConfirmed: true,
        homeScore: true,
        awayScore: true,
        advanceTeamId: true,
        advanceMethod: true,
        homeTeam: {
          select: {
            id: true,
            externalId: true,
            flagKey: true,
            isPlaceholder: true,
            placeholderRule: true,
            translations: {
              where: { locale },
              select: { name: true },
            },
          },
        },
        awayTeam: {
          select: {
            id: true,
            externalId: true,
            flagKey: true,
            isPlaceholder: true,
            placeholderRule: true,
            translations: {
              where: { locale },
              select: { name: true },
            },
          },
        },
      },
    });

    // 3) DTO limpio para front (incluye dateKey para agrupar por fecha)
    return matches.map((m) => {
      const d = new Date(m.utcDateTime);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mi = String(d.getUTCMinutes()).padStart(2, '0');

      const dateKey = `${yyyy}-${mm}-${dd}`;
      const timeUtc = `${hh}:${mi}`;

      return {
        id: m.id,
        externalId: m.externalId,

        dateKey,
        timeUtc,

        phaseCode: m.phaseCode,
        groupCode: m.groupCode,
        matchNumber: m.matchNumber,
        venue: m.venue,

        utcDateTime: m.utcDateTime,
        closeUtc: m.closeUtc,
        closeMinutes: m.closeMinutes,

        status: m.status,
        statusRaw: m.statusRaw,
        resultConfirmed: m.resultConfirmed,

        // IDs crudos (importante para validaciones KO en front)
        homeTeamId: m.homeTeam.id,
        awayTeamId: m.awayTeam.id,

        score:
          m.homeScore != null && m.awayScore != null
            ? { home: m.homeScore, away: m.awayScore }
            : null,

        advanceTeamId: (m as any).advanceTeamId ?? null,
        advanceMethod: (m as any).advanceMethod ?? null,

        homeTeam: {
          id: m.homeTeam.id,
          externalId: m.homeTeam.externalId,
          name: m.homeTeam.translations[0]?.name ?? m.homeTeam.placeholderRule ?? '',
          flagKey: m.homeTeam.flagKey,
          isPlaceholder: m.homeTeam.isPlaceholder,
        },
        awayTeam: {
          id: m.awayTeam.id,
          externalId: m.awayTeam.externalId,
          name: m.awayTeam.translations[0]?.name ?? m.awayTeam.placeholderRule ?? '',
          flagKey: m.awayTeam.flagKey,
          isPlaceholder: m.awayTeam.isPlaceholder,
        },
      };
    });
  }

  private async trySyncR32MatchTeamsFromBracketSlots(args: {
    matchId: string;
    seasonId: string;
    matchNumber: number | null;
  }) {
    const { matchId, seasonId, matchNumber } = args;
    if (!matchNumber) return;

    const slots = await this.prisma.bracketSlot.findMany({
      where: {
        seasonId,
        round: 'R32',
        matchNo: matchNumber,
      },
      select: {
        slot: true, // HOME | AWAY
        teamId: true,
      },
    });

    if (!slots.length) return;

    const home = slots.find((s) => s.slot === 'HOME')?.teamId ?? null;
    const away = slots.find((s) => s.slot === 'AWAY')?.teamId ?? null;

    // Solo actualizamos lo que ya esté resuelto en slots (no forzamos nulls)
    const data: any = {};
    if (home) data.homeTeamId = home;
    if (away) data.awayTeamId = away;

    if (!Object.keys(data).length) return;

    await this.prisma.match.update({
      where: { id: matchId },
      data,
    });
  }

  private async propagateWinnerToNextMatches(args: {
    seasonId: string;
    sourceMatchNumber: number | null;
    winnerTeamId: string;
  }) {
    const { seasonId, sourceMatchNumber, winnerTeamId } = args;
    if (!sourceMatchNumber) return;

    const key = String(sourceMatchNumber);
    const token = `partido ${key}`;

    // 1) Buscar placeholders que referencian este matchNumber de forma segura.
    // Evita falsos positivos tipo "7" matcheando "77".
    const placeholderTeams = await this.prisma.team.findMany({
      where: {
        seasonId,
        isPlaceholder: true,
        OR: [
          { placeholderRule: { endsWith: token, mode: 'insensitive' } },
          { placeholderRule: { endsWith: `${token})`, mode: 'insensitive' } },
          { placeholderRule: { endsWith: `${token}.`, mode: 'insensitive' } },
          { placeholderRule: { contains: `${token} `, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (placeholderTeams.length === 0) return;

    const placeholderIds = placeholderTeams.map((t) => t.id);

    // 2) Reemplazar en matches donde HOME o AWAY sea uno de esos placeholders
    // ⚠️ Solo actualiza si el slot aún es placeholder (no pisa nada ya resuelto).
    await this.prisma.match.updateMany({
      where: {
        seasonId,
        homeTeamId: { in: placeholderIds },
      },
      data: {
        homeTeamId: winnerTeamId,
      },
    });

    await this.prisma.match.updateMany({
      where: {
        seasonId,
        awayTeamId: { in: placeholderIds },
      },
      data: {
        awayTeamId: winnerTeamId,
      },
    });
  }

  private async propagateLoserToNextMatches(args: {
    seasonId: string;
    sourceMatchNumber: number | null;
    loserTeamId: string;
    winnerTeamId: string;
  }) {
    const { seasonId, sourceMatchNumber, loserTeamId, winnerTeamId } = args;
    if (!sourceMatchNumber) return;

    const key = String(sourceMatchNumber);
    const token = `partido ${key}`;

    // ✅ IMPORTANTE:
    // El 3er puesto (F06) debe alimentarse con los PERDEDORES de las semifinales (F05).
    // Aunque por error el placeholder del 3er puesto estuviera creado como "Ganador partido X",
    // aquí NO dependemos de la palabra "perdedor": solo verificamos que el placeholder referencie
    // a "partido X" y que el match destino sea F06.
    const ruleMatch = [
      { placeholderRule: { endsWith: token, mode: 'insensitive' as const } },
      { placeholderRule: { endsWith: `${token})`, mode: 'insensitive' as const } },
      { placeholderRule: { endsWith: `${token}.`, mode: 'insensitive' as const } },
      { placeholderRule: { contains: `${token} `, mode: 'insensitive' as const } }, // nota el espacio
    ];

    await this.prisma.match.updateMany({
      where: {
        seasonId,
        phaseCode: 'F06',
        OR: [
          // Si por error el 3er puesto fue alimentado con el GANADOR, lo corregimos
          { homeTeamId: winnerTeamId },
          // Caso normal: slot placeholder que referencia a "partido X"
          { homeTeam: { isPlaceholder: true, OR: ruleMatch as any } },
        ],
      },
      data: { homeTeamId: loserTeamId },
    });

    await this.prisma.match.updateMany({
      where: {
        seasonId,
        phaseCode: 'F06',
        OR: [
          { awayTeamId: winnerTeamId },
          { awayTeam: { isPlaceholder: true, OR: ruleMatch as any } },
        ],
      },
      data: { awayTeamId: loserTeamId },
    });
  }

  async resetKo(args: { seasonId: string; mode: 'full' | 'future' | 'groups' | 'all' }) {
    const { seasonId, mode } = args;

    const phasesToReset =
      mode === 'groups'
        ? ['F01']
        : mode === 'future'
          ? ['F03', 'F04', 'F05', 'F06', 'F07']
          : mode === 'all'
            ? ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07']
            : ['F02', 'F03', 'F04', 'F05', 'F06', 'F07']; // full (KO completo)

    // 1) Reset de resultados KO
    await this.prisma.match.updateMany({
      where: {
        seasonId,
        phaseCode: { in: phasesToReset },
      },
      data: {
        homeScore: null,
        awayScore: null,
        resultConfirmed: false,
        advanceTeamId: null,
        advanceMethod: null,
      },
    });

    // ✅ Si solo estamos limpiando fase de grupos, NO tocamos placeholders KO
    if (mode === 'groups') {
      return { ok: true, seasonId, mode, resetPhases: phasesToReset, restoredFuturePlaceholders: 0 };
    }

    // 2) Si es future o full, en ambos casos queremos que F03-F07 vuelvan a placeholders (por externalId)
    // (F02 en tu sistema viene de bracket slots / equipos reales, así que NO lo forzamos a placeholders)
    // 2) Restaurar placeholders en fases KO que usen placeholders.
    // En béisbol, F02 (Cuartos) también nace de placeholders "1ro/2do Grupo X".
    // En fútbol, normalmente F02 puede venir “real” (R32 por BracketSlot), y en ese caso NO se restaurará
    // porque la validación/skip evita pisar equipos no-placeholder.
    const futurePhases =
      mode === 'future'
        ? ['F03', 'F04', 'F05', 'F06', 'F07']
        : ['F02', 'F03', 'F04', 'F05', 'F06', 'F07'];

    const futureMatches = await this.prisma.match.findMany({
      where: { seasonId, phaseCode: { in: futurePhases } },
      select: { id: true, externalId: true },
    });

    // Mapea externalId => (homeExt, awayExt)
    // Asumimos formato: "F03" + 4 chars home + 4 chars away (ej: F0300910092)
    // Si no calza, fallamos con error claro (no inventamos).
    const toFix: Array<{ matchId: string; homeExt: string; awayExt: string }> = [];

    const skippedBadExternalId: Array<{ matchId: string; externalId: string }> = [];

    for (const m of futureMatches) {
      const ext = m.externalId ?? '';

      // En vez de fallar todo el reset, saltamos los externalId inválidos
      if (ext.length < 11) {
        skippedBadExternalId.push({ matchId: m.id, externalId: ext });
        continue;
      }

      const homeExt = ext.slice(3, 7);
      const awayExt = ext.slice(7, 11);

      if (!homeExt || !awayExt) {
        skippedBadExternalId.push({ matchId: m.id, externalId: ext });
        continue;
      }

      toFix.push({ matchId: m.id, homeExt, awayExt });
    }

    // Buscar Teams placeholders por externalId
    const neededExts = Array.from(new Set(toFix.flatMap((x) => [x.homeExt, x.awayExt])));

    const teams = await this.prisma.team.findMany({
      where: {
        seasonId,
        externalId: { in: neededExts },
      },
      select: { id: true, externalId: true, isPlaceholder: true },
    });

    const map = new Map<string, { id: string; isPlaceholder: boolean }>();
    for (const t of teams) map.set(t.externalId, { id: t.id, isPlaceholder: t.isPlaceholder });

    // Validar que existan y que sean placeholders
    const safeToFix: Array<{ matchId: string; homeExt: string; awayExt: string }> = [];
    const skippedMissingTeams: Array<{ matchId: string; homeExt: string; awayExt: string; reason: string }> = [];

    // Validar que existan y que sean placeholders (pero sin tumbar todo el reset)
    for (const row of toFix) {
      const h = map.get(row.homeExt);
      const a = map.get(row.awayExt);

      if (!h || !a) {
        skippedMissingTeams.push({
          matchId: row.matchId,
          homeExt: row.homeExt,
          awayExt: row.awayExt,
          reason: `missing team(s): ${!h ? row.homeExt : ''}${!a ? ` ${row.awayExt}` : ''}`.trim(),
        });
        continue;
      }

      if (!h.isPlaceholder || !a.isPlaceholder) {
        skippedMissingTeams.push({
          matchId: row.matchId,
          homeExt: row.homeExt,
          awayExt: row.awayExt,
          reason: `not placeholder: ${!h.isPlaceholder ? row.homeExt : ''}${!a.isPlaceholder ? ` ${row.awayExt}` : ''}`.trim(),
        });
        continue;
      }

      safeToFix.push(row);
    }

    // Aplicar update por match (seguro y explícito)
    await this.prisma.$transaction(
      safeToFix.map((row) =>
        this.prisma.match.update({
          where: { id: row.matchId },
          data: {
            homeTeamId: map.get(row.homeExt)!.id,
            awayTeamId: map.get(row.awayExt)!.id,
          },
        }),
      ),
    );

    return {
      ok: true,
      seasonId,
      mode,
      resetPhases: phasesToReset,
      restoredFuturePlaceholders: safeToFix.length,
      skippedBadExternalId: skippedBadExternalId.length,
      skippedMissingTeams: skippedMissingTeams.length,
    };
  }

  async updateResult(matchId: string, dto: UpdateMatchResultDto) {
    let match: any = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        seasonId: true,
        phaseCode: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        homeTeam: { select: { isPlaceholder: true, placeholderRule: true } },
        awayTeam: { select: { isPlaceholder: true, placeholderRule: true } },
        matchNumber: true,
        resultConfirmed: true,
        advanceTeamId: true,
        advanceMethod: true,
      },
    });

    if (!match) {
      throw new BadRequestException('Match not found');
    }

    const isKO = match.phaseCode !== 'F01';

    // ✅ NUEVO: en Béisbol NO se permite empate al confirmar resultado
    // (si tu slug es "baseball" o "beisbol", cubrimos ambos)
    const seasonSport = await this.prisma.season.findUnique({
      where: { id: match.seasonId },
      select: { competition: { select: { sport: { select: { slug: true } } } } },
    });

    const sportSlug = seasonSport?.competition?.sport?.slug?.toLowerCase() ?? "";
    const isBaseball = sportSlug === "baseball" || sportSlug === "beisbol";

    if (
      isBaseball &&
      dto.resultConfirmed &&
      dto.homeScore != null &&
      dto.awayScore != null &&
      dto.homeScore === dto.awayScore
    ) {
      throw new BadRequestException("En béisbol no se permite empate. Debes cargar un ganador.");
    }

    // ✅ Validación por deporte: BÉISBOL no permite empates (ni en grupos ni en KO)
    // const season = await this.prisma.season.findUnique({
    //  where: { id: match.seasonId },
    //  select: { competition: { select: { sport: { select: { slug: true } } } } },
    //});

    // const sportSlug = season?.competition?.sport?.slug;

    // Tomamos el "estado final" que quedaría tras aplicar dto (sin depender del orden de asignación)
    const nextHome = dto.homeScore ?? match.homeScore;
    const nextAway = dto.awayScore ?? match.awayScore;

    if (
      sportSlug === 'baseball' &&
      typeof nextHome === 'number' &&
      typeof nextAway === 'number' &&
      nextHome === nextAway
    ) {
      throw new BadRequestException(
        'Béisbol no permite empates: ajusta el marcador (debe existir ganador).',
      );
    }

    function isDynamicPlaceholder(rule?: string | null): boolean {
      if (!rule) return false;

      const r = rule.toLowerCase();

      // Dinámicos: deben resolverse antes de confirmar resultados
      // - Grupos: "1º Grupo A", "3º Grupo A/B/C..."
      // - KO: "Ganador partido 77", "Perdedor partido 75"
      return (
        r.includes('grupo') ||
        r.includes('ganador partido') ||
        r.includes('perdedor partido')
      );
    }

    // 🔄 Intento de auto-sync para 16avos (F02): si el bracket ya resolvió slots,
    // pero el match aún tiene placeholders, actualizamos el match antes de validar/bloquear.
    if (match.phaseCode === 'F02' && isAnyResultFieldPresent(dto)) {
      const homeIsPh = match.homeTeam?.isPlaceholder;
      const awayIsPh = match.awayTeam?.isPlaceholder;

      if (homeIsPh || awayIsPh) {
        await this.trySyncR32MatchTeamsFromBracketSlots({
          matchId: match.id,
          seasonId: match.seasonId,
          matchNumber: (match as any).matchNumber ?? null,
        });

        // Releer match (para refrescar isPlaceholder/placeholderRule)
        match = await this.prisma.match.findUnique({
          where: { id: matchId },
          select: {
            id: true,
            seasonId: true,
            phaseCode: true,
            homeTeamId: true,
            awayTeamId: true,
            homeScore: true,
            awayScore: true,
            homeTeam: { select: { isPlaceholder: true, placeholderRule: true } },
            awayTeam: { select: { isPlaceholder: true, placeholderRule: true } },
            matchNumber: true,
            resultConfirmed: true,
            advanceTeamId: true,
            advanceMethod: true,
          },
        }) as any;

        if (!match) {
          throw new BadRequestException('Match not found');
        }
      }
    }

    // No permitir guardar/confirmar resultados si alguno de los equipos aún es placeholder DINÁMICO de grupos.
    // Aplica a TODAS las fases (grupos y KO, incluye final y 3er lugar).
    // ✅ Permite placeholders "estáticos" tipo REPECHAJE (porque no se resuelven por grupos).
    if (isAnyResultFieldPresent(dto)) {
      const homeIsDynamicPlaceholder =
        !!match.homeTeam?.isPlaceholder && isDynamicPlaceholder(match.homeTeam?.placeholderRule);

      const awayIsDynamicPlaceholder =
        !!match.awayTeam?.isPlaceholder && isDynamicPlaceholder(match.awayTeam?.placeholderRule);

      if (homeIsDynamicPlaceholder || awayIsDynamicPlaceholder) {
        const h = match.homeTeam?.placeholderRule ?? 'HOME placeholder';
        const a = match.awayTeam?.placeholderRule ?? 'AWAY placeholder';
        throw new BadRequestException(
          `Partido bloqueado: aún hay placeholders sin resolver (${h} vs ${a}).`,
        );
      }
    }

    // 🔒 Blindaje KO: no permitir cargar resultados KO si la fase anterior no está completa
    if (isKO && isAnyResultFieldPresent(dto)) {
      const prev = PREV_PHASE[match.phaseCode];
      if (prev) {
        const totalPrev = await this.prisma.match.count({
          where: { seasonId: match.seasonId, phaseCode: prev },
        });

        // Si por alguna razón no hay partidos en la fase previa, no bloqueamos
        if (totalPrev > 0) {
          const confirmedPrev = await this.prisma.match.count({
            where: { seasonId: match.seasonId, phaseCode: prev, resultConfirmed: true },
          });

          if (confirmedPrev < totalPrev) {
            const pending = totalPrev - confirmedPrev;
            throw new BadRequestException(
              `KO bloqueado: faltan ${pending} partidos por confirmar en la fase previa (${prev}).`,
            );
          }
        }
      }
    }

    const home = dto.homeScore ?? match.homeScore ?? null;
    const away = dto.awayScore ?? match.awayScore ?? null;

    let advanceTeamId: string | null | undefined = undefined;
    let advanceMethod: any | null | undefined = undefined;

    if (!isKO) {
      advanceTeamId = null;
      advanceMethod = null;
    } else {
      const hasScores = typeof home === 'number' && typeof away === 'number';

      if (!hasScores) {
        advanceTeamId = undefined;
        advanceMethod = undefined;
      } else if (home !== away) {
        advanceTeamId = home > away ? match.homeTeamId : match.awayTeamId;
        advanceMethod = null;
      } else {
        if (!dto.advanceTeamId) {
          throw new BadRequestException('KO: advanceTeamId es requerido cuando hay empate');
        }
        if (dto.advanceTeamId !== match.homeTeamId && dto.advanceTeamId !== match.awayTeamId) {
          throw new BadRequestException('KO: advanceTeamId inválido (debe ser homeTeamId o awayTeamId)');
        }

        advanceTeamId = dto.advanceTeamId;
        advanceMethod = dto.advanceMethod ?? null;
      }
    }

    const willBeConfirmed = dto.resultConfirmed ?? match.resultConfirmed ?? false;

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: {
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        resultConfirmed: dto.resultConfirmed,
        advanceTeamId,
        advanceMethod,
      },
    });

    // ✅ Propagar solo si:
    // - es KO
    // - queda confirmado
    // - y ya tenemos un ganador (advanceTeamId calculado)
    if (isKO && willBeConfirmed && advanceTeamId) {
      await this.propagateWinnerToNextMatches({
        seasonId: match.seasonId,
        sourceMatchNumber: (match as any).matchNumber ?? null,
        winnerTeamId: advanceTeamId,
      });

      // ✅ 3er lugar: cuando confirmas una semifinal (F05), el perdedor alimenta el partido de 3er puesto (F06)
      if (match.phaseCode === 'F05') {
        const loserTeamId =
          advanceTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;

        if (loserTeamId) {
          await this.propagateLoserToNextMatches({
            seasonId: match.seasonId,
            sourceMatchNumber: (match as any).matchNumber ?? null,
            loserTeamId,
            winnerTeamId: advanceTeamId,
          });
        }
      }
    }

    return updated;

  }
}