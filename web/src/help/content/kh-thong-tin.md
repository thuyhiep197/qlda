---
title: Thông tin khách hàng
section: customer
module: Khách hàng
order: 20
summary: Màn hình của một khách hàng — danh sách dự án, thông tin, đầu mối, Sale/AM, việc, tài liệu và trao đổi chung.
routes: /customers/:id
need: customer.view
keywords: đầu mối liên hệ, sửa khách hàng, lưu trữ khách hàng, mở lại, tình trạng khách hàng, sale, am, mã khách hàng
---

## Màn hình này dùng để làm gì

Bấm tên một khách hàng trong cây hoặc trong bảng để mở. Giữa là các **dự án của khách hàng**; cột phải là thông tin khách hàng và các mục chung (công việc, tài liệu, trao đổi không thuộc dự án nào).

![Màn hình một khách hàng](/help/img/kh-thong-tin.webp)

1. **Đầu trang** — tên khách hàng, tình trạng, địa chỉ, Sale, AM.
2. **Dự án của khách hàng** — mã, tên, sản phẩm, tình trạng, tiến độ hành trình, Sale, AM, số việc đang mở, dự án sản xuất đã gắn. Bấm một dòng để mở dự án.
3. **Thông tin khách hàng** — mã khách hàng, tình trạng, tỉnh thành, phường/xã, nguồn, Sale, AM và các **đầu mối liên hệ** (bấm số điện thoại / email để gọi, gửi thư).
4. **Sửa thông tin** (biểu tượng bút chì) và **Lưu trữ khách hàng** (biểu tượng hộp) ở đầu khối — chỉ hiện khi bạn có quyền tương ứng.
5. **Thêm dự án** — tạo dự án mới cho khách hàng, xem [Dự án của khách hàng](/help/kh-du-an).

Các khối ở cột phải mặc định thu gọn (trừ **Trao đổi**); bấm tên khối để mở. Khối **Công việc**, **Tài liệu**, **Trao đổi** chỉ hiện khi bạn có quyền xem chức năng đó — xem [Công việc](/help/kh-cong-viec), [Tài liệu](/help/kh-tai-lieu), [Trao đổi & lịch gọi điện](/help/kh-trao-doi).

## Thao tác

:::perm customer.edit
### Sửa thông tin, đầu mối, Sale/AM

1. Mở khối **Thông tin khách hàng**, bấm biểu tượng **bút chì**.
2. Sửa tên, tỉnh thành, phường/xã, đầu mối liên hệ (thêm bằng **Thêm đầu mối**, bỏ bằng dấu **×**), nguồn, tình trạng, Sale, AM.
3. Bấm **Lưu**.

- Mã khách hàng tự sinh, không sửa được.
- Đổi tên khách hàng thì tên mới được cập nhật luôn vào các dự án sản xuất đang gắn với khách hàng.
- Bạn không thể tự bỏ mình khỏi Sale / AM của khách hàng (vì sau đó sẽ không còn xem được khách hàng), trừ khi bạn có quyền Xem tất cả.
- Tình trạng chỉ chọn trong danh mục **Tình trạng khách hàng** (Quản trị → Danh mục). Tình trạng đã ngừng sử dụng vẫn giữ nguyên cho khách hàng đang ở tình trạng đó.
:::

:::perm customer.delete
### Lưu trữ / mở lại khách hàng

1. Mở khối **Thông tin khách hàng**, bấm biểu tượng **hộp lưu trữ** → xác nhận.
2. Khách hàng cùng các dự án của khách hàng ẩn khỏi danh sách (dữ liệu vẫn còn).
3. Muốn mở lại: tích **Xem đã lưu trữ** ở cây bên trái, mở khách hàng, bấm biểu tượng **mở lại**.
:::

## Lưu ý

- Thêm, sửa, lưu trữ chỉ làm được trên khách hàng bạn **liên quan** (Sale, AM, hoặc tham gia một dự án của khách hàng). Người có quyền **Xem tất cả** làm được trên mọi khách hàng — trong giới hạn các quyền Thêm/Sửa/Lưu trữ đang có.
- Người không có quyền **Thông tin khách hàng – Xem** không mở được màn hình này; họ chỉ thấy tên khách hàng và vào thẳng các dự án mình tham gia.
- Không có quyền **Dự án của khách hàng – Xem**: phần giữa chỉ liệt kê tên các dự án bạn tham gia (bấm để mở), không có bảng thông tin dự án.

## Câu hỏi thường gặp

**Tôi muốn xóa hẳn một khách hàng nhập nhầm?**
Công cụ không xóa khách hàng, chỉ lưu trữ. Lưu trữ thì khách hàng không còn hiện trong danh sách.
