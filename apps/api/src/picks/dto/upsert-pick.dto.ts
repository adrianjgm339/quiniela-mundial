import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpsertPickDto {
  @IsString()
  leagueId!: string;

  @IsString()
  matchId!: string;

  @IsInt()
  @Min(0)
  homePred!: number;

  @IsInt()
  @Min(0)
  awayPred!: number;

  @IsOptional()
  @IsString()
  koWinnerTeamId?: string | null;

  // Béisbol: totales (se evaluarán solo si la regla tiene puntos > 0)
  @IsOptional()
  @IsInt()
  @Min(0)
  predTotalHits?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  predTotalErrors?: number;
}
