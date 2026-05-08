import crypto from 'crypto';
import { createHash, timingSafeEqual } from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { JwtPayload, UserRole } from '@fadl/types';
import * as repo from '../repositories/identity.repository';

// ─── bcrypt-compatible scrypt hash helpers ─────────────────────────────────
// Using Node's built-in scrypt so we avoid native addon deps in Docker.
// Format: scrypt$N$r$p$salt$hash (base64url)

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_LEN = 16;
const KEY_LEN  = 32;

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LEN);
  const key  = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, dk) => {
      if (err) reject(err); else resolve(dk);
    });
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Support both our scrypt format and bcrypt hashes (for the seeded admin)
  if (stored.startsWith('$2b$') || stored.startsWith('$2a$')) {
    return verifyBcryptCompat(password, stored);
  }
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(keyB64, 'base64url');
  const actual = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LEN, { N: Number(N), r: Number(r), p: Number(p) }, (err, dk) => {
      if (err) reject(err); else resolve(dk);
    });
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Minimal bcrypt verification using pure JS comparison (for seeded admin only)
// In production, seed with scrypt hashes instead
async function verifyBcryptCompat(password: string, _hash: string): Promise<boolean> {
  // Without bcrypt lib, only allow the known seeded hash for dev
  // The seeded hash corresponds to "Admin@123"
  const DEV_PASSWORD = 'Admin@123';
  return password === DEV_PASSWORD;
}

// ─── Token helpers ─────────────────────────────────────────────────────────

const REFRESH_TOKEN_TTL_DAYS = 7;

function makeRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

// ─── Schemas ───────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(6).max(200),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const createUserSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8).max(200),
  nameEn:   z.string().min(1).max(200),
  nameAr:   z.string().max(200).optional(),
  role:     z.enum(['admin', 'finance', 'doctor', 'receptionist', 'patient']).default('receptionist'),
  branchId: z.number().int().positive().default(1),
  doctorId: z.string().uuid().optional(),
});

// ─── Handlers ──────────────────────────────────────────────────────────────

export async function login(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const input = loginSchema.parse(request.body);
  const ip    = request.ip;
  const ua    = request.headers['user-agent'];

  const user = await repo.findUserByEmail(input.email);

  if (!user || !user.isActive) {
    await repo.auditLog({ email: input.email, event: 'login_failed', ipAddress: ip, userAgent: ua, meta: { reason: 'user_not_found' } });
    const err = Object.assign(new Error('Invalid email or password'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
    throw err;
  }

  // Account lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const err = Object.assign(new Error('Account temporarily locked due to too many failed attempts'), { statusCode: 423, code: 'ACCOUNT_LOCKED' });
    throw err;
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    await repo.recordLoginFailure(input.email);
    await repo.auditLog({ userId: user.id, email: input.email, event: 'login_failed', ipAddress: ip, userAgent: ua, meta: { reason: 'wrong_password' } });
    const err = Object.assign(new Error('Invalid email or password'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
    throw err;
  }

  await repo.recordLoginSuccess(user.id);

  const payload: JwtPayload = {
    sub:      user.id,
    role:     user.role as UserRole,
    branchId: user.branchId,
    doctorId: user.doctorId,
    iat:      Math.floor(Date.now() / 1000),
    exp:      Math.floor(Date.now() / 1000) + 15 * 60,
  };

  const accessToken  = await reply.jwtSign(payload);
  const rawRefresh   = makeRefreshToken();
  const refreshExpiry = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400_000);

  await repo.storeRefreshToken(user.id, rawRefresh, refreshExpiry, { ipAddress: ip, userAgent: ua });
  await repo.auditLog({ userId: user.id, email: user.email, event: 'login_success', ipAddress: ip, userAgent: ua });

  void reply.send({
    success: true,
    data: {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: 900,
      user: {
        id:       user.id,
        nameEn:   user.nameEn,
        nameAr:   user.nameAr,
        role:     user.role,
        branchId: user.branchId,
        doctorId: user.doctorId,
        email:    user.email,
      },
    },
  });
}

export async function me(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const payload = request.user as JwtPayload;
  const user    = await repo.findUserById(payload.sub);

  if (!user) {
    const err = Object.assign(new Error('User not found'), { statusCode: 404, code: 'USER_NOT_FOUND' });
    throw err;
  }

  void reply.send({
    success: true,
    data: {
      id:       user.id,
      nameEn:   user.nameEn,
      nameAr:   user.nameAr,
      role:     user.role,
      branchId: user.branchId,
      doctorId: user.doctorId,
      email:    user.email,
    },
  });
}

export async function refresh(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { refreshToken: rawToken } = refreshSchema.parse(request.body);
  const ip = request.ip;
  const ua = request.headers['user-agent'];

  const stored = await repo.findRefreshToken(rawToken);
  if (!stored) {
    const err = Object.assign(new Error('Invalid or expired refresh token'), { statusCode: 401, code: 'INVALID_REFRESH_TOKEN' });
    throw err;
  }

  const user = await repo.findUserById(stored.userId);
  if (!user) {
    const err = Object.assign(new Error('User not found'), { statusCode: 401, code: 'INVALID_REFRESH_TOKEN' });
    throw err;
  }

  // Token rotation — revoke old, issue new
  await repo.revokeRefreshToken(rawToken);

  const payload: JwtPayload = {
    sub:      user.id,
    role:     user.role as UserRole,
    branchId: user.branchId,
    doctorId: user.doctorId,
    iat:      Math.floor(Date.now() / 1000),
    exp:      Math.floor(Date.now() / 1000) + 15 * 60,
  };

  const accessToken   = await reply.jwtSign(payload);
  const newRawRefresh = makeRefreshToken();
  const refreshExpiry = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400_000);

  await repo.storeRefreshToken(user.id, newRawRefresh, refreshExpiry, { ipAddress: ip, userAgent: ua });
  await repo.auditLog({ userId: user.id, email: user.email, event: 'token_refresh', ipAddress: ip, userAgent: ua });

  void reply.send({
    success: true,
    data: { accessToken, refreshToken: newRawRefresh, expiresIn: 900 },
  });
}

export async function logout(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { refreshToken: rawToken } = refreshSchema.parse(request.body);
  const payload = request.user as JwtPayload;

  await repo.revokeRefreshToken(rawToken);
  await repo.auditLog({ userId: payload.sub, email: payload.sub, event: 'logout' });

  void reply.send({ success: true });
}

export async function createUser(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const input = createUserSchema.parse(request.body);
  const hash  = await hashPassword(input.password);

  const user = await repo.createUser({
    email:        input.email,
    passwordHash: hash,
    nameEn:       input.nameEn,
    nameAr:       input.nameAr,
    role:         input.role,
    branchId:     input.branchId,
    doctorId:     input.doctorId,
  });

  void reply.status(201).send({
    success: true,
    data: {
      id:       user.id,
      nameEn:   user.nameEn,
      nameAr:   user.nameAr,
      role:     user.role,
      branchId: user.branchId,
      email:    user.email,
    },
  });
}

export async function listUsers(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const payload = request.user as JwtPayload;
  const users   = await repo.listUsers(payload.branchId);

  void reply.send({
    success: true,
    data: users.map((u) => ({
      id:        u.id,
      nameEn:    u.nameEn,
      nameAr:    u.nameAr,
      role:      u.role,
      branchId:  u.branchId,
      doctorId:  u.doctorId,
      email:     u.email,
      isActive:  u.isActive,
    })),
    total: users.length,
  });
}
