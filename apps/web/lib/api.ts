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
  const res = await fetch(`${API_BASE}/auth/me?locale=${encodeURIComponent(locale)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
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
  resultConfirmed: boolean;
};

export async function getMatches(
  token: string,
  locale: string,
  filters?: { phaseCode?: string; groupCode?: string }
) {
  const params = new URLSearchParams();
  params.set("locale", locale);

  if (filters?.phaseCode) params.set("phaseCode", filters.phaseCode);
  if (filters?.groupCode) params.set("groupCode", filters.groupCode);

  const res = await fetch(`${API_BASE}/matches?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) throw new Error("Error fetching matches");
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
  input: { leagueId: string; matchId: string; homePred: number; awayPred: number },
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
  updatedAt: string;
};

export type ApiLeague = {
  id: string;
  name: string;
  joinCode: string;
  seasonId: string;
  createdAt: string;
  createdById: string;
};

export async function getMyLeagues(token: string) {
  const res = await fetch(`${API_BASE}/leagues/mine`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load leagues');
  return (await res.json()) as ApiLeague[];
}

export async function createLeague(token: string, input: { seasonId: string; name: string }) {
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

export async function getWorldLeaderboard(token: string, limit = 50) {
  const res = await fetch(`${API_BASE}/leaderboards/world?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Failed'));
  return (await res.json()) as WorldLeaderboardResponse;
}

export async function getCountryLeaderboard(token: string, countryCode: string, limit = 50) {
  const res = await fetch(
    `${API_BASE}/leaderboards/country/${encodeURIComponent(countryCode)}?limit=${limit}`,
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

export type ApiScoringRule = {
  id: string; // "B01", "R01", etc.
  name: string;
  description: string | null;
  isGlobal: boolean;
  details: ApiScoringRuleDetail[];
};

export async function listScoringRules(token: string) {
  const res = await fetch(`${API_BASE}/scoring/rules`, {
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
