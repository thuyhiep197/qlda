/**
 * MCP server QLDA (stdio). Cấu hình qua biến môi trường:
 *   QLDA_URL       địa chỉ QLDA (mặc định http://localhost:3001)
 *   QLDA_API_KEY   API key cá nhân (Hồ sơ → Bảo mật → API key) — cách nên dùng
 *   QLDA_USERNAME, QLDA_PASSWORD  hoặc đăng nhập bằng tài khoản (QLDA_TOKEN = giá trị cookie qlda_token)
 *   QLDA_READONLY=1  chỉ bật các tool đọc
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { QldaClient } from './client.ts';
import { registerTools } from './tools.ts';

const api = QldaClient.fromEnv();
const server = new McpServer({ name: 'qlda', version: '1.0.0' }, {
  instructions: 'Công cụ quản lý dự án QLDA (kiểu Jira). Issue có mã dạng DEMO-12; dự án có mã dạng DEMO. '
    + 'Tra status_id / user id bằng qlda_get_project trước khi tạo / sửa issue; chuyển trạng thái theo tên bằng qlda_transition_issue. '
    + 'Mọi thao tác chạy bằng quyền của tài khoản đã cấu hình.',
});
registerTools(server, api, { readOnly: process.env.QLDA_READONLY === '1' });
await server.connect(new StdioServerTransport());
console.error(`[qlda-mcp] sẵn sàng, kết nối ${api.baseUrl}`);
