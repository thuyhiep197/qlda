---
title: Công việc của khách hàng
section: customer
module: Công việc
order: 60
summary: Giao và theo dõi việc kinh doanh — việc chung của khách hàng và việc của từng dự án.
need: ctask.view
keywords: việc kinh doanh, giao việc, hạn, quá hạn, hoàn thành, việc chung, việc của dự án, xóa việc
---

## Màn hình này dùng để làm gì

Khối **Công việc** ở cột phải dùng để ghi các việc cần làm với khách hàng (VD gửi báo giá, chuẩn bị demo), giao cho người làm và đặt hạn.

- Ở **màn dự án** của khách hàng: việc **của dự án** đó.
- Ở **màn khách hàng**: hiện **tất cả** việc (việc chung của khách hàng và việc của các dự án, có ghi tên dự án); việc thêm ở đây là **việc chung** của khách hàng.

![Khối Công việc](/help/img/kh-cong-viec.webp)

Mỗi việc hiện tên việc, người thực hiện, hạn; việc quá hạn tô đỏ kèm **Quá hạn N ngày**. Mặc định chỉ hiện việc chưa xong; bấm **Xem cả N việc đã xong** để hiện thêm.

Việc được giao cho bạn cũng hiện trong khối **Việc kinh doanh của tôi** trên Dashboard.

## Thao tác

:::perm ctask.create
### Thêm việc

1. Mở khối **Công việc**, gõ tên việc vào ô **+ Thêm việc…**.
2. Chọn **Người thực hiện** và **Hạn** (không bắt buộc).
3. Bấm **Thêm**. Người được giao nhận thông báo trên chuông.

Chỉ giao được cho người tham gia dự án của khách hàng (Sale, AM, BA/PM, Dev, Tester, người thực hiện / phối hợp bước) và người được xem tất cả khách hàng.
:::

:::perm ctask.edit
### Cập nhật trạng thái

- Tích ô vuông đầu dòng để đánh dấu **Hoàn thành** (bỏ tích để mở lại).
- Hoặc chọn trạng thái ở ô bên phải: **Chưa bắt đầu**, **Đang thực hiện**, **Hoàn thành**.
:::

:::perm ctask.create | ctask.delete
### Xóa việc

Bấm biểu tượng **thùng rác** cuối dòng → xác nhận. Việc **do mình tạo** xóa được khi bạn có quyền **Công việc – Thêm**; xóa việc của người khác cần quyền **Công việc – Xóa**.
:::

## Lưu ý

- Việc **chung** của khách hàng (không thuộc dự án) chỉ thấy và làm được ở màn khách hàng, cần thêm quyền **Thông tin khách hàng – Xem**.
- Thêm, sửa, xóa chỉ làm được trên khách hàng / dự án bạn liên quan (hoặc mọi khách hàng nếu có quyền Xem tất cả).
