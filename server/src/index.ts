import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { DATA_DIR, migrate } from './db.ts';
import { ensureAdmin, requireAuth } from './auth.ts';
import { HttpError, seedRoles } from './permissions.ts';
import authRoutes from './routes/auth.ts';
import adminRoutes from './routes/admin.ts';
import projectRoutes from './routes/projects.ts';
import issueRoutes from './routes/issues.ts';
import issueExtraRoutes from './routes/issue-extras.ts';
import versionRoutes from './routes/versions.ts';
import componentRoutes from './routes/components.ts';
import filterRoutes from './routes/filters.ts';
import reportRoutes from './routes/reports.ts';
import notificationRoutes from './routes/notifications.ts';
import { pruneNotifications } from './notify.ts';
import { syncAllEpics } from './issues.ts';
import { scheduleBackups } from './backup.ts';

migrate();
seedRoles();
syncAllEpics();
ensureAdmin();
scheduleBackups();
pruneNotifications();
setInterval(pruneNotifications, 24 * 3600_000).unref();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:", "connect-src 'self'", "font-src 'self' data:",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; '));
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => { res.json({ ok: true }); });
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth);
app.use('/api', adminRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects', versionRoutes);
app.use('/api/projects', componentRoutes);
app.use('/api/filters', filterRoutes);
app.use('/api/issues', issueExtraRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API không tồn tại')));

// Giao diện web đã build (chế độ production)
const webDist = path.resolve(import.meta.dirname, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist, { index: false, maxAge: '7d' }));
  // Tệp build cũ không còn (sau khi triển khai bản mới) → trả 404, không trả index.html
  app.use('/assets', (_req, res) => { res.status(404).end(); });
  app.get('/{*splat}', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Tệp vượt quá dung lượng cho phép' : `Lỗi tải tệp: ${err.message}`;
    return res.status(400).json({ error: msg });
  }
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ' });
  console.error(err);
  res.status(500).json({ error: 'Lỗi hệ thống, vui lòng thử lại' });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`[qlda] API chạy tại http://localhost:${port}  (dữ liệu: ${DATA_DIR})`);
});
