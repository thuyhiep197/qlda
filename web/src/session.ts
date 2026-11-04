/** Server tạm không trả lời được (đang khởi động lại khi cập nhật phiên bản, mất mạng…): không phải lỗi của người dùng */
export const SERVER_UNAVAILABLE = 'Hệ thống đang khởi động lại hoặc mất kết nối. Vui lòng thử lại sau ít phút.';

/** Nội dung báo lỗi theo mã HTTP: 502/503/504 đến từ proxy khi server chưa chạy, không có lời nhắn từ server */
export function httpErrorMessage(status: number, serverError?: string | null) {
  if (serverError) return serverError;
  return status === 502 || status === 503 || status === 504 ? SERVER_UNAVAILABLE : `Lỗi ${status}`;
}

/**
 * Tải tài khoản đang đăng nhập. Chỉ khi server trả lời từ chối (4xx, VD 401 hết phiên) mới là chưa đăng nhập → null.
 * Lỗi tạm thời (5xx, mất mạng) ném ra để thử lại: người dùng vẫn đang đăng nhập, không được đưa về màn đăng nhập.
 */
export async function meOrNull<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (e) {
    const status = (e as { status?: number } | null)?.status;
    if (status !== undefined && status < 500) return null;
    throw e;
  }
}
