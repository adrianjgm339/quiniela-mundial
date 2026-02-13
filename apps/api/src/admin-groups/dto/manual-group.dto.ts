export class ManualGroupDto {
  seasonId!: string;
  groupCode!: string; // "A".."L"
  orderedTeamIds!: string[]; // teamIds en el orden final (1..N según tamaño del grupo)
  reason?: string;
}
