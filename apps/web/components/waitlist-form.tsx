'use client';

import * as React from 'react';
import { track } from '@/lib/track';
import { loadUtm } from '@/lib/utm';

// Import relativo (porque tu alias no resolvía components/ui)
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

type Interest = 'SOCCER' | 'BASEBALL' | 'BOTH';

export function WaitlistForm(props: { locale: string; source?: string }) {
  const { locale, source = 'landing' } = props;

  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [name, setName] = React.useState('');
  const [interest, setInterest] = React.useState<Interest>('BOTH');

  const [status, setStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const isBusy = status === 'loading';

  // ✅ Estilo PRO (mismo “idioma” del resto del sitio)
  const surface =
    'w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm';

  const header =
    'px-5 py-4 border-b border-[var(--border)]';

  const body =
    'px-5 py-5';

  const title =
    'text-base font-semibold text-[var(--foreground)]';

  const subtitle =
    'mt-1 text-sm text-[var(--muted)]';

  const label =
    'text-sm font-medium text-[var(--foreground)]';

  const hint =
    'text-xs text-[var(--muted)]';

  const controlBase =
    'h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] outline-none ' +
    'placeholder:text-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] ' +
    'disabled:cursor-not-allowed disabled:opacity-70';

  const controlSelect = controlBase + ' pr-9';

  const btnPrimary =
    'inline-flex h-10 w-full items-center justify-center rounded-xl bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)] ' +
    'hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

  const btnOutline =
    'inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--foreground)] ' +
    'hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

  // ✅ Select PRO: forzar a que el dropdown use tokens (evita el negro feo en light)
  const selectContentClass =
    'z-50 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-xl ' +
    'data-[state=open]:animate-in data-[state=closed]:animate-out ' +
    'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';

  const selectItemClass =
    'relative flex w-full cursor-default select-none items-center rounded-lg px-2 py-2 text-sm outline-none ' +
    'text-[var(--foreground)] ' +
    'data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ' +
    'data-[highlighted]:bg-[var(--muted)] data-[highlighted]:text-[var(--foreground)]';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg(null);

    // Track CTA siempre (click o Enter)
    track('cta_click', { place: 'waitlist_form', locale });

    const utm = loadUtm();

    const payload = {
      email: email.trim().toLowerCase(),
      phone: phone.trim() ? phone.trim() : undefined,
      name: name.trim() ? name.trim() : undefined,
      interest,
      locale,
      source,
      referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
      path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      ...utm,
    };

    track('waitlist_submit', { locale, source, interest });

    try {
      const rawApiBase =
        process.env.NEXT_PUBLIC_API_BASE ??
        process.env.NEXT_PUBLIC_API_URL ??
        'http://localhost:3001';

      const apiBase = rawApiBase.replace(/\/+$/, '');

      const res = await fetch(`${apiBase}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('bad_status');

      setStatus('success');
      track('waitlist_success', { locale, source });
    } catch {
      setStatus('error');
      setErrorMsg('No se pudo registrar. Revisa tu correo e inténtalo de nuevo.');
      track('waitlist_error', { locale, source });
    }
  }

  return (
    <div className={surface}>
      <div className={header}>
        <h3 className={title}>Únete a la beta</h3>
        <p className={subtitle}>Te avisamos cuando abramos cupos. Cero spam.</p>
      </div>

      <div className={body}>
        {status === 'success' ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700">
                ✓
              </div>

              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">¡Listo! Ya estás en la lista.</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Te contactaremos por email cuando habilitemos invitaciones.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`/${locale}/login`} className={btnOutline}>
                Iniciar sesión
              </a>

              <a href={`/${locale}/register`} className={btnPrimary} style={{ width: 'auto' }}>
                Crear cuenta
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {status === 'error' && errorMsg ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
                {errorMsg}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className={label}>
                  Nombre <span className="font-normal text-[var(--muted)]">(opcional)</span>
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={controlBase}
                  placeholder="José Pérez"
                  disabled={isBusy}
                  autoComplete="name"
                />
              </label>

              <label className="grid gap-1.5">
                <span className={label}>
                  WhatsApp <span className="font-normal text-[var(--muted)]">(opcional)</span>
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={controlBase}
                  placeholder="+58 412 1234567"
                  disabled={isBusy}
                  inputMode="tel"
                  autoComplete="tel"
                />
              </label>
            </div>

            <label className="grid gap-1.5">
              <span className={label}>Email</span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === 'error') {
                    setStatus('idle');
                    setErrorMsg(null);
                  }
                }}
                className={controlBase}
                placeholder="tu@correo.com"
                disabled={isBusy}
                autoComplete="email"
              />
              <span className={hint}>Usaremos este correo para enviarte la invitación.</span>
            </label>

            <label className="grid gap-1.5">
              <span className={label}>Me interesa</span>
              <Select
                disabled={isBusy}
                value={interest}
                onValueChange={(v) => setInterest(v as Interest)}
              >
                <SelectTrigger className={controlSelect}>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent className={selectContentClass + ' p-1'}>
                  <SelectItem className={selectItemClass} value="BOTH">
                    Fútbol + Béisbol
                  </SelectItem>
                  <SelectItem className={selectItemClass} value="SOCCER">
                    Fútbol
                  </SelectItem>
                  <SelectItem className={selectItemClass} value="BASEBALL">
                    Béisbol
                  </SelectItem>
                </SelectContent>
              </Select>

              <span className={hint}>Esto nos ayuda a priorizar las invitaciones.</span>
            </label>

            <button type="submit" disabled={isBusy} className={btnPrimary}>
              {isBusy ? 'Enviando…' : 'Unirme a la beta'}
            </button>

            <p className={hint}>Al registrarte aceptas recibir un email cuando abramos invitaciones.</p>
          </form>
        )}
      </div>
    </div>
  );
}