import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        subscriptionPlan: string;
        storageUsed: number;
        storageLimit: number;
        aiCreditsUsed?: number;
        aiCreditsLimit?: number;
      };
    }
  }
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    if (!token && typeof req.query.token === 'string') {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Token de acceso requerido' });
    }

    // Verify token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const decoded = jwt.verify(token, jwtSecret) as any;

    // Get user from database
    const users = await query(
      'SELECT id, email, subscription_plan, storage_used, storage_limit, ai_credits_used, ai_credits_limit FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    const user = users[0] as any;

    // Add user to request
    req.user = {
      id: user.id,
      email: user.email,
      subscriptionPlan: user.subscription_plan,
      storageUsed: user.storage_used,
      storageLimit: user.storage_limit
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ error: 'Token inválido' });
  }
};

export const checkStorageLimit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const fileSize = req.body.fileSize || 0;
    const newStorageUsed = req.user.storageUsed + fileSize;

    if (newStorageUsed > req.user.storageLimit) {
      return res.status(413).json({ 
        error: 'Límite de almacenamiento excedido',
        currentUsage: req.user.storageUsed,
        limit: req.user.storageLimit,
        requestedSize: fileSize,
        availableSpace: req.user.storageLimit - req.user.storageUsed
      });
    }

    next();
  } catch (error) {
    console.error('Storage limit check error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
