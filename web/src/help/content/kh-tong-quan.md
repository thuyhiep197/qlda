---
title: Không gian Khách hàng
section: customer
module: Khách hàng
order: 10
summary: Nơi Sale, AM theo dõi toàn bộ khách hàng và các dự án của khách hàng theo tỉnh/thành phố.
routes: /customers
need: sub:customer
keywords: danh sách khách hàng, khách hàng của tôi, tất cả khách hàng, tỉnh, lưu trữ, tìm khách hàng, tạo khách hàng, crm
---

## Màn hình này dùng để làm gì

Bấm **Khách hàng** trên thanh bên trái để mở. Màn hình chia làm hai phần: cây khách hàng bên trái và bảng danh sách ở giữa. Mỗi **khách hàng** (cơ quan/đơn vị) có thể có nhiều **dự án của khách hàng**; mỗi dự án có hành trình bán hàng riêng.

![Màn hình Khách hàng](/help/img/kh-tong-quan.webp)

1. **Tìm trong cây** — gõ tên khách hàng hoặc tên dự án, cây tự mở tới chỗ khớp.
2. **Khách hàng của tôi** — cây 3 cấp **Tỉnh/Thành phố → Khách hàng → Dự án**. Bấm mũi tên để mở / thu gọn. Bên dưới là nhóm **Tất cả khách hàng**.
3. **Xem đã lưu trữ** — tích để hiện cả khách hàng, dự án đã lưu trữ (có biểu tượng hộp lưu trữ). Máy bạn sẽ nhớ lựa chọn này.
4. **Tìm trong bảng** — tìm theo khách hàng, dự án, tỉnh, sản phẩm, đầu mối, nhân viên phụ trách.
5. **Bảng danh sách** — gom theo tỉnh/thành phố; dưới mỗi khách hàng là các dự án của khách hàng. Bấm một dòng để mở.
6. **Tạo khách hàng** — nút trên thanh trên cùng (chỉ hiện khi bạn có quyền thêm khách hàng).

## Khách hàng của tôi và Tất cả khách hàng

- **Khách hàng của tôi**: khách hàng bạn là **Sale** hoặc **AM**, hoặc bạn tham gia một dự án của khách hàng (Sale, AM, BA/PM, Dev, Tester của dự án; người thực hiện / phối hợp một bước hành trình; người được giao một công việc). Khi bạn chưa phụ trách khách hàng nào, màn hình tự mở **Tất cả khách hàng**.
- **Tất cả khách hàng**: mọi khách hàng bạn được xem. Người có quyền **Thông tin khách hàng – Xem tất cả** thấy mọi khách hàng của công ty; người chỉ có quyền **Xem** chỉ thấy khách hàng mình liên quan như trên.

## Đọc bảng danh sách

| Cột | Ý nghĩa |
|---|---|
| **Khách hàng / Dự án** | Tên khách hàng (in đậm) và các dự án bên dưới, kèm mã dự án |
| **Sản phẩm** | Sản phẩm của từng dự án |
| **Tình trạng** | Tình trạng khách hàng (chọn từ danh mục); tình trạng dự án tự tính theo hành trình (VD **I. Giải pháp**) |
| **Hành trình** | Thanh tiến độ: % bước đã hoàn thành, số bước trễ |
| **Sale**, **AM** | Người phụ trách |
| **Sản xuất** | Mã dự án sản xuất đã gắn bên phân hệ Dự án |
| **Đầu mối** | Đầu mối liên hệ đầu tiên của khách hàng |
| **Làm việc gần nhất** | Ngày có trao đổi gần nhất |

Các cột chỉ hiện khi bạn có quyền xem chức năng tương ứng (VD cột **Hành trình** cần quyền Hành trình – Xem, cột **Sản xuất** cần quyền Kế hoạch – Xem của phân hệ Dự án).

**Biểu tượng điện thoại đỏ** cạnh tỉnh, khách hàng hoặc dự án: có lịch gọi điện đã đến ngày mà chưa xác nhận. Rê chuột để xem chi tiết. Xem [Trao đổi & lịch gọi điện](/help/kh-trao-doi).

## Thao tác

:::perm customer.create
### Tạo khách hàng mới

![Hộp thoại Thêm khách hàng](/help/img/kh-them-khach-hang.webp)

1. Bấm **Tạo khách hàng** trên thanh trên cùng.
2. Nhập **Tên cơ quan/đơn vị** (bắt buộc, không trùng với khách hàng đã có).
3. Chọn **Tỉnh thành**, rồi gõ để chọn **Phường/Xã** trong danh sách gợi ý (chỉ nhận tên có trong Danh mục địa chính).
4. Nhập **Đầu mối liên hệ** (tên, số điện thoại, email); bấm **Thêm đầu mối** nếu có nhiều người.
5. Chọn **Nguồn khách hàng**, **Tình trạng**, **Sale**, **AM**.
6. Có thể đính kèm tài liệu ngay (nếu bạn có quyền tải lên tài liệu).
7. Bấm **Thêm**.

Mã khách hàng do hệ thống tự sinh từ tên. Nếu bạn có vị trí Sale, bạn được tự thêm làm **Sale** của khách hàng; nếu có vị trí AM, được tự thêm làm **AM**.
:::

## Lưu ý

- Không có quyền **Thông tin khách hàng – Xem**: trong cây chỉ thấy **tên** khách hàng (không bấm mở được) và các dự án bạn tham gia. Bạn vẫn mở được màn dự án để làm việc trên hành trình, công việc, tài liệu, trao đổi của dự án — theo quyền từng chức năng.
- Khách hàng không bị xóa, chỉ **lưu trữ**; xem [Thông tin khách hàng](/help/kh-thong-tin).

## Câu hỏi thường gặp

**Sao tôi không thấy một khách hàng mà đồng nghiệp thấy?**
Bạn chỉ thấy khách hàng mình liên quan, trừ khi được cấp quyền Xem tất cả. Nhờ Sale/AM thêm bạn vào dự án, hoặc xem [Quyền của tôi](/help/quyen-cua-toi).

**Sao không có nút Tạo khách hàng?**
Nút chỉ hiện khi bạn có quyền **Thông tin khách hàng – Thêm** và đang ở phân hệ Khách hàng.
