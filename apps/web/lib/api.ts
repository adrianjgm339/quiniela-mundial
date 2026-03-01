import { z } from "zod";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

// ---------------------------
// Shared helpers (typed JSON)
// ---------------------------

async function readJsonUnknown(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text as unknown;
  }
}

async function apiJsonZ<T>(res: Response, fallbackMsg: string, schema: z.ZodSchema<T>): Promise<T> {
  const data: unknown = await readJsonUnknown(res);

  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message: unknown }).message)
        : typeof data === "string"
          ? data
          : `${fallbackMsg} (${res.status})`;
    throw new Error(msg);
  }

  return schema.parse(data);
}

const OkSchema = z.object({ ok: z.boolean() }).passthrough();

// ---------------------------
// Auth
// ---------------------------

export type LoginResponse = {
  user: { id: string; email: string; displayName: string; role: string; createdAt: string };
  token: string;
};

const LoginResponseSchema: z.ZodType<LoginResponse> = z
  .object({
    user: z
      .object({
        id: z.string(),
        email: z.string(),
        displayName: z.string(),
        role: z.string(),
        createdAt: z.string(),
      })
      .passthrough(),
    token: z.string(),
  })
  .passthrough();

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  return apiJsonZ(res, "Login failed", LoginResponseSchema);
}

export async function googleLogin(idToken: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  return apiJsonZ(res, "Google login failed", LoginResponseSchema);
}

export async function forgotPassword(email: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  // Siempre OK (anti-enumeration), pero igual manejamos errores de red/500
  return apiJsonZ(
    res,
    "Forgot password failed",
    z.object({ ok: z.boolean(), message: z.string() }).passthrough()
  );
}

export type RegisterResponse = LoginResponse;

export async function register(email: string, password: string, displayName: string): Promise<RegisterResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName }),
  });

  return apiJsonZ(res, "Register failed", LoginResponseSchema);
}

export type MeResponse = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt?: string;
  activeSeasonId?: string | null;
  activeSeason?: { id: string; slug?: string | null; name?: string } | null;
  countryCode?: string | null;
};

