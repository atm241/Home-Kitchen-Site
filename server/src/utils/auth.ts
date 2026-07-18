import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = '30d';

export interface TokenPayload {
  userId: number;
  householdId: number;
}

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, 12);

export const comparePassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);

export const signToken = (payload: TokenPayload): string => {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
};

export const verifyToken = (token: string): TokenPayload => {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
};

export const generateInviteCode = (): string =>
  Math.random().toString(36).slice(2, 10);
