import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkDatabase, closeDatabase } from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';

// Import all routes
import authRoutes from './routes/auth.js';
import serviceRequestsRouter from './routes/serviceRequests.js';
import roomsRouter from './routes/rooms.js';
import customersRouter from './routes/customers.js';
import locationsRouter from './routes/locations.js';
import techniciansRouter from './routes/technicians.js';
import adminRoutes from './routes/adminRoutes.js';
import technicianRoutes from './routes/technicianRoutes.js';
import teamMembersRouter from './routes/teamMembers.js';
import passwordResetRouter from './routes/passwordReset.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// MIDDLEWARE
// ============================================

const allowedOrigins = new Set(
  (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
);

// Both customer and admin web clients call this API in development. Production
// deployments should set FRONTEND_URLS to their comma-separated HTTPS origins.
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.add('http://localhost:3000');
  allowedOrigins.add('http://localhost:5173');
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health/live', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get(['/health', '/health/ready'], async (req, res) => {
  try {
    const database = await checkDatabase();
    res.json({ status: 'OK', timestamp: new Date().toISOString(), uptime: process.uptime(), database });
  } catch (error) {
    res.status(503).json({ status: 'UNAVAILABLE', timestamp: new Date().toISOString(), database: { status: 'down' } });
  }
});

// ============================================
// API ROUTES - AUTHENTICATION (All users)
// ============================================

app.use('/api/auth', authRoutes);
app.use('/api/password-reset', passwordResetRouter);

// ============================================
// API ROUTES - CUSTOMER ENDPOINTS
// ============================================

app.use('/api/service-requests', serviceRequestsRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/technicians', techniciansRouter);
app.use('/api/team-members', teamMembersRouter);

// ============================================
// API ROUTES - ADMIN ENDPOINTS (Requires admin role)
// ============================================

app.use('/api/admin', adminRoutes);

// ============================================
// API ROUTES - TECHNICIAN ENDPOINTS (Requires technician role)
// ============================================

app.use('/api/technician', technicianRoutes);

// ============================================
// 404 HANDLER
// ============================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// ============================================
// GLOBAL ERROR HANDLER
// ============================================

app.use(errorHandler);

// ============================================
// SERVER STARTUP
// ============================================

const startServer = async () => {
  try {
    console.log('Testing PostgreSQL connection...');
    await checkDatabase();
    console.log('PostgreSQL connection successful');

    const server = app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║         TaskTel Unified Backend                            ║
║         ✅ Server running on port ${PORT}                  ║
║         📍 http://localhost:${PORT}                        ║
║         🔗 Health Check: GET http://localhost:${PORT}/health ║
║         📚 API Base: http://localhost:${PORT}/api          ║
║                                                            ║
║         🎯 Serving:                                        ║
║         ├─ Customer Portal (Port 3000)                     ║
║         ├─ Admin Portal (Port 3000)                        ║
║         └─ Technician Portal (Port 3000)                   ║
║                                                            ║
║         📚 Routes:                                         ║
║         ├─ /api/auth/* (All users)                         ║
║         ├─ /api/service-requests/* (Customer)             ║
║         ├─ /api/rooms/* (Customer)                         ║
║         ├─ /api/customers/* (Customer)                     ║
║         ├─ /api/locations/* (Customer)                     ║
║         ├─ /api/admin/* (Admin only)                       ║
║         └─ /api/technician/* (Technician only)             ║
║                                                            ║
║         Environment: ${process.env.NODE_ENV || 'development'}    ║
╚════════════════════════════════════════════════════════════╝
      `);
    });

    const shutdown = async (signal) => {
      console.log(`${signal} received, shutting down`);
      server.close(async () => {
        await closeDatabase();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startServer();
}

export default app;
export { startServer };
