/**
 * Shared admin-token authorization.
 *
 * A valid Supabase session only proves the caller is SOME user in the
 * project. It is not proof they are an admin. Public sign-up is on by
 * default on hosted Supabase, so "the token authenticates" and "the token
 * is authorized for the admin plane" are completely different claims, and
 * conflating them let anyone who could register an account act as admin.
 *
 * A caller is an admin only if the verified user carries an explicit admin
 * marker:
 *   - app_metadata.role === "admin"  (a claim only the service role can
 *     set — a user cannot grant it to themselves), OR
 *   - their email is in the ADMIN_EMAILS allowlist (comma-separated env).
 *
 * Both requireAdmin (API routes) and middleware (page routes) call this so
 * they cannot drift apart.
 */

interface SupabaseUser {
  id?: string;
  email?: string;
  role?: string;
  // Supabase's User type declares app_metadata loosely; index into it
  // defensively rather than assuming a shape.
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}

function adminEmailAllowlist(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** True iff the resolved Supabase user is authorized for the admin plane. */
export function isAdminUser(user: SupabaseUser | null | undefined): boolean {
  if (!user) return false;

  // `role` at the top level is Supabase's Postgres role ("authenticated"),
  // NOT an application role — never trust it for authz. Only app_metadata
  // (service-role-writable) counts.
  const meta = user.app_metadata ?? {};
  if (meta.role === "admin") return true;
  const roles = meta.roles;
  if (Array.isArray(roles) && roles.includes("admin")) return true;

  const allow = adminEmailAllowlist();
  if (allow.size > 0 && user.email && allow.has(user.email.toLowerCase())) {
    return true;
  }

  return false;
}

/**
 * Resolve an admin-token cookie to an authorized admin, or null.
 *
 * Fails CLOSED on every uncertain path: bad config, non-2xx from Supabase,
 * unparseable body, network error, or a valid-but-not-admin user. Returns
 * the user object on success so callers can log/attribute the action.
 */
export async function verifyAdminToken(token: string): Promise<SupabaseUser | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;

    const user = (await res.json()) as SupabaseUser;
    return isAdminUser(user) ? user : null;
  } catch {
    // Network failure / timeout / malformed body — fail closed.
    return null;
  }
}
