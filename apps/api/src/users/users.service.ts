import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async setActiveSeason(userId: string, seasonId: string) {
    // 1️⃣ Verificar que la season exista
    const season = await this.prisma.season.findUnique({
      where: { id: seasonId },
    });

    if (!season) {
      throw new NotFoundException('Season not found');
    }

    // 2️⃣ Guardar la season como activa para el usuario
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        activeSeasonId: seasonId,
      },
      select: {
        id: true,
        activeSeasonId: true,
      },
    });
  }
}
