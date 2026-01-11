import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateMatchResultDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  homeScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  awayScore?: number;

  @IsOptional()
  @IsBoolean()
  resultConfirmed?: boolean;
}
