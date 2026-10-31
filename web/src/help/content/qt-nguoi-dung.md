---
title: Người dùng
section: admin
module: Người dùng & phân quyền
order: 10
summary: Tạo và quản lý tài khoản đăng nhập: nhóm người dùng, phòng ban, đặt lại mật khẩu, khóa / mở khóa.
routes: /admin/users
need: user.view
keywords: tài khoản, tạo tài khoản, mật khẩu, đặt lại mật khẩu, khóa, mở khóa, bị khóa, quên mật khẩu, đăng xuất tất cả
---
## Màn hình này dùng để làm gì

Danh sách mọi tài khoản đăng nhập vào QLDA. Từ đây quản trị viên tạo tài khoản mới, chọn nhóm người dùng (quyết định người đó được dùng chức năng nào), xếp phòng ban, đặt lại mật khẩu, khóa hoặc mở khóa tài khoản.

Mở bằng menu **Quản trị → Người dùng**.

![Màn hình Người dùng](/help/img/qt-nguoi-dung.webp)

1. **Thanh lọc** — gõ họ tên, tên đăng nhập hoặc email (có dấu hay không dấu đều được): danh sách gợi ý hiện ngay bên dưới, bấm chọn (hoặc dùng phím ↑ ↓ rồi Enter) để bảng chỉ còn tài khoản đó; gõ tiếp để tìm lại. Lọc theo nhóm người dùng (có mục **Chưa có nhóm**); bật **Xếp theo nhóm** để gom tài khoản theo từng nhóm (lựa chọn này được nhớ trên máy bạn).
2. **Đăng xuất tất cả mọi người** — nút khẩn cấp, chỉ tài khoản Quản trị hệ thống thấy.
3. **+ Tạo tài khoản**.
4. **Trạng thái** — **Hoạt động** hoặc **Đã khóa** (dòng bị khóa hiện mờ).
5. **Thao tác** trên từng dòng (rê chuột vào biểu tượng để xem tên): **Phân quyền**, **Sửa**, **Đặt lại mật khẩu**, **Khóa tài khoản** / **Mở khóa tài khoản**.

Nếu có tài khoản chưa được chọn nhóm, đầu trang hiện thông báo đỏ "Có … tài khoản chưa có nhóm người dùng" — bấm **Sửa** ở các tài khoản đó để chọn nhóm.

## Thao tác

:::perm user.create
### Tạo tài khoản

![Hộp thoại Tạo tài khoản](/help/img/qt-tao-tai-khoan.webp)

1. Bấm **+ Tạo tài khoản**.
2. Nhập **Tên đăng nhập** (3–50 ký tự, chữ thường không dấu, số, dấu `.` `_` `-`, VD `nguyen.van.a`). Tên đăng nhập **không đổi được** sau khi tạo.
3. Nhập **Họ tên**, **Email** (không bắt buộc).
4. Chọn **Nhóm người dùng**. Khi chọn nhóm, ô Phòng ban và Vị trí được gợi ý sẵn — kiểm tra lại cho đúng.
5. Chọn **Phòng ban** rồi tích **Vị trí** (một hoặc nhiều). Phòng ban và vị trí là **bắt buộc**, trừ khi chọn nhóm Quản trị hệ thống. Danh sách vị trí tùy theo phòng ban (xem [Phòng ban & Nhân sự](/help/qt-phong-ban-nhan-su)).
6. **Mật khẩu tạm**: hệ thống tạo sẵn một mật khẩu ngẫu nhiên; bấm **Tạo ngẫu nhiên** để đổi, hoặc tự gõ (ít nhất 10 ký tự, có cả chữ và số, không dấu, không chứa tên đăng nhập, không quá dễ đoán).
7. Bấm **Tạo tài khoản**. Hộp thoại hiện địa chỉ đăng nhập, tên đăng nhập và mật khẩu tạm — bấm **Sao chép** rồi gửi cho người dùng. Ở lần đăng nhập đầu tiên, người dùng **bắt buộc đổi mật khẩu**.
:::

:::perm user.edit
### Sửa thông tin tài khoản

1. Bấm biểu tượng **Sửa** (cây bút) trên dòng của người dùng.
2. Sửa **Họ tên**, **Email**, **Nhóm người dùng**.
3. Bấm **Lưu**.

Đổi nhóm người dùng là đổi toàn bộ quyền theo nhóm của người đó; vai trò của họ trong các dự án cũng theo nhóm mới.
:::

:::perm user.edit, staff.edit
### Đổi phòng ban, vị trí khi sửa tài khoản

Ô **Phòng ban** và **Vị trí** trong hộp thoại Sửa chỉ hiện khi bạn có thêm quyền **Nhân sự – Sửa**. Có thể làm việc này ở màn [Phòng ban & Nhân sự](/help/qt-phong-ban-nhan-su).
:::

