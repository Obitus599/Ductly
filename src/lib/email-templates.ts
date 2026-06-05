/**
 * Server-side email rendering.
 *
 * These functions return finished strings — no placeholder syntax of any
 * kind survives into the output, so there is nothing for a downstream
 * relay to mis-render. The code is always 6 digits (see generateCode),
 * so no escaping is required, but we keep interpolation minimal regardless.
 */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderVerificationEmail(code: string, ttlMinutes: number): RenderedEmail {
  const subject = `Your Ductly verification code: ${code}`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f7f8fa; padding: 40px 20px;">
<div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 2px solid #eef0f4; padding: 40px; text-align: center;">
  <img src="https://ductly.ae/images/logo.png" alt="Ductly" style="height: 36px; margin-bottom: 24px;" />
  <h1 style="font-size: 22px; color: #3d3d3d; margin: 0 0 8px;">Verify your email</h1>
  <p style="color: #a0a5af; font-size: 14px; margin: 0 0 24px;">Enter this code on the Ductly booking page to confirm your email address.</p>
  <div style="font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #3d3d3d; background: #fcfcfc; border: 1px solid #f4f4f4; border-radius: 12px; padding: 18px 0; margin-bottom: 20px;">${code}</div>
  <p style="font-size: 13px; color: #a0a5af;">This code expires in ${ttlMinutes} minutes. If you didn't request it, you can safely ignore this email.</p>
</div>
</body>
</html>`;

  const text = `Verify your email

Your Ductly verification code is: ${code}

Enter this code on the Ductly booking page to confirm your email address.
This code expires in ${ttlMinutes} minutes. If you didn't request it, you can safely ignore this email.`;

  return { subject, html, text };
}
