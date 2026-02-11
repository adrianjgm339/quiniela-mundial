'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createLeague, getMyLeagues, joinLeagueByCode, type ApiLeague } from '@/lib/api';
import AiChatWidget from '../../components/AiChatWidget';

export default function LeaguesPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [token, setToken] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<ApiLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push(`/${locale}/login`);
      return;
    }
    setToken(t);

    const lsSeason = localStorage.getItem('activeSeasonId');
    if (lsSeason) setActiveSeasonId(lsSeason);
  }, [locale, router]);

  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getMyLeagues(token);
        setLeagues(data);
      } catch (e: any) {
        setError(e?.message ?? 'Error cargando ligas');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  function selectLeague(l: ApiLeague) {
    localStorage.setItem('activeLeagueId', l.id);
    localStorage.setItem('activeLeagueName', l.name);
    router.push(`/${locale}/matches`);
  }

  async function onCreate() {
    if (!token) return;
    if (!activeSeasonId) {
      setError('No hay un evento activo (Season). Selecciona un evento primero.');
      return;
    }

    const name = newName.trim();
    if (!name) {
      setError('Escribe un nombre de liga.');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const league = await createLeague(token, { seasonId: activeSeasonId, name });
      setLeagues((prev) => [league, ...prev]);
      setNewName('');

      localStorage.setItem('activeLeagueId', league.id);
      localStorage.setItem('activeLeagueName', league.name);
      router.push(`/${locale}/matches`);
    } catch (e: any) {
      setError(e?.message ?? 'Error creando liga');
    } finally {
      setCreating(false);
    }
  }

  async function onJoin() {
    if (!token) return;

    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setError('Escribe el código para unirte.');
      return;
    }

    setJoining(true);
    setError(null);

    try {
      const res = await joinLeagueByCode(token, { joinCode: code });

      const data = await getMyLeagues(token);
      setLeagues(data);

      const joined = data.find((x) => x.id === res.leagueId);
      if (joined) {
        localStorage.setItem('activeLeagueId', joined.id);
        localStorage.setItem('activeLeagueName', joined.name);
      } else {
        localStorage.setItem('activeLeagueId', res.leagueId);
      }

      router.push(`/${locale}/matches`);
    } catch (e: any) {
      setError(e?.message ?? 'Error uniéndose a la liga');
    } finally {
      setJoining(false);
    }
  }

  const aiContext = useMemo(() => {
    return {
      page: 'leagues',
      locale,
      activeSeasonId,
      leaguesCount: leagues.length,
      nowUtc: new Date().toISOString(),
    };
  }, [locale, activeSeasonId, leagues.length]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Ligas</h1>
          <button
            onClick={() => router.push(`/${locale}/dashboard`)}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
          >
            Volver
          </button>
        </div>

        {activeSeasonId ? (
          <div className="text-sm text-zinc-400">
            Evento activo (SeasonId): <span className="text-zinc-200">{activeSeasonId}</span>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-900/60 bg-amber-950/30 p-4 text-amber-200">
            No hay evento activo (Season) detectado. Ve a <b>Cambiar evento</b> en el dashboard.
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-4 text-red-200">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="font-medium">Crear liga</div>
          <div className="mt-3 flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ej: Liga de la Oficina"
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2"
            />
            <button
              onClick={onCreate}
              disabled={creating || !activeSeasonId}
              className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-medium disabled:opacity-50"
            >
              {creating ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="font-medium">Unirse por código</div>
          <div className="mt-3 flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Ej: A1B2C3"
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 uppercase"
            />
            <button
              onClick={onJoin}
              disabled={joining}
              className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 font-medium disabled:opacity-50"
            >
              {joining ? 'Uniéndome…' : 'Unirme'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 font-medium">Mis ligas</div>

          {loading ? (
            <div className="p-4 text-zinc-300">Cargando…</div>
          ) : leagues.length === 0 ? (
            <div className="p-4 text-zinc-400">
              No estás en ninguna liga todavía. Crea una o únete con código.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {leagues.map((l) => (
                <div key={l.id} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{l.name}</div>
                    <div className="text-sm text-zinc-400 truncate">
                      Código: <span className="text-zinc-200">{l.joinCode}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => selectLeague(l)}
                    className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium"
                  >
                    Entrar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AiChatWidget locale={locale} token={token} context={aiContext} />
    </div>
  );
}
