---
title: Thông tin dự án
section: project
module: Thông tin dự án
order: 20
summary: Thông tin chung, khách hàng, nhân sự và thành viên của dự án; cài đặt trạng thái và luồng chuyển trạng thái theo loại issue.
routes: /p/:key/info
need: project.view
keywords: thành viên, nhân sự, BA, PM, Dev, Tester, AM, khách hàng, trạng thái dự án, ghim, giai đoạn, workflow, quy trình, luồng chuyển, WIP
---

## Màn hình này dùng để làm gì

Tab **Thông tin** của một dự án gồm thông tin chung, khách hàng của dự án, nhân sự và thành viên. Người có quyền sửa dự án còn thấy thêm phần **Trạng thái & quy trình** để cài đặt các cột trạng thái và luồng chuyển.

![Tab Thông tin của dự án](/help/img/da-thong-tin.webp)

1. **Đầu trang dự án** — tên, mã, mô hình Scrum/Kanban, khách hàng; nút **Tạo issue** (khi có quyền tạo issue).
2. **Các tab của dự án** — chỉ hiện tab bạn có quyền xem: Thông tin, Kế hoạch tổng quan, Kế hoạch chi tiết, Sprint đang chạy (hoặc Bảng Kanban), Danh sách issue, Backlog.
3. **Thông tin chung** — tên, mã, mô hình, trạng thái dự án (📌 ghim tay hoặc ⚙ tự động), ưu tiên, sprint đang chạy, mô tả.
4. **Nhân sự** — người ở các vai trò BA/PM, Dev, Tester, AM.
5. **Khách hàng** và **Thành viên** — đầu mối liên hệ, Sale, AM, dự án của khách hàng đã gắn; danh sách thành viên kèm nhóm người dùng.

## Thành viên dự án

Thành viên = những người được chọn ở 4 ô **BA/PM, Dev, Tester, AM**. Không có nút thêm thành viên riêng: muốn thêm ai vào dự án thì chọn họ vào một trong các ô này. Ô chọn người lọc theo **vị trí** của tài khoản (VD ô Dev chỉ hiện người có vị trí Dev).

## Trạng thái dự án (giai đoạn)

- **⚙ Tự động (theo giai đoạn Epic)** — tool lấy theo giai đoạn của Epic đang thực hiện. Mỗi Epic có ô **Giai đoạn dự án**; để trống thì tool tự đoán theo tên Epic (VD tên có "khảo sát" → Khảo sát, phân tích).
- **📌 Ghim cố định** — chọn một giai đoạn và giữ nguyên, dùng khi dự án chưa có công việc trên tool.

## Thao tác

:::perm project.edit
### Sửa thông tin dự án
1. Ở thẻ **Thông tin chung**, bấm **Sửa**.
2. Sửa tên, mô hình (Scrum/Kanban), khách hàng, dự án của khách hàng, ưu tiên, trạng thái dự án, nhân sự, mô tả. Mã dự án không sửa được.
3. Bấm **Lưu**.

### Cài đặt trạng thái và quy trình
Bấm tab con **Trạng thái & quy trình**. Có 3 phần:
1. **Kho trạng thái của dự án** — thêm, đổi tên, đổi thứ tự (mũi tên lên/xuống), chọn **Nhóm** (Cần làm / Đang thực hiện / Hoàn thành), đặt **Giới hạn việc đang thực hiện** (cột vượt giới hạn sẽ được tô cảnh báo trên bảng). Khi xóa một trạng thái đang có issue, tool hỏi chuyển các issue đó sang trạng thái nào.
2. **Trạng thái theo loại issue** — tick các trạng thái mà từng loại (Epic, Story, Task, Bug, Sub-task) được dùng, rồi bấm **Lưu trạng thái theo loại**. Nếu có issue đang ở trạng thái bị bỏ, tool hiện bảng chuyển sang trạng thái cùng nhóm để bạn đồng ý.
3. **Luồng chuyển trạng thái** — tick **Bật kiểm soát** để chỉ cho phép các bước chuyển đã đánh dấu (hàng = trạng thái hiện tại, cột = trạng thái được chuyển tới). Có **Luồng chung** và luồng riêng cho từng loại issue. Bấm **Lưu luồng chuyển**.
:::

:::perm project.delete, project.edit
### Lưu trữ dự án
Trong màn **Sửa**, bấm **Lưu trữ dự án**. Dự án bị ẩn khỏi danh sách; khôi phục ở [Danh sách dự án](/help/da-danh-sach).
:::

## Lưu ý

- Nhóm trạng thái quyết định cách tính tiến độ: trạng thái thuộc nhóm **Hoàn thành** được tính là đã xong.
- Không có quyền **Thông tin khách hàng – Xem** thì phần Khách hàng chỉ hiện tên; dòng dự án của khách hàng cần thêm quyền **Dự án của khách hàng – Xem**.
- Mô-đun của dự án (kèm BA phụ trách) được chọn ở từng issue; danh sách mô-đun hiện chưa có màn hình quản lý trên tab này.
