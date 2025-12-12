import { Router } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').optional(),
});

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);

    // Check if user already exists
    const existingUsers = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ 
        error: 'El email ya está registrado' 
      });
    }

    // Hash password
    const passwordHash = await argon2.hash(password);

    // Create user
    const result = await query(
      'INSERT INTO users (email, password_hash, name, subscription_plan, storage_used, storage_limit, ai_credits_used, ai_credits_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [email, passwordHash, name || null, 'free', 0, 26843545600, 0, 100] // 25GB, 100 créditos
    );

    const userId = (result as any).insertId;

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const token = jwt.sign(
      { userId, email, subscriptionPlan: 'free' },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId, type: 'refresh' },
      jwtSecret,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d' } as jwt.SignOptions
    );

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    await query(
      'INSERT INTO sessions (user_id, refresh_token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, await argon2.hash(refreshToken), expiresAt]
    );

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: {
        id: userId,
        email,
        name: name || null,
        subscriptionPlan: 'free',
        storageUsed: 0,
        storageLimit: 26843545600, // 25GB
        aiCreditsUsed: 0,
        aiCreditsLimit: 100
      },
      token,
      refreshToken
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Datos inválidos', 
        details: error.errors 
      });
    }
    
    console.error('Register error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Find user
    const users = await query(
      'SELECT id, email, password_hash, name, subscription_plan, storage_used, storage_limit FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ 
        error: 'Credenciales inválidas' 
      });
    }

    const user = users[0] as any;

    // Verify password
    const isValidPassword = await argon2.verify(user.password_hash, password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Credenciales inválidas' 
      });
    }

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const token = jwt.sign(
      { userId: user.id, email: user.email, subscriptionPlan: user.subscription_plan },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      jwtSecret,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d' } as jwt.SignOptions
    );

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    await query(
      'INSERT INTO sessions (user_id, refresh_token_hash, expires_at) VALUES (?, ?, ?)',
      [user.id, await argon2.hash(refreshToken), expiresAt]
    );

    res.json({
      message: 'Login exitoso',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscriptionPlan: user.subscription_plan,
        storageUsed: user.storage_used,
        storageLimit: user.storage_limit,
        aiCreditsUsed: user.ai_credits_used || 0,
        aiCreditsLimit: user.ai_credits_limit || 100
      },
      token,
      refreshToken
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Datos inválidos', 
        details: error.errors 
      });
    }
    
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Invalidate refresh token
      await query(
        'DELETE FROM sessions WHERE refresh_token_hash = ?',
        [await argon2.hash(refreshToken)]
      );
    }

    res.json({ message: 'Logout exitoso' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token requerido' });
    }

    // Verify refresh token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const decoded = jwt.verify(refreshToken, jwtSecret) as any;
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Check if refresh token exists in database
    const sessions = await query(
      'SELECT s.*, u.email, u.subscription_plan FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.user_id = ? AND s.expires_at > NOW()',
      [decoded.userId]
    );

    if (sessions.length === 0) {
      return res.status(401).json({ error: 'Refresh token inválido o expirado' });
    }

    // Generate new access token (jwtSecret already declared above)
    const newToken = jwt.sign(
      { userId: decoded.userId, email: sessions[0].email, subscriptionPlan: sessions[0].subscription_plan },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
    );

    res.json({
      token: newToken,
      user: {
        id: decoded.userId,
        email: sessions[0].email,
        subscriptionPlan: sessions[0].subscription_plan
      }
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({ error: 'Token inválido' });
  }
});

// Get user profile with credits
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const users = await query(
      'SELECT id, email, name, subscription_plan, storage_used, storage_limit, ai_credits_used, ai_credits_limit, avatar_url FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = users[0] as any;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscriptionPlan: user.subscription_plan,
        storageUsed: user.storage_used,
        storageLimit: user.storage_limit,
        aiCreditsUsed: user.ai_credits_used || 0,
        aiCreditsLimit: user.ai_credits_limit || 100,
        avatarUrl: user.avatar_url
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
