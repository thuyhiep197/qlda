export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateAvatarFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!TYPES.has(file.type)) return 'Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.';
  if (file.size > MAX_AVATAR_BYTES) return 'Ảnh đại diện không được vượt quá 2 MB.';
  return null;
}
