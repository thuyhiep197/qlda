---
title: Sprint đang chạy / Bảng Kanban
section: project
module: Sprint & Backlog
order: 50
summary: Bảng cột theo trạng thái để theo dõi và kéo thả công việc của sprint đang chạy (dự án Scrum) hoặc luồng việc liên tục (dự án Kanban).
routes: /p/:key/board
need: sprint.view
keywords: bảng, board, kéo thả, cột trạng thái, phân làn, swimlane, hoàn thành sprint, sprint song song, WIP, giao việc hàng loạt
---

## Màn hình này dùng để làm gì

Bảng gồm các cột theo trạng thái của dự án (Cần làm, Đang làm…). Mỗi thẻ là một issue. Dự án **Scrum**: tab tên **Sprint đang chạy**, chỉ gồm issue của sprint đang chạy. Dự án **Kanban**: tab tên **Bảng Kanban**, gồm mọi issue trừ Epic (việc đã hoàn thành quá 14 ngày được ẩn bớt).

![Sprint đang chạy](/help/img/da-sprint.webp)

1. **Thanh sprint** — tên sprint, ngày bắt đầu – kết thúc, số ngày còn lại (hoặc trễ), mục tiêu sprint; nút **Hoàn thành sprint**.
2. **Thanh lọc** — tìm trong bảng, bấm ảnh đại diện để lọc theo người thực hiện, nút **Bộ lọc** (người phụ trách, Epic, mô-đun, loại, trạng thái, đánh giá, nhãn), chọn **Phân làn** theo người thực hiện / epic.
3. **Đầu cột** — tên trạng thái và số issue; nếu cột có giới hạn việc đang thực hiện sẽ hiện dạng `3 / 5` và tô cảnh báo khi vượt.
4. **Thẻ issue** — tiêu đề, Epic, nhãn, loại, mã, cờ ⚑ Quan trọng, số việc con đã xong, hạn (đỏ khi quá hạn), độ ưu tiên, người thực hiện. Bấm thẻ để mở chi tiết.

## Thao tác

:::perm transition.edit
### Đổi trạng thái bằng kéo thả
Kéo thẻ sang cột khác. Cột không được phép (theo quy trình của loại issue) sẽ bị khóa khi đang kéo.
:::

:::perm backlog.edit
### Sắp xếp thứ tự trong cột
Kéo thẻ lên / xuống trong cùng cột; vạch xanh chỉ vị trí thả.
:::

:::perm issue.create, backlog.edit
### Tạo issue ngay trên bảng
Ở cuối cột đầu tiên, bấm **+ Tạo issue**, chọn loại, gõ tiêu đề rồi **Enter**. Issue được đưa vào sprint đang xem (khi chọn **Tất cả sprint đang chạy** thì vào sprint đang chạy đầu tiên). Bấm **Chi tiết…** để mở form đầy đủ. (Dự án Kanban chỉ cần quyền **Issue – Thêm**.)
:::

:::perm assign.edit | transition.edit | backlog.edit | issue.edit | issue.delete
### Thao tác hàng loạt
1. Giữ **Ctrl** (hoặc ⌘ trên Mac) rồi bấm vào các thẻ để chọn nhiều.
2. Thanh thao tác hiện lên: **Giao cho…**, đổi trạng thái, chuyển sprint, đổi loại, độ ưu tiên, mô-đun, Dev phụ trách, thêm nhãn, xóa — mỗi nút chỉ hiện khi bạn có quyền tương ứng.
3. Bấm **Bỏ chọn** hoặc **Esc** để thôi chọn.
:::

:::perm sprint.edit
### Hoàn thành sprint
1. Bấm **Hoàn thành sprint**.
2. Hộp thoại cho biết số issue đã xong và chưa xong. Chọn nơi chuyển issue chưa hoàn thành: **Backlog**, **Sprint mới** hoặc một sprint khác.
3. Bấm **Hoàn thành sprint** trong hộp thoại. Sprint đóng lại.
:::

## Nhiều sprint chạy song song

Khi có hơn một sprint đang chạy, đầu trang có ô chọn **Tất cả sprint đang chạy** hoặc từng sprint; khi xem tất cả có thêm cách **Phân làn theo sprint** và nút **Hoàn thành <tên sprint>** cho từng sprint.

## Câu hỏi thường gặp

**Tab báo "Chưa có sprint nào đang chạy"?**
Vào [Backlog](/help/da-backlog), tạo sprint, kéo issue vào rồi bấm **Bắt đầu sprint**. Sprint cũng tự chạy khi có issue trong sprint chuyển khỏi trạng thái Cần làm.

**Không kéo được thẻ?**
Bạn chưa có quyền **Chuyển trạng thái** (đổi cột) hoặc **Backlog – Sửa** (đổi thứ tự).
