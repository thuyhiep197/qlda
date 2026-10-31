---
title: Danh mục địa chính
section: admin
module: Danh mục
order: 40
summary: Danh sách tỉnh/thành phố và phường/xã (2 cấp) dùng để chọn địa chỉ khách hàng.
routes: /admin/geo
need: geo.view
keywords: tỉnh, thành phố, phường, xã, địa chỉ, đơn vị hành chính
---
## Màn hình này dùng để làm gì

Danh mục đơn vị hành chính **2 cấp** (tỉnh/thành phố → phường/xã, áp dụng từ 01/7/2025), dùng ở ô **Tỉnh thành**, **Phường/Xã** khi nhập khách hàng. Dữ liệu đã nạp sẵn theo Nghị quyết 388/NQ-UBTVQH16; khi có thay đổi địa giới, quản trị viên cập nhật tại đây. Mở bằng **Quản trị → Danh mục → Địa chính**.

![Màn hình Danh mục địa chính](/help/img/qt-dia-chinh.webp)

1. **Danh sách tỉnh/thành phố** — ô tìm nhanh, số bên phải là số phường/xã. Bấm một tỉnh để xem phường/xã của tỉnh đó.
2. **Tỉnh đang chọn** — tên, mã, nút **Đổi tên** và **Xóa**. Bên dưới là bảng phường/xã (Mã, Tên, số **Khách hàng** đang ở phường/xã đó), có ô tìm theo tên hoặc mã.
3. **+ Thêm phường/xã** (vào tỉnh đang chọn); bên cạnh là **+ Thêm tỉnh/thành phố**.

## Thao tác

:::perm geo.create
### Thêm tỉnh/thành phố, phường/xã

1. Bấm **+ Thêm tỉnh/thành phố**, hoặc chọn tỉnh rồi bấm **+ Thêm phường/xã**.
2. Nhập **Mã** (2–5 chữ số, không trùng) và **Tên** (không trùng trong cùng cấp).
3. Bấm **Thêm**.
:::

:::perm geo.edit
### Đổi tên

Bấm biểu tượng **Đổi tên** (cây bút) cạnh tỉnh hoặc phường/xã, nhập tên mới, bấm **Lưu**. Mã không đổi được.
:::

:::perm geo.delete
### Xóa

Bấm biểu tượng **Xóa** (thùng rác) → xác nhận. Không xóa được khi:
- tỉnh/thành phố còn phường/xã (xóa các phường/xã trước) hoặc còn khách hàng thuộc tỉnh đó;
- phường/xã còn khách hàng.
:::

## Lưu ý

Danh mục dùng chung cho mọi phân hệ: người nhập khách hàng chọn được tỉnh, phường/xã mà không cần quyền xem màn hình này.
