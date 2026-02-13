"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { me } from "@/lib/api";

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
        <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Admin</h1>

                <div style={{ display: "flex", gap: 10 }}>
                    <button
                        onClick={() => router.push(`/${locale}/dashboard`)}
                        className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
                    >
                        Volver al Dashboard
                    </button>
                </div>
            </div>

            <div style={{ marginTop: 14, color: "rgba(255,255,255,0.75)" }}>
                <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, opacity: 0.7 }}>
                    Evento activo
                </div>

                <div style={{ marginTop: 6, fontSize: 16, fontWeight: 600 }}>
                    {user?.activeSeason?.name ?? "No seleccionado"}
                </div>

                <div style={{ marginTop: 2, fontSize: 13, opacity: 0.7 }}>
                    {user?.activeSeason
                        ? `${user.activeSeason.competition.sport.name} · ${user.activeSeason.competition.name}`
                        : ""}
                </div>
            </div>

            {!user && !error && <p style={{ marginTop: 16 }}>Cargando...</p>}

            {error && (
                <div style={{ marginTop: 16, background: "#ffe5e5", color: "#000", padding: 10, borderRadius: 8 }}>
                    {error}
                </div>
            )}

            {user && (
                <div
                    style={{
                        marginTop: 16,
                        padding: 12,
                        border: "1px solid #ddd",
                        borderRadius: 10,
                    }}
                >

                    <div style={{ display: "grid", gap: 10 }}>
                        <button
                            onClick={() => router.push(`/${locale}/admin/results`)}
                            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-left"
                        >
                            Resultados (cargar marcadores + confirmar + recalcular)
                        </button>

                        <Link
                            href={`/${locale}/admin/rules`}
                            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
                        >
                            Reglas (paquetes y puntos)
                        </Link>

                        <Link
                            href={`/${locale}/admin/catalog`}
                            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
                        >
                            Catálogo (deportes · competiciones · eventos)
                        </Link>

                        <Link
                            href={`/${locale}/rankings`}
                            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
                        >
                            Ver Rankings
                        </Link>

                        <div style={{ marginTop: 8, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, opacity: 0.7, marginBottom: 8 }}>
                                Admin · Fase de Grupos
                            </div>

                            <div style={{ display: "grid", gap: 10 }}>
                                <Link
                                    href={`/${locale}/admin/groups`}
                                    className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
                                >
                                    Grupos (standings + terceros + cerrar fase + manual)
                                </Link>
                            </div>
                        </div>

                        {/* Placeholders para el backlog inmediato */}
                        <div style={{ opacity: 0.7, fontSize: 13, marginTop: 8 }}>
                            Próximamente: Seeds / Config reglas / Carga masiva
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}