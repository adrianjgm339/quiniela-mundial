'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { me } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

function friendlyErrorMessage(text: string) {
    // intenta extraer {"message": "..."} o usar texto plano
    try {
        const j = JSON.parse(text);
        if (typeof j?.message === 'string') return j.message;
        if (Array.isArray(j?.message)) return j.message.join(' · ');
    } catch { }
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

    const [token, setToken] = useState<string | null>(null);
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

    useEffect(() => {
        if (!token) return;

        // Solo ADMIN/OWNER ve solicitudes
        if (canManageRoles) {
            loadJoinRequests(token);
        } else {
            setJoinRequests([]);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, canManageRoles, leagueId]);

    async function loadAccess(t: string) {
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

        const data = await res.json();
        const a = data as LeagueAccessSettings;

        setAccess(a);
        setJoinPolicyDraft(a.joinPolicy);
        setInviteEnabledDraft(!!a.inviteEnabled);
        setAccessLoading(false);
    }

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

    async function loadJoinRequests(t: string) {
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

        const data = await res.json();
        setJoinRequests(Array.isArray(data) ? (data as JoinRequestRow[]) : []);
        setRequestsLoading(false);
    }

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

    async function loadLeagueName(t: string) {
        try {
            const res = await fetch(`${API_BASE}/leagues/mine`, {
                headers: { Authorization: `Bearer ${t}` },
            });

            if (!res.ok) {
                setLeagueName(null);
                return;
            }

            const rows = await res.json().catch(() => []);
            const arr = Array.isArray(rows) ? rows : [];
            const found = arr.find((x: any) => x?.id === leagueId);
            setLeagueName(typeof found?.name === 'string' ? found.name : null);
        } catch {
            setLeagueName(null);
        }
    }

    async function loadMembers(t: string) {
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

        const data = await res.json();
        setMembers(Array.isArray(data) ? data : []);
        setLoading(false);
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

    useEffect(() => {
        const t = localStorage.getItem('token');
        setToken(t);

        if (!t) {
            router.push(`/${locale}/login`);
            return;
        }

        (async () => {
            try {
                // 1) cargar /me para saber mi userId
                const m = await me(t, locale);
                const uid = m?.user?.id ?? m?.id ?? null;
                setMyUserId(uid);

                // 2) cargar miembros de la liga
                await loadMembers(t);

                // 3) nombre de liga (para mostrarlo en el header)
                await loadLeagueName(t);
                await loadAccess(t);
            } catch (e: any) {
                // si falla /me, igual intentamos cargar miembros; backend seguirá protegiendo cambios
                await loadMembers(t);
                await loadLeagueName(t);
            }
        })();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leagueId, locale]);

    return (
        <div className="max-w-5xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-2xl font-semibold">Configuración de Liga</div>
                    <div className="text-sm text-zinc-400 mt-1">
                        Liga:{' '}
                        <span className="text-zinc-200">
                            {leagueName ? leagueName : leagueId}
                        </span>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => token && loadMembers(token)}
                        className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 font-medium"
                    >
                        Recargar
                    </button>

                    <Link
                        href={`/${locale}/leagues`}
                        className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 font-medium"
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
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40">
                    <div className="p-5 border-b border-zinc-800">
                        <div className="font-semibold">Acceso e invitaciones</div>
                        <div className="text-sm text-zinc-400 mt-1">
                            Tipos:
                            <span className="text-zinc-200"> Pública</span> (entra directo),
                            <span className="text-zinc-200"> Privada</span> (solo con código),
                            <span className="text-zinc-200"> Con aprobación</span> (con código + solicitud).
                        </div>
                    </div>

                    {accessLoading ? (
                        <div className="p-5 text-zinc-400">Cargando…</div>
                    ) : !access ? (
                        <div className="p-5 text-zinc-400">No se pudo cargar la configuración.</div>
                    ) : (
                        <div className="p-5 space-y-4">
                            <div>
                                <div className="text-sm text-zinc-400 mb-1">Código de invitación</div>
                                <div className="flex items-center gap-2">
                                    <div className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 font-mono">
                                        {access.joinCode}
                                    </div>

                                    <button
                                        disabled={!canManageRoles || !token || accessSaving}
                                        onClick={() => token && rotateCode(token)}
                                        className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-800"
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
                                <div className="text-sm text-zinc-400 mb-1">Tipo de liga</div>
                                <select
                                    value={joinPolicyDraft}
                                    onChange={(e) => setJoinPolicyDraft(e.target.value as any)}
                                    disabled={!canManageRoles || !token || accessSaving}
                                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 disabled:opacity-50"
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
                                <span className="text-zinc-200">Invitaciones habilitadas</span>
                            </label>

                            <div className="flex justify-end">
                                <button
                                    disabled={!canManageRoles || !token || accessSaving}
                                    onClick={() => token && saveAccess(token)}
                                    className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-800"
                                >
                                    Guardar
                                </button>
                            </div>

                            <div className="text-xs text-zinc-500">
                                Nota: el backend bloqueará cambios si el torneo ya inició.
                            </div>
                        </div>
                    )}
                </div>

                {/* Solicitudes pendientes */}
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40">
                    <div className="p-5 border-b border-zinc-800">
                        <div className="font-semibold">Solicitudes pendientes</div>
                        <div className="text-sm text-zinc-400 mt-1">
                            Solo visible para <span className="text-zinc-200">OWNER/ADMIN</span>.
                        </div>
                    </div>

                    {!canManageRoles ? (
                        <div className="p-5 text-zinc-400">No tienes permisos para ver solicitudes.</div>
                    ) : requestsLoading ? (
                        <div className="p-5 text-zinc-400">Cargando…</div>
                    ) : joinRequests.length === 0 ? (
                        <div className="p-5 text-zinc-400">No hay solicitudes pendientes.</div>
                    ) : (
                        <div className="divide-y divide-zinc-800">
                            {joinRequests.map((r) => {
                                const label = (r.displayName || r.email || r.userId).trim();
                                const busy = decidingRequestId === r.requestId;

                                return (
                                    <div key={r.requestId} className="p-4 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-medium truncate">{label}</div>
                                            <div className="text-sm text-zinc-400 truncate">{r.email}</div>
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                disabled={!token || busy}
                                                onClick={() => token && decideJoinRequest(token, r.requestId, true)}
                                                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-800"
                                            >
                                                Aprobar
                                            </button>
                                            <button
                                                disabled={!token || busy}
                                                onClick={() => token && decideJoinRequest(token, r.requestId, false)}
                                                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-800"
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

            <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/40">
                <div className="p-5 border-b border-zinc-800">
                    <div className="font-semibold">Miembros</div>
                    <div className="text-sm text-zinc-400 mt-1">
                        Solo el <span className="text-zinc-200">OWNER</span> o un{' '}
                        <span className="text-zinc-200">ADMIN</span> de la liga puede asignar admins.
                        {myRole === 'MEMBER' && (
                            <div className="text-xs text-amber-200 mt-2">
                                Estás como <b>MEMBER</b>. No puedes asignar/quitar admins en esta liga.
                            </div>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="p-5 text-zinc-400">Cargando…</div>
                ) : members.length === 0 ? (
                    <div className="p-5 text-zinc-400">No hay miembros para mostrar.</div>
                ) : (
                    <div className="divide-y divide-zinc-800">
                        {members.map((m) => {
                            const name = (m.displayName || m.email || m.userId).trim();
                            const isOwner = m.role === 'OWNER';
                            const isAdmin = m.role === 'ADMIN';

                            return (
                                <div key={m.userId} className="p-4 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{name}</div>
                                        <div className="text-sm text-zinc-400 truncate">
                                            {m.email} · <span className="text-zinc-200">{m.role}</span> · {m.status}
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        {isOwner ? (
                                            <span className="px-3 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm">
                                                OWNER (no editable)
                                            </span>
                                        ) : (
                                            <>
                                                {isAdmin ? (
                                                    <button
                                                        disabled={!canManageRoles || savingUserId === m.userId}
                                                        onClick={() => changeRole(m.userId, 'MEMBER')}
                                                        className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-800"
                                                    >
                                                        Quitar admin
                                                    </button>
                                                ) : (
                                                    <button
                                                        disabled={!canManageRoles || savingUserId === m.userId}
                                                        onClick={() => changeRole(m.userId, 'ADMIN')}
                                                        className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-800"
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
