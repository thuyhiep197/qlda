---
title: Phòng ban & Nhân sự
section: admin
module: Danh mục
order: 30
summary: Sơ đồ tổ chức (Ban Giám đốc → các phòng → các nhóm) và xếp tài khoản vào phòng ban với vị trí BGĐ, Sale, AM, BA/PM, Dev, Tester, Hành chính.
routes: /admin/org
need: department.view | staff.view
keywords: sơ đồ tổ chức, phòng ban, nhân sự, vị trí, quản lý, chưa xếp phòng, sale, am, dev, tester
---
## Màn hình này dùng để làm gì

Quản lý sơ đồ tổ chức và cho biết mỗi người thuộc phòng ban nào, giữ **vị trí** gì. Mở bằng **Quản trị → Danh mục → Phòng ban & Nhân sự**.

**Nhân sự chính là tài khoản người dùng** (tạo ở [Người dùng](/help/qt-nguoi-dung)). Vị trí quyết định người đó được chọn ở vai trò nào:
- **Sale**, **AM** của khách hàng;
- **BA/PM**, **Dev**, **Tester**, **AM** của dự án.

Mã vị trí (KD, AM, BA, DEV, Tester, HC, BGĐ) hiện cạnh tên người trong hành trình khách hàng.

![Màn hình Phòng ban & Nhân sự](/help/img/qt-phong-ban.webp)

1. **Tìm nhân sự, vị trí** — lọc nhanh người trong sơ đồ.
2. **+ Thêm phòng ban**.
3. **+ Xếp người vào phòng** — đưa một tài khoản chưa có phòng ban vào phòng.
4. **Ô phòng ban / nhóm** — tên, mã, số nhân sự, số nhóm bên trong; các nút **Thêm nhóm / bộ phận**, **Thêm nhân sự**, **Sửa**, **Xóa**. Bên dưới là từng người với mã vị trí, tên đăng nhập và người quản lý (nếu có).

Sơ đồ phòng ban chỉ hiện khi có quyền **Phòng ban – Xem**; danh sách người chỉ hiện khi có **Nhân sự – Xem** (chỉ có Nhân sự – Xem thì thấy danh sách nhân sự kèm tên phòng ban, không có sơ đồ). Cuối trang có ô **Tài khoản chưa xếp phòng ban** liệt kê những tài khoản chưa thuộc phòng nào.

## Vị trí theo phòng ban

Mỗi phòng chỉ cho chọn một số vị trí (nhóm con dùng chung bộ vị trí của phòng chứa nó):

| Phòng ban | Vị trí chọn được |
|---|---|
| Ban Giám đốc (mã BGĐ) | Ban Giám đốc (tích sẵn), Sale, AM |
| Phòng Kinh doanh (mã P.KD) | Sale, AM |
| Phòng Dự án (P.DA), Phòng Sản phẩm (P.SP) | BA/PM, Dev, Tester |
| Phòng Hành chính (P.HC) | Hành chính |
| Phòng ban tự thêm khác | Mọi vị trí |

Khi thêm người vào một nhóm có mã kết thúc bằng SALE, AM, DEV, BA, TEST (VD `P.KD.SALE`), vị trí tương ứng được tích sẵn.

## Thao tác

:::perm department.create
### Thêm phòng ban, nhóm / bộ phận

1. Bấm **+ Thêm phòng ban** (hoặc biểu tượng **Thêm nhóm / bộ phận** trên ô một phòng để thêm nhóm bên trong phòng đó).
2. Nhập **Tên phòng ban**, **Mã** (không trùng, VD `P.KD`), chọn **Trực thuộc**.
3. Bấm **Thêm**.
:::

:::perm department.edit
### Sửa phòng ban

Bấm biểu tượng **Sửa** (cây bút) trên ô phòng ban, đổi tên, mã hoặc phòng ban trực thuộc, rồi **Lưu**.
:::

:::perm department.delete
### Xóa phòng ban

Bấm biểu tượng **Xóa** (thùng rác) trên ô phòng ban. Chỉ xóa được khi phòng ban **không còn nhóm cấp dưới và không còn nhân sự** — chuyển người sang phòng khác trước.
:::

:::perm staff.create
### Xếp người vào phòng ban

1. Bấm **+ Xếp người vào phòng**, biểu tượng **Thêm nhân sự** (+) trên ô một phòng, hoặc bấm tên người trong ô **Tài khoản chưa xếp phòng ban**.
2. Chọn **Tài khoản** (chỉ liệt kê tài khoản chưa thuộc phòng nào), **Phòng ban**, tích **Vị trí** (ít nhất một).
3. Chọn **Quản lý** nếu có (người cùng phòng xếp lên trước), ghi **Ghi chú** (VD TTS, CTV).
4. Bấm **Thêm**.
:::

:::perm staff.edit
### Sửa phòng ban, vị trí, quản lý của một người

1. Bấm vào tên người trong sơ đồ.
2. Đổi **Phòng ban**, **Vị trí**, **Quản lý**, **Ghi chú**. Đổi sang phòng khác thì các vị trí không thuộc phòng mới được tự bỏ tích — kiểm tra lại **Vị trí** trước khi bấm **Lưu**.
3. Bấm **Lưu**.

Quyền này cũng mở ô Phòng ban / Vị trí trong hộp thoại Sửa tài khoản ở màn Người dùng.
:::

:::perm staff.delete
### Bỏ người khỏi phòng ban

Bấm biểu tượng thùng rác cạnh tên người → xác nhận. Tài khoản vẫn còn; khách hàng, dự án đã chọn người này giữ nguyên. Vị trí của người đó bị xóa nên họ không còn hiện trong các ô chọn Sale / AM / BA / Dev / Tester cho đến khi được xếp lại. Người đó chuyển xuống ô **Tài khoản chưa xếp phòng ban**.
:::

## Lưu ý

- Khi **tạo tài khoản** mới ở màn Người dùng, phòng ban và vị trí là bắt buộc (trừ tài khoản Quản trị hệ thống) và chỉ cần quyền **Người dùng – Thêm**. Sửa phòng ban / vị trí về sau cần **Nhân sự – Sửa**.
- Người không có vị trí phù hợp sẽ không xuất hiện trong ô chọn tương ứng, VD người không có vị trí Dev thì không chọn được vào ô Dev của dự án.
- Tài khoản Quản trị hệ thống không bắt buộc thuộc phòng ban và không hiện ở các ô chọn người.
