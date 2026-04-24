import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import type { JwtPayload, UserRole } from '../types/index.js';

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET is required');

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface SignTokenInput {
  userId: string;
  role: UserRole;
}

export interface SignedToken {
  token: string;
  jti: string;
  expiresAt: Date;
}

export function signToken({ userId, role }: SignTokenInput): SignedToken {
  const jti = nanoid();
  const token = jwt.sign(
    { sub: userId, role, jti },
    SECRET as string,
    { expiresIn: EXPIRES_IN } as jwt.SignOptions
  );
  const decoded = jwt.decode(token) as JwtPayload;
  return {
    token,
    jti,
    expiresAt: new Date(decoded.exp * 1000),
  };
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET as string) as JwtPayload;
}
