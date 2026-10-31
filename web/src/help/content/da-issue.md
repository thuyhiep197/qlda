---
title: Chi tiết issue
section: project
module: Công việc
order: 80
summary: Xem và sửa một issue — trạng thái, người thực hiện, các trường, việc con, liên kết, tệp đính kèm, bình luận, ghi giờ công, người theo dõi.
routes: ?issue, /browse/:issueKey
need: issue.view
keywords: issue, chi tiết, sửa issue, bình luận, nhắc tên, @, tệp đính kèm, đính kèm, ghi thời gian, worklog, giờ công, theo dõi, người theo dõi, việc con, sub-task, liên kết, nhân bản, chuyển dự án, đánh dấu quan trọng, xóa issue, lịch sử thay đổi
---

## Màn hình này dùng để làm gì

Bấm vào một issue ở bất kỳ đâu (Kế hoạch, bảng, Backlog, danh sách…) sẽ mở bảng chi tiết bên phải. Đường dẫn `/browse/<mã issue>` (VD `/browse/DEMO-4`) mở issue thành trang riêng — dùng để gửi cho người khác.

![Chi tiết issue](/help/img/da-issue.webp)

1. **Đầu bảng** — loại, mã issue; các nút ⚑ **Đánh dấu quan trọng**, **Sao chép liên kết**, **Nhân bản**, **Chuyển sang dự án khác**, **Xóa issue** (chỉ hiện nút bạn có quyền).
2. **Nội dung** — tiêu đề, mô tả, việc con / issue trong Epic, liên kết issue, tệp đính kèm.
3. **Hoạt động** — các tab **Bình luận**, **Nhật ký giờ**, **Lịch sử thay đổi**.
4. **Cột thông tin** — trạng thái, người thực hiện, người tạo, ghi chú, loại, độ ưu tiên, Epic, mô-đun, BA / Dev phụ trách, sprint, điểm, nhãn, ngày, theo dõi thời gian, người theo dõi.

## Ai sửa được issue

- Có quyền **Issue – Sửa**: sửa mọi issue của dự án.
- Có quyền **Issue của mình – Sửa**: sửa issue do mình tạo hoặc đang được giao cho mình.
- Đổi trạng thái, người thực hiện, sprint là các quyền riêng (xem từng mục dưới đây).

## Thao tác

:::perm issue.edit | issue_own.edit
### Sửa tiêu đề, mô tả và các trường
- **Tiêu đề**: bấm vào để sửa, **Enter** để lưu.
- **Mô tả**: bấm vào để sửa (hỗ trợ định dạng văn bản: in đậm, danh sách…), bấm lưu.
- **Các trường ở cột phải**: chọn hoặc nhập trực tiếp, tool tự lưu. **Ghi chú** tối đa 100 ký tự.
- **Loại**: đổi Story / Task / Bug… (tool hỏi xác nhận khi việc đổi loại ảnh hưởng việc con hoặc Epic). Sub-task có thêm ô **Loại việc con** (Story / Task / Bug).
- **Giai đoạn dự án** (chỉ Epic): để trống thì tool tự đoán theo tên Epic; dùng để tính trạng thái dự án.
- **BA phụ trách** mặc định lấy theo mô-đun.

### Đánh dấu quan trọng
Bấm ⚑, nhập lý do (không bắt buộc). Người thực hiện và người theo dõi nhận thông báo; issue hiện cờ ⚑ Quan trọng ở mọi nơi. Bấm **Bỏ đánh dấu** trên dải thông báo để gỡ.

### Liên kết issue
Bấm **Liên kết issue** (hoặc **+ Thêm** ở mục Liên kết issue), chọn kiểu (**liên quan tới**, **chặn**, **trùng với**), gõ mã issue (VD DEMO-12) rồi bấm **Liên kết**.
:::

:::perm transition.edit
### Đổi trạng thái
Chọn trong ô trạng thái ở đầu cột phải. Ô chỉ liệt kê bước chuyển được phép theo quy trình của dự án. Epic đã có Story/Task/Bug bên trong thì trạng thái không chọn tay — hiện **Tự động theo N việc bên trong**.
:::

:::perm assign.edit
### Giao việc
Chọn ở ô **Người thực hiện** (chỉ thành viên dự án), hoặc bấm **Giao cho tôi**.
:::

