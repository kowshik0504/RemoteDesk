import { Router } from 'express';
import { count, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { users } from '../../db/schema.ts';
import {
  claimAdminSchema,
  loginSchema,
  registerSchema,
} from '../validators/schemas.ts';
import {
  generateLocalUid,
  hashPassword,
  safeCompareSecret,
  signAuthToken,
  verifyPassword,
} from '../utils/security.ts';
import { normalizeEmail } from '../domain/rules.ts';
import { AppError } from '../middleware/errorHandler.ts';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.ts';
import type { AuthUser, UserRole } from '../../shared/types.ts';

const router = Router();

function serializeUser(row: typeof users.$inferSelect): AuthUser {
  return {
    id: row.id,
    uid: row.uid,
    name: row.name,
    email: row.email,
    role: row.role as UserRole,
    authProvider: row.authProvider,
    createdAt: row.createdAt.toISOString(),
  };
}

// GET /api/auth/admin-status — Checks whether an admin exists and if a passcode is required
router.get('/admin-status', async (_req, res, next) => {
  try {
    const [{ value }] = await db
      .select({ value: count() })
      .from(users)
      .where(eq(users.role, 'ADMIN'));

    const configuredPasscode = process.env.ADMIN_SETUP_PASSCODE?.trim() ?? '';
    const hasAdmin = Number(value) > 0;
    const passcodeRequired = configuredPasscode.length > 0;

    return res.json({
      hasAdmin,
      passcodeRequired,
      canClaimFirstAdmin: !hasAdmin || passcodeRequired,
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/claim-admin — One-time first-run admin bootstrap (or passcode-protected admin signup)
router.post('/claim-admin', async (req, res, next) => {
  try {
    const parsed = claimAdminSchema.parse(req.body);
    const email = normalizeEmail(parsed.email);
    const configuredPasscode = process.env.ADMIN_SETUP_PASSCODE?.trim() ?? '';

    if (configuredPasscode.length > 0) {
      if (
        !parsed.passcode ||
        !safeCompareSecret(parsed.passcode, configuredPasscode)
      ) {
        throw new AppError(
          403,
          'Invalid administrator setup passcode.',
          'INVALID_ADMIN_PASSCODE'
        );
      }
    }

    const existingEmail = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingEmail.length > 0) {
      throw new AppError(
        409,
        'An account with this email address already exists.',
        'EMAIL_TAKEN'
      );
    }

    const passwordHash = await hashPassword(parsed.password);
    const uid = generateLocalUid();

    // Perform check + insert inside a transaction to prevent race-condition double claims
    const created = await db.transaction(async (tx) => {
      if (configuredPasscode.length === 0) {
        const [{ value: adminCount }] = await tx
          .select({ value: count() })
          .from(users)
          .where(eq(users.role, 'ADMIN'));

        if (Number(adminCount) > 0) {
          throw new AppError(
            403,
            'An administrator account has already been set up. Sign in as an existing administrator or configure ADMIN_SETUP_PASSCODE.',
            'ADMIN_ALREADY_CLAIMED'
          );
        }
      }

      const [row] = await tx
        .insert(users)
        .values({
          uid,
          name: parsed.name,
          email,
          passwordHash,
          role: 'ADMIN',
          authProvider: 'LOCAL',
        })
        .returning();

      return row;
    });

    const user = serializeUser(created);
    const token = signAuthToken({
      sub: user.id,
      uid: user.uid,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return res.status(201).json({ token, user });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/register — Registers a standard USER account with scrypt password hash & JWT
router.post('/register', async (req, res, next) => {
  try {
    const parsed = registerSchema.parse(req.body);
    const email = normalizeEmail(parsed.email);

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      throw new AppError(
        409,
        'An account with this email address already exists.',
        'EMAIL_TAKEN'
      );
    }

    const passwordHash = await hashPassword(parsed.password);
    const uid = generateLocalUid();

    const [created] = await db
      .insert(users)
      .values({
        uid,
        name: parsed.name,
        email,
        passwordHash,
        role: 'USER',
        authProvider: 'LOCAL',
      })
      .returning();

    const user = serializeUser(created);
    const token = signAuthToken({
      sub: user.id,
      uid: user.uid,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return res.status(201).json({ token, user });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/login — Authenticates email/password and returns a signed JWT
router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.parse(req.body);
    const email = normalizeEmail(parsed.email);

    const [found] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!found || !found.passwordHash) {
      throw new AppError(
        401,
        'Invalid email address or password.',
        'INVALID_CREDENTIALS'
      );
    }

    const isValid = await verifyPassword(parsed.password, found.passwordHash);
    if (!isValid) {
      throw new AppError(
        401,
        'Invalid email address or password.',
        'INVALID_CREDENTIALS'
      );
    }

    const user = serializeUser(found);
    const token = signAuthToken({
      sub: user.id,
      uid: user.uid,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return res.json({ token, user });
  } catch (err) {
    return next(err);
  }
});

// GET /api/auth/me — Returns current authenticated user profile (JWT or Firebase ID Token)
router.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  return res.json({ user: req.authUser });
});

export default router;
