"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  deleteNotifications,
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  type ApiNotification,
} from "@/lib/api";
import { useTheme } from "./theme-provider";

type Theme = "dark" | "light";

function cycleTheme(t: Theme) {
  return t === "dark" ? "light" : "dark";
}

function themeLabel(t: Theme) {
  return t === "dark" ? "Oscuro" : "Claro";
}

function themeIcon(t: Theme) {
  return t === "dark" ? "🌙" : "☀️";
}

function formatRelativeDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  return new Intl.DateTimeFormat("es", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  function useIsMounted() {
    return useSyncExternalStore(
      () => () => { },
      () => true,
      () => false
    );
  }

  const mounted = useIsMounted();

  const pathname = usePathname() ?? "";
  const isAuthRoute = useMemo(() => {
    return (
      pathname.includes("/login") ||
      pathname.includes("/register") ||
      pathname.includes("/forgot-password") ||
      pathname.includes("/reset-password")
    );
  }, [pathname]);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState<string>("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [selectedNotificationIds, setSelectedNotificationIds] = useState<string[]>([]);

  async function refreshUnread() {
    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem("token") || ""
        : "";

    if (!token) {
      setUnreadCount(0);
      return;
    }

    try {
      const data = await getUnreadNotificationCount(token);
      setUnreadCount(data.count ?? 0);
    } catch {
      setUnreadCount(0);
    }
  }

  async function loadNotifications() {
    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem("token") || ""
        : "";

    if (!token) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    setNotifLoading(true);
    setNotifError("");

    try {
      const [rows, unread] = await Promise.all([
        getNotifications(token, 6),
        getUnreadNotificationCount(token),
      ]);

      setNotifications(rows);
      setUnreadCount(unread.count ?? 0);
      setSelectedNotificationIds([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudieron cargar las notificaciones";
      setNotifError(msg);
    } finally {
      setNotifLoading(false);
    }
  }

  useEffect(() => {
    if (isAuthRoute) return;
    void refreshUnread();
  }, [isAuthRoute, pathname]);

  function toggleNotificationSelection(notificationId: string) {
    setSelectedNotificationIds((prev) =>
      prev.includes(notificationId)
        ? prev.filter((id) => id !== notificationId)
        : [...prev, notificationId],
    );
  }

  const ThemeToggleButton = (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        if (!mounted) return;
        setTheme(cycleTheme(theme));
      }}
      title={
        mounted
          ? `Tema: ${themeLabel(theme)} (click para cambiar)`
          : "Tema (cargando...)"
      }
      disabled={!mounted}
    >
      <span className="text-lg leading-none">
        {mounted ? themeIcon(theme) : "🌓"}
      </span>
      <span className="sr-only">
        {mounted ? `Tema: ${themeLabel(theme)}` : "Tema"}
      </span>
    </Button>
  );

  const NotificationButton = (
    <div className="relative">
      <Button
        variant="secondary"
        size="sm"
        onClick={async () => {
          const next = !notifOpen;
          setNotifOpen(next);
          if (next) {
            await loadNotifications();
          }
        }}
        title="Notificaciones"
      >
        <span className="text-lg leading-none">🔔</span>
        <span className="sr-only">Notificaciones</span>
        {unreadCount > 0 ? (
          <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--accent)] px-1.5 text-[11px] font-semibold text-[var(--accent-foreground)]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Button>

      {notifOpen ? (
        <div className="absolute right-0 mt-2 w-[360px] max-w-[90vw] max-h-[70vh] rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-xl">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Notificaciones</div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {unreadCount > 0
                  ? `${unreadCount} sin leer`
                  : "No tienes pendientes"}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={selectedNotificationIds.length === 0}
                onClick={async () => {
                  const token =
                    typeof window !== "undefined"
                      ? window.localStorage.getItem("token") || ""
                      : "";
                  if (!token) return;

                  try {
                    await deleteNotifications(token, selectedNotificationIds);
                    await loadNotifications();
                    await refreshUnread();
                  } catch (err) {
                    const msg =
                      err instanceof Error
                        ? err.message
                        : "No se pudieron borrar las notificaciones";
                    setNotifError(msg);
                  }
                }}
              >
                Borrar
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const token =
                    typeof window !== "undefined"
                      ? window.localStorage.getItem("token") || ""
                      : "";
                  if (!token) return;

                  try {
                    await markAllNotificationsRead(token);
                    await loadNotifications();
                  } catch (err) {
                    const msg =
                      err instanceof Error
                        ? err.message
                        : "No se pudieron marcar como leídas";
                    setNotifError(msg);
                  }
                }}
              >
                Marcar todas como leídas
              </Button>
            </div>
          </div>

          {notifLoading ? (
            <div className="rounded-xl border border-[var(--border)] p-3 text-sm text-[var(--muted-foreground)]">
              Cargando notificaciones...
            </div>
          ) : notifError ? (
            <div className="rounded-xl border border-[var(--border)] p-3 text-sm text-red-500">
              {notifError}
            </div>
          ) : notifications.length === 0 ? (
            <div className="rounded-xl border border-[var(--border)] p-3 text-sm text-[var(--muted-foreground)]">
              No tienes notificaciones todavía.
            </div>
          ) : (
            <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
              {notifications.map((n) => {
                const isSelected = selectedNotificationIds.includes(n.id);

                return (
                  <div
                    key={n.id}
                    className={`w-full rounded-xl border p-3 transition hover:bg-[var(--muted)] ${n.isRead
                      ? "border-[var(--border)] bg-[var(--background)]"
                      : "border-[var(--current-user-row-border)] bg-[var(--current-user-row-bg)]"
                      }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleNotificationSelection(n.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 h-4 w-4 rounded border-[var(--border)]"
                      />

                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={async () => {
                          const token =
                            typeof window !== "undefined"
                              ? window.localStorage.getItem("token") || ""
                              : "";
                          if (!token) return;

                          try {
                            if (!n.isRead) {
                              await markNotificationRead(token, n.id);
                            }

                            setNotifOpen(false);
                            await refreshUnread();

                            if (n.actionUrl) {
                              router.push(n.actionUrl);
                            } else {
                              await loadNotifications();
                            }
                          } catch (err) {
                            const msg =
                              err instanceof Error
                                ? err.message
                                : "No se pudo abrir la notificación";
                            setNotifError(msg);
                          }
                        }}
                      >
                        <div className="mb-1 flex items-start justify-between gap-3">
                          <div className="text-sm font-semibold">{n.title}</div>
                          {!n.isRead ? (
                            <span className="mt-0.5 inline-block h-2.5 w-2.5 rounded-full bg-[var(--current-user-row-accent)]" />
                          ) : null}
                        </div>

                        <div className="text-sm text-[var(--foreground)]">
                          {n.message}
                        </div>

                        <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                          {formatRelativeDate(n.createdAt)}
                        </div>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {isAuthRoute ? (
        <div className="fixed top-3 right-3 z-50">{ThemeToggleButton}</div>
      ) : (
        <div className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-end gap-2">
            {NotificationButton}
            {ThemeToggleButton}
          </div>
        </div>
      )}

      <main
        className={
          isAuthRoute
            ? "w-full p-0"
            : "w-full bg-[var(--background)] text-[var(--foreground)] px-4 py-6"
        }
      >
        {isAuthRoute ? children : <div className="max-w-6xl mx-auto">{children}</div>}
      </main>
    </div>
  );
}