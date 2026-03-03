import { z } from "zod";

export const IdSchema = z.string();

export const SeasonSchema = z.object({
  id: IdSchema,
  slug: z.string().nullable().optional(),
  name: z.string().optional(),
});

export type Season = z.infer<typeof SeasonSchema>;

export const LeagueSchema = z.object({
  id: IdSchema,
  name: z.string(),
  seasonId: IdSchema.nullable().optional(),
});

export type League = z.infer<typeof LeagueSchema>;

export const GroupSchema = z.object({
  id: IdSchema,
  name: z.string(),
  leagueId: IdSchema,
});

export type Group = z.infer<typeof GroupSchema>;

// Útil para endpoints que devuelven listas
export const SeasonsSchema = z.array(SeasonSchema);
export const LeaguesSchema = z.array(LeagueSchema);
export const GroupsSchema = z.array(GroupSchema);

// Error estándar (si tu API devuelve algo así)
export const ApiErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;