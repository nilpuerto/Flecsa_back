import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { query } from '../config/db.js';

const router = Router();

const redirectUri =
  process.env.GOOGLE_REDIRECT_URI || `${process.env.API_URL || 'http://localhost:3000'}/api/auth/google/callback`;

// Initialize Google OAuth client (only if credentials are configured)
const hasGoogleCredentials = process.env.GOOGLE_CLIENT_ID && 
                             process.env.GOOGLE_CLIENT_SECRET && 
                             process.env.GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID' &&
                             process.env.GOOGLE_CLIENT_SECRET !== 'YOUR_GOOGLE_CLIENT_SECRET';

const client = hasGoogleCredentials 
  ? new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    )
  : null;

// Google OAuth login endpoint
router.get('/login', (req, res) => {
  if (!hasGoogleCredentials || !client) {
    return res.status(503).json({ 
      error: 'Google OAuth no está configurado. Por favor, configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el archivo .env' 
    });
  }

  try {
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ],
      state: (typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : undefined) || process.env.FRONTEND_ORIGIN || 'http://localhost:8081/app',
      redirect_uri: redirectUri
    });

    res.json({ authUrl });
  } catch (error) {
    console.error('Google auth URL generation error:', error);
    res.status(500).json({ error: 'Error generando URL de autenticación' });
  }
});

