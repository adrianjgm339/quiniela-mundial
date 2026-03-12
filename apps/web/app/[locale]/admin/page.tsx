"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { me, publishAppAnnouncement } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

type User = {
    id: string;
    email: string;
    displayName: string;
    role: string;
    createdAt: string;
    activeSeason?: null | {
        id: string;
        slug: string;
        name: string;
        competition: {
            id: string;
            slug: string;
            name: string;
            sport: { id: string; slug: string; name: string };
        };
    };
    countryCode?: string;
};

export default function AdminHomePage() {
    const router = useRouter();
    const { locale } = useParams<{ locale: string }>();

    const [user, setUser] = useState<User | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [announcementTitle, setAnnouncementTitle] = useState("Actualización de la app");
    const [announcementMessage, setAnnouncementMessage] = useState("");
    const [announcementActionUrl, setAnnouncementActionUrl] = useState("/leagues");
    const [announcementSaving, setAnnouncementSaving] = useState(false);
    const [announcementMsg, setAnnouncementMsg] = useState<string | null>(null);

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            router.replace(`/${locale}/login`);
            return;
        }

        me(token, locale)
            .then((data: User) => {
                // Bloqueo por rol (NO NEGOCIABLE)
                if (data?.role !== "ADMIN") {
                    router.replace(`/${locale}/dashboard`);
                    return;
                }

                setUser(data);

                if (data?.countryCode) {
                    localStorage.setItem("countryCode", data.countryCode);
                }
            })
            .catch((err) => {
                setError(err?.message ?? "Error");
                localStorage.removeItem("token");
                router.replace(`/${locale}/login`);
            });
    }, [router, locale]);

    async function onPublishAnnouncement() {
        const token = localStorage.getItem("token");
        if (!token) {
            router.replace(`/${locale}/login`);
            return;
        }

        const title = announcementTitle.trim();
        const message = announcementMessage.trim();
        const actionUrl = announcementActionUrl.trim();

        if (!title) {
            setError("Debes indicar el título del anuncio.");
            return;
        }

        if (!message) {
            setError("Debes indicar el mensaje del anuncio.");
            return;
        }

        try {
            setAnnouncementSaving(true);
            setError(null);
            setAnnouncementMsg(null);

            const res = await publishAppAnnouncement(token, {
                title,
                message,
                actionUrl: actionUrl || null,
            });

            setAnnouncementMsg(
                `✅ Anuncio publicado correctamente para ${res.created} usuario(s).`,
            );
            setAnnouncementMessage("");
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Error publicando anuncio";
            setError(msg);
        } finally {
            setAnnouncementSaving(false);
        }
    }

    return (
        <div className="min-h-screen">
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
                <PageHeader
                    title="Admin"
                    subtitle={<span className="text-[color:var(--muted)]">Panel de administración</span>}
                    actions={
                        <Button variant="secondary" size="sm" onClick={() => router.push(`/${locale}/dashboard`)}>
                            Volver al Dashboard
                        </Button>
                    }
                />

                <Card className="p-4">
                    <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">
                        Evento activo
                    </div>

                    <div className="mt-1 text-base font-semibold">
                        {user?.activeSeason?.name ?? "No seleccionado"}
                    </div>

                    <div className="mt-1 text-sm text-[color:var(--muted)]">
                        {user?.activeSeason
                            ? `${user.activeSeason.competition.sport.name} · ${user.activeSeason.competition.name}`
                            : ""}
                    </div>
                </Card>

                {!user && !error && <Card className="p-4 text-[color:var(--muted)]">Cargando...</Card>}

                {error && (
                    <Card className="p-4 border border-red-500/30">
                        {error}
                    </Card>
                )}

                {user && (
                    <div className="space-y-6">
                        <Card className="p-4">
                            <div className="grid gap-2.5">
                                <Button
                                    variant="secondary"
                                    className="justify-start"
                                    onClick={() => router.push(`/${locale}/admin/results`)}
                                >
                                    Resultados (cargar marcadores + confirmar + recalcular)
                                </Button>

                                <Button
                                    variant="secondary"
                                    className="justify-start"
                                    onClick={() => router.push(`/${locale}/admin/rules`)}
                                >
                                    Reglas (paquetes y puntos)
                                </Button>

                                <Button
                                    variant="secondary"
                                    className="justify-start"
                                    onClick={() => router.push(`/${locale}/admin/catalog`)}
                                >
                                    Catálogo (deportes · competiciones · eventos)
                                </Button>

                                <div className="mt-4 pt-4 border-t border-[var(--border)]">
                                    <div className="text-xs uppercase tracking-wide text-[color:var(--muted)] mb-2">
                                        Admin · Fase de Grupos
                                    </div>

                                    <div className="grid gap-2.5">
                                        <Button
                                            variant="secondary"
                                            className="justify-start"
                                            onClick={() => router.push(`/${locale}/admin/groups`)}
                                        >
                                            Grupos (standings + terceros + cerrar fase + manual)
                                        </Button>
                                    </div>
                                </div>

                                <div className="mt-4 pt-4 border-t border-[var(--border)]">
                                    <div className="text-xs uppercase tracking-wide text-[color:var(--muted)] mb-2">
                                        Admin · Notificaciones
                                    </div>

                                    <div className="text-sm text-[color:var(--muted)]">
                                        Publica anuncios globales que aparecerán en la campanita de los usuarios.
                                    </div>
                                </div>
                            </div>
                        </Card>

                        <Card className="p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="text-base font-semibold">Anuncios de la app</div>
                                </div>

                                <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1 text-xs text-[color:var(--muted)]">
                                    Tipo: APP_ANNOUNCEMENT
                                </div>
                            </div>

                            {announcementMsg ? (
                                <div className="mt-4 rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-emerald-200">
                                    {announcementMsg}
                                </div>
                            ) : null}

                            <div className="mt-4 grid gap-4">
                                <div className="grid gap-1.5">
                                    <label className="text-sm font-medium text-[color:var(--foreground)]">
                                        Título
                                    </label>
                                    <input
                                        value={announcementTitle}
                                        onChange={(e) => setAnnouncementTitle(e.target.value)}
                                        disabled={announcementSaving}
                                        className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm text-[color:var(--foreground)]"
                                        placeholder="Título del anuncio"
                                    />
                                </div>

                                <div className="grid gap-1.5">
                                    <label className="text-sm font-medium text-[color:var(--foreground)]">
                                        Mensaje
                                    </label>
                                    <textarea
                                        value={announcementMessage}
                                        onChange={(e) => setAnnouncementMessage(e.target.value)}
                                        disabled={announcementSaving}
                                        rows={4}
                                        className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm text-[color:var(--foreground)]"
                                        placeholder="Escribe el mensaje que verán los usuarios"
                                    />
                                </div>

                                <div className="grid gap-1.5">
                                    <label className="text-sm font-medium text-[color:var(--foreground)]">
                                        URL de acción opcional
                                    </label>
                                    <input
                                        value={announcementActionUrl}
                                        onChange={(e) => setAnnouncementActionUrl(e.target.value)}
                                        disabled={announcementSaving}
                                        className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm text-[color:var(--foreground)]"
                                        placeholder="/leagues"
                                    />
                                </div>

                                <div className="flex items-center justify-end gap-2">
                                    <Button
                                        variant="secondary"
                                        onClick={() => {
                                            setAnnouncementTitle("Actualización de la app");
                                            setAnnouncementMessage("");
                                            setAnnouncementActionUrl("/leagues");
                                            setAnnouncementMsg(null);
                                        }}
                                        disabled={announcementSaving}
                                    >
                                        Limpiar
                                    </Button>

                                    <Button
                                        onClick={onPublishAnnouncement}
                                        disabled={announcementSaving}
                                    >
                                        {announcementSaving ? "Publicando..." : "Publicar anuncio"}
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}