type TrackProps = Record<string, unknown>;

type PosthogCapture = (event: string, properties?: Record<string, unknown>) => void;

// Type guard: verifica si un valor es un objeto con .capture
function hasCapture(v: unknown): v is { capture: PosthogCapture } {
  return typeof v === "object" && v !== null && "capture" in v && typeof (v as { capture?: unknown }).capture === "function";
}

export function track(event: string, props: TrackProps = {}) {
  try {
    if (typeof window !== "undefined") {
      const ph: unknown = (window as unknown as { posthog?: unknown }).posthog;
      if (hasCapture(ph)) {
        ph.capture(event, props);
      }
    }
  } catch {
    // swallow
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`[track] ${event}`, props);
  }
}