:::perm backlog.edit
### Đổi sprint
Chọn ở ô **Sprint**. Sub-task không có ô này — luôn theo sprint của việc cha.
:::

:::perm issue.create
### Thêm việc con / issue vào Epic
- Ở issue thường: bấm thêm **Việc con**, chọn loại việc con (Story / Task / Bug), gõ tiêu đề rồi **Enter**.
- Ở Epic: thêm nhanh Story / Task / Bug thuộc Epic.

### Nhân bản
Bấm **Nhân bản**, chọn có nhân bản cả việc con hay không. Bản sao giữ loại, mô tả, độ ưu tiên, người thực hiện, nhãn, điểm, Epic, sprint, ngày (người thực hiện chỉ giữ khi bạn có quyền **Giao việc**, sprint chỉ giữ khi có quyền **Backlog – Sửa**); bắt đầu ở trạng thái đầu tiên và được liên kết với issue gốc. Không sao chép bình luận, tệp đính kèm, giờ công.
:::

:::perm issue.delete
### Chuyển sang dự án khác
Bấm **Chuyển sang dự án khác**, chọn dự án đích (cần có quyền **Issue – Thêm** ở dự án đích). Các Sub-task đi theo; issue nhận mã mới. Không áp dụng cho Sub-task.

### Xóa issue
Bấm **Xóa issue** và xác nhận. Xóa vĩnh viễn, kèm các Sub-task; xóa Epic thì các Story/Task/Bug bên trong chỉ được tách khỏi Epic.
:::

:::perm attachment.create
### Đính kèm tệp
Bấm **Tệp đính kèm** (issue chưa có tệp) hoặc **+ Tải lên** ở mục Tệp đính kèm; khi đã có tệp có thể kéo thả tệp vào danh sách. Tải tệp về cần quyền **Tệp đính kèm – Tải**. Bạn xóa được tệp mình tải lên; xóa tệp của người khác cần quyền **Tệp đính kèm – Xóa**.
:::

:::perm comment.create
### Bình luận
1. Gõ vào ô bình luận ở tab **Bình luận**. Gõ `@` để nhắc tên — gợi ý gồm thành viên dự án và người được xem mọi dự án; người được nhắc nhận thông báo.
2. Bấm gửi hoặc **Ctrl + Enter**.

Bình luận của mình luôn sửa / xóa được; của người khác cần quyền **Bình luận – Sửa** / **Bình luận – Xóa**.
:::

:::perm worklog.create
### Ghi thời gian làm việc
1. Ở mục **Theo dõi thời gian**, bấm **Ghi thời gian làm việc** (hoặc **Ghi thời gian** khi đã có số liệu).
2. Nhập **Thời gian đã làm** (VD `2h 30m`, `1d`, `45m`; 1d = 8 giờ, 1w = 5 ngày), **Ngày làm**, **Nội dung công việc**.
3. **Thời gian còn lại**: **Tự trừ**, **Đặt lại thành** một giá trị, hoặc **Giữ nguyên**. Bấm **Ghi**.

Giờ đã ghi xem ở tab **Nhật ký giờ**; xóa được giờ của mình, xóa của người khác cần quyền **Ghi thời gian làm việc – Xóa**.
:::

### Theo dõi issue
Bấm **Theo dõi** / **Bỏ theo dõi** ở mục **Người theo dõi**. Người theo dõi nhận thông báo khi có bình luận mới hoặc đổi trạng thái. Thêm người khác vào danh sách theo dõi (**+ Thêm người theo dõi**) cần quyền sửa issue.

### Sao chép liên kết
Bấm **Sao chép liên kết** để lấy đường dẫn `/browse/<mã issue>` gửi cho đồng nghiệp.

## Câu hỏi thường gặp

**Ô trạng thái không có trạng thái mình muốn?**
Quy trình của dự án không cho chuyển thẳng từ trạng thái hiện tại sang đó. Chuyển qua trạng thái trung gian, hoặc nhờ người quản lý dự án chỉnh luồng ở [Thông tin dự án](/help/da-thong-tin).

**Không thấy tab Bình luận / Nhật ký giờ?**
Bạn chưa có quyền **Bình luận – Xem** / **Ghi thời gian làm việc – Xem**.
