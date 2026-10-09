# User Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép người dùng tải/thay/xóa ảnh đại diện và hiển thị ảnh đó ở mọi vị trí có avatar người dùng.

**Architecture:** Server lưu tên tệp ngẫu nhiên trong `users.avatar`, lưu nội dung dưới `data/uploads/avatars`, xác thực chữ ký JPEG/PNG/WebP và phục vụ qua endpoint an toàn. Client mở rộng dữ liệu với `avatar_url`, dùng fallback chữ cái trong component `Avatar`, và quản lý ảnh tại Hồ sơ.

**Tech Stack:** Express 5, Multer 2, SQLite, React 19, TypeScript, TanStack Query, Node test runner qua `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-09-issue-default-assignee-and-user-avatar-design.md`

## Global Constraints

- Tối đa 2 MB; chỉ JPEG, PNG, WebP; kiểm tra MIME và chữ ký; cấm SVG.
- Chỉ người dùng tự đổi/xóa ảnh của mình.
- Ảnh lỗi hoặc thiếu ảnh luôn fallback về chữ cái.
- Không thêm thư viện xử lý ảnh.

## Review Focus

- MIME hợp lệ nhưng chữ ký giả: phải bị từ chối và dọn tệp tạm.
- Cập nhật DB lỗi sau khi ghi tệp: phải xóa tệp mới và giữ avatar cũ.
- Tên tệp traversal/không đúng mẫu: endpoint không được đọc ngoài thư mục avatar.
- Cache trình duyệt sau thay ảnh: URL phải thay đổi hoặc có cache-buster.
- Mọi DTO có người dùng phải mang đúng `avatar_url`, không nhầm alias SQL.

---

### Task 1: Xác thực và lưu trữ avatar phía server

**Files:**
- Create: `server/src/avatar.ts`
- Create: `server/src/avatar.test.ts`
- Modify: `server/package.json`
- Modify: `server/src/db.ts`

**Interfaces:**
- Produces: `AVATAR_DIR`, `MAX_AVATAR_BYTES`, `avatarMime(buffer): string | null`, `avatarUrl(storedName?: string | null): string | null`, `safeAvatarName(value: string): boolean`.

- [ ] **Step 1: Write failing tests** with literal JPEG/PNG/WebP headers, mismatched/invalid bytes, valid generated filenames and traversal inputs.
- [ ] **Step 2: Run** `npm test -w server -- avatar.test.ts`; **Expected:** FAIL because module is missing.
- [ ] **Step 3: Implement** helpers, create avatar directory on startup, add `"test": "tsx --test"`, and append migration `ALTER TABLE users ADD COLUMN avatar TEXT`.
- [ ] **Step 4: Run** focused tests and server typecheck; **Expected:** PASS.
- [ ] **Step 5: Commit** `feat: add avatar storage primitives`.

### Task 2: API tải, đọc và xóa avatar

**Files:**
- Modify: `server/src/routes/auth.ts`
- Modify: `server/src/avatar.ts`
- Modify: `server/src/avatar.test.ts`

**Interfaces:**
- Consumes: avatar helpers from Task 1.
- Produces: `POST /api/auth/avatar`, `DELETE /api/auth/avatar`, `GET /api/auth/avatars/:filename`.

- [ ] **Step 1: Add failing lifecycle tests** for file validation, replace cleanup, rollback cleanup, deletion and safe filename serving using temporary directories.
- [ ] **Step 2: Run** focused tests; **Expected:** FAIL.
- [ ] **Step 3: Implement** Multer single-file upload with 2 MB limit, signature validation, random filename, DB update, cleanup and authenticated endpoints.
- [ ] **Step 4: Normalize** Multer errors to Vietnamese 400 responses without changing unrelated upload behavior.
- [ ] **Step 5: Run** server tests and typecheck; **Expected:** PASS.
- [ ] **Step 6: Commit** `feat: add avatar upload API`.

### Task 3: Truyền avatar qua các response

**Files:**
- Modify: `server/src/routes/auth.ts`
- Modify: `server/src/issues.ts`
- Modify: `server/src/routes/issues.ts`
- Modify: `server/src/routes/projects.ts`
- Modify: các route báo cáo/thông báo/người dùng có DTO người dùng được tìm thấy bằng `rg "full_name|assignee_name|actor_name|user_name" server/src`
- Modify: `web/src/types.ts`

**Interfaces:**
- Consumes: `avatarUrl` from Task 1.
- Produces: nullable `avatar_url`, `assignee_avatar_url`, `author_avatar_url`, `actor_avatar_url` fields matching each DTO.

- [ ] **Step 1: Add failing mapping tests** for null and populated avatar aliases on representative DTOs.
- [ ] **Step 2: Run** focused tests; **Expected:** FAIL.
- [ ] **Step 3: Extend** SQL selects/mappers and TypeScript interfaces for every user-bearing response.
- [ ] **Step 4: Run** server/web typecheck and tests; **Expected:** PASS.
- [ ] **Step 5: Commit** `feat: expose avatar URLs across user data`.

### Task 4: Avatar component và trang Hồ sơ

**Files:**
- Modify: `web/src/components/ui.tsx`
- Modify: `web/src/pages/Profile.tsx`
- Modify: `web/src/styles.css`
- Create: `web/src/avatar-client.ts`
- Create: `web/src/avatar-client.test.ts`

**Interfaces:**
- Produces: `validateAvatarFile(file): string | null`; extends `<Avatar src?: string | null>`.

- [ ] **Step 1: Write failing tests** for client file type/size validation and fallback state reducer.
- [ ] **Step 2: Run** focused tests; **Expected:** FAIL.
- [ ] **Step 3: Implement** image rendering/fallback and profile preview, confirm-upload, remove, URL cleanup, toast and query invalidation.
- [ ] **Step 4: Run** web tests, typecheck and build; **Expected:** PASS.
- [ ] **Step 5: Commit** `feat: manage avatar from user profile`.

### Task 5: Hiển thị avatar trên toàn hệ thống

**Files:**
- Modify: mọi call site từ `rg "<Avatar" web/src` để truyền đúng trường URL.

**Interfaces:**
- Consumes: extended DTO fields from Task 3 and `Avatar src` from Task 4.

- [ ] **Step 1: Add failing compile fixtures** for representative assignee, commenter, notification actor, member and current-user usages.
- [ ] **Step 2: Run** web typecheck; **Expected:** FAIL while URL props are absent/mismatched.
- [ ] **Step 3: Update** every avatar call site, preserving unnamed/unassigned fallback.
- [ ] **Step 4: Run** all server/web tests, root typecheck and production build; **Expected:** PASS with no warnings/errors.
- [ ] **Step 5: Commit** `feat: show user avatars throughout the app`.

