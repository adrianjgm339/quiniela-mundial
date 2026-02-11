'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import AiChatWidget from '../../components/AiChatWidget';
import {
  getMatches,
  getMyLeagues,
  listPicks,
  upsertPick,
  type ApiMatch,
  type ApiPick,
  type ApiLeague,
} from '@/lib/api';

export default function MatchesPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [now, setNow] = useState(() => Date.now());

  const searchParams = useSearchParams();
  const phase = searchParams.get('phase') || '';
  const group = searchParams.get('group') || '';

  useEffect(() => {
    // Si ya viene phase/group en URL, no tocamos nada
    const hasPhaseInUrl = searchParams.has('phase');
    const hasGroupInUrl = searchParams.has('group');
    if (hasPhaseInUrl || hasGroupInUrl) return;

    const savedPhase = localStorage.getItem('matchesPhase') || '';
    const savedGroup = localStorage.getItem('matchesGroup') || '';

    const next = new URLSearchParams(searchParams.toString());
    if (savedPhase) next.set('phase', savedPhase);
    if (savedGroup) next.set('group', savedGroup);

    router.replace(`/${locale}/matches?${next.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const [items, setItems] = useState<ApiMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [picksByMatchId, setPicksByMatchId] = useState<Record<string, ApiPick>>({});

  const [token, setToken] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<ApiLeague[]>([]);
  const [loadingPicks, setLoadingPicks] = useState(false);

  // modal state
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ApiMatch | null>(null);
  const [homePred, setHomePred] = useState<number>(0);
  const [awayPred, setAwayPred] = useState<number>(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function isLocked(m: ApiMatch) {
    if (m.resultConfirmed) return true;
    const close = m.closeUtc ? new Date(m.closeUtc).getTime() : null;
    return close ? now >= close : false;
  }

  function fmtUtc(dt: string) {
    const d = new Date(dt);
    return d.toLocaleString(locale.startsWith('es') ? 'es-ES' : 'en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  function fmtClose(dt: string | null) {
    if (!dt) return '—';
    const d = new Date(dt);
    return d.toLocaleString(locale.startsWith('es') ? 'es-ES' : 'en-US', {
      timeZone: 'UTC',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  function minsLeft(dt: string | null) {
    if (!dt) return null;
    const ms = new Date(dt).getTime() - now;
    if (ms <= 0) return 0;
    return Math.floor(ms / 60_000);
  }

  // Cargar matches + ligas
  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push(`/${locale}/login`);
      return;
    }

    setToken(t);

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [data, myLeagues] = await Promise.all([
          getMatches(t, locale, {
            phaseCode: phase || undefined,
            groupCode: group || undefined,
          }),
          getMyLeagues(t),
        ]);

        setItems(data);
        setLeagues(myLeagues);

        // determinar liga activa válida
        let lid = localStorage.getItem('activeLeagueId');
        const exists = lid && myLeagues.some((l) => l.id === lid);

        if (!exists) {
          lid = myLeagues[0]?.id ?? null;
          if (!lid) {
            router.push(`/${locale}/leagues`);
            return;
          }
          localStorage.setItem('activeLeagueId', lid);
        }

        setLeagueId(lid);
      } catch (e: any) {
        setError(e?.message ?? 'Error cargando datos');
      } finally {
        setLoading(false);
      }
    })();
  }, [locale, phase, group, router]);

  // cargar picks cuando haya token + leagueId + matches
  useEffect(() => {
    if (!token || !leagueId || items.length === 0) return;

    (async () => {
      try {
        setLoadingPicks(true);
        const picks = await listPicks(token, leagueId);
        const map: Record<string, ApiPick> = {};
        for (const p of picks) map[p.matchId] = p;
        setPicksByMatchId(map);
      } catch {
        // silencioso
      } finally {
        setLoadingPicks(false);
      }
    })();
  }, [token, leagueId, items.length]);

  function openPickModal(m: ApiMatch) {
    setSelected(m);
    setOpen(true);
    setSaveError(null);

    const myPick = picksByMatchId[m.id];
    setHomePred(myPick?.homePred ?? 0);
    setAwayPred(myPick?.awayPred ?? 0);
  }

  async function onSave() {
    if (!token || !leagueId || !selected) return;

    const locked = isLocked(selected);
    if (locked) return;

    try {
      setSaving(true);
      setSaveError(null);

      const saved = await upsertPick(token, {
        leagueId,
        matchId: selected.id,
        homePred,
        awayPred,
      });

      setPicksByMatchId((prev) => ({ ...prev, [selected.id]: saved }));
      setOpen(false);
      setSelected(null);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Error guardando pick');
    } finally {
      setSaving(false);
    }
  }

  const activeLeague = leagueId ? leagues.find((l) => l.id === leagueId) : null;
  const activeLeagueLabel = activeLeague
    ? `${activeLeague.name} · Código: ${activeLeague.joinCode}`
    : '—';

  // ✅ ÚNICO aiContext (sin duplicados)
  const aiContext = useMemo(() => {
    const selectedPick = selected ? picksByMatchId[selected.id] : null;

    return {
      page: 'matches',
      locale,
      filters: { phase, group },
      leagueId,
      activeLeague: activeLeague
        ? { id: activeLeague.id, name: activeLeague.name, joinCode: activeLeague.joinCode }
        : null,
      selectedMatch: selected
        ? {
            id: selected.id,
            externalId: (selected as any).externalId ?? null,
            phaseCode: (selected as any).phaseCode ?? null,
            groupCode: (selected as any).groupCode ?? null,
            utcDateTime: (selected as any).utcDateTime ?? null,
            closeUtc: (selected as any).closeUtc ?? null,
            homeTeamName: (selected as any).homeTeamName ?? null,
            awayTeamName: (selected as any).awayTeamName ?? null,
          }
        : null,
      selectedPick: selectedPick
        ? { homePred: selectedPick.homePred, awayPred: selectedPick.awayPred, status: selectedPick.status }
        : null,
      nowUtc: new Date().toISOString(),
    };
  }, [activeLeague, group, leagueId, locale, phase, picksByMatchId, selected]);

  const groupOptions = useMemo(() => {
  const set = new Set<string>();
  for (const m of items) {
    const gc = ((m as any).groupCode ?? (m as any).group_code ?? '') as string;
    if (gc) set.add(gc);
  }
  return Array.from(set).sort();
}, [items]);


  const phaseOptions = useMemo(() => {
  const set = new Set<string>();
  for (const m of items) {
    const pc = ((m as any).phaseCode ?? (m as any).phase_code ?? '') as string;
    if (pc) set.add(pc);
  }
  return Array.from(set).sort();
}, [items]);


  function onChangePhase(v: string) {
    localStorage.setItem('matchesPhase', v);
    const next = new URLSearchParams(searchParams.toString());
    if (v) next.set('phase', v);
    else next.delete('phase');

    // si cambia phase, limpiamos group si no aplica
    if (!v) {
      localStorage.setItem('matchesGroup', '');
      next.delete('group');
    }

    router.replace(`/${locale}/matches?${next.toString()}`);
  }

  function onChangeGroup(v: string) {
    localStorage.setItem('matchesGroup', v);
    const next = new URLSearchParams(searchParams.toString());
    if (v) next.set('group', v);
    else next.delete('group');
    router.replace(`/${locale}/matches?${next.toString()}`);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Partidos</h1>
            <div className="text-sm text-zinc-400">{activeLeagueLabel}</div>
          </div>

          <button
            onClick={() => router.push(`/${locale}/leagues`)}
            className="rounded-lg bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
          >
            Cambiar liga
          </button>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs text-zinc-400 mb-1">Fase</div>
            <select
              value={phase}
              onChange={(e) => onChangePhase(e.target.value)}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm ring-1 ring-zinc-800"
            >
              <option value="">Todas</option>
              {phaseOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs text-zinc-400 mb-1">Grupo</div>
            <select
              value={group}
              onChange={(e) => onChangeGroup(e.target.value)}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm ring-1 ring-zinc-800"
            >
              <option value="">Todos</option>
              {groupOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {loadingPicks && <div className="text-xs text-zinc-400">Cargando picks…</div>}
        </div>

        {error && (
          <div className="rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-zinc-400">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-zinc-400">No hay partidos para estos filtros.</div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 divide-y divide-zinc-800">
            {items.map((m) => {
              const locked = isLocked(m);
              const left = minsLeft(m.closeUtc ?? null);
              const myPick = picksByMatchId[m.id] ?? null;
              const hasPick = !!myPick;

              return (
                <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {((m as any).homeTeamName ?? (m as any).homeTeam?.name ?? '—')} vs{' '}
                      {((m as any).awayTeamName ?? (m as any).awayTeam?.name ?? '—')}

                    </div>

                    <div className="text-xs text-zinc-400 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <span>UTC: {fmtUtc(m.utcDateTime)}</span>
                      <span>Cierra: {fmtClose(m.closeUtc ?? null)}</span>
                      {typeof left === 'number' && (
                        <span className={left === 0 ? 'text-red-300' : 'text-zinc-300'}>
                          {left === 0 ? 'Cerrado' : `${left} min`}
                        </span>
                      )}
                      <span className="text-zinc-500">·</span>
                      <span>
                        {((m as any).phaseCode ?? (m as any).phase ?? '')}
                        {((m as any).groupCode ?? (m as any).group ?? '') ? ` / ${((m as any).groupCode ?? (m as any).group ?? '')}` : ''}

                      </span>
                    </div>

                    {hasPick && (
                      <div className="mt-1 text-sm text-emerald-300">
                        Tu pick: {myPick.homePred} - {myPick.awayPred}
                        <span className="text-zinc-400"> · {myPick.status}</span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => openPickModal(m)}
                    className={
                      locked
                        ? 'rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300'
                        : 'rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-black hover:bg-emerald-500'
                    }
                  >
                    {locked ? 'Cerrado' : hasPick ? 'Editar' : 'Pronosticar'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {open && selected && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-[520px] max-w-[95vw] rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">
                  {((selected as any).homeTeamName ?? (selected as any).homeTeam?.name ?? '—')} vs{' '}
                  {((selected as any).awayTeamName ?? (selected as any).awayTeam?.name ?? '—')}

                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  Cierra: {fmtClose((selected as any).closeUtc ?? null)} UTC ·{' '}
                  {((selected as any).phaseCode ?? (selected as any).phase ?? '') as any}
                  {(((selected as any).groupCode ?? (selected as any).group ?? '') as string)
                    ? ` / ${((selected as any).groupCode ?? (selected as any).group ?? '') as string}`
                    : ''}

                </div>
              </div>

              <button
                onClick={() => {
                  setOpen(false);
                  setSelected(null);
                }}
                className="rounded-md bg-zinc-800 px-2 py-1 text-sm hover:bg-zinc-700"
              >
                X
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-zinc-400 mb-1">{((selected as any).homeTeamName ?? (selected as any).homeTeam?.name ?? '—') as any}
              </div>
                <input
                  type="number"
                  value={homePred}
                  onChange={(e) => setHomePred(Number(e.target.value))}
                  className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm ring-1 ring-zinc-800"
                />
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-1">{((selected as any).awayTeamName ?? (selected as any).awayTeam?.name ?? '—') as any}
                </div>
                <input
                  type="number"
                  value={awayPred}
                  onChange={(e) => setAwayPred(Number(e.target.value))}
                  className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm ring-1 ring-zinc-800"
                />
              </div>
            </div>

            {saveError && (
              <div className="mt-3 rounded-lg border border-red-900 bg-red-950/50 p-2 text-sm text-red-200">
                {saveError}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  setSelected(null);
                }}
                className="rounded-lg bg-zinc-800 px-3 py-2 hover:bg-zinc-700"
                disabled={saving}
              >
                Cancelar
              </button>

              {(() => {
                const selectedLocked = isLocked(selected);
                return (
                  <button
                    onClick={onSave}
                    className="rounded-lg bg-emerald-600 px-3 py-2 font-semibold text-black hover:bg-emerald-500 disabled:opacity-50"
                    disabled={saving || selectedLocked}
                  >
                    {selectedLocked ? 'Cerrado' : saving ? 'Guardando…' : 'Guardar'}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ✅ Un solo widget */}
      <AiChatWidget locale={locale} token={token} context={aiContext} />
    </div>
  );
}
