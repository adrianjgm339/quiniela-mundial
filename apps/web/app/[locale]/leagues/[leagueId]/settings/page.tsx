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

export default function LeagueSettingsPage() {
    const router = useRouter();
    const { locale, leagueId } = useParams<{ locale: string; leagueId: string }>();

    const [token, setToken] = useState<string | null>(null);
    const [myUserId, setMyUserId] = useState<string | null>(null);

    const [members, setMembers] = useState<MemberRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingUserId, setSavingUserId] = useState<string | null>(null);

    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    const myRole = useMemo(() => {
        if (!myUserId) return null;
        const row = members.find((m) => m.userId === myUserId);
        return (row?.role ?? null) as null | 'OWNER' | 'ADMIN' | 'MEMBER';
    }, [members, myUserId]);

    const canManageRoles = myRole === 'OWNER' || myRole === 'ADMIN';

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
            } catch (e: any) {
                // si falla /me, igual intentamos cargar miembros; backend seguirá protegiendo cambios
                await loadMembers(t);
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
                        Liga: <span className="text-zinc-200">{leagueId}</span>
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
