import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { UserRole } from '../../shared/types.ts';

const SCRYPT_KEY_LEN = 64;

// Server-only signing key: reads process.env.JWT_SECRET or falls back to an
// ephemeral cryptographically random per-process key (never hardcoded).
const RUNTIME_JWT_SECRET =
  process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16
    ? process.env.JWT_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

const JWT_EXPIRES_IN = '12h';

export interface JwtPayloadData {
  sub: number;
  uid: string;
  email: string;
  role: UserRole;
  name: string;
}

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, SCRYPT_KEY_LEN, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

export function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const parts = storedHash.split(':');
    if (parts.length !== 2) {
      return resolve(false);
    }
    const [salt, expectedHex] = parts;
    if (!salt || !expectedHex) {
      return resolve(false);
    }
    crypto.scrypt(password, salt, SCRYPT_KEY_LEN, (err, derivedKey) => {
      if (err) return reject(err);
      const expectedBuf = Buffer.from(expectedHex, 'hex');
      if (expectedBuf.length !== derivedKey.length) {
        return resolve(false);
      }
      resolve(crypto.timingSafeEqual(expectedBuf, derivedKey));
    });
  });
}

export function signAuthToken(payload: JwtPayloadData): string {
  return jwt.sign(payload, RUNTIME_JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'resolvedesk-api',
  });
}

export function verifyAuthToken(token: string): JwtPayloadData {
  const decoded = jwt.verify(token, RUNTIME_JWT_SECRET, {
    issuer: 'resolvedesk-api',
  });
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid JWT payload');
  }
  const sub = Number(decoded.sub);
  const uid = String((decoded as Record<string, unknown>).uid ?? '');
  const email = String((decoded as Record<string, unknown>).email ?? '');
  const role = String((decoded as Record<string, unknown>).role ?? 'USER') as UserRole;
  const name = String((decoded as Record<string, unknown>).name ?? '');
  if (!Number.isInteger(sub) || sub <= 0 || !uid || !email) {
    throw new Error('Malformed JWT claims');
  }
  return { sub, uid, email, role, name };
}

export function safeCompareSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function generateLocalUid(): string {
  return `local_${crypto.randomUUID()}`;
}
