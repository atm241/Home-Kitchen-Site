import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      householdId?: number;
    }
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    req.householdId = payload.householdId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
