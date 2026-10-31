---
title: Danh sách issue và tìm kiếm issue
section: project
module: Công việc
order: 70
summary: Bảng issue có lọc nhiều điều kiện, lưu bộ lọc, sắp xếp, xuất CSV và sửa hàng loạt — trong một dự án hoặc trên mọi dự án.
routes: /p/:key/issues, /issues
need: search.view
keywords: tìm kiếm, lọc, bộ lọc đã lưu, lưu bộ lọc, xuất excel, csv, sửa hàng loạt, giao việc hàng loạt, chuyển sprint, xóa nhiều issue, nhập từ excel
---

## Màn hình này dùng để làm gì

Có hai nơi dùng chung một màn hình:

- Tab **Danh sách issue** trong một dự án — chỉ issue của dự án đó.
- Trang **Tìm kiếm issue** (gõ từ khóa vào ô tìm kiếm trên cùng rồi chọn **Tìm "…" trong tất cả issue…**, hoặc bấm **Xem tất cả** ở Dashboard) — issue của mọi dự án bạn được xem, có thêm ô chọn dự án.

![Danh sách issue](/help/img/da-danh-sach-issue.webp)

1. **Bộ lọc đã lưu** — chọn nhanh một bộ lọc bạn (hoặc người khác chia sẻ) đã lưu.
2. **Thanh lọc** — từ khóa (gõ rồi **Enter**), **Người thực hiện** (mặc định **Tôi**), nhóm trạng thái (mặc định **Chưa hoàn thành**), nút **Bộ lọc** mở thêm: loại, trạng thái, độ ưu tiên, Epic, sprint (kể cả **Sprint đang chạy** / **Backlog**), mô-đun, BA phụ trách, Dev phụ trách, đánh giá, nhãn. **Xóa lọc** đưa về mặc định.
3. **Nút** — **Xuất Excel (CSV)**, **Nhập từ Excel** (chỉ trong tab của dự án).
4. **Bảng issue** — ô tick để chọn nhiều; bấm tiêu đề cột **Mã**, **Ưu tiên**, **Hạn**, **Ngày tạo**, **Cập nhật** để sắp xếp; bấm một dòng để mở chi tiết issue.

## Thao tác

### Lưu bộ lọc
1. Đặt các điều kiện lọc.
2. Mở ô **Bộ lọc đã lưu**, chọn **+ Lưu bộ lọc hiện tại**.
3. Đặt tên; tick **Chia sẻ** nếu muốn thành viên dự án (hoặc mọi người, ở trang Tìm kiếm) cùng dùng. Bấm lưu.

Bộ lọc do bạn tạo có thể xóa ngay trong danh sách bộ lọc đã lưu.

:::perm search.export
### Xuất danh sách ra Excel
Bấm **Xuất Excel (CSV)**. Tệp `issues-<mã dự án>-<ngày>.csv` gồm đúng các issue đang lọc, mở được bằng Excel.
:::

:::perm issue.import, issue.create
### Nhập issue từ Excel
Trong tab của dự án, bấm **Nhập từ Excel** — xem [Import kế hoạch từ Excel/CSV](/help/da-import).
:::

:::perm assign.edit
### Giao việc ngay trên bảng
Bấm ô **Người thực hiện** của dòng và chọn người.
:::

:::perm assign.edit | transition.edit | backlog.edit | issue.edit | issue.delete
### Sửa hàng loạt
1. Tick ô đầu các dòng cần sửa (ô ở tiêu đề bảng chọn tất cả).
2. Thanh thao tác hiện lên. Mỗi nút / ô chọn cần quyền riêng:
   - **Giao cho…** — quyền **Giao việc**.
   - **Chuyển vào sprint…** — quyền **Backlog – Sửa**; có lựa chọn **+ Sprint mới** khi bạn có quyền tạo sprint.
   - **Đổi trạng thái…** — quyền **Chuyển trạng thái**.
   - **Đổi loại…**, **Độ ưu tiên…**, **Mô-đun…**, **Dev phụ trách…**, **BA phụ trách…**, **+ Thêm nhãn** — quyền **Issue – Sửa**.
   - **Xóa** — quyền **Issue – Xóa**. Xóa vĩnh viễn, kèm các Sub-task; xóa Epic thì các Story/Task/Bug bên trong chỉ được tách khỏi Epic.
3. Bấm **Bỏ chọn** để thôi chọn.
:::

## Lưu ý

- Mở màn hình lần đầu chỉ thấy **việc chưa hoàn thành được giao cho bạn**. Chọn **Mọi người thực hiện** và **Mọi nhóm trạng thái** để xem tất cả.
- Trang **Tìm kiếm issue** chỉ trả về issue của các dự án bạn được xem.

## Câu hỏi thường gặp

**Không thấy issue mình vừa tạo?**
Kiểm tra ô **Người thực hiện** (mặc định **Tôi**) — issue chưa giao cho ai sẽ không hiện. Chọn **Chưa giao** hoặc **Mọi người thực hiện**.

**Không có nút Xuất Excel (CSV)?**
Bạn chưa có quyền **Danh sách & tìm kiếm issue – Tải**. Xem [Quyền của tôi](/help/quyen-cua-toi).
