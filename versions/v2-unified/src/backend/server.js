const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const logger = require('./utils/logger');
const database = require('./config/database');
const { getSystemSettings } = require('./utils/systemSettings');
const { notifySystemError } = require('./utils/notificationService');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const serverRoutes = require('./routes/servers');
const logRoutes = require('./routes/logs');
const deployRoutes = require('./routes/deploy');
const systemRoutes = require('./routes/system');
const notificationRoutes = require('./routes/notifications');

const app = express();
const PORT = process.env.PORT || 8088;
let logCleanupTimer = null;
let serviceMonitorTimer = null;
let databaseBackupTimer = null;

function toIntInRange(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

async function runAutoLogCleanupJob() {
  try {
    const settings = await getSystemSettings();
    if (!settings.auto_cleanup_logs) {
      return;
    }

    const retentionDays = toIntInRange(settings.log_retention_days, 30, 1, 3650);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await database.run(
      'DELETE FROM system_logs WHERE created_at < ?',
      [cutoffDate.toISOString()]
    );

    if (result.changes > 0) {
      logger.info(`Auto cleaned ${result.changes} logs older than ${retentionDays} days`);
    }
  } catch (error) {
    logger.error('Auto log cleanup job failed:', error);
  }
}

function formatTimestampForFile(date = new Date()) {
  const pad = (value, len = 2) => String(value).padStart(len, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    '-',
    pad(date.getMilliseconds(), 3)
  ].join('');
}

async function runAutoDatabaseBackupJob() {
  try {
    const settings = await getSystemSettings();
    if (!settings.database_backup_enabled) {
      return;
    }

    const intervalHours = toIntInRange(settings.database_backup_interval, 24, 1, 720);
    const retentionDays = toIntInRange(settings.database_backup_retention, 7, 1, 3650);
    const intervalMs = intervalHours * 60 * 60 * 1000;
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    const dbPath = database.dbPath;
    if (!dbPath) {
      return;
    }

    const backupDir = path.join(path.dirname(dbPath), 'backups');
    await fs.mkdir(backupDir, { recursive: true });

    const existingFiles = await fs.readdir(backupDir, { withFileTypes: true });
    const backupFiles = existingFiles
      .filter(file => file.isFile() && /^database-\d{8}-\d{6}-\d{3}\.sqlite$/i.test(file.name))
      .map(file => path.join(backupDir, file.name));

    let latestBackupMs = 0;
    for (const backupPath of backupFiles) {
      try {
        const stats = await fs.stat(backupPath);
        if (stats.mtimeMs > latestBackupMs) {
          latestBackupMs = stats.mtimeMs;
        }
      } catch (error) {
        // Ignore broken file and continue.
      }
    }

    if (latestBackupMs > 0 && Date.now() - latestBackupMs < intervalMs) {
      return;
    }

    await database.saveDatabase();

    const backupFilename = `database-${formatTimestampForFile(new Date())}.sqlite`;
    const backupPath = path.join(backupDir, backupFilename);
    await fs.copyFile(dbPath, backupPath);

    let removedCount = 0;
    const filesAfterBackup = await fs.readdir(backupDir, { withFileTypes: true });
    for (const file of filesAfterBackup) {
      if (!file.isFile() || !/^database-\d{8}-\d{6}-\d{3}\.sqlite$/i.test(file.name)) {
        continue;
      }
      const filePath = path.join(backupDir, file.name);
      try {
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs < cutoffMs) {
          await fs.unlink(filePath);
          removedCount += 1;
        }
      } catch (error) {
        // Ignore single file cleanup errors and continue.
      }
    }

    logger.info(`Auto database backup created: ${backupFilename}${removedCount > 0 ? `, cleaned ${removedCount} expired backups` : ''}`);
  } catch (error) {
    logger.error('Auto database backup job failed:', error);
  }
}

