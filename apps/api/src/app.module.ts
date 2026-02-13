import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from "./catalog/catalog.module";
import { UsersModule } from './users/users.module';
import { MatchesModule } from './matches/matches.module';
import { PicksModule } from './picks/picks.module';
import { LeaguesModule } from './leagues/leagues.module';
import { ScoringModule } from './scoring/scoring.module';
import { LeaderboardsModule } from './leaderboards/leaderboards.module';
import { AdminGroupsModule } from './admin-groups/admin-groups.module';

@Module({
  imports: [PrismaModule, AuthModule, CatalogModule, UsersModule, MatchesModule, PicksModule, LeaguesModule, ScoringModule, LeaderboardsModule, AdminGroupsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
