"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { verifyEmail } from "@/lib/api";

type Locale = "es" | "en";

export default function VerifyEmailPage() {
    const params = useParams<{ locale?: string }>();
    const locale: Locale = params?.locale === "en" ? "en" : "es";
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token") || "";

    const [loading, setLoading] = useState(true);
    const [ok, setOk] = useState(false);
    const [message, setMessage] = useState("Verificando correo...");
    const [redirecting, setRedirecting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let redirectTimer: ReturnType<typeof setTimeout> | null = null;

        async function run() {
            if (!token.trim()) {
                if (!cancelled) {
                    setOk(false);
                    setMessage("Enlace inválido o ausente.");
                    setLoading(false);
                }
                return;
            }

            try {
                const res = await verifyEmail(token);

                if (!cancelled) {
                    setOk(true);
                    setMessage(res.message || "Correo verificado correctamente.");
                    setRedirecting(true);

                    redirectTimer = setTimeout(() => {
                        router.replace(`/${locale}/login?verified=1`);
                    }, 2500);
                }
            } catch (err) {
                const rawMsg =
                    err instanceof Error ? err.message : "No se pudo verificar el correo.";

                let friendly = "No se pudo verificar el correo.";

                if (
                    rawMsg.includes("Invalid or expired token") ||
                    rawMsg.includes('"Invalid or expired token"')
                ) {
                    friendly =
                        "Este enlace ya fue usado o expiró. Si tu correo ya fue verificado, puedes iniciar sesión.";
                }

                if (!cancelled) {
                    setOk(false);
                    setMessage(friendly);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        void run();

        return () => {
            cancelled = true;
            if (redirectTimer) clearTimeout(redirectTimer);
        };
    }, [token, router, locale]);

    return (
        <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
            <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-6">
                <div className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
                    <div className="mb-5 flex items-center justify-center">
                        <Image
                            src="/brand/logo-light.png"
                            alt="QuinielaManía"
                            width={180}
                            height={48}
                            className="h-auto w-auto dark:hidden"
                            priority
                        />
                        <Image
                            src="/brand/logo-dark.png"
                            alt="QuinielaManía"
                            width={180}
                            height={48}
                            className="hidden h-auto w-auto dark:block"
                            priority
                        />
                    </div>

                    <h1 className="text-center text-2xl font-bold">
                        {loading ? "Verificando..." : ok ? "Correo verificado" : "No se pudo verificar"}
                    </h1>

                    <p className="mt-3 text-center text-sm text-[var(--muted-foreground)]">
                        {message}
                    </p>

                    {ok && redirecting ? (
                        <p className="mt-2 text-center text-xs text-[var(--muted-foreground)]">
                            Serás redirigido a iniciar sesión en unos segundos...
                        </p>
                    ) : null}

                    <div className="mt-6">
                        <Link
                            href={`/${locale}/login`}
                            className="flex h-10 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-foreground)]"
                        >
                            Ir a iniciar sesión
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    );
}