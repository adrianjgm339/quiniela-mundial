import Link from 'next/link';
import { UtmCapture } from '@/components/utm-capture';
import { WaitlistForm } from '@/components/waitlist-form';

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = locale === 'es' || locale === 'en' ? locale : 'es';

  const t =
    safeLocale === 'en'
      ? {
        badge: 'Beta',
        title: 'A modern prediction game for world tournaments.',
        subtitle:
          'Create private leagues, configurable scoring rules, and compete in rankings. Multi-sport by design.',
        ctaPrimary: 'Join the beta',
        ctaSecondary: 'Log in',
        featuresTitle: 'What you can do',
        f1Title: 'Private leagues',
        f1Desc: 'Invite friends with a code or link. Compete with your own rules.',
        f2Title: 'Configurable rules',
        f2Desc: 'Admins set scoring per season and keep everything consistent.',
        f3Title: 'Multi-sport',
        f3Desc: 'World Cup, WBC, and future events—same experience, same quality.',
        howTitle: 'How it works',
        how1: 'Pick an event (World Cup / WBC)',
        how2: 'Create or join a league',
        how3: 'Make picks before matches lock',
        how4: 'Earn points and climb the rankings',
        faqTitle: 'FAQ',
        faq1q: 'Is it free?',
        faq1a: 'The beta is free. Premium features may come later.',
        faq2q: 'Do you support multiple events?',
        faq2a: 'Yes—multi-sport and multi-event is a core principle.',
        footer: 'Quiniela Mundial 2026 — Built for competitive leagues.',
      }
      : {
        badge: 'Beta',
        title: 'La quiniela moderna para torneos mundiales.',
        subtitle:
          'Crea ligas privadas, reglas configurables y compite en rankings. Multi-deporte desde el diseño.',
        ctaPrimary: 'Unirme a la beta',
        ctaSecondary: 'Iniciar sesión',
        featuresTitle: 'Qué podrás hacer',
        f1Title: 'Ligas privadas',
        f1Desc: 'Invita con código o link. Compite con tus amigos con tus reglas.',
        f2Title: 'Reglas configurables',
        f2Desc: 'Admins definen scoring por evento/season con consistencia total.',
        f3Title: 'Multi-deporte',
        f3Desc: 'Mundial, Clásico Mundial y futuros eventos: misma experiencia PRO.',
        howTitle: 'Cómo funciona',
        how1: 'Elige un evento (Mundial / WBC)',
        how2: 'Crea o únete a una liga',
        how3: 'Haz picks antes del bloqueo',
        how4: 'Gana puntos y sube en el ranking',
        faqTitle: 'FAQ',
        faq1q: '¿Es gratis?',
        faq1a: 'La beta es gratis. Luego podrían existir funciones premium.',
        faq2q: '¿Soporta varios eventos?',
        faq2a: 'Sí—multi-deporte y multi-evento es parte del núcleo.',
        footer: 'Quiniela Mundial 2026 — Hecho para ligas competitivas.',
      };

  // Reutilizables PRO (mismos tokens/estética del resto)
  const container = 'mx-auto max-w-6xl px-6';
  const sectionTitle = 'text-xl font-semibold text-[hsl(var(--foreground))]';
  const card =
    'rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm';
  const cardTitle = 'text-sm font-semibold text-[hsl(var(--foreground))]';
  const cardText = 'mt-2 text-sm text-[hsl(var(--muted-foreground))]';

  const btnPrimary =
    'inline-flex h-10 items-center justify-center rounded-xl bg-[hsl(var(--foreground))] px-4 text-sm font-semibold text-[hsl(var(--background))] hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent))]';
  const btnSecondary =
    'inline-flex h-10 items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 text-sm font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent))]';

  const topBtn =
    'inline-flex h-10 items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 text-sm font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]';
  const topBtnPrimary =
    'inline-flex h-10 items-center justify-center rounded-xl bg-[hsl(var(--foreground))] px-4 text-sm font-semibold text-[hsl(var(--background))] hover:opacity-95';

  return (
    <main className="min-h-[calc(100vh-0px)] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <UtmCapture />

      {/* Background pro (tokenizado) */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,hsl(var(--primary)/0.22)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,hsl(var(--background))_60%)]" />
      </div>

      <div className={`${container} py-10 sm:py-14`}>
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]" />
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-wide">Quiniela</span>
              <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                {t.badge}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href={`/${safeLocale}/login`} className={topBtn}>
              {t.ctaSecondary}
            </Link>

            <Link href={`/${safeLocale}/register`} className={topBtnPrimary}>
              {safeLocale === 'en' ? 'Register' : 'Registrarse'}
            </Link>
          </div>
        </div>

        {/* Hero */}
        <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:items-start">
          <div className="pt-2">
            <h1 className="text-balance text-4xl font-semibold leading-tight sm:text-5xl">
              {t.title}
            </h1>

            <p className="mt-4 max-w-xl text-pretty text-base text-[hsl(var(--muted-foreground))] sm:text-lg">
              {t.subtitle}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#waitlist" className={btnPrimary}>
                {t.ctaPrimary}
              </a>

              <Link href={`/${safeLocale}/register`} className={btnSecondary}>
                {safeLocale === 'en' ? 'Create account' : 'Crear cuenta'}
              </Link>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className={card}>
                <p className={cardTitle}>World Cup 2026</p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  {safeLocale === 'en'
                    ? 'Ready for brackets & groups.'
                    : 'Listo para grupos y llaves.'}
                </p>
              </div>

              <div className={card}>
                <p className={cardTitle}>WBC 2026</p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  {safeLocale === 'en'
                    ? 'Built for multi-sport.'
                    : 'Diseñado multi-deporte.'}
                </p>
              </div>

              <div className={card}>
                <p className={cardTitle}>{safeLocale === 'en' ? 'PRO UI' : 'UI PRO'}</p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  {safeLocale === 'en'
                    ? 'Tokenized light/dark.'
                    : 'Tokenizado claro/oscuro.'}
                </p>
              </div>
            </div>
          </div>

          {/* Waitlist */}
          <div id="waitlist" className="flex justify-center lg:justify-end">
            <div className="w-full max-w-xl">
              <WaitlistForm locale={safeLocale} source="landing" />
            </div>
          </div>
        </div>

        {/* Features */}
        <section className="mt-14">
          <h2 className={sectionTitle}>{t.featuresTitle}</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className={card}>
              <p className={cardTitle}>{t.f1Title}</p>
              <p className={cardText}>{t.f1Desc}</p>
            </div>

            <div className={card}>
              <p className={cardTitle}>{t.f2Title}</p>
              <p className={cardText}>{t.f2Desc}</p>
            </div>

            <div className={card}>
              <p className={cardTitle}>{t.f3Title}</p>
              <p className={cardText}>{t.f3Desc}</p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mt-14">
          <h2 className={sectionTitle}>{t.howTitle}</h2>

          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {[t.how1, t.how2, t.how3, t.how4].map((step, idx) => (
              <li
                key={idx}
                className="flex gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm font-semibold">
                  {idx + 1}
                </div>
                <p className="text-sm text-[hsl(var(--foreground))]">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQ */}
        <section className="mt-14">
          <h2 className={sectionTitle}>{t.faqTitle}</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className={card}>
              <p className={cardTitle}>{t.faq1q}</p>
              <p className={cardText}>{t.faq1a}</p>
            </div>

            <div className={card}>
              <p className={cardTitle}>{t.faq2q}</p>
              <p className={cardText}>{t.faq2a}</p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-14 border-t border-[hsl(var(--border))] pt-6 text-sm text-[hsl(var(--muted-foreground))]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{t.footer}</span>
            <div className="flex gap-3">
              <Link className="hover:underline" href={`/${safeLocale}/login`}>
                {t.ctaSecondary}
              </Link>
              <Link className="hover:underline" href={`/${safeLocale}/register`}>
                {safeLocale === 'en' ? 'Register' : 'Registrarse'}
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}