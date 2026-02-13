const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

export type LoginResponse = {
  user: { id: string; email: string; displayName: string; role: string; createdAt: string };
  token: string;
};

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Login failed (${res.status})`);
  }

  return res.json();
}

export async function me(token: string, locale: string) {
  if (!token || !token.trim()) {
    throw new Error("Unauthorized: missing token (frontend is not storing/reading the token)");
  }

  const res = await fetch(`${API_BASE}/auth/me?locale=${encodeURIComponent(locale)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Unauthorized (${res.status}): ${txt}`);
  }

  return res.json();
}

export async function setActiveSeason(token: string, seasonId: string) {
  const res = await fetch(`${API_BASE}/auth/active-season`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ seasonId }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `Failed to set active season (${res.status})`);
  }

  return res.json() as Promise<{ ok: boolean; activeSeasonId: string }>;
}

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

export async function getCatalog(locale: string): Promise<CatalogSport[]> {
  const res = await fetch(`${API_BASE}/catalog?locale=${encodeURIComponent(locale)}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || "Error cargando catálogo");
  }

  return res.json();
}

export type ApiMatch = {
  id: string;
  externalId: string;
  dateKey: string;   // "2026-06-11"
  timeUtc: string;   // "19:00"
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

export async function getMatches(
  token: string,
  locale: string,
  filters?: { seasonId?: string; phaseCode?: string; groupCode?: string }
) {
  const params = new URLSearchParams();
  params.set("locale", locale);

  if (filters?.seasonId) params.set("seasonId", filters.seasonId);
  if (filters?.phaseCode) params.set("phaseCode", filters.phaseCode);
  if (filters?.groupCode) params.set("groupCode", filters.groupCode);

  const res = await fetch(`${API_BASE}/matches?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Error fetching matches (${res.status}): ${txt}`);
  }
  return (await res.json()) as ApiMatch[];
}

export async function listPicks(token: string, leagueId: string) {
  const res = await fetch(`${API_BASE}/picks?leagueId=${encodeURIComponent(leagueId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load picks');
  return res.json();
}

export async function upsertPick(
  token: string,
  input: { leagueId: string; matchId: string; homePred: number; awayPred: number; koWinnerTeamId?: string | null },
) {
  const res = await fetch(`${API_BASE}/picks`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || 'Failed to save pick');
  }
  return res.json();
}

export type ApiPick = {
  id: string;
  leagueId: string;
  matchId: string;
  homePred: number;
  awayPred: number;
  status: 'VALID' | 'LATE' | 'VOID';
  koWinnerTeamId?: string | null;
  updatedAt: string;
};

export type ApiLeague = {
  id: string;
  name: string;
  joinCode: string;
  seasonId: string;
  createdAt: string;
  createdById: string;

  // NUEVO (MVP reglas por liga)
  scoringRuleId?: string | null;
  myRole?: 'OWNER' | 'ADMIN' | 'MEMBER';
};

export async function getMyLeagues(token: string) {
  const res = await fetch(`${API_BASE}/leagues/mine`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load leagues');
  return (await res.json()) as ApiLeague[];
}

export async function createLeague(
  token: string,
  input: { seasonId: string; name: string; scoringRuleId: string },
) {
  const res = await fetch(`${API_BASE}/leagues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Failed to create league');
  }

  return (await res.json()) as ApiLeague;
}

export async function joinLeagueByCode(token: string, input: { joinCode: string }) {
  const res = await fetch(`${API_BASE}/leagues/join`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Failed to join league');
  }

  return (await res.json()) as { ok: boolean; leagueId: string };
}

export async function setLeagueScoringRule(
  token: string,
  leagueId: string,
  scoringRuleId: string | null,
) {
  const res = await fetch(`${API_BASE}/leagues/${encodeURIComponent(leagueId)}/scoring-rule`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ scoringRuleId }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `Failed to set league scoring rule (${res.status})`);
  }

  return (await res.json()) as { id: string; scoringRuleId: string | null };
}

export type LeaderboardRow = {
  userId: string;
  displayName: string | null;
  points: number;
  rank: number;
};

export type LeagueLeaderboardResponse = {
  scope: 'LEAGUE';
  league: { id: string; name: string; joinCode: string };
  ruleIdUsed: string;
  top: LeaderboardRow[];
  me: LeaderboardRow | null;
};

export type WorldLeaderboardResponse = {
  scope: 'WORLD';
  ruleIdUsed: string; // B01
  bestMode: 'BEST_LEAGUE_TOTAL';
  top: LeaderboardRow[];
  me: LeaderboardRow | null;
};

export type CountryLeaderboardResponse = {
  scope: 'COUNTRY';
  countryCode: string;
  ruleIdUsed: string; // B01
  bestMode: 'BEST_LEAGUE_TOTAL';
  top: LeaderboardRow[];
  me: LeaderboardRow | null;
};

