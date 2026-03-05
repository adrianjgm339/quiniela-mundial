import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export enum MatchAdvanceMethodDto {
  ET = 'ET', // Prórroga
  PEN = 'PEN', // Penales
}

export class UpdateMatchResultDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  homeScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  awayScore?: number;

  // Béisbol: stats oficiales (se guardan como home/away; el total se calcula luego)
  @IsOptional()
  @IsInt()
  @Min(0)
  homeHits?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  awayHits?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  homeErrors?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  awayErrors?: number;

  @IsOptional()
  @IsBoolean()
  resultConfirmed?: boolean;

  // KO: quién avanza (solo aplica en KO y normalmente solo se necesita si hay empate)
  @IsOptional()
  @IsUUID()
  advanceTeamId?: string;

  // KO: método de definición si hubo empate (ET o PEN)
  @IsOptional()
  @IsEnum(MatchAdvanceMethodDto)
  advanceMethod?: MatchAdvanceMethodDto;
}
