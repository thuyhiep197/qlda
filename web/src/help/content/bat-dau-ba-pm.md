---
title: Bắt đầu nhanh – BA, PM
section: start
order: 4
summary: Lập kế hoạch, chia sprint, giao việc và theo dõi tiến độ dự án sản xuất.
need: sub:project
keywords: ba, pm, techlead, kế hoạch, sprint, giao việc, import
---
## Việc hằng ngày

### 1. Mở dự án
Vào **Dự án**, chọn dự án trong danh sách. Dự án mở thẳng vào tab **Kế hoạch chi tiết** (nếu bạn có quyền xem). Xem [Danh sách dự án](/help/da-danh-sach).

:::perm project.create
### 2. Tạo dự án mới
Ở phân hệ Dự án, bấm **Tạo dự án** trên thanh trên cùng, nhập **Tên dự án**, **Mã dự án** (VD `DEMO`), chọn **Mô hình quản lý** (Scrum hoặc Kanban); có thể điền luôn khách hàng và nhân sự BA/PM, Dev, Tester, AM ngay trong hộp thoại, hoặc sửa sau ở tab **Thông tin**. Xem [Thông tin dự án](/help/da-thong-tin).
:::

:::perm issue.import
### 3. Nhập kế hoạch từ Excel
Ở tab **Backlog** hoặc **Danh sách issue**, bấm **Nhập từ Excel** để tạo hàng loạt Epic, Story, Task, Sub-task từ tệp kế hoạch. Xem [Import Excel/CSV](/help/da-import).
:::

:::perm issue.create
### 4. Tạo issue
Bấm **Tạo issue** ở đầu dự án, chọn loại (Epic, Story, Task, Bug, Sub-task), nhập tóm tắt, người thực hiện, hạn. Xem [Tạo issue](/help/da-tao-issue).
:::

:::perm sprint.create, sprint.edit, backlog.edit
### 5. Lập sprint
Ở tab **Backlog**: bấm **Tạo sprint** (hoặc **Tạo loạt sprint**), kéo các issue từ Backlog vào sprint, rồi bắt đầu sprint. Xem [Backlog](/help/da-backlog) và [Sprint đang chạy](/help/da-sprint).
:::

:::perm assign.edit
### 6. Giao việc
Mở issue, chọn **Người thực hiện**; người được giao nhận thông báo trên chuông. Có thể chọn nhiều issue trong danh sách để sửa hàng loạt. Xem [Chi tiết issue](/help/da-issue) và [Danh sách issue](/help/da-danh-sach-issue).
:::

:::perm plan.view
### 7. Theo dõi tiến độ
- **Kế hoạch chi tiết**: cây Epic → Story/Task → Sub-task với tiến độ và tình trạng đúng hạn / chậm / trễ. Xem [Kế hoạch chi tiết](/help/da-ke-hoach-chi-tiet).
- **Kế hoạch tổng quan**: các giai đoạn trên trục thời gian. Xem [Kế hoạch tổng quan](/help/da-ke-hoach-tong-quan).
:::

:::perm issue.view
- Dashboard: khối **Chờ tôi kiểm thử** hiện các việc ở bước kiểm thử của mô-đun bạn là BA phụ trách.
:::

:::perm plan.export
### 8. Xuất báo cáo Excel
Ở **Kế hoạch chi tiết**, bấm **Xuất Excel** để lấy kế hoạch gửi khách hàng / lãnh đạo.
:::
