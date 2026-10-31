---
title: Danh sách dự án
section: project
module: Thông tin dự án
order: 10
summary: Xem các dự án sản xuất bạn được vào, lọc theo trạng thái, ưu tiên, tạo dự án mới và lưu trữ dự án đã xong.
routes: /projects
need: sub:project
keywords: dự án của tôi, tất cả dự án, tạo dự án, lưu trữ, khôi phục, scrum, kanban, trạng thái dự án, giai đoạn
---

## Màn hình này dùng để làm gì

Đây là cửa vào phân hệ **Dự án**: liệt kê các dự án sản xuất bạn được vào, kèm khách hàng, ưu tiên, trạng thái và nhân sự phụ trách. Bấm tên một dự án để mở dự án đó.

![Màn hình Danh sách dự án](/help/img/da-danh-sach.webp)

1. **Cột trái** — hai nhóm **Dự án của tôi** (dự án bạn là thành viên) và **Tất cả dự án** (mọi dự án bạn được vào). Ô **Tìm dự án, khách hàng…** lọc nhanh theo tên, mã dự án hoặc tên khách hàng; bấm tên dự án để mở thẳng.
2. **Thanh lọc** — lọc theo tên, mã, khách hàng, nhân sự; lọc **Trạng thái** và **Ưu tiên**. Góc phải hiện số dự án đang khớp.
3. **Bảng dự án** — các cột **Tên dự án, Khách hàng, Ưu tiên, Trạng thái, BA/PM, Dev, Tester, AM, Loại** (Scrum hoặc Kanban).
4. **Tạo dự án** — nút trên thanh trên cùng, chỉ hiện khi bạn có quyền tạo dự án.

## Bạn thấy những dự án nào

- Có ô **Dự án – Xem tất cả**: thấy và vào được **mọi** dự án.
- Không có ô đó: chỉ thấy dự án bạn là **thành viên** (có tên ở ô BA/PM, Dev, Tester hoặc AM của dự án) và (khi có quyền **Thông tin khách hàng – Xem**) dự án sản xuất gắn với khách hàng / dự án của khách hàng trong phạm vi bạn được xem.
- Không có ô **Xem** nào của phân hệ Dự án thì không thấy menu **Dự án**.

Danh sách sắp dự án đang chạy lên trước, dự án **Chưa bắt đầu** xuống sau; trong mỗi nhóm xếp theo ưu tiên rồi theo tên.

## Cột Trạng thái

Trạng thái dự án là một trong 9 giai đoạn: Chưa bắt đầu, Trình chủ trương, Lập HSYC, Khảo sát, phân tích, Xây dựng, Kiểm thử, Triển khai, Nghiệm thu, Hỗ trợ vận hành.

- Dấu **⚙** — tự động: tính theo giai đoạn của Epic đang thực hiện. Rê chuột vào để xem lý do.
- Dấu **📌** — ghim tay: người sửa dự án chọn cố định (VD dự án đang trình chủ trương, chưa có công việc trên tool). Xem [Thông tin dự án](/help/da-thong-tin).

## Thao tác

:::perm project.create
### Tạo dự án
1. Bấm **Tạo dự án** trên thanh trên cùng.
2. Nhập **Tên dự án** — tool tự gợi ý **Mã dự án** từ chữ cái đầu; sửa lại nếu cần. Mã dài 2–10 ký tự, bắt đầu bằng chữ cái, dùng làm tiền tố mã issue (VD QLVB-12) và **không đổi được** sau khi tạo.
3. Chọn **Mô hình quản lý**: **Scrum** (làm theo sprint, có Backlog) hoặc **Kanban** (luồng việc liên tục).
4. Điền thêm (không bắt buộc): **Khách hàng**, **Dự án của khách hàng**, **Ưu tiên**, **Trạng thái dự án**, **Nhân sự** (BA/PM, Dev, Tester, AM) và **Mô tả**.
5. Bấm **Tạo dự án**. Tool mở dự án mới; dự án cũng tự có trong Danh mục sản phẩm (loại Dự án).

Dự án mới có sẵn 5 trạng thái: Cần làm, Đang làm, Đang review, Kiểm thử, Hoàn thành.
:::

:::perm project.delete
### Lưu trữ / khôi phục dự án
1. Ở cột cuối của dòng dự án, bấm **Lưu trữ** rồi xác nhận. Dự án bị ẩn khỏi danh sách của mọi người (dữ liệu vẫn giữ nguyên).
2. Muốn xem lại: tick **Xem dự án đã lưu trữ** ở góc trên, rồi bấm **Khôi phục** ở dòng dự án.
:::

## Lưu ý

- Thành viên dự án không thêm tay: ai được chọn ở ô **BA/PM, Dev, Tester, AM** của dự án thì là thành viên.
- Tên khách hàng là liên kết sang màn Khách hàng chỉ khi bạn có quyền **Thông tin khách hàng – Xem**.

## Câu hỏi thường gặp

**Tôi không thấy dự án mình đang làm?**
Bạn chưa được chọn vào ô BA/PM, Dev, Tester hoặc AM của dự án. Nhờ người quản lý dự án thêm tên bạn ở tab **Thông tin** của dự án.

**Không thấy nút Tạo dự án?**
Tài khoản chưa có quyền **Dự án – Thêm**. Xem [Quyền của tôi](/help/quyen-cua-toi).
