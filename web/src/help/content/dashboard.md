---
title: Dashboard
section: dashboard
module: Dashboard
order: 1
summary: Trang thống kê: khách hàng theo tình trạng, Sale, AM; dự án theo trạng thái, BA, Dev.
routes: /home
need: sub:dashboard
keywords: tổng quan, trang chủ, thống kê, số liệu, người phụ trách, chưa phân công
---
## Màn hình này dùng để làm gì

Dashboard là trang đầu tiên sau khi đăng nhập (nếu bạn có quyền **Dashboard – Xem**). Trang chỉ gồm số liệu thống kê, lấy trong phạm vi khách hàng và dự án bạn được xem, không tính mục đã lưu trữ. Vì vậy số liệu của mỗi người có thể khác nhau.

![Dashboard](/help/img/dashboard.webp)

1. **Khách hàng** — tổng số, số theo tình trạng, số theo Sale và theo AM.
2. **Dự án** — tổng số, số theo trạng thái, số theo BA và theo Dev.

## Các khối và quyền cần có

:::perm customer.view
### Khách hàng
- **Tổng số** và các ô **tình trạng** (Mới, Đang tư vấn…).
- **Theo Sale**, **Theo AM**: mỗi người một thanh ngang, người phụ trách nhiều nhất ở trên.

Bấm một ô hoặc một dòng để mở danh sách khách hàng đã lọc sẵn; bấm **Bỏ lọc** để xem lại toàn bộ.
:::

:::perm project.view
### Dự án
- **Tổng số** và các ô **trạng thái** (Chưa bắt đầu, Xây dựng, Kiểm thử…). Ô **Chưa xác định** chỉ hiện khi có dự án đang chạy mà chưa Epic nào gắn được giai đoạn.
- **Theo BA**, **Theo Dev**: mỗi người một thanh ngang, người phụ trách nhiều nhất ở trên.

Bấm một ô hoặc một dòng để mở danh sách dự án đã lọc sẵn. Số liệu chỉ tính dự án trong phân hệ Dự án, không tính dự án của khách hàng ở phân hệ Khách hàng.
:::

## Cách đọc số liệu

- Khách hàng hoặc dự án có nhiều người phụ trách được **tính cho từng người**, nên cộng các dòng có thể lớn hơn tổng số.
- **Chưa phân công** là số khách hàng hoặc dự án chưa có ai ở vai trò đó.

## Câu hỏi thường gặp

**Dashboard của tôi trống / thiếu khối so với đồng nghiệp?**
Mỗi khối theo quyền của từng người. Xem [Quyền của tôi](/help/quyen-cua-toi).

**Vì sao tổng số của tôi ít hơn của đồng nghiệp?**
Số liệu chỉ tính khách hàng và dự án bạn được xem. Người có quyền **Xem tất cả** thấy toàn bộ.

**Xem việc được giao cho tôi ở đâu?**
Issue dự án xem ở [Danh sách issue](/help/da-danh-sach-issue), lọc người thực hiện là bạn. Việc kinh doanh xem ở [Công việc](/help/kh-cong-viec), bước hành trình xem ở [Hành trình](/help/kh-hanh-trinh) với ô **Việc của tôi**.
