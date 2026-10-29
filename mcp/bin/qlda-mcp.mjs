#!/usr/bin/env node
// Chạy src/index.ts qua tsx, dùng được với `npx` hoặc đường dẫn tuyệt đối trong cấu hình MCP
import { register } from 'tsx/esm/api';
register();
await import('../src/index.ts');
