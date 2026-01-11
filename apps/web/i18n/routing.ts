export const routing = {
    locales: ['es', 'en'] as const,
    defaultLocale: 'es'
  };
  
export type Locale = (typeof routing.locales)[number];