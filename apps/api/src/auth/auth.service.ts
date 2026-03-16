import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { createHash, randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { Resend } from 'resend';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {
    // Usa GOOGLE_CLIENT_ID en el backend (no NEXT_PUBLIC_)
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.googleClient = new OAuth2Client(clientId);
  }

  private sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private getResend() {
    const apiKey = (process.env.RESEND_API_KEY || '').trim();
    if (!apiKey) {
      throw new BadRequestException('RESEND_API_KEY is not configured');
    }
    return new Resend(apiKey);
  }

  private getMailFrom() {
    const mailFrom = (process.env.MAIL_FROM || '').trim();
    if (!mailFrom) {
      throw new BadRequestException('MAIL_FROM is not configured');
    }
    return mailFrom;
  }

  private getAppBaseUrl() {
    const appBaseUrl = (process.env.APP_BASE_URL || '').trim();
    if (!appBaseUrl) {
      throw new BadRequestException('APP_BASE_URL is not configured');
    }
    return appBaseUrl.replace(/\/+$/, '');
  }

  private async sendVerificationEmail(input: { userId: string; email: string; locale?: string }) {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.sha256(rawToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 horas

    await this.prisma.emailVerificationToken.create({
      data: {
        userId: input.userId,
        tokenHash,
        expiresAt,
      },
    });

    const locale = (input.locale || 'es').trim() || 'es';
    const appBaseUrl = this.getAppBaseUrl();
    const verifyUrl = `${appBaseUrl}/${locale}/verify-email?token=${encodeURIComponent(rawToken)}`;

    const resend = this.getResend();
    const from = this.getMailFrom();

    await resend.emails.send({
      from,
      to: input.email,
      subject: 'Verifica tu correo - QuinielaManía',
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111">
          <h2>Verifica tu correo</h2>
          <p>Gracias por crear tu cuenta en QuinielaManía.</p>
          <p>Para activar tu cuenta, confirma tu correo haciendo clic en el siguiente botón:</p>
          <p>
            <a href="${verifyUrl}" style="display:inline-block;padding:10px 16px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;">
              Verificar correo
            </a>
          </p>
          <p>Si el botón no te funciona, copia y pega este enlace en tu navegador:</p>
          <p>${verifyUrl}</p>
          <p>Este enlace vence en 24 horas.</p>
        </div>
      `,
    });
  }

  async register(input: {
    email: string;
    password: string;
    displayName: string;
    locale?: string;
  }) {
    const email = (input.email || '').trim().toLowerCase();
    const password = input.password || '';
    const displayName = (input.displayName || '').trim();
    const locale = (input.locale || 'es').trim() || 'es';

    if (!email || !password || !displayName) {
      throw new BadRequestException(
        'email, password, displayName are required',
      );
    }

    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new BadRequestException('Email already in use');

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: { email, passwordHash, displayName },
      select: {
        id: true,
        email: true,
        displayName: true,
      },
    });

    await this.sendVerificationEmail({
      userId: user.id,
      email: user.email,
      locale,
    });

    return {
      ok: true,
      message: 'Te enviamos un correo para verificar tu cuenta.',
      email: user.email,
    };
  }

  async login(input: { email: string; password: string }) {
    const email = (input.email || '').trim().toLowerCase();
    const password = input.password || '';

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException('Email not verified');
    }

    const safeUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt,
    };

    const token = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
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
    if (!payload?.email)
      throw new UnauthorizedException('Invalid Google token');

    const email = payload.email.trim().toLowerCase();
    const displayName =
      (payload.name || '').trim() || email.split('@')[0] || 'User';

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
          emailVerifiedAt: new Date(),
        },
      });
    }

    if (!user.emailVerifiedAt) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
    }

    const safeUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt,
    };

    const token = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { user: safeUser, token };
  }

  async verifyEmail(input: { token: string }) {
    const rawToken = (input.token || '').trim();
    if (!rawToken) {
      throw new BadRequestException('token is required');
    }

    const tokenHash = this.sha256(rawToken);

    const verificationToken =
      await this.prisma.emailVerificationToken.findUnique({
        where: { tokenHash },
      });

    if (!verificationToken) {
      throw new BadRequestException('Invalid or expired token');
    }

    if (verificationToken.usedAt) {
      throw new BadRequestException('Invalid or expired token');
    }

    if (verificationToken.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invalid or expired token');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return {
      ok: true,
      message: 'Correo verificado correctamente.',
    };
  }

  async forgotPassword(input: { email: string }) {
    const email = (input.email || '').trim().toLowerCase();

    if (!email) {
      throw new BadRequestException('email is required');
    }

    const genericResponse = {
      ok: true,
      message: 'Si existe una cuenta con ese email, recibirás instrucciones.',
    };

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return genericResponse;
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.sha256(rawToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hora

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    const appBaseUrl = this.getAppBaseUrl();
    const resetUrl = `${appBaseUrl}/es/reset-password?token=${encodeURIComponent(rawToken)}`;

    const resend = this.getResend();
    const from = this.getMailFrom();

    await resend.emails.send({
      from,
      to: user.email,
      subject: 'Recupera tu contraseña - QuinielaManía',
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111">
          <h2>Recuperar contraseña</h2>
          <p>Recibimos una solicitud para restablecer tu contraseña.</p>
          <p>
            <a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;">
              Restablecer contraseña
            </a>
          </p>
          <p>Si el botón no te funciona, copia y pega este enlace en tu navegador:</p>
          <p>${resetUrl}</p>
          <p>Este enlace vence en 1 hora.</p>
          <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
        </div>
      `,
    });

    return genericResponse;
  }

  async resetPassword(input: { token: string; password: string }) {
    const rawToken = (input.token || '').trim();
    const password = input.password || '';

    if (!rawToken) {
      throw new BadRequestException('token is required');
    }

    if (password.length < 6) {
      throw new BadRequestException(
        'password must be at least 6 characters',
      );
    }

    const tokenHash = this.sha256(rawToken);

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired token');
    }

    if (resetToken.usedAt) {
      throw new BadRequestException('Invalid or expired token');
    }

    if (resetToken.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invalid or expired token');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return {
      ok: true,
      message: 'Contraseña restablecida correctamente.',
    };
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
        .replace(
          /\p{L}[\p{L}\p{M}'’\-]*/gu,
          (w) => w.charAt(0).toUpperCase() + w.slice(1),
        );

    const pickName = (
      translations: Array<{ locale: string; name: string }> | undefined,
      preferredLocale: string,
      fallbackSlug: string,
    ) => {
      const list = Array.isArray(translations) ? translations : [];
      const p = (preferredLocale || '').trim();

      const exact = list
        .find((t) => (t.locale || '').trim() === p)
        ?.name?.trim();
      if (exact) return exact;

      const es = list
        .find((t) => (t.locale || '').trim() === 'es')
        ?.name?.trim();
      if (es) return es;

      const en = list
        .find((t) => (t.locale || '').trim() === 'en')
        ?.name?.trim();
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
          name: pickName(
            user.activeSeason.translations,
            locale,
            user.activeSeason.slug,
          ),
          competition: {
            id: user.activeSeason.competition.id,
            slug: user.activeSeason.competition.slug,
            name: pickName(
              user.activeSeason.competition.translations,
              locale,
              user.activeSeason.competition.slug,
            ),
            sport: {
              id: user.activeSeason.competition.sport.id,
              slug: user.activeSeason.competition.sport.slug,
              name: pickName(
                user.activeSeason.competition.sport.translations,
                locale,
                user.activeSeason.competition.sport.slug,
              ),
            },
          },
        }
        : null,
    };
  }
}