function startBackgroundJobs() {
  const intervalMs = toIntInRange(
    process.env.AUTO_LOG_CLEANUP_INTERVAL_MS,
    60 * 60 * 1000,
    5 * 60 * 1000,
    24 * 60 * 60 * 1000
  );

  void runAutoLogCleanupJob();
  logCleanupTimer = setInterval(() => {
    void runAutoLogCleanupJob();
  }, intervalMs);

  if (typeof logCleanupTimer.unref === 'function') {
    logCleanupTimer.unref();
  }

  if (typeof serverRoutes.runManagedServiceMonitorJob === 'function') {
    const serviceIntervalMs = toIntInRange(
      process.env.SERVICE_MONITOR_INTERVAL_MS,
      2 * 60 * 1000,
      30 * 1000,
      24 * 60 * 60 * 1000
    );

    void serverRoutes.runManagedServiceMonitorJob({ trigger: 'scheduler' }).catch(error => {
      logger.error('Managed service monitor job failed:', error);
    });

    serviceMonitorTimer = setInterval(() => {
      void serverRoutes.runManagedServiceMonitorJob({ trigger: 'scheduler' }).catch(error => {
        logger.error('Managed service monitor job failed:', error);
      });
    }, serviceIntervalMs);

    if (typeof serviceMonitorTimer.unref === 'function') {
      serviceMonitorTimer.unref();
    }
  }

  const backupCheckIntervalMs = toIntInRange(
    process.env.DATABASE_BACKUP_CHECK_INTERVAL_MS,
    10 * 60 * 1000,
    60 * 1000,
    24 * 60 * 60 * 1000
  );

  void runAutoDatabaseBackupJob();
  databaseBackupTimer = setInterval(() => {
    void runAutoDatabaseBackupJob();
  }, backupCheckIntervalMs);

  if (typeof databaseBackupTimer.unref === 'function') {
    databaseBackupTimer.unref();
  }
}

function stopBackgroundJobs() {
  if (logCleanupTimer) {
    clearInterval(logCleanupTimer);
    logCleanupTimer = null;
  }
  if (serviceMonitorTimer) {
    clearInterval(serviceMonitorTimer);
    serviceMonitorTimer = null;
  }
  if (databaseBackupTimer) {
    clearInterval(databaseBackupTimer);
    databaseBackupTimer = null;
  }
}

const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.has(origin) || origin.startsWith('file://')) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const silentGetPaths = new Set([
  '/health',
  '/api/system/status',
  '/api/system/dashboard-summary'
]);

app.use((req, res, next) => {
  if (req.method === 'GET' && silentGetPaths.has(req.path)) {
    return next();
  }
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

app.use('/static', express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/deploy', deployRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/health', async (req, res) => {
  try {
    const dbStatus = await database.healthCheck();
    return res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      database: dbStatus ? 'connected' : 'disconnected',
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  } catch (error) {
    return res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

app.get('/api/system/info', (req, res) => {
  res.json({
    version: '2.0.0',
    name: 'auto-deploy-system',
    description: 'unified architecture',
    nodejs: process.version,
    platform: process.platform,
    arch: process.arch,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

app.use((error, req, res, next) => {
  logger.error('Server error:', error);
  void notifySystemError({
    method: req.method,
    path: req.originalUrl,
    status: error.status || 500,
    message: error.message,
    stack: error.stack
  });
  res.status(error.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

async function startServer() {
  try {
    logger.info('Initializing database...');
    await database.initialize();
    startBackgroundJobs();

    const server = app.listen(PORT, '127.0.0.1', () => {
      logger.info('Backend started successfully');
      logger.info(`Server URL: http://127.0.0.1:${PORT}`);
      logger.info('Database: SQLite');
      logger.info(`Environment: ${process.env.NODE_ENV || 'production'}`);
    });

    const gracefulShutdown = signal => {
      logger.info(`Received ${signal}, shutting down...`);
      stopBackgroundJobs();
      server.close(() => {
        logger.info('HTTP server closed');
        database.close();
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error('Server failed to start:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
