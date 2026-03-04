'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { me } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getString(obj: unknown, key: string): string | undefined {
  if (!isRecord(obj)) return undefined;
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

function toJoinPolicy(v: string): 'PUBLIC' | 'PRIVATE' | 'APPROVAL' {
  if (v === 'PUBLIC' || v === 'PRIVATE' || v === 'APPROVAL') return v;
  return 'PRIVATE';
}

function friendlyErrorMessage(text: string) {
  // intenta extraer {"message": "..."} o usar texto plano
  try {
    const j: unknown = JSON.parse(text);
    if (isRecord(j) && typeof j.message === 'string') return j.message;
    if (isRecord(j) && Array.isArray(j.message)) return (j.message as unknown[]).map(String).join(' · ');
  } catch {
    // ignore
  }
  const lower = (text || '').toLowerCase();
  if (lower.includes('tournament has started')) return 'No se pueden modificar roles porque el torneo ya inició.';
  if (lower.includes('insufficient league role')) return 'No tienes permisos para administrar esta liga.';
  return text || 'Ocurrió un error';
}

type MemberRow = {
  userId: string;
  email: string;
  displayName: string | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  status: 'ACTIVE' | 'INVITED' | 'LEFT';
  joinedAt: string;
};

type LeagueAccessSettings = {
  id: string;
  seasonId: string;
  joinCode: string;
  joinPolicy: 'PUBLIC' | 'PRIVATE' | 'APPROVAL';
  inviteEnabled: boolean;
};

type JoinRequestRow = {
  requestId: string;
  userId: string;
  email: string;
  displayName: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  createdAt: string;
};

