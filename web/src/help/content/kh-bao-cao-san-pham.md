---
title: Báo cáo khách hàng theo sản phẩm
section: customer
module: Dự án của khách hàng
order: 35
summary: Mỗi sản phẩm có bao nhiêu khách hàng và hiện trạng tương tác của từng khách hàng.
routes: /customers/report
need: sales_project.view
keywords: báo cáo, thống kê, sản phẩm, số khách hàng, hiện trạng tương tác, trao đổi gần nhất, chưa trao đổi, lịch gọi, xuất excel
---

## Màn hình này dùng để làm gì

Trả lời hai câu hỏi: **mỗi sản phẩm đang có bao nhiêu khách hàng** và **khách hàng đó đang được tương tác thế nào**. Mở bằng mục **Báo cáo theo sản phẩm** ở đầu cột trái của phân hệ Khách hàng.

Sản phẩm của khách hàng lấy từ ô **Sản phẩm** của từng [dự án của khách hàng](/help/kh-du-an). Một dự án chọn được nhiều sản phẩm (VD combo 3 trợ lý), nên một khách hàng có thể được đếm ở nhiều sản phẩm.

## Bảng tổng hợp

Mỗi dòng là một sản phẩm:

- **Số khách hàng** — số khách hàng có dự án chọn sản phẩm này.
- Các cột **tình trạng khách hàng** (Mới, Đang tư vấn…) — số khách hàng theo từng tình trạng.
- **Trong N ngày** / **Quá N ngày** / **Chưa trao đổi** — khách hàng có trao đổi gần đây, đã lâu chưa trao đổi lại, hoặc chưa có trao đổi nào. Đổi N ở ô **Trao đổi gần đây trong** (7–90 ngày).
- **Lịch gọi đến hạn** — khách hàng có lịch gọi đã đến ngày mà chưa xác nhận.
- **Có hành trình** — khách hàng có dự án đã áp dụng hành trình bán hàng.
- **Việc đang mở** — tổng số công việc kinh doanh chưa xong.

Hai dòng cuối: **Dự án chưa chọn sản phẩm** (cần mở dự án để chọn sản phẩm) và **Khách hàng chưa có dự án**.

## Thao tác

### Xem từng khách hàng của một sản phẩm

1. Bấm vào dòng sản phẩm. Danh sách khách hàng mở ra ngay bên dưới.
2. Mỗi khách hàng hiện tình trạng, các dự án thuộc sản phẩm (kèm tình trạng theo hành trình), Sale / AM, **trao đổi gần nhất** (ngày, cách đây bao lâu, người ghi, nội dung) và lịch gọi kế tiếp.
3. Bấm tên khách hàng hoặc tên dự án để mở màn hình tương ứng.

### Tìm và xuất Excel

1. Gõ vào ô tìm (không cần gõ dấu) để lọc theo sản phẩm, khách hàng, dự án, tỉnh, Sale, AM.
2. Bấm **Xuất Excel** để tải tệp gồm sheet **Tổng hợp** và sheet **Chi tiết** (mỗi dòng một khách hàng × một sản phẩm) theo đúng nội dung đang lọc.

## Lưu ý

- Báo cáo chỉ tính khách hàng, dự án **trong phạm vi bạn được xem** và chưa lưu trữ.
- Cột hiện theo quyền: tình trạng khách hàng và dòng "Khách hàng chưa có dự án" cần **Thông tin khách hàng – Xem**; trao đổi, lịch gọi cần **Trao đổi – Xem**; tiến độ hành trình cần **Hành trình – Xem**; việc đang mở cần **Công việc – Xem**.
- Trao đổi của một khách hàng ở một sản phẩm gồm trao đổi của các dự án thuộc sản phẩm đó (kể cả ở các bước hành trình) và trao đổi chung của khách hàng.

## Câu hỏi thường gặp

**Vì sao cộng số khách hàng của các sản phẩm lại lớn hơn tổng số khách hàng?**
Khách hàng dùng nhiều sản phẩm được đếm ở từng sản phẩm. Tổng số khách hàng không trùng ghi ở cuối màn hình.

**Khách hàng của tôi nằm ở "Dự án chưa chọn sản phẩm"?**
Mở dự án đó, bấm **Sửa dự án** và chọn sản phẩm ở ô **Sản phẩm**.
