/**
 * Email provider abstraction.
 * Implement this interface to swap providers (Resend, SendGrid, etc.)
 */
export interface EmailProvider {
  send(opts: SendEmailOptions): Promise<void>;
}

export interface SendEmailOptions {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}

// ── Resend (default) ──────────────────────────────────────────────────────────

export class ResendEmailProvider implements EmailProvider {
  constructor(private readonly apiKey: string) {}

  async send(opts: SendEmailOptions): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: opts.from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend API error ${res.status}: ${body}`);
    }
  }
}

// ── Magic-link email template ─────────────────────────────────────────────────

export function buildMagicLinkEmail(
  magicLinkUrl: string,
  expiresMinutes = 15
): { html: string; text: string } {
  const text = `Sign in to XupaStack\n\nClick this link to sign in (expires in ${expiresMinutes} minutes):\n${magicLinkUrl}\n\nIf you did not request this, you can safely ignore this email.`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Sign in to XupaStack</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:24px;color:#1a1a1a">
  <h1 style="font-size:24px;margin-bottom:8px">Sign in to XupaStack</h1>
  <p style="color:#555;margin-bottom:24px">Click the button below to sign in. This link expires in ${expiresMinutes} minutes.</p>
  <a href="${magicLinkUrl}" style="display:inline-block;background:#0f0f0f;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Sign in</a>
  <p style="margin-top:24px;font-size:13px;color:#999">Or copy this URL into your browser:<br><a href="${magicLinkUrl}" style="color:#555">${magicLinkUrl}</a></p>
  <hr style="margin:32px 0;border:none;border-top:1px solid #eee">
  <p style="font-size:12px;color:#bbb">If you did not request this email, you can safely ignore it.</p>
</body>
</html>`;

  return { html, text };
}
