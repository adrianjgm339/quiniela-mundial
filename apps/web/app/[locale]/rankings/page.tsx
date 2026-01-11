'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getLeagueLeaderboard,
  getWorldLeaderboard,
  getCountryLeaderboard,
  getMyLeagues,
  type ApiLeague,
  type LeaderboardRow,
} from '@/lib/api';

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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 font-medium">{title}</div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-zinc-400">
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-2 w-16">#</th>
              <th className="text-left px-4 py-2">Jugador</th>
              <th className="text-right px-4 py-2 w-28">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className="border-b border-zinc-800/70">
                <td className="px-4 py-2">{r.rank}</td>
                <td className="px-4 py-2">{r.displayName ?? r.userId.slice(0, 8)}</td>
                <td className="px-4 py-2 text-right font-semibold">{r.points}</td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-3 text-zinc-400">
                  Sin datos aún. (Asegúrate de tener partidos confirmados y correr /scoring/recompute)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 bg-zinc-950/40 border-t border-zinc-800">
        <div className="text-xs text-zinc-400">Tu posición</div>
        {me ? (
          <div className="mt-1 flex items-center justify-between">
            <div className="font-medium">
              #{me.rank} · {me.displayName ?? me.userId.slice(0, 8)}
            </div>
            <div className="font-semibold">{me.points} pts</div>
          </div>
        ) : (
          <div className="mt-1 text-zinc-400 text-sm">
            Aún no apareces (probablemente no tienes picks para partidos confirmados con puntaje).
          </div>
        )}
      </div>
    </div>
  );
}

export default function RankingsPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [tab, setTab] = useState<Tab>('LEAGUE');
  const [countryCode, setCountryCode] = useState<string>('');

  const [leagues, setLeagues] = useState<ApiLeague[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [leagueTitle, setLeagueTitle] = useState<string>('Liga');
  const [ruleInfo, setRuleInfo] = useState<string>('');

  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [me, setMe] = useState<LeaderboardRow | null>(null);

  const title = useMemo(() => {
    if (tab === 'LEAGUE') return `${leagueTitle} · Ranking`;
    if (tab === 'WORLD') return 'Mundial · Ranking';
    return `${countryCode.toUpperCase()} · Ranking`;
  }, [tab, leagueTitle, countryCode]);

  // 1.4 B) Cargar countryCode + mis ligas y decidir liga por defecto
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
        const myLeagues = await getMyLeagues(token);
        setLeagues(myLeagues);

        const storedActiveLeagueId = localStorage.getItem('activeLeagueId') || '';
        const storedIsValid =
          !!storedActiveLeagueId && myLeagues.some((l) => l.id === storedActiveLeagueId);

        let defaultId = '';
        if (storedIsValid) defaultId = storedActiveLeagueId;
        else if (myLeagues.length === 1) defaultId = myLeagues[0].id;

        setSelectedLeagueId(defaultId);

        // Sync recomendado: si autoseleccionamos por única liga, fijamos activeLeagueId global
        if (!storedIsValid && defaultId) {
          localStorage.setItem('activeLeagueId', defaultId);
        }
      } catch (e) {
        console.error('Error loading leagues', e);
        // No rompemos la pantalla por esto.
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
        const data = await getWorldLeaderboard(token, 50);
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

        const data = await getCountryLeaderboard(token, countryCode.toUpperCase(), 50);
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
}, [tab, countryCode, selectedLeagueId, leagues.length, locale, router]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Rankings</h1>
            <div className="text-sm text-zinc-400">{ruleInfo}</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(`/${locale}/dashboard`)}
              className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
            >
              Volver
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTab('LEAGUE')}
            className={`px-3 py-2 rounded-lg text-sm ${
              tab === 'LEAGUE' ? 'bg-emerald-600' : 'bg-zinc-800 hover:bg-zinc-700'
            }`}
          >
            Liga
          </button>
          <button
            onClick={() => setTab('WORLD')}
            className={`px-3 py-2 rounded-lg text-sm ${
              tab === 'WORLD' ? 'bg-emerald-600' : 'bg-zinc-800 hover:bg-zinc-700'
            }`}
          >
            Mundial
          </button>
          <button
            onClick={() => setTab('COUNTRY')}
            className={`px-3 py-2 rounded-lg text-sm ${
              tab === 'COUNTRY' ? 'bg-emerald-600' : 'bg-zinc-800 hover:bg-zinc-700'
            }`}
          >
            País
          </button>

          {countryCode ? (
            <span className="ml-1 px-2 py-2 rounded-lg text-sm bg-zinc-800 border border-zinc-700 text-zinc-200">
              {countryCode.toUpperCase()}
            </span>
          ) : (
            <span className="ml-1 px-2 py-2 rounded-lg text-sm bg-zinc-900 border border-zinc-800 text-zinc-500">
              --
            </span>
          )}
        </div>

        {tab === 'LEAGUE' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-zinc-400">Liga:</div>

            <select
              className="px-3 py-2 rounded-lg text-sm bg-zinc-900 border border-zinc-800"
              value={selectedLeagueId}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedLeagueId(v);

                // Sync recomendado para coherencia con /matches
                if (v) localStorage.setItem('activeLeagueId', v);
              }}
            >
              <option value="">
                {leagues.length > 0 ? 'Selecciona liga…' : 'Cargando ligas…'}
              </option>

              {leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.joinCode})
                </option>
              ))}
            </select>

            {leagues.length === 0 ? (
              <button
                onClick={() => router.push(`/${locale}/leagues`)}
                className="px-3 py-2 rounded-lg text-sm bg-zinc-800 hover:bg-zinc-700"
              >
                Ir a Ligas
              </button>
            ) : null}
          </div>
        )}

        {loading && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-zinc-300">
            Cargando…
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-4 text-red-200">
            {error}
          </div>
        )}

        {!loading && !error && <RowTable title={title} rows={rows} me={me} />}
      </div>
    </div>
  );
}