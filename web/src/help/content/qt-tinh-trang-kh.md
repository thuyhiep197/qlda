---
title: Tình trạng khách hàng
section: admin
module: Danh mục
order: 60
summary: Danh mục tình trạng chọn cho khách hàng (Mới, Đang tư vấn, Đã ký hợp đồng…): thêm, đổi tên, ngừng / dùng lại, kéo thả sắp xếp.
routes: /admin/customer-statuses
need: cstatus.view
keywords: tình trạng, trạng thái khách hàng, ngừng sử dụng, sắp xếp, kéo thả
---
## Màn hình này dùng để làm gì

Danh mục các **tình trạng** chọn cho khách hàng. Thứ tự ở đây là thứ tự hiện trong ô chọn tình trạng của khách hàng và trên Dashboard. Mở bằng **Quản trị → Danh mục → Tình trạng khách hàng**.

![Màn hình Tình trạng khách hàng](/help/img/qt-tinh-trang-kh.webp)

1. **Ô thêm tình trạng mới** và nút **+ Thêm**.
2. **Tay nắm kéo thả** (⋮⋮) ở đầu dòng.
3. **Thao tác**: **Sửa tên** (cây bút), **Ngừng sử dụng** / **Dùng lại**.

Bảng ghi số khách hàng đang ở mỗi tình trạng và trạng thái **Đang sử dụng** / **Ngừng sử dụng**.

## Thao tác

:::perm cstatus.create
### Thêm tình trạng

Nhập tên vào ô (VD "Tạm dừng"), bấm **+ Thêm**. Tình trạng mới nằm cuối danh sách — kéo lên vị trí mong muốn.
:::

:::perm cstatus.edit
### Đổi tên

1. Bấm **Sửa tên** (cây bút), sửa tên.
2. Nhấn **Enter** hoặc bấm dấu ✓ để lưu (**Esc** để hủy).

Mọi khách hàng đang ở tình trạng này được cập nhật theo tên mới.

### Sắp xếp thứ tự

Giữ chuột vào biểu tượng ⋮⋮ ở đầu dòng, kéo lên / xuống rồi thả. Thứ tự lưu ngay khi thả.
:::

:::perm cstatus.delete
### Ngừng / dùng lại một tình trạng

Bấm **Ngừng sử dụng** → xác nhận. Tình trạng này không chọn được cho khách hàng nữa; khách hàng **đang ở** tình trạng đó giữ nguyên. Bấm **Dùng lại** để mở lại. Phải luôn còn ít nhất một tình trạng đang sử dụng.
:::

## Lưu ý

Tình trạng không xóa hẳn được, chỉ ngừng sử dụng — để giữ đúng dữ liệu của khách hàng cũ.
