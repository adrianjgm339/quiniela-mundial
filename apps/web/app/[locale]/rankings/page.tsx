'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getLeagueLeaderboard,
  getWorldLeaderboard,
  getCountryLeaderboard,
  getMyLeagues,
  getCatalog,
  getScoringRule,
  getSeasonConcepts,
  type ApiLeague,
  type LeaderboardRow,
  type CatalogSport,
  type ApiScoringRule,
  type ApiSeasonConcept,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';

type Tab = 'LEAGUE' | 'WORLD' | 'COUNTRY';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getErrorMessage(raw: unknown): string {
  if (raw instanceof Error) return raw.message;
  if (isRecord(raw) && typeof raw.message === 'string') return raw.message;
  return String(raw ?? '');
}

type RankingCriteriaRow = {
  code: string;
  label: string;
  points: number;
};

function buildCriteriaRows(rule: ApiScoringRule, concepts: ApiSeasonConcept[]): RankingCriteriaRow[] {
  const labelByCode = new Map(
    (concepts ?? []).map((c) => [c.code, (c.label || '').trim() || c.code]),
  );

  return (rule.details ?? [])
    .filter((d) => Number(d.points || 0) > 0)
    .map((d) => ({
      code: d.code,
      label: labelByCode.get(d.code) || d.code,
      points: d.points,
    }));
}

