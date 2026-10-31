---
title: Trao đổi & lịch gọi điện
section: customer
module: Trao đổi
order: 80
summary: Ghi lại làm việc với khách hàng, thảo luận nội bộ (nhắc @ đồng nghiệp) và đặt lịch gọi điện cho khách hàng.
need: ctalk.view
keywords: trao đổi, ghi chú, nội bộ, gặp mặt, email, gọi điện, nhắc tên, @, lịch gọi, đã gọi, chưa gọi được, cảnh báo, quá hạn gọi
---

## Màn hình này dùng để làm gì

Khối **Trao đổi** có ở 3 chỗ: màn khách hàng (trao đổi **chung**), màn dự án (trao đổi **của dự án**) và bảng một bước (trao đổi **của bước**). Khối **Lịch gọi điện** nằm ở màn dự án. Hai khối dùng chung nhóm quyền **Trao đổi**.

![Khối Trao đổi của dự án](/help/img/kh-trao-doi-khung.webp)

Mỗi trao đổi ghi người viết, loại, ngày. Có 3 loại khi thêm mới:

| Loại | Dùng khi |
|---|---|
| **Nội bộ / Ghi chú** | Thảo luận trong công ty; gõ **@** để nhắc đồng nghiệp; ngày là lúc gửi |
| **Gặp mặt** | Ghi lại buổi làm việc trực tiếp với khách hàng; chọn ngày làm việc (không sau hôm nay) |
| **Email** | Ghi lại trao đổi qua email với khách hàng; chọn ngày |

Các trao đổi loại **Gọi điện** cũ vẫn hiện; cuộc gọi mới đặt ở **Lịch gọi điện**.

## Thao tác

:::perm ctalk.create
### Thêm trao đổi

1. Trong khối **Trao đổi**, chọn loại: **Nội bộ / Ghi chú**, **Gặp mặt** hoặc **Email**.
2. Với Gặp mặt / Email: chọn ngày làm việc với khách hàng.
3. Nhập nội dung. Với trao đổi nội bộ, gõ **@** rồi chọn tên để nhắc — người được nhắc nhận thông báo trên chuông.
4. Bấm **Gửi**.

**Nhắc được ai?**
- Trao đổi **chung** của khách hàng: Sale, AM của khách hàng.
- Trao đổi **của dự án** và **của bước**: Sale, AM, BA/PM, Dev, Tester của dự án.
- Cùng với người có quyền xem tất cả khách hàng và xem trao đổi.
:::

:::perm ctalk.create | ctalk.delete
### Xóa trao đổi

Bấm biểu tượng **thùng rác** cạnh trao đổi → xác nhận. Trao đổi **do mình ghi** xóa được khi có quyền **Trao đổi – Thêm**; xóa của người khác cần quyền **Trao đổi – Xóa**.
:::

## Lịch gọi điện

![Khối Lịch gọi điện](/help/img/kh-trao-doi.webp)

Khối **Lịch gọi điện** (màn dự án) giúp không quên gọi lại khách hàng. Tiêu đề khối cho biết số lịch **chờ gọi**.

**Cảnh báo đến hạn**: khi đến ngày gọi mà chưa xác nhận,
- người gọi nhận nhắc trên chuông **mỗi ngày** cho tới khi xác nhận;
- mọi người xem dự án thấy cảnh báo: dòng **Hôm nay phải gọi khách hàng** / **Quá hạn gọi khách hàng N ngày** trong khối, biểu tượng điện thoại đỏ ở đầu trang dự án, ở cây khách hàng và tên dự án tô đỏ trong bảng.

:::perm ctalk.create
### Đặt lịch gọi

1. Ở khối **Lịch gọi điện**, bấm **+** (Đặt lịch gọi khách hàng).
2. Chọn **ngày gọi**, **người gọi** (mặc định là bạn nếu bạn tham gia dự án; chỉ chọn được người tham gia dự án), ghi chú gọi để làm gì.
3. Bấm **Đặt lịch**. Người gọi nhận thông báo trên chuông (trừ khi tự đặt cho mình).

### Sửa lịch gọi

Bấm biểu tượng **bút chì** ở lịch, sửa ngày / người gọi / ghi chú → **Lưu**. Đổi ngày thì việc nhắc tính lại từ ngày mới; đổi người gọi thì người mới nhận thông báo. Lịch đã xác nhận không sửa được.

### Xác nhận kết quả cuộc gọi

1. Bấm **Đã gọi** hoặc **Chưa gọi được**.
2. Nhập kết quả cuộc gọi (hoặc lý do chưa gọi được: không nghe máy, hẹn lại…).
3. Muốn hẹn gọi tiếp: tích **Đặt lịch kế tiếp**, chọn ngày (với **Chưa gọi được** ô này tích sẵn).
4. Bấm **Xác nhận đã gọi** / **Xác nhận chưa gọi được**.

Lịch đã xác nhận chuyển vào **Xem lịch sử gọi**.
:::

:::perm ctalk.create | ctalk.delete
### Xóa lịch gọi

Bấm **thùng rác** ở lịch → xác nhận. Lịch do mình đặt xóa được khi có quyền **Trao đổi – Thêm**; lịch người khác đặt cần quyền **Trao đổi – Xóa**.
:::

## Lưu ý

- Trao đổi **chung** của khách hàng cần thêm quyền **Thông tin khách hàng – Xem**.
- Thêm, xóa chỉ làm được trên khách hàng / dự án bạn liên quan (hoặc mọi khách hàng nếu có quyền Xem tất cả).
- Tài khoản Quản trị hệ thống không có trong danh sách nhắc @.
