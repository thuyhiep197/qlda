# QLDA MCP server

Cho Claude (Claude Code, Claude Desktop, hoặc trợ lý AI nào hỗ trợ MCP) thao tác QLDA bằng lời: tra cứu, tạo, sửa issue, chạy sprint, ghi giờ, xem báo cáo…

MCP server gọi REST API của QLDA bằng một tài khoản người dùng. Vì vậy phân quyền, workflow, thông báo và nhật ký của QLDA vẫn áp dụng như khi thao tác trên web.

Gói này **độc lập**, không nằm trong workspace npm của QLDA nên không ảnh hưởng tới Docker build.

## Cài đặt

Yêu cầu: Node.js 22 trở lên.

```bash
cd mcp
npm install
```

## Biến môi trường

| Biến | Ý nghĩa |
|---|---|
| `QLDA_URL` | Địa chỉ QLDA, mặc định `http://localhost:3001` (bản deploy: `https://qlda.tencongty.vn`) |
| `QLDA_API_KEY` | **Nên dùng.** API key cá nhân, tạo trong QLDA: Hồ sơ → Bảo mật → API key |
| `QLDA_USERNAME`, `QLDA_PASSWORD` | Tài khoản đăng nhập. Khi phiên hết hạn, server tự đăng nhập lại |
| `QLDA_TOKEN` | Thay cho mật khẩu: giá trị cookie `qlda_token` (hết hạn sau 7 ngày) |
| `QLDA_READONLY=1` | Chỉ bật 22 tool đọc, không sửa được gì |

> Nếu sai mật khẩu, server chỉ thử đăng nhập **một lần** rồi dừng, không thử tiếp, vì QLDA khóa tài khoản sau 5 lần sai liên tiếp. Nên tạo riêng một tài khoản cho trợ lý AI, đổi mật khẩu lần đầu trên web và chỉ cấp những quyền cần dùng.

Hướng dẫn cài cho người dùng (gửi nội bộ): [HUONG-DAN-CAI-DAT.md](HUONG-DAN-CAI-DAT.md).

## Gắn vào Claude Code

```bash
claude mcp add qlda -s user \
  -e QLDA_URL=http://localhost:3001 -e QLDA_API_KEY=qlda_xxx \
  -- node C:/duong-dan/qlda/mcp/bin/qlda-mcp.mjs
```

Hoặc thêm vào `.mcp.json` / `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "qlda": {
      "command": "node",
      "args": ["C:/duong-dan/qlda/mcp/bin/qlda-mcp.mjs"],
      "env": { "QLDA_URL": "http://localhost:3001", "QLDA_API_KEY": "qlda_xxx" }
    }
  }
}
```

Chạy thử bằng MCP Inspector: `npm run inspect`.

## Danh sách tool (62)

| Nhóm | Tool |
|---|---|
| Tài khoản, chung | `qlda_whoami`, `qlda_search`, `qlda_list_users`, `qlda_list_notifications`, `qlda_mark_notifications_read`, `qlda_list_catalog` (phòng ban, nhân sự, sản phẩm, trạng thái khách hàng, tỉnh) |
| Dự án | `qlda_list_projects`, `qlda_get_project` (statuses, members, workflow), `qlda_create_project`, `qlda_update_project`, `qlda_archive_project` |
| Issue | `qlda_list_issues` (lọc đủ: dự án, loại, trạng thái, người làm `me`/`none`, sprint `backlog`/`active`, nhãn, từ khóa…), `qlda_get_issue`, `qlda_create_issue`, `qlda_update_issue`, `qlda_transition_issue` (chuyển trạng thái **theo tên**, kiểm tra workflow), `qlda_move_issue`, `qlda_bulk_update_issues`, `qlda_clone_issue`, `qlda_move_issue_to_project`, `qlda_delete_issue` |
| Bình luận, liên kết, theo dõi | `qlda_add_comment`, `qlda_edit_comment`, `qlda_delete_comment`, `qlda_link_issues`, `qlda_unlink_issues`, `qlda_watch_issue`, `qlda_unwatch_issue` |
| Tệp đính kèm | `qlda_upload_attachments`, `qlda_download_attachment`, `qlda_delete_attachment` |
| Giờ công | `qlda_list_worklogs`, `qlda_log_work`, `qlda_update_worklog`, `qlda_delete_worklog` |
| Sprint | `qlda_list_sprints`, `qlda_create_sprint`, `qlda_update_sprint`, `qlda_start_sprint`, `qlda_complete_sprint`, `qlda_delete_sprint` |
| Phiên bản, mô-đun | `qlda_list_versions`, `qlda_save_version`, `qlda_release_version`, `qlda_delete_version`, `qlda_list_components`, `qlda_save_component`, `qlda_delete_component` |
| Báo cáo | `qlda_my_dashboard`, `qlda_project_report` (summary, dashboard, velocity, burndown, roadmap, sprint-report, worklogs) |
| Bộ lọc | `qlda_list_filters`, `qlda_save_filter`, `qlda_delete_filter` |
| Khách hàng | `qlda_list_customers`, `qlda_get_customer`, `qlda_save_customer`, `qlda_add_customer_activity`, `qlda_customer_work_summary` |
| Tài liệu | `qlda_list_docs`, `qlda_upload_doc`, `qlda_download_doc` |
| Còn lại | `qlda_api_request`: gọi thẳng mọi endpoint `/api/...` (quản trị người dùng, nhóm quyền, workflow, hành trình khách hàng…), vẫn theo quyền của tài khoản |

Ví dụ câu lệnh cho Claude:

- "Liệt kê việc của tôi đang làm trong dự án DEMO"
- "Tạo bug ở DEMO: lỗi đăng nhập bằng VNeID, ưu tiên cao, giao cho dev.minh, đưa vào sprint đang chạy"
- "Chuyển DEMO-12 sang Đang review và bình luận 'đã xong phần API'"
- "Ghi 2h30 cho DEMO-12 hôm nay"
- "Báo cáo burndown sprint hiện tại của DEMO"
