---
title: Tạo issue và việc con
section: project
module: Công việc
order: 90
summary: Các cách tạo Epic, Story, Task, Bug, Sub-task; ý nghĩa từng loại và từng ô trong form Tạo issue.
need: issue.create
keywords: tạo issue, thêm việc, tạo epic, story, task, bug, sub-task, việc con, issue cha, tạo nhanh, tạo tiếp
---

## Màn hình này dùng để làm gì

Form **Tạo issue** dùng để thêm một công việc vào dự án. Mở form bằng nút **Tạo issue** ở đầu trang dự án, hoặc **Chi tiết…** / **Thêm chi tiết…** từ các ô tạo nhanh.

![Form Tạo issue](/help/img/da-tao-issue.webp)

1. **Dự án** và **Loại issue** — rê chuột lên từng loại để xem gợi ý.
2. **Tiêu đề** (bắt buộc); bên dưới là **Mô tả** (gõ `@` để nhắc tên) và **Ghi chú** (tối đa 100 ký tự).
3. **Thuộc Epic** / **Issue cha**, **Người thực hiện**, **Độ ưu tiên**, **Sprint**, điểm, ước lượng thời gian, mô-đun, Dev phụ trách, ngày, nhãn.
4. **Tạo tiếp issue khác** và nút **Tạo**.

## Các loại issue

| Loại | Dùng cho |
|---|---|
| **Epic** | Giai đoạn lớn của dự án; hiện trên Kế hoạch tổng quan. Không nằm trong sprint. |
| **Story** | Chức năng phục vụ người dùng. |
| **Task** | Đầu việc cần làm. |
| **Bug** | Lỗi cần sửa. |
| **Sub-task** | Việc nhỏ nằm dưới một Story / Task / Bug; đi theo sprint của việc cha. |

## Thao tác

:::perm issue.create
### Tạo bằng form
1. Bấm **Tạo issue** ở đầu trang dự án.
2. Chọn **Loại issue**, nhập **Tiêu đề** (bắt buộc).
3. Story / Task / Bug: chọn **Thuộc Epic** nếu có. Sub-task: bắt buộc chọn **Issue cha** (chỉ liệt kê việc chưa hoàn thành).
4. Điền các ô khác nếu cần, bấm **Tạo**.
5. Muốn tạo liền nhiều issue: tick **Tạo tiếp issue khác** — form giữ lại loại, Epic, người thực hiện… và xóa tiêu đề, mô tả, ghi chú, điểm.

### Tạo nhanh
- **Kế hoạch chi tiết**: nút **+** trên dòng Epic hoặc đầu việc.
- **Backlog**, **Sprint đang chạy**: **+ Tạo issue** ở cuối mục / cột.
- **Kế hoạch tổng quan**, **Kế hoạch chi tiết**: nút **Tạo Epic**.
- **Chi tiết issue**: thêm việc con (chọn loại việc con Story / Task / Bug) hoặc thêm issue vào Epic.

Gõ tiêu đề rồi **Enter** là xong; ô tạo nhanh giữ mở để gõ tiếp, **Esc** để đóng.
:::

:::perm assign.edit
### Giao việc ngay khi tạo
Ô **Người thực hiện** chỉ hiện khi bạn có quyền **Giao việc**, và chỉ chọn được thành viên dự án. Không có quyền này thì issue tạo ra ở trạng thái chưa giao.
:::

:::perm backlog.edit
### Đưa vào sprint ngay khi tạo
Ô **Sprint** (dự án Scrum, không áp dụng cho Epic và Sub-task) chỉ hiện khi bạn có quyền **Backlog – Sửa**. Để trống = Backlog.
:::

## Lưu ý

- Ô **Mô-đun** chỉ hiện khi dự án đã có mô-đun; chọn mô-đun thì **BA phụ trách** tự lấy theo mô-đun.
- **Ước lượng thời gian**: VD `2d`, `4h 30m`; 1d = 8 giờ, 1w = 5 ngày, số không có đơn vị là giờ.
- Issue mới bắt đầu ở trạng thái đầu tiên của quy trình (thường là **Cần làm**), trừ khi tạo từ một cột cụ thể trên bảng.
- Sau khi tạo, mở [Chi tiết issue](/help/da-issue) để thêm tệp đính kèm, liên kết, người theo dõi.

## Câu hỏi thường gặp

**Nút Tạo bị mờ, form báo "Bạn không có quyền tạo issue trong dự án này"?**
Bạn chưa có quyền **Issue – Thêm** ở dự án đang chọn. Đổi ô **Dự án** hoặc xem [Quyền của tôi](/help/quyen-cua-toi).

**Không thấy ô Người thực hiện / Sprint?**
Thiếu quyền **Giao việc** / **Backlog – Sửa** (xem các mục trên).

**Có nhiều việc cần nhập một lúc?**
Dùng [Import kế hoạch từ Excel/CSV](/help/da-import).
