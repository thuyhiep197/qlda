import crypto from 'node:crypto';
import multer from 'multer';
import { UPLOAD_DIR } from './db.ts';

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 25);
export const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 10 },
});

/** multer đọc tên tệp theo latin1, chuyển về UTF-8 để giữ tiếng Việt */
export const utf8Name = (originalname: string) => Buffer.from(originalname, 'latin1').toString('utf8');
