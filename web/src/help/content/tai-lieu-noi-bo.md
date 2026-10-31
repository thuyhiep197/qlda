---
title: Tài liệu nội bộ
section: docs
module: Tài liệu
order: 1
summary: Kho tài liệu dùng chung theo thư mục nhiều cấp: tạo thư mục, tải lên, tải về, đổi tên, xóa, tìm kiếm.
routes: /docs
need: sub:docs
keywords: tài liệu, thư mục, tải lên, tải về, biểu mẫu, quy trình, file
---
## Màn hình này dùng để làm gì

Lưu trữ tài liệu dùng chung của công ty (quy trình, biểu mẫu, hồ sơ năng lực…) theo thư mục nhiều cấp. Nhận tệp **Excel, PDF, Word, HTML, EXE**.

![Tài liệu nội bộ](/help/img/tai-lieu-noi-bo.webp)

1. **Cây thư mục** — bấm **Tài liệu nội bộ** để về thư mục gốc; bấm mũi tên để mở / thu gọn thư mục con. Số bên cạnh là số tệp trong thư mục.
2. **Đường dẫn** — thư mục đang mở; bấm một cấp để quay lại.
3. **Ô tìm kiếm** — tìm tài liệu, thư mục trong toàn bộ kho (không cần gõ dấu).
4. **Thư mục mới / Tải lên** — chỉ hiện khi bạn có quyền Thêm.
5. **Bảng nội dung** — thư mục con và tài liệu: tên, dung lượng, người tải lên, ngày; các nút tải xuống, đổi tên, xóa ở cuối dòng.

## Bạn thấy những gì

- Quyền **Xem**: thấy **mọi thư mục**, nhưng chỉ thấy **tệp do mình tải lên** (màn hình ghi "Chỉ hiện tài liệu bạn tải lên").
- Quyền **Xem tất cả**: thấy tệp của mọi người.

## Thao tác

:::perm document.create
### Tạo thư mục
1. Mở thư mục cha (hoặc ở thư mục gốc).
2. Bấm **Thư mục mới**, nhập tên. Trong cùng một thư mục không được có hai thư mục trùng tên.
:::

:::perm document.create
### Tải tài liệu lên
1. Mở thư mục cần lưu.
2. Bấm **Tải lên** và chọn một hoặc nhiều tệp, hoặc **kéo thả tệp** vào vùng nội dung.
3. Mỗi lần tối đa 20 tệp. Chỉ nhận Excel, PDF, Word, HTML, EXE.

Nếu thư mục đã có tài liệu **cùng tên**, tệp mới sẽ **thay bản cũ** (chỉ giữ bản mới nhất). Bản cũ do người khác tải lên thì bạn cần quyền **Sửa** mới thay được; nếu không, hãy đổi tên tệp trước khi tải lên.
:::

:::perm document.export
### Tải tài liệu về máy
Bấm vào tên tài liệu hoặc biểu tượng **Tải xuống** ở cuối dòng.
:::

:::perm document.create
### Đổi tên, xóa tài liệu / thư mục của mình
- Bấm biểu tượng bút chì (**Đổi tên**) ở cuối dòng. Khi đổi tên tài liệu phải giữ nguyên phần mở rộng (VD `.docx`).
- Bấm biểu tượng thùng rác để **Xóa**. Chỉ xóa được **thư mục rỗng** (không còn thư mục con hay tài liệu).
:::

:::perm document.edit
### Đổi tên thư mục / tài liệu của người khác
Ô **Sửa** cho phép đổi tên thư mục, tài liệu do người khác tạo / tải lên.
:::

:::perm document.delete
### Xóa thư mục / tài liệu của người khác
Ô **Xóa** cho phép xóa thư mục (rỗng), tài liệu do người khác tạo / tải lên.
:::

### Tìm tài liệu
Gõ vào ô **Tìm tài liệu, thư mục trong toàn bộ…**: kết quả gồm thư mục và tài liệu ở mọi cấp, cột **Thư mục** cho biết tài liệu nằm ở đâu (bấm để mở thư mục đó). Khi đang tìm, nút Thư mục mới / Tải lên tạm khóa — xóa nội dung ô tìm để quay lại.

Ô tìm kiếm chung trên thanh trên cùng cũng tìm được tài liệu nội bộ. Xem [Tìm kiếm nhanh](/help/tim-kiem).

## Câu hỏi thường gặp

**Đồng nghiệp nói đã tải lên nhưng tôi không thấy tệp?**
Bạn chỉ có quyền **Xem** (thấy tệp của mình). Cần quyền **Xem tất cả** để thấy tệp của mọi người.

**Không xóa được thư mục?**
Thư mục còn thư mục con hoặc tài liệu. Xóa hết thư mục con và tài liệu bên trong trước.

**Tải lên báo lỗi "Chỉ nhận tệp…"?**
Tệp không thuộc các loại Excel, PDF, Word, HTML, EXE. Hãy chuyển tệp sang PDF (hoặc Word / Excel) trước khi tải lên; tệp nén (.zip, .rar) cũng không được nhận.
