/**
 * Fire a Facebook (Meta) pixel standard event safely. No-op if the pixel
 * hasn't loaded yet, and never throws — analytics must never break the page.
 */
export function fbqEvent(event: string, params?: Record<string, unknown>): void {
  try {
    const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq;
    if (typeof fbq === "function") fbq("track", event, params);
  } catch {
    // ignore
  }
}