const MeResponseSchema: z.ZodType<MeResponse> = z
  .object({
    id: z.string(),
    email: z.string(),
    displayName: z.string(),
    role: z.string(),
    createdAt: z.string().optional(),
    activeSeasonId: z.string().nullable().optional(),
    activeSeason: z
      .object({
        id: z.string(),
        slug: z.string().nullable().optional(),
        name: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    countryCode: z.string().nullable().optional(),
  })
  .passthrough();

export async function me(token: string, locale: string): Promise<MeResponse> {
  if (!token || !token.trim()) {
    throw new Error("Unauthorized: missing token (frontend is not storing/reading the token)");
  }

  const res = await fetch(`${API_BASE}/auth/me?locale=${encodeURIComponent(locale)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  return apiJsonZ(res, "Unauthorized", MeResponseSchema);
}

export async function setActiveSeason(token: string, seasonId: string): Promise<{ ok: boolean; activeSeasonId: string }> {
  const res = await fetch(`${API_BASE}/auth/active-season`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ seasonId }),
  });

  return apiJsonZ(
    res,
    "Failed to set active season",
    z.object({ ok: z.boolean(), activeSeasonId: z.string() }).passthrough()
  );
}

// ---------------------------
// Catalog (public)
// ---------------------------

export type CatalogSport = {
  id: string;
  slug: string;
  name: string;
  competitions: {
    id: string;
    slug: string;
    name: string;
    seasons: {
      id: string;
      slug: string;
      name: string;
    }[];
    defaultScoringRuleId?: string | null;
  }[];
};

const CatalogSeasonSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    defaultScoringRuleId: z.string().nullable().optional(),
  })
  .passthrough();

const CatalogCompetitionSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    seasons: z.array(CatalogSeasonSchema),
    defaultScoringRuleId: z.string().nullable().optional(),
  })
  .passthrough();

const CatalogSportSchema: z.ZodType<CatalogSport> = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    competitions: z.array(CatalogCompetitionSchema),
  })
  .passthrough();

const CatalogSportsSchema = z.array(CatalogSportSchema);

export async function getCatalog(locale: string): Promise<CatalogSport[]> {
  const res = await fetch(`${API_BASE}/catalog?locale=${encodeURIComponent(locale)}`, {
    cache: "no-store",
  });

  return apiJsonZ(res, "Error cargando catálogo", CatalogSportsSchema);
}

// ---------------------------
// Matches / Picks
// ---------------------------

export type ApiMatch = {
  id: string;
  externalId: string;
  dateKey: string; // "2026-06-11"
  timeUtc: string; // "19:00"
  utcDateTime: string;
  closeUtc: string | null;
  venue?: string | null;
  status: string;
  score: null | { home: number; away: number };
  homeTeam: { id: string; externalId: string; name: string; flagKey?: string | null; isPlaceholder: boolean };
  awayTeam: { id: string; externalId: string; name: string; flagKey?: string | null; isPlaceholder: boolean };
  phaseCode: string; // "F01" grupos, "F02".. KO
  resultConfirmed: boolean;
};

const TeamSchema = z
  .object({
    id: z.string(),
    externalId: z.string(),
    name: z.string(),
    flagKey: z.string().nullable().optional(),
    isPlaceholder: z.boolean(),
  })
  .passthrough();

const ApiMatchSchema: z.ZodType<ApiMatch> = z
  .object({
    id: z.string(),
    externalId: z.string(),
    dateKey: z.string(),
    timeUtc: z.string(),
    utcDateTime: z.string(),
    closeUtc: z.string().nullable(),
    venue: z.string().nullable().optional(),
    status: z.string(),
    score: z
      .object({
        home: z.number(),
        away: z.number(),
      })
      .nullable(),
    homeTeam: TeamSchema,
    awayTeam: TeamSchema,
    phaseCode: z.string(),
    resultConfirmed: z.boolean(),
  })
  .passthrough();

const ApiMatchesSchema = z.array(ApiMatchSchema);

export async function getMatches(
  token: string,
  locale: string,
  filters?: { seasonId?: string; phaseCode?: string; groupCode?: string }
): Promise<ApiMatch[]> {
  const params = new URLSearchParams();
  params.set("locale", locale);

  if (filters?.seasonId) params.set("seasonId", filters.seasonId);
  if (filters?.phaseCode) params.set("phaseCode", filters.phaseCode);
  if (filters?.groupCode) params.set("groupCode", filters.groupCode);

  const res = await fetch(`${API_BASE}/matches?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  return apiJsonZ(res, "Error fetching matches", ApiMatchesSchema);
}

export type ApiPick = {
  id: string;
  leagueId: string;
  matchId: string;
  homePred: number;
  awayPred: number;
  status: "VALID" | "LATE" | "VOID";
  koWinnerTeamId?: string | null;
  updatedAt: string;
};

const ApiPickSchema: z.ZodType<ApiPick> = z
  .object({
    id: z.string(),
    leagueId: z.string(),
    matchId: z.string(),
    homePred: z.number(),
    awayPred: z.number(),
    status: z.enum(["VALID", "LATE", "VOID"]),
    koWinnerTeamId: z.string().nullable().optional(),
    updatedAt: z.string(),
  })
  .passthrough();

const ApiPicksSchema = z.array(ApiPickSchema);

export async function listPicks(token: string, leagueId: string): Promise<ApiPick[]> {
  const res = await fetch(`${API_BASE}/picks?leagueId=${encodeURIComponent(leagueId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  return apiJsonZ(res, "Failed to load picks", ApiPicksSchema);
}

export async function upsertPick(
  token: string,
  input: { leagueId: string; matchId: string; homePred: number; awayPred: number; koWinnerTeamId?: string | null }
): Promise<ApiPick> {
  const res = await fetch(`${API_BASE}/picks`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return apiJsonZ(res, "Failed to save pick", ApiPickSchema);
}

// ---------------------------
// Leagues
// ---------------------------

export type ApiLeague = {
  id: string;
  name: string;
  joinCode: string;
  seasonId: string;
  createdAt: string;
  createdById: string;

  // NUEVO (MVP reglas por liga)
  scoringRuleId?: string | null;
  myRole?: "OWNER" | "ADMIN" | "MEMBER";
};

const ApiLeagueSchema: z.ZodType<ApiLeague> = z
  .object({
    id: z.string(),
    name: z.string(),
    joinCode: z.string(),
    seasonId: z.string(),
    createdAt: z.string(),
    createdById: z.string(),
    scoringRuleId: z.string().nullable().optional(),
    myRole: z.enum(["OWNER", "ADMIN", "MEMBER"]).optional(),
  })
  .passthrough();

const ApiLeaguesSchema = z.array(ApiLeagueSchema);

export async function getMyLeagues(token: string): Promise<ApiLeague[]> {
  const res = await fetch(`${API_BASE}/leagues/mine`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  return apiJsonZ(res, "Failed to load leagues", ApiLeaguesSchema);
}

export async function createLeague(
  token: string,
  input: { seasonId: string; name: string; scoringRuleId: string }
): Promise<ApiLeague> {
  const res = await fetch(`${API_BASE}/leagues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return apiJsonZ(res, "Failed to create league", ApiLeagueSchema);
}

export async function joinLeagueByCode(
  token: string,
  input: { joinCode: string }
): Promise<{ ok: boolean; leagueId: string }> {
  const res = await fetch(`${API_BASE}/leagues/join`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return apiJsonZ(res, "Failed to join league", z.object({ ok: z.boolean(), leagueId: z.string() }).passthrough());
}

export async function setLeagueScoringRule(
  token: string,
  leagueId: string,
  scoringRuleId: string | null
): Promise<{ id: string; scoringRuleId: string | null }> {
  const res = await fetch(`${API_BASE}/leagues/${encodeURIComponent(leagueId)}/scoring-rule`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scoringRuleId }),
  });

  return apiJsonZ(
    res,
    "Failed to set league scoring rule",
    z.object({ id: z.string(), scoringRuleId: z.string().nullable() }).passthrough()
  );
}

// ---------------------------
// Leaderboards
// ---------------------------

export type LeaderboardRow = {
  userId: string;
  displayName: string | null;
  points: number;
  rank: number;
};

const LeaderboardRowSchema: z.ZodType<LeaderboardRow> = z
  .object({
    userId: z.string(),
    displayName: z.string().nullable(),
    points: z.number(),
    rank: z.number(),
  })
  .passthrough();

export type ApiPointsBreakdown = {
  leagueId: string;
  leagueName: string;
  seasonId: string;
  ruleIdUsed: string;
  totalPoints: number;
  breakdown: Array<{ code: string; label: string | null; points: number }>;
};

const ApiPointsBreakdownSchema: z.ZodType<ApiPointsBreakdown> = z
  .object({
    leagueId: z.string(),
    leagueName: z.string(),
    seasonId: z.string(),
    ruleIdUsed: z.string(),
    totalPoints: z.number(),
    breakdown: z
      .array(
        z
          .object({
            code: z.string(),
            label: z.string().nullable(),
            points: z.number(),
          })
          .passthrough()
      )
      .default([]),
  })
  .passthrough();

export type LeagueLeaderboardResponse = {
  scope: "LEAGUE";
  league: { id: string; name: string; joinCode: string };
  ruleIdUsed: string;
  top: LeaderboardRow[];
  me: LeaderboardRow | null;
};

const LeagueLeaderboardSchema: z.ZodType<LeagueLeaderboardResponse> = z
  .object({
    scope: z.literal("LEAGUE"),
    league: z
      .object({
        id: z.string(),
        name: z.string(),
        joinCode: z.string(),
      })
      .passthrough(),
    ruleIdUsed: z.string(),
    top: z.array(LeaderboardRowSchema),
    me: LeaderboardRowSchema.nullable(),
  })
  .passthrough();

export type WorldLeaderboardResponse = {
  scope: "WORLD";
  ruleIdUsed: string; // B01
  bestMode: "BEST_LEAGUE_TOTAL";
  top: LeaderboardRow[];
  me: LeaderboardRow | null;
};

const WorldLeaderboardSchema: z.ZodType<WorldLeaderboardResponse> = z
  .object({
    scope: z.literal("WORLD"),
    ruleIdUsed: z.string(),
    bestMode: z.literal("BEST_LEAGUE_TOTAL"),
    top: z.array(LeaderboardRowSchema),
    me: LeaderboardRowSchema.nullable(),
  })
  .passthrough();

export type CountryLeaderboardResponse = {
  scope: "COUNTRY";
  countryCode: string;
  ruleIdUsed: string; // B01
  bestMode: "BEST_LEAGUE_TOTAL";
  top: LeaderboardRow[];
  me: LeaderboardRow | null;
};

const CountryLeaderboardSchema: z.ZodType<CountryLeaderboardResponse> = z
  .object({
    scope: z.literal("COUNTRY"),
    countryCode: z.string(),
    ruleIdUsed: z.string(),
    bestMode: z.literal("BEST_LEAGUE_TOTAL"),
    top: z.array(LeaderboardRowSchema),
    me: LeaderboardRowSchema.nullable(),
  })
  .passthrough();

export async function getLeagueLeaderboard(
  token: string,
  leagueId: string,
  limit = 50
): Promise<LeagueLeaderboardResponse> {
  const res = await fetch(`${API_BASE}/leagues/${encodeURIComponent(leagueId)}/leaderboard?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  return apiJsonZ(res, "Failed", LeagueLeaderboardSchema);
}

export async function getWorldLeaderboard(
  token: string,
  limit = 50,
  seasonId?: string
): Promise<WorldLeaderboardResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (seasonId) params.set("seasonId", seasonId);

  const res = await fetch(`${API_BASE}/leaderboards/world?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  return apiJsonZ(res, "Failed", WorldLeaderboardSchema);
}

export async function getCountryLeaderboard(
  token: string,
  countryCode: string,
  limit = 50,
  seasonId?: string
): Promise<CountryLeaderboardResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (seasonId) params.set("seasonId", seasonId);

  const res = await fetch(`${API_BASE}/leaderboards/country/${encodeURIComponent(countryCode)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  return apiJsonZ(res, "Failed", CountryLeaderboardSchema);
}

// =====================
// Admin · Scoring Rules
// =====================

export type ApiScoringRuleDetail = {
  code: string;
  points: number;
};

const ApiScoringRuleDetailSchema: z.ZodType<ApiScoringRuleDetail> = z
  .object({
    code: z.string(),
    points: z.number(),
  })
  .passthrough();

export type ApiSeasonConcept = {
  code: string;
  label: string | null;
};

const ApiSeasonConceptSchema: z.ZodType<ApiSeasonConcept> = z
  .object({
    code: z.string(),
    label: z.string().nullable(),
  })
  .passthrough();

export type ApiScoringRule = {
  id: string; // "B01", "R01", etc.
  name: string;
  description: string | null;
  isGlobal: boolean;
  details: ApiScoringRuleDetail[];
};

const ApiScoringRuleSchema: z.ZodType<ApiScoringRule> = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    isGlobal: z.boolean(),
    details: z.array(ApiScoringRuleDetailSchema),
  })
  .passthrough();

const ApiScoringRulesSchema = z.array(ApiScoringRuleSchema);
const ApiSeasonConceptsSchema = z.array(ApiSeasonConceptSchema);

export async function listScoringRules(token: string, seasonId?: string): Promise<ApiScoringRule[]> {
  const params = new URLSearchParams();
  if (seasonId) params.set("seasonId", seasonId);

  const url = params.toString() ? `${API_BASE}/scoring/rules?${params.toString()}` : `${API_BASE}/scoring/rules`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  return apiJsonZ(res, "Failed", ApiScoringRulesSchema);
}

export async function getScoringRule(token: string, ruleId: string): Promise<ApiScoringRule> {
  const res = await fetch(`${API_BASE}/scoring/rules/${encodeURIComponent(ruleId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  return apiJsonZ(res, "Failed", ApiScoringRuleSchema);
}

export async function getSeasonConcepts(token: string, seasonId: string): Promise<ApiSeasonConcept[]> {
  const res = await fetch(`${API_BASE}/scoring/concepts?seasonId=${encodeURIComponent(seasonId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  return apiJsonZ(res, "Failed", ApiSeasonConceptsSchema);
}

export async function createScoringRule(
  token: string,
  input: { id: string; name: string; description?: string | null; isGlobal?: boolean; details?: ApiScoringRuleDetail[] }
): Promise<ApiScoringRule> {
  const res = await fetch(`${API_BASE}/scoring/rules`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return apiJsonZ(res, "Failed", ApiScoringRuleSchema);
}

export async function updateScoringRule(
  token: string,
  ruleId: string,
  input: { name?: string; description?: string | null; isGlobal?: boolean }
): Promise<ApiScoringRule> {
  const res = await fetch(`${API_BASE}/scoring/rules/${encodeURIComponent(ruleId)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return apiJsonZ(res, "Failed", ApiScoringRuleSchema);
}

export async function setScoringRuleDetails(
  token: string,
  ruleId: string,
  details: ApiScoringRuleDetail[]
): Promise<ApiScoringRule> {
  const res = await fetch(`${API_BASE}/scoring/rules/${encodeURIComponent(ruleId)}/details`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ details }),
  });

  return apiJsonZ(res, "Failed", ApiScoringRuleSchema);
}

export async function recomputeScoring(
  token: string,
  seasonId?: string
): Promise<{
  ok: boolean;
  seasonId: string | null;
  confirmedMatchesWithScore: number;
  picksProcessed: number;
  rulesLoaded: string[];
  note?: string;
}> {
  const params = new URLSearchParams();
  if (seasonId) params.set("seasonId", seasonId);

  const url = params.toString() ? `${API_BASE}/scoring/recompute?${params.toString()}` : `${API_BASE}/scoring/recompute`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  return apiJsonZ(
    res,
    "Failed",
    z
      .object({
        ok: z.boolean(),
        seasonId: z.string().nullable(),
        confirmedMatchesWithScore: z.number(),
        picksProcessed: z.number(),
        rulesLoaded: z.array(z.string()),
        note: z.string().optional(),
      })
      .passthrough()
  );
}

// ---------------------------
// ADMIN Catalog CRUD
// ---------------------------

export type CatalogNames = { es?: string; en?: string };

export type AdminCatalogEntity = {
  id: string;
  slug?: string;
  names: CatalogNames;
  startDate?: string | null;
  endDate?: string | null;
  defaultScoringRuleId?: string | null;
  sportId?: string;
  competitionId?: string;
};

const CatalogNamesSchema: z.ZodType<CatalogNames> = z.object({
  es: z.string().optional(),
  en: z.string().optional(),
}).passthrough();

const AdminCatalogEntitySchema: z.ZodType<AdminCatalogEntity> = z
  .object({
    id: z.string(),
    slug: z.string().optional(),
    names: CatalogNamesSchema,
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    defaultScoringRuleId: z.string().nullable().optional(),
    sportId: z.string().optional(),
    competitionId: z.string().optional(),
  })
  .passthrough();

export async function adminCreateSport(token: string, names: CatalogNames): Promise<AdminCatalogEntity> {
  const res = await fetch(`${API_BASE}/catalog/sports`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ names }),
  });

  return apiJsonZ(res, "Error creando deporte", AdminCatalogEntitySchema);
}

export async function adminUpdateSport(token: string, id: string, names: CatalogNames): Promise<AdminCatalogEntity> {
  const res = await fetch(`${API_BASE}/catalog/sports/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ names }),
  });

  return apiJsonZ(res, "Error actualizando deporte", AdminCatalogEntitySchema);
}

export async function adminDeleteSport(token: string, id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/catalog/sports/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  return apiJsonZ(res, "Error borrando deporte", OkSchema);
}

export async function adminCreateCompetition(
  token: string,
  sportId: string,
  names: CatalogNames
): Promise<AdminCatalogEntity> {
  const res = await fetch(`${API_BASE}/catalog/competitions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sportId, names }),
  });

  return apiJsonZ(res, "Error creando competición", AdminCatalogEntitySchema);
}