function CriteriaCard({
  title,
  rows,
}: {
  title: string;
  rows: RankingCriteriaRow[];
}) {
  return (
    <Card className="lg:sticky lg:top-24 overflow-hidden self-start lg:max-w-[260px]">
      <div className="px-3 py-2.5 border-b border-[var(--border)] text-sm font-semibold">
        {title}
      </div>

      <div className="overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="text-[color:var(--muted)]">
            <tr className="border-b border-[var(--border)]">
              <th className="text-left px-3 py-2 font-semibold">Desglose por concepto</th>
              <th className="text-right px-3 py-2 w-16 font-semibold">Pts</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-b border-[var(--border)] last:border-b-0">
                <td className="px-3 py-1.5 align-top">
                  <div className="font-medium leading-snug">{r.label}</div>
                </td>
                <td className="px-3 py-1.5 text-right font-semibold align-top">{r.points}</td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={2} className="px-3 py-2.5 text-[13px] text-[color:var(--muted)]">
                  No hay conceptos con puntos configurados para este ranking.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RowTable({
  title,
  rows,
  me,
}: {
  title: string;
  rows: LeaderboardRow[];
  me: LeaderboardRow | null;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] text-base font-semibold">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[color:var(--muted)]">
            <tr className="border-b border-[var(--border)]">
              <th className="text-left px-4 py-2 w-16">#</th>
              <th className="text-left px-4 py-2">Jugador</th>
              <th className="text-right px-4 py-2 w-28">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isMe = !!me && r.userId === me.userId;

              return (
                <tr
                  key={r.userId}
                  className={`border-b border-[var(--border)] ${isMe ? 'font-semibold' : ''}`}
                >
                  <td
                    className="px-4 py-2"
                    style={
                      isMe
                        ? {
                          backgroundColor: 'var(--current-user-row-bg)',
                          borderTop: '1px solid var(--current-user-row-border)',
                          borderBottom: '1px solid var(--current-user-row-border)',
                          borderLeft: '4px solid var(--current-user-row-accent)',
                        }
                        : undefined
                    }
                  >
                    {r.rank}
                  </td>
                  <td
                    className="px-4 py-2"
                    style={
                      isMe
                        ? {
                          backgroundColor: 'var(--current-user-row-bg)',
                          borderTop: '1px solid var(--current-user-row-border)',
                          borderBottom: '1px solid var(--current-user-row-border)',
                        }
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span>{r.displayName ?? r.userId.slice(0, 8)}</span>
                      {isMe ? <Badge className="text-[11px] px-1.5 py-0">Tú</Badge> : null}
                    </div>
                  </td>
                  <td
                    className="px-4 py-2 text-right font-semibold"
                    style={
                      isMe
                        ? {
                          backgroundColor: 'var(--current-user-row-bg)',
                          borderTop: '1px solid var(--current-user-row-border)',
                          borderBottom: '1px solid var(--current-user-row-border)',
                          borderRight: '1px solid var(--current-user-row-border)',
                        }
                        : undefined
                    }
                  >
                    {r.points}
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-3 text-[color:var(--muted)]">
                  Sin datos aún. (Asegúrate de tener partidos confirmados y correr /scoring/recompute)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--card)]">
        <div className="text-xs text-[color:var(--muted)]">Tu posición</div>
        {me ? (
          <div className="mt-1 flex items-center justify-between">
            <div className="font-medium">
              #{me.rank} · {me.displayName ?? me.userId.slice(0, 8)}
            </div>
            <div className="font-semibold">{me.points} pts</div>
          </div>
        ) : (
          <div className="mt-1 text-[color:var(--muted)] text-sm">
            Aún no apareces (probablemente no tienes picks para partidos confirmados con puntaje).
          </div>
        )}
      </div>
    </Card>
  );
}

export default function RankingsPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const searchParams = useSearchParams();

  const qsScope = (searchParams.get('scope') || '').toLowerCase(); // 'league' | 'world' | 'country'
  const qsLeagueId = searchParams.get('leagueId') || '';
  const qsSeasonId = searchParams.get('seasonId') || '';

  const isSameQuery = useCallback(
    (next: { scope?: string; leagueId?: string; seasonId?: string }) => {
      const scope = (next.scope || '').toLowerCase();
      const leagueId = next.leagueId || '';
      const seasonId = next.seasonId || '';

      return (qsScope || '') === scope && (qsLeagueId || '') === leagueId && (qsSeasonId || '') === seasonId;
    },
    [qsLeagueId, qsScope, qsSeasonId],
  );

  const pushRankingsQuery = useCallback(
    (next: { scope?: string; leagueId?: string; seasonId?: string }) => {
      if (isSameQuery(next)) return;

      const params = new URLSearchParams();
      if (next.scope) params.set('scope', next.scope);
      if (next.leagueId) params.set('leagueId', next.leagueId);
      if (next.seasonId) params.set('seasonId', next.seasonId);

      const qs = params.toString();
      router.replace(`/${locale}/rankings${qs ? `?${qs}` : ''}`);
    },
    [isSameQuery, locale, router],
  );

  const [tab, setTab] = useState<Tab>('LEAGUE');
  const [countryCode, setCountryCode] = useState<string>('');

  const [leagues, setLeagues] = useState<ApiLeague[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>('');

  // Filtros consistentes con /leagues y /matches: Sport → Competition → Season (Evento)
  const [catalog, setCatalog] = useState<CatalogSport[]>([]);
  const [sportId, setSportId] = useState<string>('');
  const [competitionId, setCompetitionId] = useState<string>('');
  const [seasonId, setSeasonId] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [leagueTitle, setLeagueTitle] = useState<string>('Liga');
  const [ruleInfo, setRuleInfo] = useState<string>('');

  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [me, setMe] = useState<LeaderboardRow | null>(null);
  const [criteriaTitle, setCriteriaTitle] = useState<string>('');
  const [criteriaRows, setCriteriaRows] = useState<RankingCriteriaRow[]>([]);

  const sportOptions = useMemo(() => catalog ?? [], [catalog]);

  const competitionOptions = useMemo(() => {
    const s = sportOptions.find((x) => x.id === sportId);
    return s?.competitions ?? [];
  }, [sportOptions, sportId]);

  const seasonOptions = useMemo(() => {
    const c = competitionOptions.find((x) => x.id === competitionId);
    return c?.seasons ?? [];
  }, [competitionOptions, competitionId]);

  // Mostrar solo ligas del evento seleccionado
  const leaguesByEvent = useMemo(() => {
    if (!seasonId) return [];
    return leagues.filter((l) => (l as unknown as { seasonId?: string | null }).seasonId === seasonId);
  }, [leagues, seasonId]);

  const title = useMemo(() => {
    if (tab === 'LEAGUE') return `${leagueTitle} · Ranking (Top 100)`;
    if (tab === 'WORLD') return 'Mundial · Ranking (Top 100)';
    return `${countryCode.toUpperCase()} · Ranking (Top 100)`;
  }, [tab, leagueTitle, countryCode]);

  const loadCriteria = useCallback(
    async (token: string, ruleId: string, currentSeasonId: string, nextTitle: string) => {
      const [rule, concepts] = await Promise.all([
        getScoringRule(token, ruleId),
        currentSeasonId ? getSeasonConcepts(token, currentSeasonId) : Promise.resolve([] as ApiSeasonConcept[]),
      ]);

      setCriteriaTitle(nextTitle);
      setCriteriaRows(buildCriteriaRows(rule, concepts));
    },
    [],
  );

  // Cargar countryCode + catálogo + mis ligas y decidir defaults coherentes con filtros
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push(`/${locale}/login`);
      return;
    }

    const cc = localStorage.getItem('countryCode') || '';
    setCountryCode(cc);

    void (async () => {
      try {
        // 1) Catálogo para Sport/Competition/Season
        const cat = await getCatalog(locale);
        setCatalog(cat);

        // 2) Cargar ligas
        const myLeagues = await getMyLeagues(token);
        setLeagues(myLeagues);

        // 3) Default Tab/Scope desde querystring (Dashboard → Rankings)
        if (qsScope === 'world') setTab('WORLD');
        if (qsScope === 'league') setTab('LEAGUE');
        if (qsScope === 'country') setTab('COUNTRY');

        // 4) Default Season: prioridad a seasonId del querystring, luego activeSeasonId
        const storedSeasonId = localStorage.getItem('activeSeasonId') || '';
        let nextSeasonId = qsSeasonId || storedSeasonId;

        // Si no hay activeSeasonId pero hay activeLeagueId, inferimos season desde la liga
        const storedActiveLeagueId = localStorage.getItem('activeLeagueId') || '';
        const preferredLeagueId = qsLeagueId || storedActiveLeagueId;

        const activeLeague = preferredLeagueId ? myLeagues.find((l) => l.id === preferredLeagueId) : null;
        const activeLeagueSeasonId = (activeLeague as unknown as { seasonId?: string | null })?.seasonId ?? '';
        if (!nextSeasonId && activeLeagueSeasonId) nextSeasonId = activeLeagueSeasonId;

        // Si hay season, inferir sport/competition
        if (nextSeasonId) {
          let inferred = { sportId: '', competitionId: '' };

          for (const s of cat) {
            for (const c of s.competitions ?? []) {
              const found = (c.seasons ?? []).some((se) => se.id === nextSeasonId);
              if (found) {
                inferred = { sportId: s.id, competitionId: c.id };
                break;
              }
            }
            if (inferred.sportId) break;
          }

          setSportId(inferred.sportId);
          setCompetitionId(inferred.competitionId);
          setSeasonId(nextSeasonId);

          // Sync: mantener activeSeasonId para coherencia global
          localStorage.setItem('activeSeasonId', nextSeasonId);
        } else {
          setSportId('');
          setCompetitionId('');
          setSeasonId('');
        }

        // 5) Default League: prioridad a leagueId del querystring, luego activeLeagueId (solo si pertenece al evento)
        let defaultLeagueId = '';
        if (nextSeasonId && preferredLeagueId) {
          const ok = myLeagues.some(
            (l) => l.id === preferredLeagueId && (l as unknown as { seasonId?: string | null })?.seasonId === nextSeasonId,
          );
          if (ok) defaultLeagueId = preferredLeagueId;
        }

        // si no hay activeLeagueId válido, NO autoseleccionamos (dejamos "Selecciona liga…")
        setSelectedLeagueId(defaultLeagueId);

        // Sync localStorage para coherencia global si vino desde Dashboard
        if (defaultLeagueId) localStorage.setItem('activeLeagueId', defaultLeagueId);

        // Si activeLeagueId no pertenece al evento, lo limpiamos para evitar incoherencia
        if (preferredLeagueId && nextSeasonId) {
          const ok = myLeagues.some(
            (l) => l.id === preferredLeagueId && (l as unknown as { seasonId?: string | null })?.seasonId === nextSeasonId,
          );
          if (!ok) localStorage.removeItem('activeLeagueId');
        }
      } catch (e: unknown) {
        // no bloqueante: pantalla aún puede funcionar parcialmente
        console.error('Error loading rankings prerequisites', e);
      }
    })();
  }, [locale, router, qsScope, qsLeagueId, qsSeasonId]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push(`/${locale}/login`);
      return;
    }

    setLoading(true);
    setError(null);
    setCriteriaTitle('');
    setCriteriaRows([]);

    void (async () => {
      try {
        // URL shareable: reflejar selección actual
        if (tab === 'LEAGUE') {
          pushRankingsQuery({ scope: 'league', leagueId: selectedLeagueId || '' });
        } else if (tab === 'WORLD') {
          pushRankingsQuery({ scope: 'world', seasonId: seasonId || '' });
        } else {
          pushRankingsQuery({ scope: 'country', seasonId: seasonId || '' });
        }

        if (tab === 'LEAGUE') {
          // ✅ NO redirigir. Si no hay liga seleccionada, solo muestra mensaje.
          if (!selectedLeagueId) {
            setRows([]);
            setMe(null);

            if (leagues.length === 0) {
              setLeagueTitle('Liga');
              setRuleInfo('No estás en ninguna liga todavía. Ve a “Ligas” para crear o unirte.');
            } else {
              setLeagueTitle('Liga');
              setRuleInfo('Selecciona una liga para ver el ranking.');
            }

            return;
          }

          const data = await getLeagueLeaderboard(token, selectedLeagueId, 100);
          setRows(data.top);
          setMe(data.me);
          setLeagueTitle(`${data.league.name} (${data.league.joinCode})`);
          setRuleInfo(`Regla usada: ${data.ruleIdUsed}`);

          await loadCriteria(
            token,
            data.ruleIdUsed,
            seasonId,
            'Criterios para sumar puntos en la liga seleccionada',
          );
        } else if (tab === 'WORLD') {
          if (!seasonId) {
            setRows([]);
            setMe(null);
            setLeagueTitle('Liga');
            setRuleInfo('Selecciona un evento para ver el ranking mundial.');
            return;
          }

          const data = await getWorldLeaderboard(token, 100, seasonId);
          setRows(data.top);
          setMe(data.me);
          setLeagueTitle('Liga');
          setRuleInfo(`Regla: ${data.ruleIdUsed} · Modo: ${data.bestMode}`);

          await loadCriteria(
            token,
            data.ruleIdUsed,
            seasonId,
            'Criterios para sumar puntos en el ranking mundial',
          );
        } else {
          // COUNTRY
          if (!countryCode) {
            setRows([]);
            setMe(null);
            setLeagueTitle('Liga');
            setRuleInfo('No tienes countryCode aún. Entra al Dashboard para que se guarde en el navegador.');
            return;
          }

          if (!seasonId) {
            setRows([]);
            setMe(null);
            setLeagueTitle('Liga');
            setRuleInfo('Selecciona un evento para ver el ranking por país.');
            return;
          }

          const data = await getCountryLeaderboard(token, countryCode.toUpperCase(), 100, seasonId);

          setRows(data.top);
          setMe(data.me);
          setLeagueTitle('Liga');
          setRuleInfo(`Regla: ${data.ruleIdUsed} · Modo: ${data.bestMode}`);

          await loadCriteria(
            token,
            data.ruleIdUsed,
            seasonId,
            'Criterios para sumar puntos en el ranking por país',
          );
        }
      } catch (e: unknown) {
        setError(getErrorMessage(e) || 'Error cargando ranking');
      } finally {
        setLoading(false);
      }
    })();
  }, [tab, countryCode, selectedLeagueId, seasonId, leagues.length, locale, router, pushRankingsQuery, loadCriteria]);

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <PageHeader
          title="Rankings"
          subtitle={<span className="text-[color:var(--muted)]">{ruleInfo}</span>}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => router.push(`/${locale}/dashboard`)}>
                Volver
              </Button>
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={tab === 'LEAGUE' ? 'primary' : 'outline'} onClick={() => setTab('LEAGUE')}>
            Liga
          </Button>

          <Button size="sm" variant={tab === 'WORLD' ? 'primary' : 'outline'} onClick={() => setTab('WORLD')}>
            Mundial
          </Button>

          <Button size="sm" variant={tab === 'COUNTRY' ? 'primary' : 'outline'} onClick={() => setTab('COUNTRY')}>
            País
          </Button>

          {countryCode ? (
            <Badge>{countryCode.toUpperCase()}</Badge>
          ) : (
            <Badge className="border border-[var(--border)] bg-[var(--card)] text-[color:var(--muted)]">--</Badge>
          )}
        </div>

        {/* Filtros en cascada: Sport → Competition → Season (Evento). En tab LEAGUE además mostramos Liga. */}
        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            {/* Deporte */}
            <div>
              <div className="text-sm text-[color:var(--muted)] mb-1">Deporte</div>
              <select
                className="w-full px-3 py-2 rounded-lg text-sm border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] disabled:opacity-50 disabled:bg-[var(--background)] disabled:text-[color:var(--muted)]"
                value={sportId}
                onChange={(e) => {
                  const v = e.target.value;
                  setSportId(v);
                  setCompetitionId('');
                  setSeasonId('');
                  setSelectedLeagueId('');
                  localStorage.removeItem('activeLeagueId');
                  localStorage.removeItem('activeSeasonId');
                }}
              >
                <option value="">Seleccionar…</option>
                {sportOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Competición */}
            <div>
              <div className="text-sm text-[color:var(--muted)] mb-1">Competición</div>
              <select
                className="w-full px-3 py-2 rounded-lg text-sm border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] disabled:opacity-50 disabled:bg-[var(--background)] disabled:text-[color:var(--muted)]"
                value={competitionId}
                disabled={!sportId}
                onChange={(e) => {
                  const v = e.target.value;
                  setCompetitionId(v);
                  setSeasonId('');
                  setSelectedLeagueId('');
                  localStorage.removeItem('activeLeagueId');
                  localStorage.removeItem('activeSeasonId');
                }}
              >
                <option value="">{sportId ? 'Seleccionar…' : 'Seleccionar deporte…'}</option>
                {competitionOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Evento */}
            <div>
              <div className="text-sm text-[color:var(--muted)] mb-1">Evento</div>
              <select
                className="w-full px-3 py-2 rounded-lg text-sm border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] disabled:opacity-50 disabled:bg-[var(--background)] disabled:text-[color:var(--muted)]"
                value={seasonId}
                disabled={!competitionId}
                onChange={(e) => {
                  const v = e.target.value;
                  setSeasonId(v);
                  setSelectedLeagueId('');
                  localStorage.removeItem('activeLeagueId');

                  if (v) localStorage.setItem('activeSeasonId', v);
                  else localStorage.removeItem('activeSeasonId');
                }}
              >
                <option value="">{competitionId ? 'Seleccionar…' : 'Seleccionar competición…'}</option>
                {seasonOptions.map((se) => (
                  <option key={se.id} value={se.id}>
                    {se.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Liga (solo en tab LEAGUE) */}
            {tab === 'LEAGUE' ? (
              <div>
                <div className="text-sm text-[color:var(--muted)] mb-1">Liga</div>
                <select
                  className="w-full px-3 py-2 rounded-lg text-sm border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] disabled:opacity-50 disabled:bg-[var(--background)] disabled:text-[color:var(--muted)]"
                  value={selectedLeagueId}
                  disabled={!seasonId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedLeagueId(v);
                    if (v) localStorage.setItem('activeLeagueId', v);
                  }}
                >
                  <option value="">
                    {!seasonId
                      ? 'Seleccionar evento…'
                      : leaguesByEvent.length > 0
                        ? 'Selecciona liga…'
                        : 'No hay ligas para este evento'}
                  </option>

                  {leaguesByEvent.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.joinCode})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div />
            )}
          </div>

          {/* Botón auxiliar (solo si no tiene ligas) */}
          {tab === 'LEAGUE' && leagues.length === 0 ? (
            <div className="mt-3">
              <Button variant="secondary" size="sm" onClick={() => router.push(`/${locale}/leagues`)}>
                Ir a Ligas
              </Button>
            </div>
          ) : null}
        </Card>

        {loading && <Card className="p-4 text-[color:var(--muted)]">Cargando…</Card>}

        {error && (
          <Card className="p-4 border border-red-500/30">
            <div className="font-semibold">Error</div>
            <div className="mt-1 text-[color:var(--muted)]">{error}</div>
          </Card>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-5 items-start">
            <RowTable title={title} rows={rows} me={me} />
            <CriteriaCard title={criteriaTitle || 'Criterios para sumar puntos'} rows={criteriaRows} />
          </div>
        )}
      </div>
    </div>
  );
}