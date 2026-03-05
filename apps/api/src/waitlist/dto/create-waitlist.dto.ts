import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum WaitlistInterestDto {
  SOCCER = 'SOCCER',
  BASEBALL = 'BASEBALL',
  BOTH = 'BOTH',
}

export class CreateWaitlistDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsEnum(WaitlistInterestDto)
  interest?: WaitlistInterestDto;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  referrer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  path?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utmContent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utmTerm?: string;
}
