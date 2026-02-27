import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { ThemeProvider } from "./theme-provider";
import { AppShell } from "./app-shell";
import { PostHogProvider } from "./posthog-provider";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = locale === "es" || locale === "en" ? locale : "es";

  // Usa safeLocale para evitar inconsistencias
  setRequestLocale(safeLocale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <PostHogProvider>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </PostHogProvider>
    </NextIntlClientProvider>
  );
}