export default function LeagueSettingsPage() {
  const router = useRouter();
  const { locale, leagueId } = useParams<{ locale: string; leagueId: string }>();

  // token NO debe depender de leagueId/locale (eslint warning)
  const token = useMemo(() => localStorage.getItem('token'), []);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [leagueName, setLeagueName] = useState<string | null>(null);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const [access, setAccess] = useState<LeagueAccessSettings | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessSaving, setAccessSaving] = useState(false);

  const [joinPolicyDraft, setJoinPolicyDraft] = useState<'PUBLIC' | 'PRIVATE' | 'APPROVAL'>('PRIVATE');
  const [inviteEnabledDraft, setInviteEnabledDraft] = useState(true);

  const [joinRequests, setJoinRequests] = useState<JoinRequestRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [decidingRequestId, setDecidingRequestId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const myRole = useMemo(() => {
    if (!myUserId) return null;
    const row = members.find((m) => m.userId === myUserId);
    return (row?.role ?? null) as null | 'OWNER' | 'ADMIN' | 'MEMBER';
  }, [members, myUserId]);

  const canManageRoles = myRole === 'OWNER' || myRole === 'ADMIN';

  const loadJoinRequests = useCallback(
    async (t: string) => {
      setRequestsLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE}/leagues/${leagueId}/join-requests`, {
        headers: { Authorization: `Bearer ${t}` },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        setError(friendlyErrorMessage(text));
        setJoinRequests([]);
        setRequestsLoading(false);
        return;
      }

      const data: unknown = await res.json();
      setJoinRequests(Array.isArray(data) ? (data as JoinRequestRow[]) : []);
      setRequestsLoading(false);
    },
    [leagueId],
  );

  const loadAccess = useCallback(
    async (t: string) => {
      setAccessLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE}/leagues/${leagueId}/access`, {
        headers: { Authorization: `Bearer ${t}` },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        setError(friendlyErrorMessage(text));
        setAccess(null);
        setAccessLoading(false);
        return;
      }

      const data: unknown = await res.json();
      const a = data as LeagueAccessSettings;

      setAccess(a);
      setJoinPolicyDraft(a.joinPolicy);
      setInviteEnabledDraft(!!a.inviteEnabled);
      setAccessLoading(false);
    },
    [leagueId],
  );

  async function saveAccess(t: string) {
    setAccessSaving(true);
    setError(null);
    setInfo(null);

    const res = await fetch(`${API_BASE}/leagues/${leagueId}/access`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        joinPolicy: joinPolicyDraft,
        inviteEnabled: inviteEnabledDraft,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      setError(friendlyErrorMessage(text));
      setAccessSaving(false);
      return;
    }

    const updated = (await res.json()) as LeagueAccessSettings;
    setAccess(updated);
    setJoinPolicyDraft(updated.joinPolicy);
    setInviteEnabledDraft(!!updated.inviteEnabled);

    setInfo('Acceso/Invitaciones actualizado.');
    setTimeout(() => setInfo(null), 3000);

    setAccessSaving(false);
  }

  async function rotateCode(t: string) {
    setAccessSaving(true);
    setError(null);
    setInfo(null);

    const res = await fetch(`${API_BASE}/leagues/${leagueId}/access`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rotateCode: true }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      setError(friendlyErrorMessage(text));
      setAccessSaving(false);
      return;
    }

    const updated = (await res.json()) as LeagueAccessSettings;
    setAccess(updated);

    setInfo('Código rotado correctamente.');
    setTimeout(() => setInfo(null), 3000);

    setAccessSaving(false);
  }

  const loadLeagueName = useCallback(
    async (t: string) => {
      try {
        const res = await fetch(`${API_BASE}/leagues/mine`, {
          headers: { Authorization: `Bearer ${t}` },
        });

        if (!res.ok) {
          setLeagueName(null);
          return;
        }

        const rows: unknown = await res.json().catch(() => []);
        const arr = Array.isArray(rows) ? rows : [];
        const found = arr.find((x: unknown) => getString(x, 'id') === leagueId);
        setLeagueName(isRecord(found) && typeof found.name === 'string' ? found.name : null);
      } catch {
        setLeagueName(null);
      }
    },
    [leagueId],
  );

  const loadMembers = useCallback(
    async (t: string) => {
      setLoading(true);
      setError(null);
      // NO limpiamos setInfo aquí para que el mensaje de éxito no desaparezca al recargar

      const res = await fetch(`${API_BASE}/leagues/${leagueId}/members`, {
        headers: { Authorization: `Bearer ${t}` },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        setError(friendlyErrorMessage(text));
        setMembers([]);
        setLoading(false);
        return;
      }

      const data: unknown = await res.json();
      setMembers(Array.isArray(data) ? (data as MemberRow[]) : []);
      setLoading(false);
    },
    [leagueId],
  );

  async function decideJoinRequest(t: string, requestId: string, approve: boolean) {
    setDecidingRequestId(requestId);
    setError(null);
    setInfo(null);

    const res = await fetch(`${API_BASE}/leagues/${leagueId}/join-requests/${requestId}/decide`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ approve }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      setError(friendlyErrorMessage(text));
      setDecidingRequestId(null);
      return;
    }

    setInfo(approve ? 'Solicitud aprobada.' : 'Solicitud rechazada.');
    setTimeout(() => setInfo(null), 3000);

    setDecidingRequestId(null);

    // refrescar solicitudes y miembros (si aprobaste, ahora será miembro)
    await loadJoinRequests(t);
    await loadMembers(t);
  }

  async function changeRole(targetUserId: string, role: 'ADMIN' | 'MEMBER') {
    if (!token) return;

    setSavingUserId(targetUserId);
    setError(null);
    setInfo(null);

    const res = await fetch(`${API_BASE}/leagues/${leagueId}/members/${targetUserId}/role`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      setError(friendlyErrorMessage(text));
      setSavingUserId(null);
      return;
    }

    setInfo('Rol actualizado correctamente.');
    setTimeout(() => setInfo(null), 3000);
    setSavingUserId(null);
    await loadMembers(token);
  }

  // ✅ ÚNICO efecto de carga, y deferido para evitar el lint "set-state-in-effect"
  useEffect(() => {
    if (!token) {
      router.push(`/${locale}/login`);
      return;
    }

    const h = window.setTimeout(() => {
      void loadMembers(token);
      void loadAccess(token);
      void loadLeagueName(token);

      void (async () => {
        try {
          const mRaw: unknown = await me(token, locale);
          const id =
            (isRecord(mRaw) && typeof mRaw.id === 'string' && mRaw.id) ||
            (isRecord(mRaw) && isRecord(mRaw.user) && typeof mRaw.user.id === 'string' && mRaw.user.id) ||
            null;
          setMyUserId(id);
        } catch {
          setMyUserId(null);
        }
      })();

      // Solo ADMIN/OWNER ve solicitudes
      if (canManageRoles) {
        void loadJoinRequests(token);
      } else {
        setJoinRequests([]);
      }
    }, 0);

    return () => window.clearTimeout(h);
  }, [token, locale, router, canManageRoles, loadMembers, loadAccess, loadLeagueName, loadJoinRequests]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">Configuración de Liga</div>
          <div className="text-sm text-[color:var(--muted)] mt-1">
            Liga:{' '}
            <span className="font-medium text-[var(--foreground)]">
              {leagueName ? leagueName : leagueId}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => token && loadMembers(token)}
            className="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[color:var(--muted)] font-medium"
          >
            Recargar
          </button>

          <Link
            href={`/${locale}/leagues`}
            className="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[color:var(--muted)] font-medium"
          >
            Volver a Ligas
          </Link>
        </div>
      </div>

      {(error || info) && (
        <div className="mt-4 space-y-2">
          {error && (
            <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-red-200">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-3 text-emerald-200">
              {info}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Acceso e invitaciones */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <div className="p-5 border-b border-[var(--border)]">
            <div className="font-semibold">Acceso e invitaciones</div>
            <div className="text-sm text-[color:var(--muted)] mt-1">
              Tipos:
              <span className="text-[var(--foreground)]"> Pública</span> (entra directo),
              <span className="text-[var(--foreground)]"> Privada</span> (solo con código),
              <span className="text-[var(--foreground)]"> Con aprobación</span> (con código + solicitud).
            </div>
          </div>

          {accessLoading ? (
            <div className="p-5 text-[color:var(--muted)]">Cargando…</div>
          ) : !access ? (
            <div className="p-5 text-[color:var(--muted)]">No se pudo cargar la configuración.</div>
          ) : (
            <div className="p-5 space-y-4">
              <div>
                <div className="text-sm text-[color:var(--muted)] mb-1">Código de invitación</div>
                <div className="flex items-center gap-2">
                  <div className="px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--border)] font-mono text-[var(--foreground)]">
                    {access.joinCode}
                  </div>

                  <button
                    disabled={!canManageRoles || !token || accessSaving}
                    onClick={() => token && rotateCode(token)}
                    className="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[color:var(--muted)] font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--card)]"
                  >
                    Rotar código
                  </button>
                </div>

                {!canManageRoles && (
                  <div className="text-xs text-amber-200 mt-2">
                    Solo OWNER/ADMIN puede rotar el código.
                  </div>
                )}
              </div>

              <div>
                <div className="text-sm text-[color:var(--muted)] mb-1">Tipo de liga</div>
                <select
                  value={joinPolicyDraft}
                  onChange={(e) => setJoinPolicyDraft(toJoinPolicy(e.target.value))}
                  disabled={!canManageRoles || !token || accessSaving}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] disabled:opacity-50"
                >
                  <option value="PRIVATE">Privada (solo con código)</option>
                  <option value="PUBLIC">Pública (entra directo)</option>
                  <option value="APPROVAL">Con aprobación (con código)</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={inviteEnabledDraft}
                  onChange={(e) => setInviteEnabledDraft(e.target.checked)}
                  disabled={!canManageRoles || !token || accessSaving}
                />
                <span className="text-[var(--foreground)]">Invitaciones habilitadas</span>
              </label>

              <div className="flex justify-end">
                <button
                  disabled={!canManageRoles || !token || accessSaving}
                  onClick={() => token && saveAccess(token)}
                  className="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[color:var(--muted)] font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--card)]"
                >
                  Guardar
                </button>
              </div>

              <div className="text-xs text-zinc-500">Nota: el backend bloqueará cambios si el torneo ya inició.</div>
            </div>
          )}
        </div>

        {/* Solicitudes pendientes */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <div className="p-5 border-b border-[var(--border)]">
            <div className="font-semibold">Solicitudes pendientes</div>
            <div className="text-sm text-[color:var(--muted)] mt-1">
              Solo visible para <span className="text-[var(--foreground)]">OWNER/ADMIN</span>.
            </div>
          </div>

          {!canManageRoles ? (
            <div className="p-5 text-[color:var(--muted)]">No tienes permisos para ver solicitudes.</div>
          ) : requestsLoading ? (
            <div className="p-5 text-[color:var(--muted)]">Cargando…</div>
          ) : joinRequests.length === 0 ? (
            <div className="p-5 text-[color:var(--muted)]">No hay solicitudes pendientes.</div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {joinRequests.map((r) => {
                const label = (r.displayName || r.email || r.userId).trim();
                const busy = decidingRequestId === r.requestId;

                return (
                  <div key={r.requestId} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{label}</div>
                      <div className="text-sm text-[color:var(--muted)] truncate">{r.email}</div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        disabled={!token || busy}
                        onClick={() => token && decideJoinRequest(token, r.requestId, true)}
                        className="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[color:var(--muted)] font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--card)]"
                      >
                        Aprobar
                      </button>
                      <button
                        disabled={!token || busy}
                        onClick={() => token && decideJoinRequest(token, r.requestId, false)}
                        className="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[color:var(--muted)] font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--card)]"
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="p-5 border-b border-[var(--border)]">
          <div className="font-semibold">Miembros</div>
          <div className="text-sm text-[color:var(--muted)] mt-1">
            Solo el <span className="text-[var(--foreground)]">OWNER</span> o un <span className="text-[var(--foreground)]">ADMIN</span> de la
            liga puede asignar admins.
            {myRole === 'MEMBER' && (
              <div className="text-xs text-amber-200 mt-2">
                Estás como <b>MEMBER</b>. No puedes asignar/quitar admins en esta liga.
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-5 text-[color:var(--muted)]">Cargando…</div>
        ) : members.length === 0 ? (
          <div className="p-5 text-[color:var(--muted)]">No hay miembros para mostrar.</div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {members.map((m) => {
              const name = (m.displayName || m.email || m.userId).trim();
              const isOwner = m.role === 'OWNER';
              const isAdmin = m.role === 'ADMIN';

              return (
                <div key={m.userId} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{name}</div>
                    <div className="text-sm text-[color:var(--muted)] truncate">
                      {m.email} · <span className="text-[var(--foreground)]">{m.role}</span> · {m.status}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {isOwner ? (
                      <span className="px-3 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm">OWNER (no editable)</span>
                    ) : (
                      <>
                        {isAdmin ? (
                          <button
                            disabled={!canManageRoles || savingUserId === m.userId}
                            onClick={() => changeRole(m.userId, 'MEMBER')}
                            className="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[color:var(--muted)] font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--card)]"
                          >
                            Quitar admin
                          </button>
                        ) : (
                          <button
                            disabled={!canManageRoles || savingUserId === m.userId}
                            onClick={() => changeRole(m.userId, 'ADMIN')}
                            className="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[color:var(--muted)] font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--card)]"
                          >
                            Hacer admin
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-zinc-500">
        Nota: si el torneo ya inició, el backend bloqueará cambios de rol (igual que el cambio de reglas).
      </div>
    </div>
  );
}