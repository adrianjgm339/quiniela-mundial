type TrackProps = Record<string, any>;

export function track(event: string, props: Record<string, any> = {}) {
  try {
    if (typeof window !== 'undefined' && (window as any).posthog?.capture) {
      (window as any).posthog.capture(event, props);
    }
  } catch {}

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[track] ${event}`, props);
  }
}