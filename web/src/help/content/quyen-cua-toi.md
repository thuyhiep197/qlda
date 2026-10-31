---
title: Quyền của tôi
section: start
order: 8
summary: Xem tài khoản của bạn được làm gì trong QLDA và cách đọc bảng phân quyền.
keywords: quyền, phân quyền, ma trận, không thấy nút, không thấy menu, xem tất cả
---
## Quyền trong QLDA hoạt động thế nào

Mỗi tài khoản thuộc một **nhóm người dùng** (VD: Kinh doanh, AM, BA, Dev, Ban Giám đốc). Quyền của bạn = quyền của nhóm + các quyền quản trị cấp thêm riêng cho bạn. Tài khoản thuộc nhóm **Quản trị hệ thống** có toàn quyền.

Quyền được chia 3 cấp, giống thanh bên của tool:

1. **Phân hệ** — Dashboard, Khách hàng, Dự án, Tài liệu nội bộ, Quản trị. Phân hệ chỉ hiện trên thanh bên khi bạn có ít nhất một ô **Xem** (hoặc **Xem tất cả**) của một chức năng trong phân hệ đó.
2. **Module** — nhóm chức năng trong phân hệ (VD: Module Hành trình, Module Sprint & Backlog).
3. **Chức năng** — từng dòng trong bảng, với các cột hành động.

## Ý nghĩa các cột

| Cột | Nghĩa |
|---|---|
| **Xem** | Thấy chức năng / màn hình đó. Với Khách hàng và Dự án: chỉ những khách hàng, dự án bạn phụ trách, tham gia hoặc phối hợp. Với Tài liệu nội bộ: thấy mọi thư mục nhưng chỉ thấy tệp do mình tải lên. |
| **Xem tất cả** | Thấy của mọi người: mọi khách hàng, mọi dự án, tệp của mọi người. Các quyền Thêm, Sửa, Xóa bạn đang có cũng áp dụng trên tất cả. |
| **Thêm** | Tạo mới. |
| **Sửa** | Chỉnh sửa. |
| **Xóa** | Xóa. |
| **Tải** | Tải về / xuất Excel. |
| **Import** | Nhập hàng loạt từ Excel / CSV. |

Một số ô có **tên riêng** ghi ngay trong ô, VD: **Lưu trữ** (ẩn khách hàng / dự án khỏi danh sách, mở lại được), **Khóa** (khóa tài khoản), **Ngừng sử dụng** (tình trạng khách hàng), **Tải lên** / **Tải về** (tài liệu). Rê chuột vào một ô để xem giải thích chi tiết.

## Những điều nên biết

- **Ô có đánh dấu** là quyền quản trị **cấp riêng** cho bạn, ngoài quyền của nhóm.
- Việc, bình luận, tệp, trao đổi **do chính bạn tạo** thường luôn sửa hoặc xóa được; ô Sửa / Xóa trong bảng là để sửa, xóa **của người khác**.
- Không thấy một menu, một tab hay một nút: nhiều khả năng tài khoản chưa có ô quyền tương ứng. Trong các trang hướng dẫn, thao tác bạn chưa có quyền được hiện mờ kèm tên quyền cần có — hãy gửi tên quyền đó cho quản trị hệ thống nếu bạn cần dùng.
- Quyền do quản trị thay đổi có hiệu lực ngay; giao diện cập nhật sau khi bạn tải lại trang (hoặc sau khoảng một phút).

Bảng dưới đây là quyền hiện tại của bạn:
