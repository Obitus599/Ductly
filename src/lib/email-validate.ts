/**
 * Shared email validation.
 *
 * The old inline regex (`/^[^@\s]+@[^@\s]+\.[^@\s]+$/`, copied into four
 * routes) accepted commas, parentheses, and PostgREST operator tokens in
 * the local part. Because a customer's email is later interpolated into
 * DB-side filter expressions and rate-limit keys, that was an injection
 * vector as much as a validation gap.
 *
 * This validator rejects whitespace and the punctuation that would let an
 * address escape a value context (`, ( ) < > " ' ; :`), and caps length at
 * the RFC 5321 maximum of 254. Ordinary addresses — including `+` tags,
 * dots, and hyphens — pass unchanged.
 */
export const MAX_EMAIL_LEN = 254;

// Local and domain parts: any char except whitespace, @, and the
// separator/quoting punctuation that enables injection. Domain must
// contain at least one dot with a 2+ char final label.
const EMAIL_RE =
  /^[^\s@,()<>"';:]+@[^\s@,()<>"';:]+\.[^\s@,()<>"';:]{2,}$/;

export function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const email = value.trim();
  if (email.length === 0 || email.length > MAX_EMAIL_LEN) return false;
  return EMAIL_RE.test(email);
}
