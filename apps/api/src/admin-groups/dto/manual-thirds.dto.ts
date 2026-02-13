export class ManualThirdsDto {
  seasonId!: string;
  qualifiedTeamIds!: string[]; // 8 teamIds (los terceros que clasifican)
  reason?: string;
}
