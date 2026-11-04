---
title: Kế hoạch chi tiết
section: project
module: Kế hoạch
order: 40
summary: Cây công việc Epic → đầu việc → việc con với tiến độ, đánh giá đúng / chậm / trễ, lọc và xuất Excel.
routes: /p/:key/plan
need: plan.view
keywords: cây công việc, wbs, tiến độ, trễ hạn, chậm tiến độ, đúng tiến độ, xuất excel, hiện việc đã hoàn thành, thêm nhanh, người phụ trách, kanban
---

## Màn hình này dùng để làm gì

Theo dõi toàn bộ kế hoạch dự án dạng cây ba cấp: **Epic (giai đoạn) → Story / Task / Bug (đầu việc) → Sub-task (việc con)**. Mỗi dòng có tiến độ, đánh giá so với kế hoạch, thời gian, người thực hiện, người phụ trách và trạng thái. Khi mở một dự án, tool vào thẳng tab này (nếu bạn có quyền xem).

![Kế hoạch chi tiết](/help/img/da-ke-hoach-chi-tiet.webp)

1. **Ô tóm tắt** — số giai đoạn, đầu việc, việc con và số việc theo từng đánh giá. Bấm một ô đánh giá (VD **Trễ hạn**) để chỉ xem các việc đó; bấm lần nữa để bỏ lọc.
2. **Thanh lọc** — tìm theo mã / tên; nút **Bộ lọc** mở thêm các ô lọc: Người thực hiện, Người phụ trách, Giai đoạn (Epic), Loại, Trạng thái, Đánh giá. Ô **Hiện việc đã hoàn thành** (chỉ ở Dạng bảng; Dạng Kanban luôn có cột Hoàn thành).
3. **Dạng bảng / Dạng Kanban**; bên cạnh là **Tạo Epic**, **Xuất Excel**, và **Mở hết** / **Chỉ giai đoạn** (chỉ hiện khi không có bộ lọc nào).
4. **Bảng kế hoạch** — bấm mũi tên để mở/đóng nhánh, bấm tên để mở chi tiết issue; nút **+** trên dòng Epic / đầu việc để thêm việc nhanh.

## Cách tính tiến độ và đánh giá

- **Tiến độ** tính theo số issue, không dùng điểm: việc lẻ Cần làm 0%, Đang thực hiện 50%, Hoàn thành 100%; việc cha = trung bình cộng các việc bên trong.
- **Đánh giá** so với hôm nay:
  - **Trễ hạn** — đã qua hạn hoàn thành mà chưa xong.
  - **Chậm tiến độ** — đã đến ngày bắt đầu mà chưa làm; với việc cha: % hoàn thành thấp hơn % thời gian đã trôi qua quá 15 điểm.
  - **Đúng tiến độ** — đang làm và còn trong hạn, hoặc theo kịp thời gian.
  - **Chưa đến hạn** — chưa tới ngày bắt đầu.
  - **Xong, trễ hạn** / **Hoàn thành** — đã xong sau / trước hạn.
  - **Chưa có lịch** — chưa đặt ngày.
- Thanh ở cột **Tiến trình** là khoảng thời gian của việc trên trục của cả dự án; vạch dọc là hôm nay.
- **Người phụ trách**: dòng giai đoạn → người thực hiện Epic; việc thuộc mô-đun → BA phụ trách mô-đun; việc không thuộc mô-đun do người không phải Dev thực hiện → chính người đó; còn lại → người phụ trách của cấp trên.

## Lưu ý về bộ lọc

- Mặc định ô **Người thực hiện** không lọc: bảng hiện việc của mọi người, kể cả việc **chưa giao**. Chọn một người (hoặc **— Chưa giao —**) để chỉ xem việc của người đó.
- Mặc định **ẩn việc đã Hoàn thành**; tiến độ và đánh giá vẫn tính đủ cả việc đã xong. Tick **Hiện việc đã hoàn thành** để xem (lựa chọn được nhớ trên máy). Khi lọc trạng thái hoặc đánh giá Hoàn thành thì việc đã xong tự hiện.
- Việc chưa thuộc Epic nào được gom vào dòng **Chưa thuộc giai đoạn nào**.

