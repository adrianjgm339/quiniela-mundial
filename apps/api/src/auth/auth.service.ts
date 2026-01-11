import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async register(input: { email: string; password: string; displayName: string }) {
    const email = (input.email || '').trim().toLowerCase();
    const password = input.password || '';
    const displayName = (input.displayName || '').trim();

    if (!email || !password || !displayName) {
      throw new BadRequestException('email, password, displayName are required');
    }

    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new BadRequestException('Email already in use');

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: { email, passwordHash, displayName },
      select: { id: true, email: true, displayName: true, role: true, createdAt: true },
    });

    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return { user, token };
  }

  async login(input: { email: string; password: string }) {
    const email = (input.email || '').trim().toLowerCase();
    const password = input.password || '';

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const safeUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt,
    };

    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return { user: safeUser, token };
  }

    async me(userId: string, locale: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
        activeSeasonId: true,
        countryCode: true,

        activeSeason: {
          select: {
            id: true,
            slug: true,
            translations: {
              where: { locale },
              select: { name: true },
            },
            competition: {
              select: {
                id: true,
                slug: true,
                translations: {
                  where: { locale },
                  select: { name: true },
                },
                sport: {
                  select: {
                    id: true,
                    slug: true,
                    translations: {
                      where: { locale },
                      select: { name: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException('User not found');

    return {
      ...user,
      activeSeason: user.activeSeason
        ? {
            id: user.activeSeason.id,
            slug: user.activeSeason.slug,
            name: user.activeSeason.translations[0]?.name ?? '',
            competition: {
              id: user.activeSeason.competition.id,
              slug: user.activeSeason.competition.slug,
              name: user.activeSeason.competition.translations[0]?.name ?? '',
              sport: {
                id: user.activeSeason.competition.sport.id,
                slug: user.activeSeason.competition.sport.slug,
                name: user.activeSeason.competition.sport.translations[0]?.name ?? '',
              },
            },
          }
        : null,
    };
  }

}
