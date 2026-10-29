# Hướng dẫn cài QLDA cho Claude (MCP)

Sau khi cài, bạn giao việc cho Claude bằng lời và Claude thao tác thẳng trên QLDA, ví dụ:

- "Liệt kê việc của tôi đang làm trong dự án DEMO"
- "Tạo bug ở DEMO: lỗi đăng nhập bằng VNeID, ưu tiên cao, giao cho dev.minh"
- "Chuyển DEMO-12 sang Đang review và bình luận 'đã xong phần API'"
- "Ghi 2h30 cho DEMO-12 hôm nay"
- "Tóm tắt tiến độ sprint đang chạy của DEMO"

Claude dùng **đúng quyền tài khoản của bạn**. Việc bạn không làm được trên web thì Claude cũng không làm được. Mọi thao tác Claude thực hiện được ghi dưới tên bạn.

---

## Bước 1. Cài Node.js

Cần **Node.js 22 trở lên**. Kiểm tra bằng cách mở Terminal / PowerShell và gõ:

```
node -v
```

Nếu chưa có hoặc phiên bản thấp hơn 22, tải bản **LTS** tại https://nodejs.org rồi cài như phần mềm thường.

## Bước 2. Lấy bộ cài QLDA MCP

1. Nhận thư mục `mcp` (file nén `qlda-mcp.zip`) từ quản trị hệ thống và giải nén vào chỗ cố định, ví dụ `C:\Tools\qlda-mcp`.
   **Không** để trong Downloads hay Desktop, vì lỡ xóa là Claude mất kết nối.
2. Mở PowerShell tại thư mục đó và chạy:

```
cd C:\Tools\qlda-mcp
npm install
```

## Bước 3. Tạo API key trên QLDA

1. Đăng nhập QLDA trên trình duyệt: **https://qlda.x2h.com.vn**.
2. Bấm vào tên mình ở góc phải, chọn **Hồ sơ**, rồi chọn tab **Bảo mật**.
3. Ở mục **API key**:
   - đặt tên cho key, ví dụ `Claude máy công ty`,
   - chọn thời hạn (khuyên dùng 90 ngày),
   - bấm **Tạo API key**, rồi bấm **Sao chép**.

Key có dạng `qlda_xxxxxxxx…`. Muốn lấy lại thì quay lại đây, bấm **Xem** hoặc **Sao chép**.

> ⚠️ **API key có giá trị như mật khẩu**. Không gửi key qua chat/email, không dán vào tài liệu chung.
> Nghi bị lộ thì bấm **Thu hồi** ngay rồi tạo key mới.
> **Đổi mật khẩu sẽ tự thu hồi mọi API key.** Khi đó cần tạo key mới và làm lại bước 4.

## Bước 4. Gắn vào Claude

Bên dưới, thay `C:/Tools/qlda-mcp` bằng thư mục ở bước 2, thay `qlda_xxx` bằng key ở bước 3.
Đường dẫn dùng dấu `/` (vẫn đúng trên Windows).

### Cách A: Claude Code (dòng lệnh)

Chạy một lệnh trong PowerShell:

```
claude mcp add qlda -s user -e QLDA_URL=https://qlda.x2h.com.vn -e QLDA_API_KEY=qlda_xxx -- node C:/Tools/qlda-mcp/bin/qlda-mcp.mjs
```

### Cách B: Claude Desktop (ứng dụng)

1. Mở Claude Desktop, vào **Settings → Developer → Edit Config**. Thao tác này mở file `claude_desktop_config.json`.
2. Dán nội dung sau (nếu file đã có `mcpServers` thì chỉ thêm khối `"qlda"` vào trong):

```json
{
  "mcpServers": {
    "qlda": {
      "command": "node",
      "args": ["C:/Tools/qlda-mcp/bin/qlda-mcp.mjs"],
      "env": {
        "QLDA_URL": "https://qlda.x2h.com.vn",
        "QLDA_API_KEY": "qlda_xxx"
      }
    }
  }
}
```

3. Lưu file, **thoát hẳn** Claude Desktop (cả ở khay hệ thống) rồi mở lại.

## Bước 5. Kiểm tra

Mở cuộc trò chuyện mới với Claude và hỏi:

> **QLDA: tôi là ai?**

Claude trả lời đúng họ tên và tài khoản của bạn là xong.
Trên Claude Code có thể gõ thêm `/mcp` để thấy `qlda` ở trạng thái **connected**.

---

## Tùy chọn: chế độ chỉ xem

Nếu chỉ muốn Claude tra cứu và báo cáo, không sửa gì, thêm biến `QLDA_READONLY=1`:

- Claude Code: thêm `-e QLDA_READONLY=1` vào lệnh ở cách A.
- Claude Desktop: thêm dòng `"QLDA_READONLY": "1"` vào khối `env`.

## Gặp lỗi?

| Claude báo | Cách xử lý |
|---|---|
| `API key không hợp lệ, đã hết hạn hoặc đã bị thu hồi` | Key hết hạn, bị thu hồi, hoặc bạn vừa đổi mật khẩu. Tạo key mới (bước 3) rồi thay vào cấu hình (bước 4) |
| `Tài khoản không tồn tại hoặc đã bị khóa` | Liên hệ quản trị hệ thống để mở khóa tài khoản |
| `Bạn không có quyền…` | Tài khoản chưa có quyền đó trên QLDA. Nhờ quản trị cấp quyền nếu cần |
| `fetch failed` / không kết nối được | Kiểm tra `QLDA_URL` (có `https://`, không có `/` ở cuối) và mạng / VPN công ty |
| Claude không thấy công cụ QLDA | Kiểm tra đường dẫn tới `qlda-mcp.mjs`, đã chạy `npm install` chưa, và đã mở lại Claude chưa |
| `node` không được nhận diện | Cài Node.js (bước 1) rồi mở lại PowerShell / Claude |

Mỗi lần dùng key, QLDA ghi lại thời điểm và địa chỉ IP. Bạn xem được ở cột **Dùng gần nhất** trong Hồ sơ → Bảo mật → API key.
Quản trị viên xem việc tạo, xem lại và thu hồi key trong **Quản trị → Nhật ký**.
