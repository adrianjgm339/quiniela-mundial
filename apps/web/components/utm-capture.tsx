'use client';

import * as React from 'react';
import { saveUtm } from '@/lib/utm';
import { track } from '@/lib/track';

export function UtmCapture() {
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const utm = {
      utmSource: params.get('utm_source') || undefined,
      utmMedium: params.get('utm_medium') || undefined,
      utmCampaign: params.get('utm_campaign') || undefined,
      utmContent: params.get('utm_content') || undefined,
      utmTerm: params.get('utm_term') || undefined,
    };

    const hasAny = Object.values(utm).some(Boolean);
    if (hasAny) saveUtm(utm);

    track('landing_view', {
      path: window.location.pathname,
      hasUtm: hasAny,
    });
  }, []);

  return null;
}