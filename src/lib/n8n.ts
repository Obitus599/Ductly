import { supabaseAdmin } from "@/utils/supabase/admin";

/**
 * Fire-and-forget POST to an n8n webhook, with failure logging to the
 * error_log table so we can see which notifications never went out.
 *
 * Returns immediately — does NOT block the caller. Internally it
 * awaits the response just long enough to check status, then writes a
 * row to error_log on any failure. The original 30s Stripe webhook
 * timeout is unaffected because Next.js will keep the function alive
 * after we've returned the response (edge runtime semantics).
 *
 * `payload` is also stored so we can debug or replay later if we
 * eventually build a retry queue.
 */
export function fireN8nWebhook(
  flowName: string,
  url: string,
  payload: Record<string, unknown>
): void {
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`n8n returned ${res.status} ${body.slice(0, 200)}`);
      }
    })
    .catch(async (err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`n8n ${flowName} webhook failed:`, message);
      try {
        await supabaseAdmin.from("error_log").insert({
          flow_name: `n8n_${flowName}`,
          error_message: message,
          payload,
        } as never);
      } catch (logErr) {
        // Last resort — if even error_log fails, we have a bigger
        // problem (DB down). Don't throw, just stderr.
        console.error("error_log insert also failed:", logErr);
      }
    });
}