:::perm user.edit
### Đặt lại mật khẩu (người dùng quên mật khẩu)

1. Bấm biểu tượng **Đặt lại mật khẩu** (chìa khóa).
2. Bấm **Đặt lại**. Mật khẩu được đặt về mật khẩu tạm mặc định (hiện ngay trong hộp thoại để bạn báo cho người dùng).
3. Báo người dùng đăng nhập bằng mật khẩu này; hệ thống bắt họ đổi mật khẩu ngay. Mọi phiên đăng nhập cũ của người đó trên các máy khác cũng bị đăng xuất.
:::

:::perm user.delete
### Khóa tài khoản

1. Bấm biểu tượng **Khóa tài khoản** (ổ khóa) → xác nhận.
2. Người dùng không đăng nhập được nữa. Tài khoản và dữ liệu vẫn giữ nguyên (không xóa).

Dùng khi nhân sự nghỉ việc hoặc nghi tài khoản bị lộ. Bạn không tự khóa tài khoản của chính mình được.
:::

:::perm user.edit
### Mở khóa tài khoản

1. Tìm tài khoản cần mở khóa (dòng có trạng thái **Đã khóa** hiện mờ).
2. Bấm biểu tượng **Mở khóa tài khoản**. Số lần nhập sai mật khẩu được đếm lại từ đầu.

Tài khoản **tự bị khóa** khi nhập sai mật khẩu **5 lần liên tiếp**; người dùng sẽ thấy thông báo "liên hệ quản trị viên để mở khóa". Nếu người đó cũng không nhớ mật khẩu, mở khóa xong thì đặt lại mật khẩu.
:::

### Xem, cấp thêm quyền riêng cho một người

:::perm role.view
Bấm biểu tượng **Phân quyền** (khiên) trên dòng để xem quyền của người đó — xem chi tiết ở [Nhóm người dùng & phân quyền](/help/qt-phan-quyen).
:::

:::perm role.edit
Tích thêm các ô quyền riêng cho người đó rồi bấm **Lưu thay đổi**. Chỉ cấp thêm được, không bỏ bớt quyền của nhóm.
:::

:::perm admin
### Đăng xuất tất cả mọi người (khẩn cấp)

1. Bấm **Đăng xuất tất cả mọi người** → xác nhận.
2. Mọi tài khoản (trừ bạn) bị đăng xuất ngay và phải đăng nhập lại.

Chỉ dùng khi nghi có người lạ đang dùng tài khoản trong hệ thống. Sau đó nên kiểm tra [Nhật ký bảo mật](/help/qt-nhat-ky-bao-mat) và đặt lại mật khẩu cho tài khoản nghi bị lộ.
:::

## Lưu ý

- **Tài khoản Quản trị hệ thống** (thuộc nhóm Quản trị hệ thống) luôn có toàn quyền. Chỉ Quản trị hệ thống mới tạo, sửa, đặt lại mật khẩu, khóa / mở khóa được tài khoản loại này, và chỉ Quản trị hệ thống mới đưa một tài khoản vào hoặc ra khỏi nhóm này. Hệ thống luôn phải còn ít nhất một tài khoản Quản trị hệ thống đang hoạt động.
- Tài khoản Quản trị hệ thống **không hiện** trong các ô chọn người (giao việc, Sale/AM, BA/Dev/Tester…) và gợi ý nhắc tên @.
- Bạn không tự đổi nhóm người dùng của chính mình được (trừ Quản trị hệ thống).
- Khi gán nhóm cho người khác: người có đủ mọi ô của **Người dùng** và **Nhóm người dùng & phân quyền** gán được mọi nhóm thường; người khác chỉ gán được nhóm mà mọi quyền của nhóm đó mình cũng có.
- Mọi thao tác tạo, sửa, khóa, đặt lại mật khẩu đều được ghi vào [Nhật ký bảo mật](/help/qt-nhat-ky-bao-mat).

## Câu hỏi thường gặp

**Người dùng báo "Tài khoản đã bị khóa" dù không ai khóa?**
Họ đã nhập sai mật khẩu 5 lần liên tiếp. Bấm **Mở khóa tài khoản**, rồi **Đặt lại mật khẩu** nếu họ quên mật khẩu.

**Tại sao tôi không thấy nút Sửa / Khóa ở một dòng?**
Dòng đó là tài khoản Quản trị hệ thống (chỉ Quản trị hệ thống thao tác được), là chính bạn (không tự khóa), hoặc bạn chưa có quyền tương ứng — xem [Quyền của tôi](/help/quyen-cua-toi).

**Xóa hẳn tài khoản được không?**
Không. Tài khoản chỉ khóa để giữ lịch sử công việc, bình luận, nhật ký của người đó.
