---
title: Tài liệu khách hàng
section: customer
module: Tài liệu
order: 70
summary: Lưu tài liệu chung của khách hàng, tài liệu của dự án và tài liệu kết quả của từng bước hành trình.
need: cfile.view
keywords: tải lên, tải về, tệp, file, hồ sơ, báo giá, tài liệu kết quả, xóa tài liệu
---

## Màn hình này dùng để làm gì

Tài liệu được lưu ở 3 chỗ, tùy bạn tải lên từ đâu:

| Tải lên ở | Là tài liệu |
|---|---|
| Khối **Tài liệu** ở màn khách hàng | **Chung** của khách hàng |
| Khối **Tài liệu** ở màn dự án | **Của dự án** |
| Khối **Tài liệu kết quả** của một bước | **Kết quả của bước** |

Khối Tài liệu ở màn khách hàng hiện **mọi** tài liệu của khách hàng (có ghi tên dự án / bước); ở màn dự án hiện tài liệu của dự án và của các bước trong dự án.

![Khối Tài liệu của dự án](/help/img/kh-tai-lieu.webp)

Mỗi tệp hiện tên, dung lượng, người tải lên, thời gian.

## Thao tác

:::perm cfile.create
### Tải tài liệu lên

1. Mở dự án (hoặc khách hàng, hoặc một bước), bấm **Tải lên** ở đầu khối **Tài liệu** / **Tài liệu kết quả**.
2. Chọn một hoặc nhiều tệp. Tài liệu hiện ngay trong danh sách.
:::

:::perm cfile.export
### Tải tài liệu về máy

Bấm tên tệp hoặc biểu tượng **tải về** cuối dòng. Không có quyền này thì tên tệp không bấm được.
:::

:::perm cfile.create | cfile.delete
### Xóa tài liệu

Bấm biểu tượng **thùng rác** cuối dòng → xác nhận. Tài liệu **do mình tải lên** xóa được khi bạn có quyền **Tài liệu – Tải lên**; xóa tài liệu của người khác cần quyền **Tài liệu – Xóa**.
:::

## Lưu ý

- Tài liệu **chung** của khách hàng cần thêm quyền **Thông tin khách hàng – Xem**.
- Tải lên, xóa chỉ làm được trên khách hàng / dự án bạn liên quan (hoặc mọi khách hàng nếu có quyền Xem tất cả).
- Khi thêm khách hàng mới, có thể đính kèm tài liệu ngay trong hộp thoại **Thêm khách hàng**.
