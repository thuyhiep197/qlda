---
title: Kế hoạch tổng quan
section: project
module: Kế hoạch
order: 30
summary: Lộ trình các Epic (giai đoạn) theo tháng, mở rộng để xem các issue bên trong.
routes: /p/:key/roadmap
need: plan.view
keywords: lộ trình, roadmap, timeline, epic, giai đoạn, theo tháng, gantt
---

## Màn hình này dùng để làm gì

Xem nhanh toàn bộ dự án trên trục thời gian: mỗi Epic (giai đoạn) là một thanh ngang theo tháng, phần tô đậm là tỷ lệ issue đã hoàn thành. Mở rộng Epic để thấy các Story/Task/Bug bên trong.

![Kế hoạch tổng quan](/help/img/da-ke-hoach-tong-quan.webp)

1. **Mở rộng / Thu gọn tất cả** và **Tạo Epic**.
2. **Cột Epic / issue** — mã, tên, thanh tiến độ (số issue hoàn thành / tổng), trạng thái, người phụ trách. Bấm mũi tên để mở/đóng danh sách issue của Epic.
3. **Trục thời gian** — theo tháng; vạch dọc là **hôm nay**. Rê chuột lên thanh để xem ngày và số issue hoàn thành.

## Cách đọc

- Thanh thời gian lấy theo **Ngày bắt đầu – Hạn hoàn thành** của issue; thiếu ngày thì lấy theo ngày của sprint chứa issue.
- Epic chưa có ngày hiện dòng "Chưa đặt lịch — mở epic để đặt ngày bắt đầu/kết thúc".
- Tiến độ tính theo **số issue** (không dùng điểm ước lượng). Với issue con: Cần làm 0%, đang làm 50%, Hoàn thành 100%.

## Thao tác

- Bấm vào tên hoặc thanh của một Epic / issue để mở chi tiết (cần quyền **Issue – Xem**).

:::perm issue.create
### Tạo Epic
1. Bấm **Tạo Epic**.
2. Nhập tiêu đề, đặt **Ngày bắt đầu** và **Hạn hoàn thành** để Epic hiện trên trục thời gian.
3. Bấm **Tạo**.
:::

## Câu hỏi thường gặp

**Epic không có thanh trên trục thời gian?**
Epic chưa có ngày bắt đầu / hạn hoàn thành và chưa có issue nào bên trong nằm trong sprint. Mở Epic và đặt ngày.

**Trạng thái Epic không đổi được?**
Trạng thái Epic tự động theo các việc bên trong: tất cả Hoàn thành → Hoàn thành, tất cả Cần làm → Cần làm, còn lại → Đang thực hiện.
