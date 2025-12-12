import { Router } from 'express';
import authRoutes from './auth.js';
import googleAuthRoutes from './google-auth.js';
import documentRoutes from './documents.js';
import searchRoutes from './search.js';
import earlyAccessRoutes from './early-access.js';
import contactRoutes from './contact.js';

const router = Router();

// Health check
router.get('/ping', (_req, res) => res.json({ pong: true }));

// Auth routes
router.use('/auth', authRoutes);

// Google OAuth routes
router.use('/auth/google', googleAuthRoutes);

// Document routes
router.use('/documents', documentRoutes);

// Search routes
router.use('/search', searchRoutes);

// Early access routes
router.use('/early-access', earlyAccessRoutes);

// Contact routes
router.use('/contact', contactRoutes);

export default router; 