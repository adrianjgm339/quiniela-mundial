import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeaguesController } from './leagues.controller';
import { LeaguesService } from './leagues.service';

@Module({
  controllers: [LeaguesController],
  providers: [LeaguesService, PrismaService],
})
export class LeaguesModule {}
