import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWaitlistDto, WaitlistInterestDto } from './dto/create-waitlist.dto';

@Injectable()
export class WaitlistService {
    constructor(private readonly prisma: PrismaService) { }

    async create(dto: CreateWaitlistDto) {
        const email = dto.email.trim().toLowerCase();

        try {
            const created = await this.prisma.waitlist.upsert({
                where: { email },
                update: {
                    phone: dto.phone?.trim() || null,
                    name: dto.name?.trim() || null,
                    interest: (dto.interest as any) || WaitlistInterestDto.BOTH,
                    locale: dto.locale || null,
                    source: dto.source || 'landing',
                    referrer: dto.referrer || null,
                    path: dto.path || null,
                    utmSource: dto.utmSource || null,
                    utmMedium: dto.utmMedium || null,
                    utmCampaign: dto.utmCampaign || null,
                    utmContent: dto.utmContent || null,
                    utmTerm: dto.utmTerm || null,
                },
                create: {
                    email,
                    phone: dto.phone?.trim() || null,
                    name: dto.name?.trim() || null,
                    interest: (dto.interest as any) || WaitlistInterestDto.BOTH,
                    locale: dto.locale || null,
                    source: dto.source || 'landing',
                    referrer: dto.referrer || null,
                    path: dto.path || null,
                    utmSource: dto.utmSource || null,
                    utmMedium: dto.utmMedium || null,
                    utmCampaign: dto.utmCampaign || null,
                    utmContent: dto.utmContent || null,
                    utmTerm: dto.utmTerm || null,
                },
                select: { id: true, email: true, createdAt: true },
            });

            return { ok: true, ...created };
        } catch {
            throw new BadRequestException('No se pudo registrar en la waitlist.');
        }
    }
}