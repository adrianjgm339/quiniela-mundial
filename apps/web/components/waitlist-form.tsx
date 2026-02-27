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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/waitlist`, {
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
    <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Únete a la beta</h3>
        <p className="text-sm text-muted-foreground">Te avisamos cuando abramos cupos. Cero spam.</p>
      </div>

      {status === 'success' ? (
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="font-medium text-foreground">¡Listo! Ya estás en la lista.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Te contactaremos por email cuando habilitemos invitaciones.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={`/${locale}/login`}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Iniciar sesión
            </a>

            <a
              href={`/${locale}/register`}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-95"
            >
              Crear cuenta
            </a>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          {status === 'error' && errorMsg ? (
            <div className="rounded-xl border border-border bg-background p-3 text-sm text-foreground">
              {errorMsg}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 pb-2 text-sm text-foreground">
              Nombre (opcional)
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 appearance-none rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-70 disabled:cursor-not-allowed"
                placeholder="José Pérez"
                disabled={isBusy}
              />
            </label>

            <label className="grid gap-1 pb-2 text-sm text-foreground">
              WhatsApp (opcional)
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-10 appearance-none rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-70 disabled:cursor-not-allowed"
                placeholder="+58 412 1234567"
                disabled={isBusy}
              />
            </label>
          </div>

          <label className="grid gap-1 pb-2 text-sm text-foreground">
            Email
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
              className="h-10 appearance-none rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-70 disabled:cursor-not-allowed"
              placeholder="tu@correo.com"
              disabled={isBusy}
            />
          </label>

          <label className="grid gap-1 pb-8 text-sm text-foreground">
            Me interesa
            <Select
              disabled={isBusy}
              value={interest}
              onValueChange={(v) => setInterest(v as Interest)}
            >
              <SelectTrigger className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="BOTH">Fútbol + Béisbol</SelectItem>
                <SelectItem value="SOCCER">Fútbol</SelectItem>
                <SelectItem value="BASEBALL">Béisbol</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <button
            type="submit"
            disabled={isBusy}
            className="mt-2 h-10 w-full rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isBusy ? 'Enviando…' : 'Unirme a la beta'}
          </button>

          <p className="text-xs text-muted-foreground">
            Al registrarte aceptas recibir un email cuando abramos invitaciones.
          </p>
        </form>
      )}
    </div>
  );
}