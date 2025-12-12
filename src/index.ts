import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import apiRouter from './routes/index.js';

const app = express();

// Security middlewares
app.use(helmet({
    frameguard: false,
    // Allow loading cross-origin resources (images) from our API by the frontend
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            connectSrc: ["'self'"],
            // Allow embedding pages (preview) only from our dev frontends
            frameAncestors: [
                "'self'",
                'http://localhost:8081',
                'http://localhost:8082',
                process.env.FRONTEND_ORIGIN ?? 'http://localhost:8081'
            ],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = [
	process.env.FRONTEND_ORIGIN ?? 'http://localhost:8081',
	'http://localhost:5173', // Vite default port
	'http://localhost:8082', // Vite dev server alternate port
	'http://localhost:8081', // Vite dev server alternate port
	'http://localhost:8080', // Server port
	'http://127.0.0.1:8081',
	'http://127.0.0.1:5173',
	'http://127.0.0.1:8080',
	// Production domains
	'https://flecsa.com',
	'https://www.flecsa.com',
	'http://flecsa.com',
	'http://www.flecsa.com',
];

app.use(cors({
	origin: (origin, callback) => {
		// Allow requests with no origin (mobile apps, Postman, etc.)
		if (!origin) return callback(null, true);
		
		// Log for debugging (only in development)
		if (process.env.NODE_ENV !== 'production') {
			console.log('CORS request from origin:', origin);
		}
		
		// In development, allow ALL localhost and 127.0.0.1 origins
		if (process.env.NODE_ENV !== 'production') {
			if (origin?.includes('localhost') || origin?.includes('127.0.0.1')) {
				return callback(null, true);
			}
		}
		
		if (allowedOrigins.includes(origin)) {
			callback(null, true);
		} else if (origin?.includes('flecsa.com')) {
			// Allow all flecsa.com subdomains
			callback(null, true);
		} else {
			console.warn('CORS blocked origin:', origin);
			callback(new Error('Not allowed by CORS'));
		}
	},
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 300,
	standardHeaders: true,
	legacyHeaders: false,
});
app.use('/api/', limiter);

app.get('/health', (_req, res) => {
	res.status(200).json({ status: 'ok' });
});

app.use('/api', apiRouter);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, '0.0.0.0', () => {
	console.log(`Flecsa server listening on port ${port}`);
	console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
}); 