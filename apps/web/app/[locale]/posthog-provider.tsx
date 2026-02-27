'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

    // Debug rápido (en dev)
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[posthog] env', { hasKey: Boolean(key), host });
    }

    if (!key || !host) return;

    posthog.init(key, {
      api_host: host,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      loaded: (ph) => {
        // Fuerza a exponerlo para que window.posthog NO sea undefined
        (window as any).posthog = ph;

        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.log('[posthog] loaded');
        }
      },
    });
  }, []);

  return <>{children}</>;
}