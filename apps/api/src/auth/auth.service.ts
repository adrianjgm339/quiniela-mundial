import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(private prisma: PrismaService, private jwt: JwtService) {
    // Usa GOOGLE_CLIENT_ID en el backend (no NEXT_PUBLIC_)
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.googleClient = new OAuth2Client(clientId);
  }

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

  async googleLogin(input: { idToken: string }) {
    const idToken = (input.idToken || '').trim();
    if (!idToken) throw new BadRequestException('idToken is required');

    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    if (!clientId) {
      throw new BadRequestException('GOOGLE_CLIENT_ID is not configured');
    }

    // Verifica firma + audience + expiración del token
    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    if (!payload?.email) throw new UnauthorizedException('Invalid Google token');

    const email = payload.email.trim().toLowerCase();
    const displayName =
      (payload.name || '').trim() ||
      email.split('@')[0] ||
      'User';

    // Buscar usuario por email
    let user = await this.prisma.user.findUnique({ where: { email } });

    // Si no existe, crear usuario automático (MVP)
    if (!user) {
      // Como tu schema usa passwordHash (y login asume que existe),
      // generamos un password aleatorio y lo hasheamos.
      const randomPassword = randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 10);

      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName,
        },
      });
    }

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

  async forgotPassword(input: { email: string }) {
    // Stub MVP anti-enumeration:
    // Siempre respondemos OK, exista o no exista el email.
    // Luego lo conectamos a email provider + token reset.
    return { ok: true, message: 'Si existe una cuenta con ese email, recibirás instrucciones.' };
  }


  async setActiveSeason(userId: string, seasonId: string) {
    const sid = (seasonId || '').trim();
    if (!sid) throw new BadRequestException('seasonId is required');

    const season = await this.prisma.season.findUnique({ where: { id: sid } });
    if (!season) throw new BadRequestException('Season not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: { activeSeasonId: sid },
    });

    return { ok: true, activeSeasonId: sid };
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
              select: { locale: true, name: true },
            },
            competition: {
              select: {
                id: true,
                slug: true,
                translations: {
                  select: { locale: true, name: true },
                },
                sport: {
                  select: {
                    id: true,
                    slug: true,
                    translations: {
                      select: { locale: true, name: true },
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

    const toTitle = (slug: string) =>
      (slug || '')
        .trim()
        .replace(/-/g, ' ')
        .replace(/\p{L}[\p{L}\p{M}'’\-]*/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1));

    const pickName = (
      translations: Array<{ locale: string; name: string }> | undefined,
      preferredLocale: string,
      fallbackSlug: string
    ) => {
      const list = Array.isArray(translations) ? translations : [];
      const p = (preferredLocale || '').trim();

      const exact = list.find((t) => (t.locale || '').trim() === p)?.name?.trim();
      if (exact) return exact;

      const es = list.find((t) => (t.locale || '').trim() === 'es')?.name?.trim();
      if (es) return es;

      const en = list.find((t) => (t.locale || '').trim() === 'en')?.name?.trim();
      if (en) return en;

      const any = list.find((t) => (t.name || '').trim())?.name?.trim();
      if (any) return any;

      const slug = (fallbackSlug || '').trim();
      return slug ? toTitle(slug) : '';
    };

    return {
      ...user,
      activeSeason: user.activeSeason
        ? {
          id: user.activeSeason.id,
          slug: user.activeSeason.slug,
          name: pickName(user.activeSeason.translations, locale, user.activeSeason.slug),
          competition: {
            id: user.activeSeason.competition.id,
            slug: user.activeSeason.competition.slug,
            name: pickName(
              user.activeSeason.competition.translations,
              locale,
              user.activeSeason.competition.slug
            ),
            sport: {
              id: user.activeSeason.competition.sport.id,
              slug: user.activeSeason.competition.sport.slug,
              name: pickName(
                user.activeSeason.competition.sport.translations,
                locale,
                user.activeSeason.competition.sport.slug
              ),
            },
          },
        }
        : null,
    };
  }

}
