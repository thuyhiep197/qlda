---
title: Nhóm người dùng & phân quyền
section: admin
module: Người dùng & phân quyền
order: 20
summary: Đặt quyền cho từng nhóm người dùng theo ma trận Phân hệ → Module → Chức năng × hành động, và cấp thêm quyền riêng cho từng người.
routes: /admin/roles
need: role.view
keywords: phân quyền, quyền, nhóm, vai trò, ma trận, xem tất cả, cấp quyền, quyền riêng, không thấy menu
---
## Màn hình này dùng để làm gì

Quyết định **ai được thấy và làm gì** trong QLDA. Mở bằng menu **Quản trị → Phân quyền**. Màn hình có 2 tab:

- **Theo nhóm người dùng** — bảng quyền của từng nhóm (VD Kinh doanh, AM, BA, Dev…). Mọi người thuộc nhóm có các quyền này.
- **Theo người dùng** — xem quyền của một người và **cấp thêm quyền riêng** cho người đó.

**Quyền thực tế của một người = quyền của nhóm + quyền cấp thêm riêng.** Quyền riêng chỉ cộng thêm, không bớt được quyền của nhóm; muốn bớt thì đổi nhóm của người đó hoặc sửa quyền của nhóm.

![Tab Theo nhóm người dùng](/help/img/qt-phan-quyen.webp)

1. **Hai tab** Theo nhóm người dùng / Theo người dùng.
2. **Danh sách nhóm** — mỗi nhóm ghi số người thuộc nhóm và số quyền.
3. **Thanh thao tác của nhóm**: Sao chép quyền từ nhóm…, Đổi tên, Xóa nhóm, **Lưu thay đổi**.
4. **Các cột hành động**: Xem, Thêm, Sửa, Xóa, Tải, Import, Xem tất cả, Tất cả.
5. **Dòng phân hệ** — tiêu đề xanh của từng phân hệ (Dashboard, Khách hàng, Dự án, Tài liệu nội bộ, Quản trị).

## Cách đọc ma trận quyền

Ma trận xếp theo 3 cấp: **Phân hệ → Module → Chức năng**; mỗi chức năng có các ô hành động.

- **Dòng chức năng**: mỗi ô là một quyền. Ô gạch chéo = hành động không áp dụng cho chức năng đó. Rê chuột vào ô để xem giải thích.
- **Ô có tên riêng**: ở một số chức năng, cột mang nghĩa riêng và tên ghi ngay dưới ô, VD **Lưu trữ** (cột Xóa của Khách hàng, Dự án), **Khóa** (cột Xóa của Người dùng), **Tải lên / Tải về** (Tài liệu), **Ngừng sử dụng** (Tình trạng khách hàng), **Áp dụng mẫu, thêm bước / Cập nhật bước / Bỏ bước** (Hành trình).
- **Dòng Module** (chữ đậm): tích một cột = tích cột đó cho mọi chức năng trong module.
- **Cột Tất cả**: ở dòng chức năng bật / tắt mọi hành động của chức năng; ở dòng module, dòng phân hệ bật / tắt cả module, cả phân hệ.
- Ô hiện trạng thái "một phần" (gạch ngang) khi chỉ một số quyền bên trong được bật.

### Xem và Xem tất cả

- **Thông tin khách hàng**: **Xem** = chỉ khách hàng, dự án mình phụ trách, thực hiện hoặc phối hợp. **Xem tất cả** = mọi khách hàng, dự án của khách hàng; các quyền Thêm, Sửa, Xóa đang có áp dụng trên tất cả.
- **Dự án** (phân hệ Dự án): không có **Xem tất cả** thì chỉ vào được dự án mình là thành viên và dự án sản xuất liên kết với khách hàng / dự án của khách hàng mình phụ trách; **Xem tất cả** = vào mọi dự án, các quyền đang có áp dụng trên tất cả. Riêng ô **Dự án – Xem** là quyền xem tab **Thông tin** của dự án.
- **Tài liệu nội bộ**: **Xem** = thấy mọi thư mục nhưng chỉ thấy tệp mình tải lên; **Xem tất cả** = thấy tệp của mọi người.

### Quy tắc hiện menu và màn hình

- Một **phân hệ** hiện trên menu khi người dùng có **ít nhất một ô Xem (hoặc Xem tất cả)** ở bất kỳ module nào của phân hệ đó. Không có ô nào → phân hệ bị ẩn và không vào được.
- Một **màn hình / tab** chỉ hiện khi có ô Xem của chức năng đó.
- Nút, ô nhập, kéo thả chỉ hiện khi có đúng ô hành động tương ứng (Thêm, Sửa, Xóa, Tải, Import).
- Là thành viên dự án, là Sale/AM của khách hàng… **không thay** cho ô quyền: vẫn phải được tích ô mới dùng được.

## Thao tác

:::perm role.create
### Tạo nhóm người dùng