export async function getLeagueLeaderboard(token: string, leagueId: string, limit = 50) {
  const res = await fetch(
    `${API_BASE}/leagues/${encodeURIComponent(leagueId)}/leaderboard?limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  if (!res.ok) throw new Error(await res.text().catch(() => 'Failed'));
  return (await res.json()) as LeagueLeaderboardResponse;
}

export async function getWorldLeaderboard(token: string, limit = 50, seasonId?: string) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (seasonId) params.set('seasonId', seasonId);

  const res = await fetch(`${API_BASE}/leaderboards/world?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Failed'));
  return (await res.json()) as WorldLeaderboardResponse;
}

export async function getCountryLeaderboard(token: string, countryCode: string, limit = 50, seasonId?: string) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (seasonId) params.set('seasonId', seasonId);

  const res = await fetch(
    `${API_BASE}/leaderboards/country/${encodeURIComponent(countryCode)}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  if (!res.ok) throw new Error(await res.text().catch(() => 'Failed'));
  return (await res.json()) as CountryLeaderboardResponse;
}

// =====================
// Admin · Scoring Rules
// =====================

export type ApiScoringRuleDetail = {
  code: string;
  points: number;
};

export type ApiSeasonConcept = {
  code: string;
  label: string | null;
};

export type ApiScoringRule = {
  id: string; // "B01", "R01", etc.
  name: string;
  description: string | null;
  isGlobal: boolean;
  details: ApiScoringRuleDetail[];
};

export async function listScoringRules(token: string, seasonId?: string) {
  const params = new URLSearchParams();
  if (seasonId) params.set('seasonId', seasonId);

  const url = params.toString() ? `${API_BASE}/scoring/rules?${params.toString()}` : `${API_BASE}/scoring/rules`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Failed"));
  return (await res.json()) as ApiScoringRule[];
}

export async function getScoringRule(token: string, ruleId: string) {
  const res = await fetch(`${API_BASE}/scoring/rules/${encodeURIComponent(ruleId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Failed"));
  return (await res.json()) as ApiScoringRule;
}

export async function getSeasonConcepts(token: string, seasonId: string) {
  const res = await fetch(`${API_BASE}/scoring/concepts?seasonId=${encodeURIComponent(seasonId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Failed'));
  return (await res.json()) as ApiSeasonConcept[];
}

export async function createScoringRule(
  token: string,
  input: { id: string; name: string; description?: string | null; isGlobal?: boolean; details?: ApiScoringRuleDetail[] },
) {
  const res = await fetch(`${API_BASE}/scoring/rules`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Failed"));
  return (await res.json()) as ApiScoringRule;
}

export async function updateScoringRule(
  token: string,
  ruleId: string,
  input: { name?: string; description?: string | null; isGlobal?: boolean },
) {
  const res = await fetch(`${API_BASE}/scoring/rules/${encodeURIComponent(ruleId)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Failed"));
  return (await res.json()) as ApiScoringRule;
}

export async function setScoringRuleDetails(
  token: string,
  ruleId: string,
  details: ApiScoringRuleDetail[],
) {
  const res = await fetch(`${API_BASE}/scoring/rules/${encodeURIComponent(ruleId)}/details`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ details }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Failed"));
  return (await res.json()) as ApiScoringRule;
}

export async function recomputeScoring(token: string, seasonId?: string) {
  const params = new URLSearchParams();
  if (seasonId) params.set("seasonId", seasonId);

  const url = params.toString() ? `${API_BASE}/scoring/recompute?${params.toString()}` : `${API_BASE}/scoring/recompute`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(await res.text().catch(() => "Failed"));
  return res.json() as Promise<{
    ok: boolean;
    seasonId: string | null;
    confirmedMatchesWithScore: number;
    picksProcessed: number;
    rulesLoaded: string[];
    note?: string;
  }>;
}


// ---------------------------
// ADMIN Catalog CRUD
// ---------------------------

export type CatalogNames = { es?: string; en?: string };

async function apiJson<T>(res: Response, fallbackMsg: string): Promise<T> {
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `${fallbackMsg} (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function adminCreateSport(token: string, names: CatalogNames) {
  const res = await fetch(`${API_BASE}/catalog/sports`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ names }),
  });

  return apiJson(res, "Error creando deporte");
}

export async function adminUpdateSport(token: string, id: string, names: CatalogNames) {
  const res = await fetch(`${API_BASE}/catalog/sports/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ names }),
  });

  return apiJson(res, "Error actualizando deporte");
}

export async function adminDeleteSport(token: string, id: string) {
  const res = await fetch(`${API_BASE}/catalog/sports/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  return apiJson(res, "Error borrando deporte");
}

export async function adminCreateCompetition(token: string, sportId: string, names: CatalogNames) {
  const res = await fetch(`${API_BASE}/catalog/competitions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sportId, names }),
  });

  return apiJson(res, "Error creando competición");
}

export async function adminUpdateCompetition(token: string, id: string, names: CatalogNames) {
  const res = await fetch(`${API_BASE}/catalog/competitions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ names }),
  });

  return apiJson(res, "Error actualizando competición");
}

export async function adminDeleteCompetition(token: string, id: string) {
  const res = await fetch(`${API_BASE}/catalog/competitions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  return apiJson(res, "Error borrando competición");
}

export async function adminCreateSeason(
  token: string,
  competitionId: string,
  names: CatalogNames,
  dates?: { startDate?: string | null; endDate?: string | null },
  defaultScoringRuleId?: string
) {
  const res = await fetch(`${API_BASE}/catalog/seasons`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ competitionId, names, defaultScoringRuleId, ...dates }),
  });

  return apiJson(res, "Error creando evento");
}

export async function adminUpdateSeason(
  token: string,
  id: string,
  names: CatalogNames,
  dates?: { startDate?: string | null; endDate?: string | null },
  defaultScoringRuleId?: string
) {

  const res = await fetch(`${API_BASE}/catalog/seasons/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ names, defaultScoringRuleId, ...dates }),
  });

  return apiJson(res, "Error actualizando evento");
}

export async function adminDeleteSeason(token: string, id: string) {
  const res = await fetch(`${API_BASE}/catalog/seasons/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  return apiJson(res, "Error borrando evento");
}
