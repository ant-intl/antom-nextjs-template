import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = '__Host-antom-airtable';
const SESSION_SECONDS = 60 * 60;
interface Session { version: 1; exp: number; nonce: string; binding: string }

function mac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function constantEqual(left: string, right: string): boolean {
  return timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest());
}

export function issueSession(secret: string, binding: string, now = Date.now()): string {
  const value = Buffer.from(JSON.stringify({ version: 1, exp: Math.floor(now / 1000) + SESSION_SECONDS,
    nonce: randomBytes(24).toString('base64url'), binding })).toString('base64url');
  return `${value}.${mac(secret, `session:${value}`)}`;
}

export function verifySession(token: string, secret: string, binding: string, now = Date.now()): boolean {
  if (token.length > 2048) return false;
  const parts = token.split('.');
  if (parts.length !== 2 || !constantEqual(parts[1], mac(secret, `session:${parts[0]}`))) return false;
  try {
    const data: Session = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const seconds = Math.floor(now / 1000);
    return data.version === 1 && data.binding === binding && /^[A-Za-z0-9_-]{32}$/.test(data.nonce)
      && Number.isInteger(data.exp) && data.exp > seconds && data.exp <= seconds + SESSION_SECONDS;
  } catch { return false; }
}

export function csrfToken(token: string, secret: string): string { return mac(secret, `csrf:${token}`); }
export function verifyCsrf(value: string, token: string, secret: string): boolean {
  return value.length <= 256 && constantEqual(value, csrfToken(token, secret));
}
export function sessionCookie(token: string, clear = false): string {
  return `${SESSION_COOKIE}=${clear ? '' : token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}`;
}
export function readSessionCookie(request: Request): string {
  const matches = (request.headers.get('cookie') || '').split(';').map(v => v.trim())
    .filter(v => v.startsWith(`${SESSION_COOKIE}=`));
  return matches.length === 1 ? matches[0].slice(SESSION_COOKIE.length + 1) : '';
}
