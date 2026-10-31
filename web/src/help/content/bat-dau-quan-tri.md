---
title: Bắt đầu nhanh – Quản trị
section: start
order: 7
summary: Tạo tài khoản, phân quyền, mở khóa, đặt lại mật khẩu và quản lý danh mục dùng chung.
need: sub:admin
keywords: quản trị, tài khoản, phân quyền, danh mục, mật khẩu, khóa
---
## Việc thường làm

:::perm user.create
### 1. Tạo tài khoản
1. Vào **Quản trị** → **Người dùng**, bấm **+ Tạo tài khoản**.
2. Nhập tên đăng nhập, họ tên, chọn nhóm người dùng, **phòng ban** và **vị trí** (bắt buộc, trừ nhóm Quản trị hệ thống), nhập mật khẩu tạm (hoặc bấm **Tạo ngẫu nhiên**).
3. Gửi tên đăng nhập và mật khẩu tạm cho người dùng; lần đầu đăng nhập họ phải đổi mật khẩu.

Chi tiết: [Người dùng](/help/qt-nguoi-dung).
:::

:::perm role.edit
### 2. Phân quyền
- Phân quyền theo nhóm: **Quản trị** → **Phân quyền**, chọn nhóm, tích các ô trong ma trận, bấm **Lưu thay đổi**.
- Cấp thêm quyền riêng cho một người: ở danh sách người dùng bấm biểu tượng **Phân quyền** của người đó.

Chi tiết: [Phân quyền](/help/qt-phan-quyen).
:::

:::perm user.edit
### 3. Đặt lại mật khẩu
Ở **Người dùng**, bấm biểu tượng **Đặt lại mật khẩu** của người cần cấp lại → **Đặt lại**. Hệ thống đặt một mật khẩu tạm và hiện ngay trên màn hình để bạn gửi cho người dùng; họ phải đổi mật khẩu khi đăng nhập.
:::

:::perm user.delete
### 4. Khóa tài khoản
Bấm biểu tượng **Khóa tài khoản** khi nhân sự nghỉ việc. Tài khoản bị khóa không đăng nhập được nữa.
:::

:::perm user.edit
### 5. Mở khóa tài khoản
Bấm biểu tượng **Mở khóa tài khoản** khi một người bị khóa (VD do nhập sai mật khẩu 5 lần liên tiếp).
:::

:::perm department.edit | staff.edit
### 6. Sắp xếp phòng ban, nhân sự
**Quản trị** → **Danh mục** → **Phòng ban & Nhân sự**: sơ đồ tổ chức, xếp người vào phòng ban, chọn vị trí (BGĐ, Sale, AM, BA/PM, Dev, Tester…). Vị trí quyết định người đó có trong ô chọn người ở dự án hay không. Xem [Phòng ban & Nhân sự](/help/qt-phong-ban-nhan-su).
:::

:::perm product.edit | cstatus.edit | geo.edit
### 7. Cập nhật danh mục dùng chung
- [Sản phẩm](/help/qt-san-pham): loại sản phẩm và sản phẩm chọn cho dự án của khách hàng.
- [Tình trạng khách hàng](/help/qt-tinh-trang-kh): danh sách tình trạng, kéo thả để sắp xếp.
- [Địa chính](/help/qt-dia-chinh): tỉnh/thành phố, phường/xã.
:::

:::perm user.view
### 8. Kiểm tra nhật ký bảo mật
**Quản trị** → **Nhật ký bảo mật**: đăng nhập, đăng nhập thất bại, khóa tài khoản, đổi quyền… Xem [Nhật ký bảo mật](/help/qt-nhat-ky-bao-mat).
:::
