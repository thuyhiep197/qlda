---
title: Dự án của khách hàng
section: customer
module: Dự án của khách hàng
order: 30
summary: Tạo, sửa, lưu trữ dự án của khách hàng; xem tiến độ dự án sản xuất đã gắn.
need: sub:customer
keywords: thêm dự án, sửa dự án, lưu trữ dự án, sản phẩm, mô tả sản phẩm, ba/pm, dev, tester, tình trạng dự án, liên kết tiến độ sản xuất, mã dự án
---

## Màn hình này dùng để làm gì

Mỗi khách hàng có thể có nhiều **dự án của khách hàng** (một sản phẩm có sẵn hoặc một dự án làm mới). Mỗi dự án có người phụ trách, tình trạng và [hành trình bán hàng](/help/kh-hanh-trinh) riêng. Khi ký hợp đồng, dự án được chuyển sang phân hệ Dự án để Dev, BA, Tester sản xuất.

Mở dự án: bấm tên dự án trong cây bên trái, trong bảng danh sách, hoặc trong màn khách hàng. Khi chưa chọn bước hành trình nào, cột phải hiện các khối của dự án.

![Màn hình dự án của khách hàng](/help/img/kh-du-an.webp)

1. **Thông tin dự án** — mã dự án, tình trạng, khách hàng, Sale, AM, BA/PM, Dev, Tester, loại sản phẩm, sản phẩm, mô tả, ghi chú.
2. **Sửa dự án** (bút chì) và **Lưu trữ dự án** (hộp lưu trữ).
3. **Liên kết tiến độ sản xuất** — dự án sản xuất đã gắn với dự án này.

Bên dưới là các khối **Lịch gọi điện**, **Công việc**, **Tài liệu**, **Trao đổi** của dự án.

## Tình trạng dự án (tự động)

Tình trạng dự án **không chọn tay** mà tự tính theo hành trình (có dấu ⚙ theo hành trình):

- **Chưa áp dụng quy trình** — dự án chưa có hành trình.
- **Chưa bắt đầu** — có hành trình nhưng chưa bước nào bắt đầu.
- **I. Giải pháp**, **II. Hợp đồng**, **III. Triển khai**, **IV. Nghiệm thu - Thanh toán** — phần xa nhất đã có bước Đang thực hiện hoặc Hoàn thành.
- **Hoàn thành** — mọi bước đã hoàn thành.

## Thao tác

:::perm sales_project.create
### Thêm dự án cho khách hàng

![Hộp thoại Thêm dự án của khách hàng](/help/img/kh-du-an-form.webp)

1. Mở màn khách hàng, bấm **Thêm dự án**.
2. Nhập **Tên dự án** (bắt buộc). **Mã dự án** tự sinh theo mã khách hàng + số thứ tự.
3. **Sale**, **AM** điền sẵn theo khách hàng; chọn thêm **BA/PM**, **Dev**, **Tester** nếu đã biết (ô chọn người lọc theo vị trí của tài khoản).
4. Chọn **Loại sản phẩm** và **Sản phẩm** trong danh mục; **Mô tả sản phẩm** tự lấy từ danh mục, sửa được. Sau khi chọn **Loại sản phẩm**, nút **+ Thêm mới** hiện nếu bạn có quyền: với loại sản phẩm thường cần **Sản phẩm – Thêm**; với loại là "dự án", nút mở hộp thoại **Tạo dự án** và cần **Dự án – Thêm**.
5. Bấm **Thêm dự án**. Màn hình chuyển sang dự án vừa tạo để bạn [áp dụng quy trình mẫu](/help/kh-mau-hanh-trinh).
:::

:::perm sales_project.edit
### Sửa dự án

1. Mở khối **Thông tin dự án**, bấm biểu tượng **bút chì**.
2. Sửa tên, người phụ trách, sản phẩm, mô tả, ghi chú → **Lưu**.
:::

:::perm sales_project.delete
### Lưu trữ / mở lại dự án

1. Mở khối **Thông tin dự án**, bấm biểu tượng **hộp lưu trữ** → xác nhận. Dự án ẩn khỏi danh sách.
2. Muốn mở lại: tích **Xem đã lưu trữ**, mở dự án, bấm biểu tượng **mở lại**.
:::

:::perm plan.view
### Xem tiến độ dự án sản xuất

Khối **Liên kết tiến độ sản xuất** hiện dự án sản xuất đã gắn: mã, tên, trạng thái, BA/PM, số việc đã xong / tổng số việc. Bấm vào để mở **Kế hoạch chi tiết** của dự án sản xuất. Nếu bạn không vào được dự án sản xuất đó, khối hiện mờ kèm thông báo.

Việc gắn dự án sản xuất làm ở phân hệ **Dự án**: khi tạo dự án hoặc ở tab **Thông tin** của dự án sản xuất, chọn **Khách hàng** rồi chọn **Dự án của khách hàng**. Mỗi dự án của khách hàng chỉ gắn với một dự án sản xuất.
:::

## Lưu ý

- Thêm, sửa, lưu trữ chỉ làm được trên dự án bạn **liên quan** (Sale/AM của khách hàng; Sale, AM, BA/PM, Dev, Tester của dự án; người thực hiện / phối hợp bước; người được giao việc của dự án), hoặc mọi dự án nếu bạn có quyền **Thông tin khách hàng – Xem tất cả**.
- Không có quyền **Dự án của khách hàng – Xem**: bạn vẫn vào được dự án mình tham gia nhưng không thấy khối Thông tin dự án.
- Những người ở các ô Sale, AM, BA/PM, Dev, Tester là **người tham gia dự án**: chỉ họ (và người được xem tất cả khách hàng) mới được giao bước hành trình, công việc, lịch gọi của dự án.
