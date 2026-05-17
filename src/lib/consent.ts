// Bump this when the privacy policy changes materially. The customer's
// stored consent_version gets refreshed on their next booking — that's
// how we prove they consented to the current terms.
export const CURRENT_CONSENT_VERSION = "2026-05-17";

// Sentinel used by admin-created bookings (verbal/phone consent recorded
// by an operator, not a UI tick).
export const ADMIN_RECORDED_CONSENT_VERSION = "admin-recorded";
