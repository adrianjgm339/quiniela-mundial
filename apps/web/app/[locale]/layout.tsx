import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { type Locale } from "../../i18n/routing";
import { ThemeProvider } from "./theme-provider";
import { AppShell } from "./app-shell";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <ThemeProvider>
        <AppShell>{children}</AppShell>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
