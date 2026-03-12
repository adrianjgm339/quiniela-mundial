import { IsArray, IsOptional, IsString, ArrayMinSize } from 'class-validator';

export class ManualGroupDto {
  @IsString()
  seasonId!: string;

  @IsString()
  groupCode!: string; // "A".."L"

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderedTeamIds!: string[]; // teamIds en el orden final (1..N según tamaño del grupo)

  @IsOptional()
  @IsString()
  reason?: string;
}