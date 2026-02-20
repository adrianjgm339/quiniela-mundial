'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getLeagueLeaderboard,
  getWorldLeaderboard,
  getCountryLeaderboard,
  getMyLeagues,
  getCatalog,
  type ApiLeague,
  type LeaderboardRow,
  type CatalogSport,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';

type Tab = 'LEAGUE' | 'WORLD' | 'COUNTRY';

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
      <div className="px-4 py-3 border-b border-[var(--border)] font-medium">{title}</div>
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
                  className={`border-b border-[var(--border)] ${isMe ? 'font-medium' : ''}`}
                  style={
                    isMe
                      ? {
                        background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                        boxShadow: 'inset 3px 0 0 0 var(--primary)',
                      }
                      : undefined
                  }
                >
                  <td className="px-4 py-2">{r.rank}</td>
                  <td className="px-4 py-2">{r.displayName ?? r.userId.slice(0, 8)}</td>
                  <td className="px-4 py-2 text-right font-semibold">{r.points}</td>
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
    return leagues.filter((l: any) => l?.seasonId === seasonId);
  }, [leagues, seasonId]);

  // Helper: inferir sportId/competitionId buscando el seasonId dentro del catálogo
  function inferSportCompetitionFromSeason(seasonIdToFind: string): { sportId: string; competitionId: string } {
    for (const s of catalog) {
      for (const c of s.competitions ?? []) {
        const found = (c.seasons ?? []).some((se: any) => se.id === seasonIdToFind);
        if (found) return { sportId: s.id, competitionId: c.id };
      }
    }
    return { sportId: '', competitionId: '' };
  }

  const title = useMemo(() => {
    if (tab === 'LEAGUE') return `${leagueTitle} · Ranking`;
    if (tab === 'WORLD') return 'Mundial · Ranking';
    return `${countryCode.toUpperCase()} · Ranking`;
  }, [tab, leagueTitle, countryCode]);

  // Cargar countryCode + catálogo + mis ligas y decidir defaults coherentes con filtros
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push(`/${locale}/login`);
      return;
    }

    const cc = localStorage.getItem('countryCode') || '';
    setCountryCode(cc);

    (async () => {
      try {
        // 1) Catálogo para Sport/Competition/Season
        const cat = await getCatalog(locale);
        setCatalog(cat);

        // 2) Cargar ligas
        const myLeagues = await getMyLeagues(token);
        setLeagues(myLeagues);

        // 3) Default Season: prioridad a activeSeasonId (igual que otras pantallas)
        const storedSeasonId = localStorage.getItem('activeSeasonId') || '';
        let nextSeasonId = storedSeasonId;

        // Si no hay activeSeasonId pero hay activeLeagueId, inferimos season desde la liga
        const storedActiveLeagueId = localStorage.getItem('activeLeagueId') || '';
        const activeLeague = storedActiveLeagueId ? myLeagues.find((l) => l.id === storedActiveLeagueId) : null;
        if (!nextSeasonId && activeLeague?.seasonId) nextSeasonId = activeLeague.seasonId;

        // Si hay season, inferir sport/competition
        if (nextSeasonId) {
          const inferred = (() => {
            for (const s of cat) {
              for (const c of s.competitions ?? []) {
                const found = (c.seasons ?? []).some((se: any) => se.id === nextSeasonId);
                if (found) return { sportId: s.id, competitionId: c.id };
              }
            }
            return { sportId: '', competitionId: '' };
          })();

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

        // 4) Default League: solo si pertenece al evento seleccionado
        let defaultLeagueId = '';
        if (nextSeasonId && storedActiveLeagueId) {
          const ok = myLeagues.some((l) => l.id === storedActiveLeagueId && (l as any)?.seasonId === nextSeasonId);
          if (ok) defaultLeagueId = storedActiveLeagueId;
        }

        // si no hay activeLeagueId válido, NO autoseleccionamos (dejamos "Selecciona liga…")
        setSelectedLeagueId(defaultLeagueId);

        // Si activeLeagueId no pertenece al evento, lo limpiamos para evitar incoherencia
        if (storedActiveLeagueId && nextSeasonId) {
          const ok = myLeagues.some((l) => l.id === storedActiveLeagueId && (l as any)?.seasonId === nextSeasonId);
          if (!ok) localStorage.removeItem('activeLeagueId');
        }
      } catch (e) {
        console.error('Error loading rankings prerequisites', e);
      }
    })();
  }, [locale, router]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push(`/${locale}/login`);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
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

          const data = await getLeagueLeaderboard(token, selectedLeagueId, 50);
          setRows(data.top);
          setMe(data.me);
          setLeagueTitle(`${data.league.name} (${data.league.joinCode})`);
          setRuleInfo(`Regla usada: ${data.ruleIdUsed}`);
        } else if (tab === 'WORLD') {
          if (!seasonId) {
            setRows([]);
            setMe(null);
            setLeagueTitle('Liga');
            setRuleInfo('Selecciona un evento para ver el ranking mundial.');
            return;
          }

          const data = await getWorldLeaderboard(token, 50, seasonId);
          setRows(data.top);
          setMe(data.me);
          setLeagueTitle('Liga');
          setRuleInfo(`Regla: ${data.ruleIdUsed} · Modo: ${data.bestMode}`);
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

          const data = await getCountryLeaderboard(token, countryCode.toUpperCase(), 50, seasonId);

          setRows(data.top);
          setMe(data.me);
          setLeagueTitle('Liga');
          setRuleInfo(`Regla: ${data.ruleIdUsed} · Modo: ${data.bestMode}`);
        }
      } catch (e: any) {
        setError(e?.message ?? 'Error cargando ranking');
      } finally {
        setLoading(false);
      }
    })();
  }, [tab, countryCode, selectedLeagueId, seasonId, leagues.length, locale, router]);

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
          <Button
            size="sm"
            variant={tab === 'LEAGUE' ? 'primary' : 'outline'}
            onClick={() => setTab('LEAGUE')}
          >
            Liga
          </Button>

          <Button
            size="sm"
            variant={tab === 'WORLD' ? 'primary' : 'outline'}
            onClick={() => setTab('WORLD')}
          >
            Mundial
          </Button>

          <Button
            size="sm"
            variant={tab === 'COUNTRY' ? 'primary' : 'outline'}
            onClick={() => setTab('COUNTRY')}
          >
            País
          </Button>

          {countryCode ? (
            <Badge>{countryCode.toUpperCase()}</Badge>
          ) : (
            <Badge className="border border-[var(--border)] bg-[var(--card)] text-[color:var(--muted)]">--</Badge>
          )}
        </div>

        {/* Filtros en cascada: Sport → Competition → Season (Evento). 
            En tab LEAGUE además mostramos Liga. */}
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

        {loading && (
          <Card className="p-4 text-[color:var(--muted)]">Cargando…</Card>
        )}

        {error && (
          <Card className="p-4 border border-red-500/30">
            <div className="font-semibold">Error</div>
            <div className="mt-1 text-[color:var(--muted)]">{error}</div>
          </Card>
        )}

        {!loading && !error && <RowTable title={title} rows={rows} me={me} />}
      </div>
    </div>
  );
}