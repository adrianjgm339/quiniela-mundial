import { BadRequestException, Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeaguesService {
  constructor(private prisma: PrismaService) { }

  async myLeagues(userId: string) {
    const rows = await this.prisma.leagueMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: {
        role: true,
        league: {
          select: {
            id: true,
            name: true,
            joinCode: true,
            seasonId: true,
            createdAt: true,
            createdById: true,
            scoringRuleId: true,
          },
        },
      },

      orderBy: { joinedAt: 'desc' },
    });

    return rows.map((r) => ({ ...r.league, myRole: r.role }));
  }

  async createLeague(
    userId: string,
    input: { seasonId: string; name: string; scoringRuleId: string; joinPolicy?: 'PUBLIC' | 'PRIVATE' | 'APPROVAL' },
  ) {
    const name = (input.name || '').trim();
    const seasonId = (input.seasonId || '').trim();

    const scoringRuleId = (input.scoringRuleId || '').trim();
    if (!scoringRuleId) throw new BadRequestException('scoringRuleId is required');

    // validar que la regla exista y pertenezca al mismo evento (Season)
    const rule = await this.prisma.scoringRule.findUnique({
      where: { id: scoringRuleId },
      select: { id: true, seasonId: true },
    });
    if (!rule) throw new NotFoundException('Scoring rule not found');

    if (rule.seasonId && rule.seasonId !== seasonId) {
      throw new BadRequestException('Scoring rule does not belong to this season');
    }

    if (!name || !seasonId) throw new BadRequestException('seasonId and name are required');

    // joinCode simple (luego lo hacemos más robusto)
    const joinCode = Math.random().toString(36).slice(2, 8).toUpperCase();

    const league = await this.prisma.league.create({
      data: {
        seasonId,
        name,
        joinCode,
        joinPolicy: (input.joinPolicy as any) ?? 'PRIVATE',
        inviteEnabled: true,
        createdById: userId,
        scoringRuleId,
        members: {
          create: {
            userId,
            status: 'ACTIVE',
            role: 'OWNER',
          },
        },

      },
      select: {
        id: true,
        name: true,
        joinCode: true,
        seasonId: true,
        createdAt: true,
        createdById: true,
        scoringRuleId: true,
      },

    });

    return { ...league, myRole: 'OWNER' as const };
  }

  async joinByCode(userId: string, input: { joinCode: string }) {
    const joinCode = (input.joinCode || '').trim().toUpperCase();
    if (!joinCode) throw new BadRequestException('joinCode is required');

    const league = await this.prisma.league.findUnique({
      where: { joinCode },
      select: { id: true, seasonId: true, joinPolicy: true, inviteEnabled: true },
    });
    if (!league) throw new BadRequestException('Código inválido o expirado');

    if (league.inviteEnabled === false) {
      throw new BadRequestException('Invitations are disabled for this league');
    }

    // bloqueamos altas cuando torneo inició (misma lógica que reglas)
    await this.assertTournamentNotStarted(league.seasonId);

    // Si la liga requiere aprobación: crear/actualizar solicitud en PENDING
    if (league.joinPolicy === 'APPROVAL') {
      const req = await this.prisma.leagueJoinRequest.upsert({
        where: { leagueId_userId: { leagueId: league.id, userId } },
        update: { status: 'PENDING', decidedAt: null, decidedById: null, reason: null },
        create: { leagueId: league.id, userId, status: 'PENDING' },
        select: { id: true, status: true },
      });

      return { ok: true, leagueId: league.id, pending: true, requestId: req.id };
    }

    // PRIVATE/PUBLIC por código => entra directo
    await this.prisma.leagueMember.upsert({
      where: { leagueId_userId: { leagueId: league.id, userId } },
      update: { status: 'ACTIVE' },
      create: { leagueId: league.id, userId, status: 'ACTIVE', role: 'MEMBER' },
    });

    return { ok: true, leagueId: league.id, pending: false };
  }

  async setActiveLeague(userId: string, leagueId: string) {
    const membership = await this.prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('Not a member of this league');
    }

    // por ahora: guardamos en user un campo activo
    // si aún no existe activeLeagueId en schema, lo agregamos luego (pero por ahora seguimos con localStorage)
    return { ok: true };
  }

  private async assertCanManageLeague(userId: string, leagueId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    // ADMIN global del sistema
    if (user?.role === 'ADMIN') return;

    const m = await this.prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
      select: { status: true, role: true },
    });

    if (!m || m.status !== 'ACTIVE') throw new ForbiddenException('Not a member of this league');
    if (m.role !== 'OWNER' && m.role !== 'ADMIN') throw new ForbiddenException('Insufficient league role');
  }

  // Estricto: SOLO ADMIN/OWNER de la liga (NO bypass por ADMIN global)
  private async assertLeagueAdminOnly(userId: string, leagueId: string) {
    const m = await this.prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
      select: { status: true, role: true },
    });

    if (!m || m.status !== 'ACTIVE') throw new ForbiddenException('Not a member of this league');
    if (m.role !== 'OWNER' && m.role !== 'ADMIN') throw new ForbiddenException('Insufficient league role');
  }

  private async assertTournamentNotStarted(seasonId: string) {
    // Torneo “iniciado” = ya pasó el primer closeUtc (fallback utcDateTime si closeUtc null)
    const firstByClose = await this.prisma.match.findFirst({
      where: { seasonId, closeUtc: { not: null } },
      orderBy: { closeUtc: 'asc' },
      select: { closeUtc: true },
    });

    const firstByUtc = await this.prisma.match.findFirst({
      where: { seasonId },
      orderBy: { utcDateTime: 'asc' },
      select: { utcDateTime: true },
    });

    const start = firstByClose?.closeUtc ?? firstByUtc?.utcDateTime ?? null;
    if (!start) return; // si no hay partidos cargados aún, no bloqueamos

    if (new Date() >= new Date(start)) {
      throw new BadRequestException('Tournament already started. League rules are locked.');
    }
  }

  async setLeagueScoringRule(userId: string, leagueId: string, scoringRuleId: string | null) {
    const league = await this.prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, seasonId: true },
    });
    if (!league) throw new NotFoundException('League not found');

    await this.assertTournamentNotStarted(league.seasonId);
    await this.assertLeagueAdminOnly(userId, leagueId);

    if (scoringRuleId) {
      const exists = await this.prisma.scoringRule.findUnique({
        where: { id: scoringRuleId },
        select: { id: true, seasonId: true },
      });
      if (!exists) throw new BadRequestException('Scoring rule not found');

      if (exists.seasonId && exists.seasonId !== league.seasonId) {
        throw new BadRequestException('Scoring rule does not belong to this season');
      }
    }


    return this.prisma.league.update({
      where: { id: leagueId },
      data: { scoringRuleId },
      select: { id: true, scoringRuleId: true },
    });
  }

  async updateLeagueCustomRule(
    userId: string,
    leagueId: string,
    input: { name?: string; details: Array<{ code: string; points: number }> },
  ) {
    const league = await this.prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, seasonId: true, scoringRuleId: true },
    });
    if (!league) throw new NotFoundException('League not found');

    // mismas reglas que cambiar scoringRuleId
    await this.assertTournamentNotStarted(league.seasonId);
    await this.assertLeagueAdminOnly(userId, leagueId);

    const ruleId = league.scoringRuleId;
    if (!ruleId) throw new BadRequestException('League has no scoring rule assigned');

    // Solo permitir editar regla NO-global (custom)
    const rule = await this.prisma.scoringRule.findUnique({
      where: { id: ruleId },
      select: { id: true, isGlobal: true },
    });
    if (!rule) throw new NotFoundException('Scoring rule not found');
    if (rule.isGlobal) throw new BadRequestException('Global scoring rules cannot be edited');

    // Validaciones server-side (mismas de UI)
    const details = Array.isArray(input?.details) ? input.details : [];
    if (details.length === 0) throw new BadRequestException('details are required');

    const rows = await this.prisma.seasonScoringConcept.findMany({
      where: { seasonId: league.seasonId },
      select: { code: true },
    });
    const allowed = new Set(rows.map((x) => x.code));

    if (allowed.size === 0) {
      throw new BadRequestException('Season has no scoring concepts configured');
    }

    let hasPositive = false;
    for (const d of details) {
      if (!allowed.has(d.code)) throw new BadRequestException(`Invalid code: ${d.code}`);
      if (!Number.isInteger(d.points)) throw new BadRequestException(`Points must be integer for ${d.code}`);
      if (d.points < 0) throw new BadRequestException(`Points cannot be negative for ${d.code}`);
      if (d.points > 0) hasPositive = true;
    }
    if (!hasPositive) throw new BadRequestException('At least one concept must have points > 0');

    // Guardado: reemplazamos detalles completos (simple y consistente)
    const name = (input?.name ?? '').trim();

    await this.prisma.$transaction(async (tx) => {
      if (name) {
        await tx.scoringRule.update({
          where: { id: ruleId },
          data: { name },
        });
      }

      await tx.scoringRuleDetail.deleteMany({ where: { ruleId } });
      await tx.scoringRuleDetail.createMany({
        data: details.map((d) => ({ ruleId, code: d.code, points: d.points })),
      });
    });

    return { ok: true, ruleId };
  }

  async listMembers(userId: string, leagueId: string) {
    // Debe ser miembro activo para poder ver la lista
    const m = await this.prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
      select: { status: true },
    });
    if (!m || m.status !== 'ACTIVE') throw new ForbiddenException('Not a member of this league');

    const rows = await this.prisma.leagueMember.findMany({
      where: { leagueId },
      select: {
        role: true,
        status: true,
        joinedAt: true,
        user: { select: { id: true, email: true, displayName: true } },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    // Orden manual deseado: OWNER, ADMIN, MEMBER
    const order: Record<string, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };

    return rows
      .slice()
      .sort((a: any, b: any) => (order[a.role] ?? 9) - (order[b.role] ?? 9))
      .map((r: any) => ({
        userId: r.user.id,
        email: r.user.email,
        displayName: r.user.displayName,
        role: r.role,
        status: r.status,
        joinedAt: r.joinedAt,
      }));
  }

  async setMemberRole(
    userId: string,
    leagueId: string,
    targetUserId: string,
    role: 'ADMIN' | 'MEMBER',
  ) {
    if (!targetUserId) throw new BadRequestException('userId is required');
    if (role !== 'ADMIN' && role !== 'MEMBER') throw new BadRequestException('Invalid role');

    // Solo admins/owner (o admin global) pueden gestionar
    await this.assertCanManageLeague(userId, leagueId);

    // Bloquear cambios si el torneo ya empezó (usamos mismo criterio que para reglas)
    const league = await this.prisma.league.findUnique({
      where: { id: leagueId },
      select: { seasonId: true },
    });
    if (!league) throw new NotFoundException('League not found');
    await this.assertTournamentNotStarted(league.seasonId);

    // Target debe ser miembro
    const target = await this.prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId: targetUserId } },
      select: { role: true, status: true },
    });
    if (!target || target.status !== 'ACTIVE') throw new NotFoundException('Member not found');

    // No se puede cambiar OWNER por este endpoint
    if (target.role === 'OWNER') throw new ForbiddenException('Cannot change OWNER role');

    // Actualizar rol
    return this.prisma.leagueMember.update({
      where: { leagueId_userId: { leagueId, userId: targetUserId } },
      data: { role },
      select: {
        leagueId: true,
        userId: true,
        role: true,
        status: true,
      },
    });
  }

  async listPublicLeagues(userId: string, seasonId: string) {
    const sid = (seasonId || '').trim();
    if (!sid) throw new BadRequestException('seasonId is required');

    // mostramos PUBLIC y APPROVAL; PRIVATE no aparece
    const leagues = await this.prisma.league.findMany({
      where: {
        seasonId: sid,
        joinPolicy: { in: ['PUBLIC', 'APPROVAL'] as any },
      },
      select: {
        id: true,
        name: true,
        joinPolicy: true,
        createdAt: true,
        createdById: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // memberCount (simple)
    const counts = await this.prisma.leagueMember.groupBy({
      by: ['leagueId'],
      where: { leagueId: { in: leagues.map((l) => l.id) }, status: 'ACTIVE' },
      _count: { leagueId: true },
    });

    const map = new Map(counts.map((c) => [c.leagueId, c._count.leagueId]));

    // si ya soy miembro, marcamos
    const my = await this.prisma.leagueMember.findMany({
      where: { userId, leagueId: { in: leagues.map((l) => l.id) }, status: 'ACTIVE' },
      select: { leagueId: true, role: true },
    });
    const myMap = new Map(my.map((m) => [m.leagueId, m.role]));

    return leagues.map((l) => ({
      ...l,
      memberCount: map.get(l.id) ?? 0,
      myRole: myMap.get(l.id) ?? null,
    }));
  }

  async joinPublic(userId: string, leagueId: string) {
    const league = await this.prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, seasonId: true, joinPolicy: true },
    });
    if (!league) throw new NotFoundException('League not found');

    await this.assertTournamentNotStarted(league.seasonId);

    if (league.joinPolicy !== 'PUBLIC') {
      throw new BadRequestException('League is not public');
    }

    await this.prisma.leagueMember.upsert({
      where: { leagueId_userId: { leagueId: league.id, userId } },
      update: { status: 'ACTIVE' },
      create: { leagueId: league.id, userId, status: 'ACTIVE', role: 'MEMBER' },
    });

    return { ok: true, leagueId: league.id };
  }

  async listJoinRequests(userId: string, leagueId: string) {
    await this.assertCanManageLeague(userId, leagueId);

    const rows = await this.prisma.leagueJoinRequest.findMany({
      where: { leagueId, status: 'PENDING' },
      select: {
        id: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, email: true, displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((r) => ({
      requestId: r.id,
      userId: r.user.id,
      email: r.user.email,
      displayName: r.user.displayName,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  async decideJoinRequest(
    userId: string,
    leagueId: string,
    requestId: string,
    input: { approve: boolean; reason?: string },
  ) {
    await this.assertCanManageLeague(userId, leagueId);

    const req = await this.prisma.leagueJoinRequest.findUnique({
      where: { id: requestId },
      select: { id: true, leagueId: true, userId: true, status: true },
    });
    if (!req || req.leagueId !== leagueId) throw new NotFoundException('Join request not found');
    if (req.status !== 'PENDING') throw new BadRequestException('Join request is not pending');

    const nextStatus = input.approve ? 'APPROVED' : 'REJECTED';

    await this.prisma.$transaction(async (tx) => {
      await tx.leagueJoinRequest.update({
        where: { id: req.id },
        data: {
          status: nextStatus as any,
          decidedAt: new Date(),
          decidedById: userId,
          reason: (input.reason || '').trim() || null,
        },
      });

      if (input.approve) {
        await tx.leagueMember.upsert({
          where: { leagueId_userId: { leagueId, userId: req.userId } },
          update: { status: 'ACTIVE' },
          create: { leagueId, userId: req.userId, status: 'ACTIVE', role: 'MEMBER' },
        });
      }
    });

    return { ok: true };
  }

  async getLeagueAccessSettings(userId: string, leagueId: string) {
    // solo miembro puede ver settings básicos; solo admin/owner cambiará luego (en el front lo bloqueamos)
    const m = await this.prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
      select: { status: true },
    });
    if (!m || m.status !== 'ACTIVE') throw new ForbiddenException('Not a member of this league');

    const league = await this.prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, joinCode: true, joinPolicy: true, inviteEnabled: true, seasonId: true },
    });
    if (!league) throw new NotFoundException('League not found');

    return league;
  }

  async updateLeagueAccessSettings(
    userId: string,
    leagueId: string,
    input: { joinPolicy?: 'PUBLIC' | 'PRIVATE' | 'APPROVAL'; inviteEnabled?: boolean; rotateCode?: boolean },
  ) {
    await this.assertCanManageLeague(userId, leagueId);

    const league = await this.prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, seasonId: true },
    });
    if (!league) throw new NotFoundException('League not found');

    await this.assertTournamentNotStarted(league.seasonId);

    const data: any = {};
    if (typeof input.inviteEnabled === 'boolean') data.inviteEnabled = input.inviteEnabled;
    if (input.joinPolicy) data.joinPolicy = input.joinPolicy as any;

    if (input.rotateCode) {
      data.joinCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    return this.prisma.league.update({
      where: { id: leagueId },
      data,
      select: { id: true, joinCode: true, joinPolicy: true, inviteEnabled: true },
    });
  }

}
