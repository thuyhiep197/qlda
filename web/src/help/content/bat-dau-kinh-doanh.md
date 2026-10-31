---
title: Bắt đầu nhanh – Kinh doanh, AM
section: start
order: 3
summary: Các việc hằng ngày của Sale và AM trong phân hệ Khách hàng.
need: sub:customer
keywords: sale, am, kinh doanh, khách hàng, hành trình, lịch gọi
---
## Việc hằng ngày

### 1. Xem việc của mình trên Dashboard
Mở **Dashboard**: khối **Việc kinh doanh của tôi** và **Bước hành trình tôi phụ trách** liệt kê những gì đang chờ bạn; dòng chữ đỏ **Đang trễ hạn** cho biết số việc, số bước đã quá hạn. Bấm vào một dòng để mở đúng khách hàng / bước. Xem [Dashboard](/help/dashboard).

### 2. Tìm khách hàng
Vào **Khách hàng**. Cột trái có **Khách hàng của tôi** (khách hàng bạn phụ trách, thực hiện hoặc phối hợp) và **Tất cả khách hàng** (mọi khách hàng bạn được xem; có quyền Xem tất cả thì là toàn bộ khách hàng của công ty). Xem [Không gian Khách hàng](/help/kh-tong-quan).

:::perm customer.create
### 3. Thêm khách hàng mới
1. Ở phân hệ Khách hàng, bấm **Tạo khách hàng** trên thanh trên cùng.
2. Nhập tên cơ quan/đơn vị, địa chỉ, tình trạng, chọn Sale / AM phụ trách, thêm đầu mối liên hệ, rồi bấm **Thêm**.

Chi tiết: [Không gian Khách hàng](/help/kh-tong-quan).
:::

:::perm sales_project.create
### 4. Thêm dự án cho khách hàng
1. Mở khách hàng, bấm **Thêm dự án**.
2. Nhập tên dự án, chọn sản phẩm, người phụ trách (Sale, AM, BA, Dev, Tester).

Chi tiết: [Dự án của khách hàng](/help/kh-du-an).
:::

:::perm journey.create
### 5. Áp dụng hành trình bán hàng cho dự án
1. Mở dự án của khách hàng. Nếu chưa có hành trình, bấm **Áp dụng quy trình mẫu**.
2. Hành trình gồm 4 phần: I. Giải pháp → II. Hợp đồng → III. Triển khai → IV. Nghiệm thu – Thanh toán.

Chi tiết: [Hành trình bán hàng](/help/kh-hanh-trinh).
:::

:::perm journey.edit
### 6. Cập nhật tiến độ từng bước
Bấm vào một bước trong hành trình để cập nhật trạng thái (Chưa bắt đầu / Đang thực hiện / Hoàn thành), người thực hiện, người phối hợp, hạn hoàn thành. Chi tiết: [Cập nhật bước hành trình](/help/kh-buoc).
:::

:::perm ctalk.create
### 7. Ghi lại trao đổi, đặt lịch gọi
- Ghi lại buổi gặp mặt, email hoặc trao đổi nội bộ trong khối **Trao đổi**; gõ **@** để nhắc tên đồng nghiệp.
- Ở khối **Lịch gọi điện** của dự án, bấm **+**, chọn ngày và người gọi rồi bấm **Đặt lịch**; đến ngày, người được giao sẽ được nhắc.

Chi tiết: [Trao đổi và lịch gọi điện](/help/kh-trao-doi).
:::

### 8. Giao việc, tải tài liệu
:::perm ctask.create
- Thêm công việc (người làm, hạn) cho khách hàng hoặc cho từng dự án: [Công việc](/help/kh-cong-viec).
:::

:::perm cfile.create
- Tải lên báo giá, hồ sơ, biên bản: [Tài liệu khách hàng](/help/kh-tai-lieu).
:::

:::perm plan.view
### 9. Theo dõi tiến độ sản xuất
Dự án của khách hàng đã liên kết với dự án sản xuất sẽ hiện tiến độ ở màn dự án của khách hàng; bạn có thể mở xem Kế hoạch chi tiết của dự án sản xuất. Xem [Kế hoạch chi tiết](/help/da-ke-hoach-chi-tiet).
:::
