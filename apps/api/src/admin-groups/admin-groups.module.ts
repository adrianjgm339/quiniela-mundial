import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminGroupsController } from './admin-groups.controller';
import { AdminGroupsService } from './admin-groups.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminGroupsController],
  providers: [AdminGroupsService],
})
export class AdminGroupsModule {}