## Thao tác

:::perm issue.create
### Thêm việc nhanh ngay trên bảng
1. Rê chuột vào dòng Epic (hoặc đầu việc), bấm nút **+**.
2. Chọn loại (Story / Task / Bug — với đầu việc là **Việc con** loại Story / Task / Bug), gõ tiêu đề rồi **Enter**. Gõ tiếp để tạo thêm; **Esc** để đóng. Việc vừa tạo hiện ngay trên bảng, kể cả khi không khớp bộ lọc. Khi tải lại trang, bộ lọc được áp dụng lại bình thường.
3. Cần điền người thực hiện, ngày, sprint…: bấm **Thêm chi tiết…** để mở form đầy đủ với việc cha chọn sẵn.

:::

:::perm assign.edit | transition.edit | backlog.edit | issue.edit | issue.delete
### Sửa nhiều việc cùng lúc
1. Tick ô đầu các dòng cần sửa; ô ở tiêu đề bảng chọn tất cả việc đang hiện. Dòng Epic không có ô tick.
2. Thanh thao tác hiện phía trên bảng, cùng các thao tác và quyền như ở [Danh sách issue](/help/da-danh-sach-issue): **Giao cho…**, **Chuyển vào sprint…**, **Đổi trạng thái…**, **Đổi loại…**, **Độ ưu tiên…**, **Xóa**…
3. Bấm **Bỏ chọn** để thôi chọn.

Thao tác chỉ áp dụng cho việc đang hiện: việc đã tick nhưng bị bộ lọc ẩn đi hoặc nằm trong nhánh đang thu gọn không bị thay đổi. Chỉ có ở Dạng bảng.
:::

:::perm issue.create
### Tạo Epic
Bấm **Tạo Epic**, nhập tiêu đề, ngày bắt đầu và hạn hoàn thành. Xem thêm [Tạo issue và việc con](/help/da-tao-issue).
:::

:::perm transition.edit
### Đổi trạng thái ngay trên bảng
Ở cột **Trạng thái**, chọn trạng thái mới trong ô chọn. Ô chỉ liệt kê trạng thái được phép theo quy trình của loại issue. Trạng thái Epic không chọn tay — tự động theo các việc bên trong.
:::

:::perm assign.edit
### Giao việc ngay trên bảng
Bấm vào ô **Người thực hiện** của dòng và chọn người (danh sách có ô tìm kiếm). Dòng Epic cũng có ô này.
:::

:::perm plan.export
### Xuất Excel kế hoạch
Bấm **Xuất Excel**. Tệp `Ke-hoach-chi-tiet-<mã dự án>-<ngày>.xlsx` gồm các việc đang hiện theo bộ lọc hiện tại (bấm **Xóa lọc** trước nếu cần cả dự án), luôn kèm cả việc đã hoàn thành; cây đã thụt cấp, có thể gập nhóm trong Excel, tiến độ, đánh giá có tô màu.
:::

### Xem dạng Kanban
Bấm **Dạng Kanban** để xem các việc theo cột trạng thái, chia làn theo từng giai đoạn. Kéo thẻ sang cột khác để đổi trạng thái (cần quyền **Chuyển trạng thái**).

## Câu hỏi thường gặp

**Mở Kế hoạch chi tiết thấy rất ít việc?**
Bảng đang có bộ lọc, hoặc các việc đều đã hoàn thành (mặc định bị ẩn). Bấm **Xóa lọc** và/hoặc tick **Hiện việc đã hoàn thành**.

**Dự án trống, muốn đưa kế hoạch từ Excel vào?**
Dùng **Nhập từ Excel** ở tab Backlog hoặc Danh sách issue — xem [Import kế hoạch từ Excel/CSV](/help/da-import).
