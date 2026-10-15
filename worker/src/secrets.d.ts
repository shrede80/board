declare namespace Cloudflare {
  interface Env {
    /** HMAC key for session cookies (wrangler secret). */
    SESSION_SECRET: string;
    /** One-time code that unlocks /setup until a password exists (wrangler secret). */
    SETUP_TOKEN?: string;
  }
}
