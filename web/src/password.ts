/** Mật khẩu chỉ gồm chữ không dấu, số và ký tự bàn phím thường (máy chủ kiểm tra cùng quy tắc) */
export const hasAccent = (password: string) => /[^\x20-\x7E]/.test(password);

export const ACCENT_WARNING = 'Mật khẩu đang có chữ có dấu — hãy tắt bộ gõ tiếng Việt (Unikey, EVKey…) rồi gõ lại';
/** Ô đăng nhập: mật khẩu cũ có thể từng có dấu, nên chỉ nhắc, không chặn */
export const ACCENT_LOGIN_HINT = 'Mật khẩu bạn gõ đang có chữ có dấu — bộ gõ tiếng Việt có đang bật không?';
