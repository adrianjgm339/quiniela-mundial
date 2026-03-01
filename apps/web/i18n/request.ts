import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

type SupportedLocale = (typeof routing.locales)[number];

function isSupportedLocale(v: unknown): v is SupportedLocale {
  return typeof v === "string" && (routing.locales as readonly string[]).includes(v);
}

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale puede venir undefined en algunos casos (primera carga / rewrites)
  const rawLocale: unknown = await requestLocale;

  // ✅ ANCLA: fallback tipado para que el ternario no se convierta en string
  const fallback: SupportedLocale = routing.defaultLocale as SupportedLocale;

  const locale: SupportedLocale = isSupportedLocale(rawLocale) ? rawLocale : fallback;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});