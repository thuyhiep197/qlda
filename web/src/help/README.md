# Hướng dẫn sử dụng — cách viết bài

Mỗi bài là một tệp `content/<mã bài>.md` (mã bài: chữ thường không dấu, gạch ngang). Bài sửa trên tool (Quản trị hệ thống)
ghi đè bài cùng mã; "Khôi phục bản gốc" quay về tệp này. **Mỗi lần sửa một chức năng: sửa luôn bài của chức năng đó và thêm
một dòng vào `content/co-gi-moi.md` trong cùng commit.**

## Đầu bài

```
---
title: Kế hoạch chi tiết
section: project            # start | general | dashboard | customer | project | docs | admin
module: Kế hoạch            # nhóm trong mục lục (tên Module như trong ma trận phân quyền), có thể bỏ trống
order: 30                   # thứ tự trong mục
summary: Một câu nói màn hình dùng để làm gì.
routes: /p/:key/plan        # màn hình mà bài hướng dẫn (nút "?" → "Hướng dẫn màn hình này"); nhiều đường dẫn cách dấu phẩy; ?issue = đang mở issue
need: plan.view             # ai thấy bài: mã quyền, sub:<phân hệ>, admin; dấu | = một trong, dấu phẩy = tất cả; bỏ trống = mọi người
keywords: excel, xuất, cây công việc   # từ khóa thêm cho ô tìm kiếm
---
```

## Khuôn bài (màn hình)

1. `## Màn hình này dùng để làm gì` — 1–3 câu.
2. Ảnh minh họa có đánh số: `![Màn hình Kế hoạch chi tiết](/help/img/da-ke-hoach-chi-tiet.webp)` rồi danh sách giải thích
   `1. **Thanh lọc** — …` khớp số trên ảnh.
3. `## Thao tác` — mỗi thao tác một `###`, các bước đánh số. Thao tác cần quyền đặt trong khối:

   ```
   :::perm plan.export
   ### Xuất Excel kế hoạch
   1. Bấm **Xuất Excel** …
   :::
   ```
   Người xem không có quyền thấy khối này mờ đi kèm "Bạn chưa có quyền …". Mã quyền phải đúng danh mục trong
   `server/src/permissions.ts` (kiểm thử sẽ báo mã sai). Khối không lồng nhau.
4. `## Lưu ý` (quy tắc nghiệp vụ, hành vi tự động) và `## Câu hỏi thường gặp` (`**Hỏi?**` + trả lời) khi có.

Liên kết sang bài khác: `[Chi tiết issue](/help/da-issue)`; sang màn hình: `[Dự án](/projects)`.

## Văn phong

- Viết cho nhân viên không chuyên kỹ thuật: "bấm", "chọn", "kéo thả"; tên nút, tab, cột **in đậm, đúng chữ trên giao diện**.
- Thuật ngữ giữ như trên tool: Sprint, Backlog, Epic, Story, Task, Bug, Sub-task, issue.
- Chỉ viết điều đã kiểm tra trong mã nguồn / trên bản chạy thử. Không bịa nút, không hứa tính năng chưa có.
- Không dùng tên người, khách hàng, dự án thật.

## Ảnh minh họa

Khai báo trong `shots/<nhóm>.json`, chụp bằng `node web/scripts/help-shots.mjs` trên bản chạy thử có dữ liệu mẫu:

```json
{ "file": "da-ke-hoach-chi-tiet.webp", "path": "/p/DEMO/plan", "as": "ba.lan",
  "wait": ".plan-table", "clicks": [], "waitAfter": null, "clip": null, "size": [1440, 900],
  "marks": [{ "n": 1, "sel": ".filter-bar" }, { "n": 2, "sel": "button.btn-primary" }] }
```

`as` = tài khoản chụp (mặc định tài khoản đầu tiên trong `--accounts`); `clicks` = bấm lần lượt trước khi chụp (VD mở hộp thoại);
`clip` = chỉ chụp quanh phần tử này; `marks` = viền đỏ + số tròn.