export async function adminUpdateCompetition(token: string, id: string, names: CatalogNames): Promise<AdminCatalogEntity> {
  const res = await fetch(`${API_BASE}/catalog/competitions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ names }),
  });

  return apiJsonZ(res, "Error actualizando competición", AdminCatalogEntitySchema);
}

export async function adminDeleteCompetition(token: string, id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/catalog/competitions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  return apiJsonZ(res, "Error borrando competición", OkSchema);
}

export async function adminCreateSeason(
  token: string,
  competitionId: string,
  names: CatalogNames,
  dates?: { startDate?: string | null; endDate?: string | null },
  defaultScoringRuleId?: string
): Promise<AdminCatalogEntity> {
  const res = await fetch(`${API_BASE}/catalog/seasons`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ competitionId, names, defaultScoringRuleId, ...dates }),
  });

  return apiJsonZ(res, "Error creando evento", AdminCatalogEntitySchema);
}

export async function adminUpdateSeason(
  token: string,
  id: string,
  names: CatalogNames,
  dates?: { startDate?: string | null; endDate?: string | null },
  defaultScoringRuleId?: string
): Promise<AdminCatalogEntity> {
  const res = await fetch(`${API_BASE}/catalog/seasons/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ names, defaultScoringRuleId, ...dates }),
  });

  return apiJsonZ(res, "Error actualizando evento", AdminCatalogEntitySchema);
}

export async function adminDeleteSeason(token: string, id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/catalog/seasons/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  return apiJsonZ(res, "Error borrando evento", OkSchema);
}

export async function getMyPointsBreakdown(token: string, leagueId: string): Promise<ApiPointsBreakdown> {
  const res = await fetch(`${API_BASE}/leagues/${encodeURIComponent(leagueId)}/me/points-breakdown`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  return apiJsonZ(res, "Failed to load points breakdown", ApiPointsBreakdownSchema);
}