// Google OAuth callback - Handle both GET and POST
router.get('/callback', async (req, res) => {
  if (!hasGoogleCredentials || !client) {
    const errorUrl = new URL(process.env.FRONTEND_ORIGIN || 'http://localhost:8081');
    errorUrl.searchParams.set('error', 'Google OAuth no está configurado');
    return res.redirect(errorUrl.toString());
  }

  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'Código de autorización requerido' });
    }

    // Exchange code for tokens
    const { tokens } = await client.getToken(code as string);
    client.setCredentials(tokens);

    // Get user info from Google
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(400).json({ error: 'No se pudo obtener información del usuario' });
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const avatarUrl = payload.picture;

    if (!email) {
      return res.status(400).json({ error: 'Email no disponible en la cuenta de Google' });
    }

    // Check if user exists
    let users = await query(
      'SELECT id, email, name, subscription_plan, storage_used, storage_limit, login_method FROM users WHERE email = ?',
      [email]
    );

    let userId: number;
    let isNewUser = false;

    if (users.length === 0) {
      // Create new user
      const result = await query(
        `INSERT INTO users (
          email, google_id, name, avatar_url, login_method, 
          subscription_plan, storage_used, storage_limit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [email, googleId, name, avatarUrl, 'google', 'free', 0, 5368709120]
      );

      userId = (result as any).insertId;
      isNewUser = true;
    } else {
      // Update existing user with Google info if needed
      const user = users[0] as any;
      userId = user.id;

      if (user.login_method === 'email') {
        // Link Google account to existing email account
        await query(
          'UPDATE users SET google_id = ?, login_method = ?, avatar_url = ? WHERE id = ?',
          [googleId, 'google', avatarUrl, userId]
        );
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId, 
        email, 
        subscriptionPlan: users.length > 0 ? users[0].subscription_plan : 'free',
        loginMethod: 'google'
      },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId, type: 'refresh' },
      jwtSecret,
      { expiresIn: (process.env.REFRESH_TOKEN_EXPIRES_IN || '30d') as string }
    );

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await query(
      'INSERT INTO sessions (user_id, refresh_token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, await argon2.hash(refreshToken), expiresAt]
    );

    // Get updated user info
    const updatedUsers = await query(
      'SELECT id, email, name, subscription_plan, storage_used, storage_limit, login_method, avatar_url FROM users WHERE id = ?',
      [userId]
    );

    const user = updatedUsers[0] as any;

    // Redirect to frontend with tokens as URL parameters
    const redirectUrl = new URL(state as string || 'http://localhost:8082/app/upload');
    redirectUrl.searchParams.set('token', token);
    redirectUrl.searchParams.set('refreshToken', refreshToken);
    redirectUrl.searchParams.set('user', JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
      subscriptionPlan: user.subscription_plan,
      storageUsed: user.storage_used,
      storageLimit: user.storage_limit,
      loginMethod: user.login_method
    }));
    redirectUrl.searchParams.set('isNewUser', isNewUser.toString());

    res.redirect(redirectUrl.toString());

  } catch (error) {
    console.error('Google OAuth callback error:', error);
    // Redirect to frontend with error
    const errorUrl = new URL('http://localhost:8082');
    errorUrl.searchParams.set('error', 'Error en la autenticación con Google');
    res.redirect(errorUrl.toString());
  }
});

// Keep POST route for frontend calls
router.post('/callback', async (req, res) => {
  if (!hasGoogleCredentials || !client) {
    return res.status(503).json({ 
      error: 'Google OAuth no está configurado. Por favor, configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el archivo .env' 
    });
  }

  try {
    const { code, state } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Código de autorización requerido' });
    }

    // Exchange code for tokens
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Get user info from Google
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(400).json({ error: 'No se pudo obtener información del usuario' });
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const avatarUrl = payload.picture;

    if (!email) {
      return res.status(400).json({ error: 'Email no disponible en la cuenta de Google' });
    }

    // Check if user exists
    let users = await query(
      'SELECT id, email, name, subscription_plan, storage_used, storage_limit, login_method FROM users WHERE email = ?',
      [email]
    );

    let userId: number;
    let isNewUser = false;

    if (users.length === 0) {
      // Create new user
      const result = await query(
        `INSERT INTO users (
          email, google_id, name, avatar_url, login_method, 
          subscription_plan, storage_used, storage_limit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [email, googleId, name, avatarUrl, 'google', 'free', 0, 5368709120]
      );

      userId = (result as any).insertId;
      isNewUser = true;
    } else {
      // Update existing user with Google info if needed
      const user = users[0] as any;
      userId = user.id;

      if (user.login_method === 'email') {
        // Link Google account to existing email account
        await query(
          'UPDATE users SET google_id = ?, login_method = ?, avatar_url = ? WHERE id = ?',
          [googleId, 'google', avatarUrl, userId]
        );
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId, 
        email, 
        subscriptionPlan: users.length > 0 ? users[0].subscription_plan : 'free',
        loginMethod: 'google'
      },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId, type: 'refresh' },
      jwtSecret,
      { expiresIn: (process.env.REFRESH_TOKEN_EXPIRES_IN || '30d') as string }
    );

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await query(
      'INSERT INTO sessions (user_id, refresh_token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, await argon2.hash(refreshToken), expiresAt]
    );

    // Get updated user info
    const updatedUsers = await query(
      'SELECT id, email, name, subscription_plan, storage_used, storage_limit, login_method, avatar_url FROM users WHERE id = ?',
      [userId]
    );

    const user = updatedUsers[0] as any;

    res.json({
      message: isNewUser ? 'Usuario creado exitosamente' : 'Login exitoso',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        subscriptionPlan: user.subscription_plan,
        storageUsed: user.storage_used,
        storageLimit: user.storage_limit,
        loginMethod: user.login_method
      },
      token,
      refreshToken,
      isNewUser,
      redirectUri: state || 'http://localhost:5173/app'
    });

  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.status(500).json({ error: 'Error en la autenticación con Google' });
  }
});

// Verify Google token (for frontend verification)
router.post('/verify', async (req, res) => {
  if (!hasGoogleCredentials || !client) {
    return res.status(503).json({ 
      error: 'Google OAuth no está configurado' 
    });
  }

  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'Token de Google requerido' });
    }

    // Verify the token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(400).json({ error: 'Token de Google inválido' });
    }

    res.json({
      valid: true,
      user: {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture
      }
    });

  } catch (error) {
    console.error('Google token verification error:', error);
    res.status(400).json({ error: 'Token de Google inválido' });
  }
});

export default router;
