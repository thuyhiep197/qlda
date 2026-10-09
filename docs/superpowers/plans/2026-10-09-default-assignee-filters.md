# Default Assignee Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mặc định hiển thị issue của người đang đăng nhập trên Danh sách issue, Backlog và Kế hoạch chi tiết mà vẫn cho phép xem tất cả hoặc người khác.

**Architecture:** Tách quy tắc khởi tạo/xóa bộ lọc thành hàm thuần có test. `IssueList` dùng sentinel URL `all`; `Backlog` và `Plan` dùng ID người dùng từ `useMe`. Board và các màn tổng hợp không thay đổi.

**Tech Stack:** React 19, TypeScript, TanStack Query, React Router, Node test runner qua `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-09-issue-default-assignee-and-user-avatar-design.md`

## Global Constraints

- Phạm vi mặc định “Tôi” chỉ gồm Danh sách issue toàn hệ thống/trong dự án, Backlog và Kế hoạch chi tiết.
- “Tất cả”, người khác và “Chưa giao” vẫn chọn được từ bộ lọc.
- Không làm thay đổi Board, Roadmap, Dashboard hoặc Báo cáo.
- Kế hoạch chi tiết giữ các dòng cha làm ngữ cảnh.

## Review Focus

- `useMe` chưa tải xong: không được hiển thị thoáng qua issue của tất cả người dùng.
- URL `assignee=all`: API không nhận giá trị `all` như một ID.
- Bộ lọc lưu cũ không có `assignee`: dùng mặc định “Tôi”.
- Xóa các bộ lọc khác: vẫn giữ mặc định “Tôi”.
- Issue cha không được giao cho tôi: chỉ hiện khi cần làm ngữ cảnh cho issue con khớp.

---

### Task 1: Quy tắc bộ lọc thuần và hạ tầng test web

**Files:**
- Create: `web/src/issue-filter-defaults.ts`
- Create: `web/src/issue-filter-defaults.test.ts`
- Modify: `web/package.json`

**Interfaces:**
- Produces: `issueListAssignee(param: string | null): { control: string; api?: string }`
- Produces: `defaultAssignees(userId?: number): number[] | null`

- [ ] **Step 1: Write the failing tests** for missing URL value, `all`, `me`, numeric ID, missing/current user ID and reset semantics using literal expected values.
- [ ] **Step 2: Run** `npm test -w web -- issue-filter-defaults.test.ts`; **Expected:** FAIL because the module/functions do not exist.
- [ ] **Step 3: Implement** the two exported pure functions and add `"test": "tsx --test"` to `web/package.json`.
- [ ] **Step 4: Run** the focused test; **Expected:** all cases PASS.
- [ ] **Step 5: Commit** `test/feat: add default assignee filter rules`.

### Task 2: Danh sách issue mặc định theo Tôi

**Files:**
- Modify: `web/src/pages/IssueList.tsx`
- Modify: `web/src/issue-filter-defaults.test.ts`

**Interfaces:**
- Consumes: `issueListAssignee` from Task 1.

- [ ] **Step 1: Add failing tests** proving `all` is omitted from API filters and clear-filter state resolves to `me`.
- [ ] **Step 2: Run** focused test; **Expected:** FAIL on the new behavior.
- [ ] **Step 3: Integrate** the helper into URL parsing, dropdown value, API query and saved-filter application; keep `assignee=all` in URL but delete it from the API filter object.
- [ ] **Step 4: Run** focused test and `npm run typecheck -w web`; **Expected:** PASS.
- [ ] **Step 5: Commit** `feat: default issue lists to current assignee`.

### Task 3: Backlog và Kế hoạch chi tiết mặc định theo Tôi

**Files:**
- Modify: `web/src/components/FilterBar.tsx`
- Modify: `web/src/pages/Backlog.tsx`
- Modify: `web/src/pages/Plan.tsx`
- Modify: `web/src/issue-filter-defaults.test.ts`

**Interfaces:**
- Consumes: `defaultAssignees` from Task 1.
- Produces: `useFilters(defaultAssigneeId?: number)` while preserving no-argument behavior for Board.

- [ ] **Step 1: Add failing tests** for initialization/reset with current user, no-user loading state and unchanged no-argument behavior.
- [ ] **Step 2: Run** focused test; **Expected:** FAIL on the new cases.
- [ ] **Step 3: Update** `useFilters` and `FilterBar` reset behavior; pass `me?.id` only from Backlog, leaving Board unchanged.
- [ ] **Step 4: Update** Plan to initialize/reset/filter by assignee ID, render “Tôi” selected after `useMe`, and keep parent context.
- [ ] **Step 5: Run** focused tests, web typecheck and web build; **Expected:** PASS.
- [ ] **Step 6: Commit** `feat: default backlog and plan to current assignee`.

