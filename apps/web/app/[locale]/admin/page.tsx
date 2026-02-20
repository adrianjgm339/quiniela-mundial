"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { me } from "@/lib/api";
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

                            <Button
                                variant="secondary"
                                className="justify-start"
                                onClick={() => router.push(`/${locale}/rankings`)}
                            >
                                Ver Rankings
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

                            {/* Placeholders para el backlog inmediato */}
                            <div style={{ opacity: 0.7, fontSize: 13, marginTop: 8 }}>
                                Próximamente: Seeds / Config reglas / Carga masiva
                            </div>
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
}