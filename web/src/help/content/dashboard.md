---
title: Dashboard
section: dashboard
module: Dashboard
order: 1
summary: Trang tổng quan: khách hàng, việc kinh doanh, bước hành trình, việc dự án của bạn và hoạt động gần đây.
routes: /home
need: sub:dashboard
keywords: tổng quan, trang chủ, việc của tôi, quá hạn, chờ kiểm thử
---
## Màn hình này dùng để làm gì

Dashboard là trang đầu tiên sau khi đăng nhập (nếu bạn có quyền **Dashboard – Xem**). Mỗi khối chỉ hiện khi bạn có quyền xem phần tương ứng, nên Dashboard của mỗi người có thể khác nhau.

![Dashboard](/help/img/dashboard.webp)

1. **Việc được giao chưa xong / Đang thực hiện / Quá hạn** — số issue dự án đang giao cho bạn.
2. **Việc của tôi** — các issue đang giao cho bạn chưa xong; bấm để mở chi tiết.
3. **Hoạt động gần đây** — ai vừa tạo, chuyển trạng thái, giao việc, đổi sprint issue trong các dự án bạn vào được.
4. **Dự án của tôi** — các dự án bạn vào được, số issue đang mở và số thành viên.

## Các khối và quyền cần có

:::perm customer.view
### Khách hàng
Số khách hàng theo từng tình trạng (Mới, Đang tư vấn…); bấm bất kỳ ô nào hoặc **Quản lý khách hàng** để mở phân hệ Khách hàng (danh sách chưa lọc theo tình trạng).
:::

:::perm ctask.view | journey.view
### Đang trễ hạn
Dòng chữ đỏ **Đang trễ hạn** cho biết số việc kinh doanh và bước hành trình đã quá hạn trong phạm vi khách hàng bạn được xem (không chỉ việc của bạn).
:::

:::perm ctask.view
### Việc kinh doanh của tôi
Các công việc của khách hàng đang giao cho bạn chưa xong, kèm hạn (chữ đỏ khi quá hạn). Bấm để mở đúng khách hàng / dự án của khách hàng. Xem [Công việc](/help/kh-cong-viec).
:::

:::perm journey.view
### Bước hành trình tôi phụ trách
Các bước hành trình bán hàng bạn là người thực hiện, chưa hoàn thành. Bấm để mở đúng bước. Xem [Cập nhật bước hành trình](/help/kh-buoc).
:::

:::perm issue.view
### Công việc dự án
- Ba ô số: **Việc được giao chưa xong**, **Đang thực hiện**, **Quá hạn** (ô đỏ khi có việc quá hạn).
- **Chờ tôi kiểm thử** — chỉ hiện khi có việc: các issue thuộc mô-đun bạn là BA phụ trách (hoặc bạn là BA của issue) đang ở trạng thái kiểm thử.
- **Việc của tôi** và **Hoạt động gần đây**.
:::

:::perm search.view
### Xem tất cả
Ở khối **Việc của tôi** và **Chờ tôi kiểm thử** có liên kết **Xem tất cả**, mở **Danh sách issue** đã lọc sẵn. Xem [Danh sách issue](/help/da-danh-sach-issue).
:::

### Dự án của tôi
Hiện khi bạn thấy phân hệ Dự án: các dự án bạn là thành viên hoặc được xem. Bấm một thẻ để mở dự án.

## Câu hỏi thường gặp

**Dashboard của tôi trống / thiếu khối so với đồng nghiệp?**
Mỗi khối theo quyền của từng người. Xem [Quyền của tôi](/help/quyen-cua-toi).

**Một việc đã xong vẫn nằm trong Việc của tôi?**
Việc chỉ rời danh sách khi được chuyển sang trạng thái thuộc nhóm hoàn thành. Mở việc và cập nhật trạng thái.
