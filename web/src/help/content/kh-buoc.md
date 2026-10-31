---
title: Cập nhật một bước hành trình
section: customer
module: Hành trình
order: 50
summary: Cập nhật người thực hiện, người phối hợp, trạng thái, hạn, nhắc nhở; trao đổi và tài liệu kết quả của một bước.
routes: ?step
need: journey.view
keywords: bước, trạng thái bước, hoàn thành, hạn, nhắc nhở, ping, người thực hiện, người phối hợp, bước con, bỏ bước, tài liệu kết quả
---

## Màn hình này dùng để làm gì

Mỗi bước của hành trình giống như một đầu việc của Phòng Kinh doanh. Bấm vào một bước trong bảng hành trình, cột phải hiện bảng của bước đó.

![Bảng một bước hành trình](/help/img/kh-buoc.webp)

1. **Bước đang chọn** được tô nền trong bảng hành trình.
2. **Tên bước** và đường dẫn phần › giai đoạn chứa bước. Nút **×** để đóng, quay về thông tin dự án.
3. **Thông tin bước** — **Người thực hiện**, **Người phối hợp**, **Trạng thái**, **Hạn**, **Nhắc nhở**; dưới mỗi ô người là phòng theo quy trình mẫu.
4. **Trao đổi** của bước — xem [Trao đổi & lịch gọi điện](/help/kh-trao-doi).
5. **Tài liệu kết quả** của bước.

Bước quá hạn mà chưa hoàn thành có dải cảnh báo đỏ **Quá hạn N ngày** ngay dưới tên bước.

## Thao tác

:::perm journey.edit
### Cập nhật thông tin bước

1. Mở khối **Thông tin bước**.
2. **Người thực hiện**: bấm ô, chọn một người. **Người phối hợp**: chọn được nhiều người. Chỉ chọn được người tham gia dự án.
3. **Trạng thái**: **Chưa bắt đầu**, **Đang thực hiện**, **Hoàn thành**.
4. **Hạn**: chọn ngày.
5. **Nhắc nhở**: chọn **Trước hạn N ngày** (1, 2, 3, 5, 7, 10, 14 hoặc 30) hoặc **Tắt**.

Mọi thay đổi lưu ngay khi chọn. Tình trạng dự án tự cập nhật theo trạng thái các bước.

**Nhắc nhở hoạt động thế nào?** Từ N ngày trước hạn, mỗi ngày chuông thông báo nhắc **người thực hiện** cho tới khi bước **Hoàn thành**. Bước chưa giao người hoặc chưa có hạn thì không nhắc.
:::

:::perm journey.create
### Thêm bước con

Bấm nút **+** ở đầu khối **Thông tin bước**, gõ tên bước con → **OK**.
:::

:::perm journey.delete
### Bỏ bước không áp dụng

Bấm biểu tượng **thùng rác** ở đầu khối **Thông tin bước** → xác nhận. Bước **cùng mọi bước con** bị bỏ khỏi hành trình của dự án này (không ảnh hưởng quy trình mẫu và các dự án khác).
:::

:::perm ctalk.create
### Ghi trao đổi về bước

Trong khối **Trao đổi**, chọn loại (**Nội bộ / Ghi chú**, **Gặp mặt**, **Email**), nhập nội dung → **Gửi**. Trao đổi nội bộ gõ **@** để nhắc người của dự án.
:::

:::perm cfile.create
### Tải lên tài liệu kết quả

Trong khối **Tài liệu kết quả**, bấm **Tải lên**, chọn một hoặc nhiều tệp. Tài liệu này cũng hiện trong khối Tài liệu của dự án và của khách hàng (có ghi tên bước).
:::

## Lưu ý

- Phần **III. Triển khai** và **IV. Nghiệm thu – Thanh toán**: bước trùng tên với một đầu việc của dự án sản xuất đã gắn sẽ tự nhận trạng thái và hạn của đầu việc đó mỗi khi bên Dự án thay đổi; sửa tay vẫn được giữ cho tới lần đầu việc đổi tiếp.
- Có thể mở thẳng một bước từ chuông thông báo hoặc từ khối **Bước hành trình tôi phụ trách** trên Dashboard.
- Người chỉ có quyền xem thấy các ô ở dạng chữ, không sửa được.
- Sửa, thêm, bỏ bước chỉ làm được trên dự án bạn liên quan (hoặc mọi dự án nếu có quyền Xem tất cả khách hàng).
