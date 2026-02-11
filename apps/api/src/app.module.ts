import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { UsersModule } from './users/users.module';
import { MatchesModule } from './matches/matches.module';
import { PicksModule } from './picks/picks.module';
import { LeaguesModule } from './leagues/leagues.module';
import { ScoringModule } from './scoring/scoring.module';
import { LeaderboardsModule } from './leaderboards/leaderboards.module';
import { AiModule } from './ai/ai.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Busca .env en:
      // 1) apps/api/.env
      // 2) root del repo (../../.env)
      envFilePath: [
        path.resolve(process.cwd(), '.env'),
        path.resolve(__dirname, '..', '..', '..', '.env'),
      ],
    }),
    PrismaModule,
    AuthModule,
    CatalogModule,
    UsersModule,
    MatchesModule,
    PicksModule,
    LeaguesModule,
    ScoringModule,
    LeaderboardsModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
