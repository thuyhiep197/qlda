---
title: Quản lý bài hướng dẫn
section: admin
module: Hướng dẫn sử dụng
order: 90
summary: Quản trị hệ thống sửa, thêm bài hướng dẫn ngay trên tool và khôi phục bản gốc.
need: admin
keywords: sửa hướng dẫn, thêm bài, khôi phục bản gốc, markdown, perm
---
## Ai dùng được

Chỉ tài khoản thuộc nhóm **Quản trị hệ thống**. Các nút **Sửa bài**, **Thêm bài hướng dẫn**, **Khôi phục bản gốc** / **Xóa bài** chỉ hiện với tài khoản này. Mọi lần lưu, khôi phục, xóa đều được ghi vào [Nhật ký bảo mật](/help/qt-nhat-ky-bao-mat).

## Thao tác

### Sửa một bài có sẵn
1. Mở bài trong **Trung tâm hướng dẫn** (nút **Hướng dẫn sử dụng** trên thanh trên cùng → **Trung tâm hướng dẫn**).
2. Bấm **Sửa bài** cạnh tiêu đề.
3. Sửa **Tiêu đề** và nội dung (bài có sẵn giữ nguyên Mục và Module trong mục lục); bấm **Xem trước** để xem thử, **Soạn** để quay lại sửa.
4. Bấm **Lưu**. Cuối bài hiện dòng "Cập nhật trên tool bởi … lúc …".

### Thêm bài mới
1. Bấm **Thêm bài hướng dẫn** ở cuối mục lục bên trái.
2. Nhập **Mã bài** (chữ thường không dấu, số, dấu gạch ngang; VD `quy-trinh-bao-gia`) — mã dùng làm địa chỉ bài, không đổi được sau khi lưu.
3. Nhập **Tiêu đề**, chọn **Mục** (Bắt đầu, Dùng chung, hoặc một phân hệ) và **Module** (nhóm trong mục lục, có thể để trống), soạn nội dung, bấm **Lưu**.

Bài thêm mới hiện với **mọi tài khoản** và nằm cuối mục đã chọn; bài này không gắn với màn hình nào (không mở từ "Hướng dẫn màn hình này").

### Khôi phục bản gốc / xóa bài
- Bài có sẵn đã sửa: bấm **Khôi phục bản gốc** để bỏ nội dung đã sửa, quay về bài gốc.
- Bài thêm mới: bấm **Xóa bài** để xóa hẳn.

## Cách soạn nội dung

Nội dung viết theo Markdown:

| Viết | Hiển thị |
|---|---|
| `## Tiêu đề lớn` / `### Tiêu đề nhỏ` | Đề mục |
| `**chữ đậm**` | **chữ đậm** — dùng cho tên nút, tab, cột |
| `1. Bước một` | Danh sách đánh số |
| `- Ý` | Danh sách gạch đầu dòng |
| `[Chi tiết issue](/help/da-issue)` | Liên kết sang bài khác |
| `[Dự án](/projects)` | Liên kết sang màn hình của tool |
| `![Dashboard](/help/img/dashboard.webp)` | Ảnh minh họa có sẵn (ảnh nằm trong thư mục /help/img/ của bản cài đặt) |

### Đánh dấu thao tác cần quyền
Đặt thao tác giữa hai dòng `:::perm <mã quyền>` và `:::`:

```
  :::perm issue.create
  ### Tạo issue
  1. Bấm **Tạo issue** …
  :::
```

(Khi soạn thật, viết các dòng trên sát lề trái, không có khoảng trắng đầu dòng.)

- Người có quyền thấy khối bình thường kèm dòng "Quyền cần có: …".
- Người chưa có quyền thấy khối **mờ** kèm "Bạn chưa có quyền …".
- Nhiều quyền: dấu `|` = chỉ cần một trong các quyền (VD `issue.edit | issue_own.edit`); dấu phẩy = cần đủ tất cả (VD `sprint.create, backlog.edit`).
- Mã quyền là `<chức năng>.<hành động>` như trong ma trận phân quyền, VD `customer.view`, `plan.export`, `document.create`. Hành động: `view` (Xem), `view_all` (Xem tất cả), `create` (Thêm), `edit` (Sửa), `delete` (Xóa), `export` (Tải), `import` (Import).
- Không lồng khối này vào nhau. Chế độ **Xem trước** không hiện mờ theo quyền — mở bài sau khi lưu để kiểm tra.

## Lưu ý quan trọng

Các bài có sẵn được cập nhật cùng mỗi phiên bản mới của QLDA. Bài nào bạn **đã sửa trên tool** thì bản sửa của bạn được ưu tiên hiển thị, nên sẽ **không nhận** nội dung mới của phiên bản sau. Khi thấy mục [Có gì mới](/help/co-gi-moi) báo một chức năng thay đổi mà bài bạn đã sửa có liên quan, hãy bấm **Khôi phục bản gốc** để lấy bài mới nhất, rồi sửa lại nếu cần.
