---
title: Hành trình bán hàng
section: customer
module: Hành trình
order: 40
summary: Theo dõi dự án của khách hàng theo quy trình 4 phần I. Giải pháp → II. Hợp đồng → III. Triển khai → IV. Nghiệm thu – Thanh toán.
routes: /customers/:id/p/:pid
need: journey.view
keywords: quy trình, giai đoạn, bước, giao người thực hiện, người phối hợp, quá hạn, trễ, việc của tôi, phòng ban, tiến độ
---

## Màn hình này dùng để làm gì

Mở một dự án của khách hàng, phần giữa là **hành trình bán hàng**: danh sách các bước theo quy trình của công ty, ai thực hiện, ai phối hợp, trạng thái và hạn của từng bước. Dự án mới chưa có hành trình thì bấm **Áp dụng quy trình mẫu** — xem [Áp dụng quy trình mẫu](/help/kh-mau-hanh-trinh).

![Hành trình bán hàng của một dự án](/help/img/kh-hanh-trinh.webp)

1. **Đầu trang** — khách hàng › dự án, mã, tình trạng, Sale, AM; cảnh báo số bước quá hạn và lịch gọi đến hạn.
2. **Bốn phần I–IV** — mỗi thẻ cho biết số bước hoàn thành / tổng số, %, số bước trễ. Bấm một thẻ để chỉ mở phần đó trong bảng.
3. **Thanh lọc** — **Tìm bước…**, lọc **trạng thái**, lọc **phòng ban**, tích **Việc của tôi** (bước bạn thực hiện hoặc phối hợp).
4. **Bảng bước** — cột **Nội dung**, **Người thực hiện**, **Người phối hợp**, **Trạng thái**, **Hạn**, số trao đổi / tài liệu kết quả của bước.
5. **Cột phải** — thông tin dự án; khi bấm một bước thì chuyển thành bảng của bước đó, xem [Cập nhật một bước hành trình](/help/kh-buoc).

## Đọc bảng bước

- Bước được xếp nhiều cấp: **phần** (I, II…) → **giai đoạn** (1, 1.1…) → đầu việc → việc chi tiết (dấu –). Bấm mũi tên ở dòng phần / giai đoạn để mở hoặc thu gọn.
- Ô người còn trống nhưng có chữ xám như **KD**, **BA**: đó là **phòng theo quy trình mẫu**, chưa giao người cụ thể.
- Bước **Hoàn thành** bị gạch ngang; bước quá hạn tô đỏ kèm nhãn **Quá hạn N ngày**. Dòng phần có nhãn số việc quá hạn.
- Tiến độ tính trên các bước cuối cùng (bước không có bước con).

## Thao tác

### Mở một bước để cập nhật

Bấm vào dòng bước. Cột phải chuyển sang thông tin, trao đổi và tài liệu kết quả của bước. Xem [Cập nhật một bước hành trình](/help/kh-buoc).

:::perm journey.edit
### Giao người thực hiện / người phối hợp ngay trong bảng

1. Bấm vào ô **Người thực hiện** (hoặc **Người phối hợp**) của bước.
2. Chọn người trong danh sách (người đúng phòng theo quy trình được gợi ý trước). Người thực hiện chỉ một người; người phối hợp chọn được nhiều người.

Chỉ chọn được **người tham gia dự án** (Sale/AM của khách hàng; Sale, AM, BA/PM, Dev, Tester của dự án; người đang thực hiện / phối hợp bước) và người được xem tất cả khách hàng. Muốn giao cho người khác, hãy thêm họ vào dự án trước ([Dự án của khách hàng](/help/kh-du-an)).
:::

:::perm journey.create
### Thêm bước mới

1. Rê chuột vào dòng cha, nút **+** hiện cạnh tên; bấm nút đó (ở dòng phần là **Thêm giai đoạn**, ở các dòng khác là **Thêm bước con**).
2. Gõ tên bước, nhấn **Enter** (hoặc bấm **Thêm**); **Esc** để hủy.

Hành trình có tối đa 7 cấp. Nút + không hiện khi đang lọc / tìm kiếm.
:::

## Lưu ý

- Phần **III. Triển khai** và **IV. Nghiệm thu – Thanh toán**: bước trùng tên với một đầu việc của dự án sản xuất đã gắn sẽ tự nhận trạng thái và hạn của đầu việc đó mỗi khi bên Dự án thay đổi; sửa tay vẫn được giữ cho tới lần đầu việc đổi tiếp.
- Trạng thái, hạn, nhắc nhở của bước sửa ở cột phải sau khi bấm vào bước.
- Tình trạng của dự án (VD **I. Giải pháp**) tự đổi theo các bước bạn cập nhật.
- Thêm, sửa, bỏ bước chỉ làm được trên dự án bạn liên quan (hoặc mọi dự án nếu có quyền Xem tất cả khách hàng).

## Câu hỏi thường gặp

**Lọc "Việc của tôi" gồm những gì?**
Các bước bạn là người thực hiện hoặc người phối hợp.

**Tôi áp dụng nhầm quy trình, có làm lại được không?**
Trên giao diện chưa có nút xóa cả hành trình. Bạn có thể **bỏ** từng nhánh không áp dụng (xem [Cập nhật một bước hành trình](/help/kh-buoc)) hoặc nhờ quản trị hệ thống hỗ trợ.
