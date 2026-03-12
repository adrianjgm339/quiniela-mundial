import { IsArray, IsOptional, IsString, ArrayMinSize } from 'class-validator';

export class ManualThirdsDto {
  @IsString()
  seasonId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  qualifiedTeamIds!: string[]; // 8 teamIds (los terceros que clasifican)

  @IsOptional()
  @IsString()
  reason?: string;
}