import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PicksController } from './picks.controller';
import { PicksService } from './picks.service';

@Module({
  controllers: [PicksController],
  providers: [PicksService, PrismaService],
})
export class PicksModule {}
