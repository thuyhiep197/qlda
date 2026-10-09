import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from './db.ts';

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const UUID_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;

export function avatarMime(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

export const safeAvatarName = (value: string) => UUID_FILE.test(value);
export const avatarUrl = (storedName?: string | null) => storedName && safeAvatarName(storedName) ? `/api/auth/avatars/${storedName}` : null;
export const avatarExtension = (mime: string) => mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