1. Ở tab **Theo nhóm người dùng**, bấm **+ Tạo nhóm**, nhập tên nhóm.
2. Nhóm mới được tích sẵn vài quyền xem cơ bản của phân hệ Dự án (Kế hoạch – Xem, Issue – Xem, Bình luận – Xem, Bình luận – Thêm). Kiểm tra lại, bỏ đi nếu nhóm không cần.
3. Tích các ô quyền cần thiết rồi bấm **Lưu thay đổi**.
:::

:::perm role.edit
### Sửa quyền của nhóm

1. Chọn nhóm ở danh sách bên trái.
2. Tích / bỏ tích các ô. Có thể chọn **Sao chép quyền từ nhóm…** để lấy bảng quyền của nhóm khác làm điểm bắt đầu.
3. Bấm **Lưu thay đổi**. Nếu chuyển sang nhóm khác khi chưa lưu, hệ thống hỏi có bỏ thay đổi không.

Quyền mới có hiệu lực ngay với mọi người trong nhóm; nhờ họ tải lại trang (F5) để giao diện cập nhật.

### Đổi tên, mô tả nhóm

Bấm **Đổi tên**, nhập tên mới rồi mô tả (có thể bỏ trống). Hộp mô tả chỉ hiện khi bạn đổi tên.
:::

:::perm role.delete
### Xóa nhóm

Nút **Xóa nhóm** chỉ hiện khi nhóm không còn ai (0 người) và không còn được dùng trong dự án nào. Muốn xóa nhóm đang có người: vào [Người dùng](/help/qt-nguoi-dung) đổi nhóm cho những người đó trước.
:::

:::perm role.edit
### Cấp thêm quyền riêng cho một người

![Tab Theo người dùng](/help/img/qt-phan-quyen-nguoi-dung.webp)

1. Chọn tab **Theo người dùng** (hoặc bấm biểu tượng **Phân quyền** trên dòng người dùng ở màn Người dùng).
2. Tìm và chọn người ở danh sách bên trái (1). Dòng dưới tên ghi nhóm và số quyền riêng đang có (VD "+2 quyền riêng").
3. Đọc chú thích (2): ô **đã tích sẵn và khóa** là quyền theo nhóm (không bỏ được ở đây); ô **nền xanh** là quyền cấp thêm riêng.
4. Tích thêm các ô cần cấp. Bấm **Bỏ hết quyền riêng** nếu muốn trả về đúng quyền nhóm.
5. Bấm **Lưu thay đổi** (3).
:::

## Lưu ý

- Nhóm **Quản trị hệ thống** luôn có toàn quyền trên mọi phân hệ, dự án, khách hàng. Quyền của nhóm này cố định: không sửa, không đổi tên, không xóa được. Cấp / gỡ quản trị = đổi nhóm của tài khoản ở màn Người dùng (chỉ Quản trị hệ thống làm được).
- Tự cấp quyền riêng cho chính mình: chỉ Quản trị hệ thống hoặc người có đủ mọi ô của **Người dùng** và **Nhóm người dùng & phân quyền** làm được; việc tự cấp được ghi vào **Nhật ký bảo mật**. Không ai (trừ Quản trị hệ thống) tự đổi nhóm của mình hoặc tự nâng quyền qua nhóm mình đang thuộc.
- Người có đủ mọi ô của **Người dùng** và **Nhóm người dùng & phân quyền** cấp được mọi quyền; người khác chỉ cấp được quyền mà chính mình đang có.
- Có ô **Nhóm người dùng & phân quyền – Xem** nhưng không có **Người dùng – Xem**: tab Theo người dùng vẫn chỉ liệt kê tài khoản đang hoạt động, nhưng không hiện số quyền riêng và không hiện các tài khoản Quản trị hệ thống.
- Mọi thay đổi quyền nhóm và quyền riêng được ghi vào [Nhật ký bảo mật](/help/qt-nhat-ky-bao-mat) (ô bị thêm / bỏ).
- Mỗi người tự xem quyền của mình ở [Quyền của tôi](/help/quyen-cua-toi).

## Câu hỏi thường gặp

**Người dùng báo không thấy menu Khách hàng / Dự án?**
Họ chưa có ô Xem nào trong phân hệ đó. Mở tab Theo người dùng, chọn người đó và kiểm tra các ô Xem của phân hệ.

**Người dùng thấy dự án nhưng không thấy dự án khác của công ty?**
Không có **Dự án – Xem tất cả** thì chỉ vào được dự án mình là thành viên (và dự án liên kết với khách hàng mình phụ trách). Chọn người đó vào ô BA/PM, Dev, Tester hoặc AM của dự án (tab Thông tin dự án), hoặc cấp **Dự án – Xem tất cả** nếu họ cần thấy mọi dự án.

**Sửa quyền nhóm có ảnh hưởng quyền riêng đã cấp không?**
Không. Quyền riêng giữ nguyên và vẫn được cộng thêm vào quyền nhóm mới.
