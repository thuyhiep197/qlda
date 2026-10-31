---
title: Nhật ký bảo mật
section: admin
module: Người dùng & phân quyền
order: 70
summary: Ai đăng nhập từ đâu, các lần đăng nhập sai, khóa tài khoản và mọi thao tác quản trị — để phát hiện truy cập bất thường.
routes: /admin/audit
need: user.view
keywords: nhật ký, audit, đăng nhập sai, ip, bảo mật, bị chiếm tài khoản, lịch sử thao tác quản trị
---
## Màn hình này dùng để làm gì

Ghi lại các sự kiện liên quan đến an toàn tài khoản và thao tác quản trị. Mở bằng **Quản trị → Nhật ký bảo mật** (cần quyền **Người dùng – Xem**). Nhật ký được giữ **365 ngày**; màn hình hiện tối đa 1.000 dòng mới nhất và tự làm mới mỗi 30 giây.

![Màn hình Nhật ký bảo mật](/help/img/qt-nhat-ky-bao-mat.webp)

1. **Thanh lọc** — tìm theo tài khoản, IP, nội dung; chọn loại **Hành động**; bên phải là số dòng.
2. **Các cột**: Thời gian, Tài khoản (người thực hiện), Hành động, Đối tượng (tài khoản / nhóm / dự án… bị tác động), Chi tiết, IP, Thiết bị (trình duyệt · hệ điều hành; rê chuột để xem đầy đủ).

Dòng tô đỏ là hành động cần chú ý (đăng nhập thất bại, khóa tài khoản, đặt lại mật khẩu, tạo tài khoản, đổi quyền…). Nếu 24 giờ qua có đăng nhập thất bại, đầu trang hiện cảnh báo kèm số lần.

## Những gì được ghi

- **Đăng nhập**: thành công, thất bại (sai mật khẩu), **bị chặn** (một địa chỉ IP sai quá nhiều lần trong 15 phút), **khóa tài khoản do sai mật khẩu 5 lần liên tiếp**.
- **Mật khẩu, phiên đăng nhập**: tự đổi mật khẩu, quản trị đặt lại mật khẩu cho người khác, đăng xuất các thiết bị khác, **Đăng xuất tất cả mọi người**.
- **Tài khoản và quyền**: tạo / sửa tài khoản (đổi nhóm, khóa, mở khóa, cấp / gỡ Quản trị hệ thống), tạo / sửa / xóa nhóm, đổi quyền của nhóm (ghi các ô thêm, bỏ), phân quyền riêng cho người dùng.
- **Dữ liệu dùng chung**: tạo, lưu trữ dự án; thêm / xóa phòng ban; nhân sự; địa chính; thêm / xóa sản phẩm, loại sản phẩm; tình trạng khách hàng; tạo / sửa khách hàng; tải lên, xóa tài liệu nội bộ; sửa bài hướng dẫn.

## Thao tác

### Kiểm tra một tài khoản nghi bị lộ

1. Gõ tên đăng nhập vào ô tìm kiếm.
2. Xem các lần **Đăng nhập** gần đây: IP và Thiết bị có lạ không (VD đăng nhập lúc nửa đêm, thiết bị "Công cụ/script", IP lạ).
3. Xem các dòng **Đăng nhập thất bại** / **Bị chặn**: nhiều lần liên tiếp từ cùng một IP là dấu hiệu có người dò mật khẩu.

### Dấu hiệu bất thường cần xử lý ngay

- Nhiều **Đăng nhập thất bại** vào nhiều tài khoản khác nhau từ cùng một IP.
- **Sửa tài khoản** có chi tiết cấp Quản trị hệ thống, **Đổi quyền của nhóm**, **Phân quyền riêng cho người dùng** mà không ai trong công ty thực hiện.
- **Đặt lại mật khẩu** hoặc **Khóa tài khoản** hàng loạt.

Cách xử lý: [khóa tài khoản](/help/qt-nguoi-dung) nghi bị chiếm, đặt lại mật khẩu, và (Quản trị hệ thống) bấm **Đăng xuất tất cả mọi người** ở màn Người dùng.

## Lưu ý

Nhật ký chỉ đọc — không ai sửa hay xóa được dòng nhật ký trên tool.
