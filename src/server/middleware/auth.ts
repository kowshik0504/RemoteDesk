import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { users } from '../../db/schema.ts';
import { adminAuth } from '../../lib/firebase-admin.ts';
import { verifyAuthToken } from '../utils/security.ts';
import { normalizeEmail } from '../domain/rules.ts';
import type { AuthUser, UserRole } from '../../shared/types.ts';

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
}

async function getOrCreateFirebaseUser(
  uid: string,
  rawEmail: string,
  rawName?: string
): Promise<AuthUser> {
  const email = normalizeEmail(rawEmail);
  const displayName = rawName?.trim() || email.split('@')[0] || 'Helpdesk User';

  // If no admin exists yet, the first Google Sign-In user can be checked;
  // otherwise default new sign-ins to USER unless already existing with ADMIN role.
  const existingByEmail = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingByEmail.length > 0) {
    const existing = existingByEmail[0];
    return {
      id: existing.id,
      uid: existing.uid,
      name: existing.name,
      email: existing.email,
      role: existing.role as UserRole,
      authProvider: existing.authProvider,
      createdAt: existing.createdAt.toISOString(),
    };
  }

  const existingAdmins = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'ADMIN'))
    .limit(1);

  const assignedRole: UserRole = existingAdmins.length === 0 ? 'ADMIN' : 'USER';

  const [upserted] = await db
    .insert(users)
    .values({
      uid,
      name: displayName,
      email,
      role: assignedRole,
      authProvider: 'FIREBASE',
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email,
        name: displayName,
        updatedAt: new Date(),
      },
    })
    .returning();

  return {
    id: upserted.id,
    uid: upserted.uid,
    name: upserted.name,
    email: upserted.email,
    role: upserted.role as UserRole,
    authProvider: upserted.authProvider,
    createdAt: upserted.createdAt.toISOString(),
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required. Please sign in to continue.',
      code: 'UNAUTHORIZED',
    });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({
      error: 'Missing authentication token.',
      code: 'UNAUTHORIZED',
    });
  }

  // 1. Attempt local JWT verification first
  try {
    const payload = verifyAuthToken(token);
    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!dbUser) {
      return res.status(401).json({
        error: 'Session account no longer exists. Please sign in again.',
        code: 'UNAUTHORIZED',
      });
    }

    req.authUser = {
      id: dbUser.id,
      uid: dbUser.uid,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role as UserRole,
      authProvider: dbUser.authProvider,
      createdAt: dbUser.createdAt.toISOString(),
    };
    return next();
  } catch {
    // Fall through to Firebase ID Token verification
  }

  // 2. Attempt Firebase Auth ID token verification (Google Sign-In)
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email) {
      return res.status(401).json({
        error: 'Verified Google account is missing an email address.',
        code: 'UNAUTHORIZED',
      });
    }
    const syncedUser = await getOrCreateFirebaseUser(
      decoded.uid,
      decoded.email,
      decoded.name
    );
    req.authUser = syncedUser;
    return next();
  } catch {
    return res.status(401).json({
      error: 'Invalid or expired authentication token.',
      code: 'UNAUTHORIZED',
    });
  }
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.authUser) {
    return res.status(401).json({
      error: 'Authentication required.',
      code: 'UNAUTHORIZED',
    });
  }
  if (req.authUser.role !== 'ADMIN') {
    return res.status(403).json({
      error: 'Administrator privileges are required for this action.',
      code: 'FORBIDDEN',
    });
  }
  return next();
}
