---
title: Danh mục sản phẩm
section: admin
module: Danh mục
order: 50
summary: Loại sản phẩm và sản phẩm (kèm mô tả) dùng để chọn cho dự án của khách hàng.
routes: /admin/products
need: product.view
keywords: sản phẩm, loại sản phẩm, mô tả sản phẩm, sản phẩm có sẵn, loại dự án
---
## Màn hình này dùng để làm gì

Danh mục **Loại sản phẩm** và **Sản phẩm** để chọn cho dự án của khách hàng. Khi chọn một sản phẩm cho dự án của khách hàng, **mô tả** của sản phẩm được tự điền vào ô "Mô tả sản phẩm". Mở bằng **Quản trị → Danh mục → Sản phẩm**.

![Màn hình Danh mục sản phẩm](/help/img/qt-san-pham.webp)

1. **Loại sản phẩm** — mỗi loại kèm số sản phẩm, nút **Đổi tên**, **Xóa**.
2. **Thanh lọc** — lọc theo loại (Tất cả, từng loại) và tìm theo tên sản phẩm.
3. **+ Thêm sản phẩm**; bên cạnh là **+ Thêm loại sản phẩm**.

Bảng sản phẩm gồm Tên, Loại, Mô tả và cột **Khách hàng** (số khách hàng đang chọn sản phẩm theo cách cũ, trước khi sản phẩm chuyển sang chọn theo dự án của khách hàng).

## Loại "Dự án"

Loại **Dự án** đặc biệt: mỗi sản phẩm loại này chính là một dự án trong phân hệ Dự án (mã dự án hiện cạnh tên, bấm để mở dự án).
- Tạo dự án ở phân hệ Dự án là tự có trong danh mục; thêm sản phẩm loại Dự án ở đây = mở form **Tạo dự án** (cần quyền **Dự án – Thêm**).
- Sửa tên / mô tả sản phẩm loại Dự án = sửa dự án (cần thêm **Dự án – Sửa**).
- Không xóa được sản phẩm loại Dự án (lưu trữ dự án ở phân hệ Dự án), không xóa được loại Dự án.

## Thao tác

:::perm product.create
### Thêm loại sản phẩm

Bấm **+ Thêm loại sản phẩm**, nhập **Tên loại sản phẩm** (không trùng), bấm **Thêm**.

### Thêm sản phẩm

1. Bấm **+ Thêm sản phẩm** (đang lọc theo một loại thì loại đó được chọn sẵn).
2. Chọn **Loại sản phẩm**, nhập **Tên sản phẩm** (không trùng trong cùng loại), **Mô tả sản phẩm**.
3. Bấm **Thêm**.
:::

:::perm product.edit
### Sửa sản phẩm, đổi tên loại

Bấm biểu tượng **Sửa** (cây bút) trên dòng sản phẩm hoặc cạnh tên loại. Sửa mô tả ở đây **không đổi** mô tả đã ghi ở các dự án của khách hàng đã chọn sản phẩm trước đó.
:::

:::perm product.delete
### Xóa sản phẩm, loại sản phẩm

- Xóa sản phẩm: bấm biểu tượng thùng rác → xác nhận. Dự án của khách hàng đang chọn sản phẩm này được gỡ sản phẩm, vẫn giữ loại sản phẩm và mô tả đã ghi.
- Xóa loại sản phẩm: chỉ được khi loại không còn sản phẩm nào (xóa hoặc chuyển các sản phẩm sang loại khác trước).
:::

## Lưu ý

Danh mục dùng chung: người nhập dự án của khách hàng chọn được sản phẩm mà không cần quyền xem màn hình này.
