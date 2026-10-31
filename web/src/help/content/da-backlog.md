---
title: Backlog và lập kế hoạch sprint
section: project
module: Sprint & Backlog
order: 60
summary: Sắp xếp các issue chưa làm, tạo sprint, kéo issue vào sprint, bắt đầu và hoàn thành sprint (chỉ dự án Scrum).
routes: /p/:key/backlog
need: backlog.view
keywords: backlog, sprint, tạo sprint, bắt đầu sprint, hoàn thành sprint, tạo loạt sprint, kéo thả, sắp xếp, nhập từ excel
---

## Màn hình này dùng để làm gì

Tab **Backlog** (chỉ có ở dự án Scrum) liệt kê các sprint chưa đóng ở trên và mục **Backlog** (issue chưa vào sprint nào) ở dưới cùng. Đây là nơi lên kế hoạch: tạo sprint, kéo issue vào sprint, rồi bắt đầu sprint.

![Backlog](/help/img/da-backlog.webp)

1. **Thanh lọc và nút** — tìm, lọc theo người thực hiện (mặc định lọc sẵn **chính bạn**), nút **Bộ lọc**; **Tạo sprint**, **Tạo loạt sprint**, **Nhập từ Excel**.
2. **Mục sprint** — tên, nhãn **Đang chạy**, ngày, số issue; các nút **Bắt đầu sprint** / **Hoàn thành sprint**, **Sửa**, **Xóa**.
3. **Dòng issue** — ô tick để chọn, loại, mã, tiêu đề; việc con hiện thụt vào dưới việc cha (chỉ để xem, đi theo sprint của việc cha).
4. **+ Tạo issue** — ở cuối mỗi mục. Mục **Backlog** (issue chưa vào sprint nào) nằm dưới cùng trang.

## Thao tác

:::perm backlog.edit
### Đưa issue vào sprint, sắp xếp thứ tự
1. Kéo dòng issue thả vào mục sprint (hoặc về mục **Backlog**); thả ở vị trí nào thì issue nằm đúng thứ tự đó.
2. Kéo cả nhóm: giữ **Ctrl** và bấm từng issue (giữ **Shift** để chọn liên tiếp) hoặc tick ô đầu dòng, rồi kéo một issue trong nhóm. Ô tick ở đầu mục sprint chọn tất cả issue của mục đó.
:::

:::perm sprint.create
### Tạo sprint
1. Bấm **Tạo sprint**. Tool tạo sprint mới (tên tự đặt `<mã dự án> Sprint <số>`) và mở hộp **Sửa sprint**.
2. Đặt tên, chọn nhanh **Thời lượng** (1–4 tuần) hoặc nhập **Ngày bắt đầu**, **Ngày kết thúc**, **Mục tiêu sprint**, rồi bấm **Lưu**.

### Tạo loạt sprint
Khi đã có ít nhất một sprint có ngày bắt đầu và kết thúc, bấm **Tạo loạt sprint**, chọn **Tạo đến hết ngày** — tool tạo tiếp các sprint theo cùng độ dài và nhịp, cho xem trước rồi mới tạo.
:::

:::perm sprint.edit
### Bắt đầu sprint
1. Ở mục sprint chưa chạy (đã có issue), bấm **Bắt đầu sprint**.
2. Kiểm tra tên, ngày bắt đầu, ngày kết thúc, mục tiêu rồi bấm **Bắt đầu**.

Có thể bắt đầu sprint khi đang có sprint khác chạy — các sprint chạy song song.

### Sửa / hoàn thành sprint
- **Sửa**: đổi tên, ngày, mục tiêu (sprint đã đóng thì không sửa được).
- **Hoàn thành sprint**: chọn nơi chuyển các issue chưa xong (Backlog, sprint mới hoặc sprint khác).
:::

:::perm sprint.delete
### Xóa sprint
Chỉ xóa được sprint **chưa bắt đầu**. Bấm **Xóa** ở mục sprint; các issue trong sprint quay về Backlog.
:::

:::perm issue.create
### Tạo issue nhanh
Bấm **+ Tạo issue** ở cuối mục, chọn loại (Story / Task / Bug), gõ tiêu đề rồi **Enter**. Tạo ngay trong một sprint cần thêm quyền **Backlog – Sửa**. Issue vừa tạo luôn hiện ra dù không khớp bộ lọc đang chọn.
:::

:::perm issue.import, issue.create
### Nhập kế hoạch từ Excel
Bấm **Nhập từ Excel** — xem [Import kế hoạch từ Excel/CSV](/help/da-import).
:::

## Lưu ý

- **Sprint tự chạy**: sprint chưa bắt đầu sẽ tự chuyển **Đang chạy** ngay khi có issue trong sprint rời trạng thái Cần làm. Nếu chưa đặt ngày, tool lấy hôm nay làm ngày bắt đầu và kéo dài 2 tuần.
- Epic không nằm trong sprint; Sub-task luôn đi theo sprint của việc cha.
- Mục **Backlog** không hiện issue đã hoàn thành.

## Câu hỏi thường gặp

**Mục sprint ghi "x issue bị ẩn do không khớp bộ lọc"?**
Backlog mặc định lọc theo **người thực hiện là bạn** (nút **Xóa lọc** cũng đưa về lọc này). Bấm vào ảnh đại diện của bạn trên thanh lọc để bỏ chọn, khi đó thấy issue của mọi người.

**Nút Bắt đầu sprint bị mờ?**
Sprint chưa có issue nào.
