# Inline Assignee Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép đổi Người thực hiện ngay trên dòng issue tại Danh sách issue và Kế hoạch chi tiết.

**Architecture:** Một component dùng chung quản lý popover, quyền và request PATCH. Component lấy dự án theo `project_key`, chặn click lan lên dòng, và làm mới cache sau khi lưu.

**Tech Stack:** React 19, TypeScript, TanStack Query, API PATCH hiện có, Node test runner qua `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-09-issue-default-assignee-and-user-avatar-design.md`

## Global Constraints

- Chỉ thêm sửa nhanh tại Danh sách issue và Kế hoạch chi tiết.
- Không thay đổi quy tắc quyền server: `issue.assign` được giao/bỏ giao; người khác chỉ tự nhận issue chưa giao.
- Lỗi giữ giá trị cũ và hiển thị toast.

## Review Focus

- Click bộ chọn không mở modal issue.
- Danh sách toàn hệ thống dùng đúng thành viên/quyền của dự án chứa issue.
- Người không có quyền không thể bỏ giao hoặc đổi từ người khác sang mình.
- Request đang chạy không thể gửi lặp.
- Issue được giao khỏi “Tôi” biến mất đúng lúc sau refresh.

---

### Task 1: Mô hình quyền và lựa chọn hợp lệ

**Files:**
- Create: `web/src/assignee-options.ts`
- Create: `web/src/assignee-options.test.ts`

**Interfaces:**
- Produces: `assigneeOptions(issue, project, me): { editable: boolean; members: Member[]; allowUnassign: boolean; selfOnly: boolean }`

- [ ] **Step 1: Write failing table tests** for full permission, self-assignment of unassigned issue, already-assigned issue without permission and absent membership.
- [ ] **Step 2: Run** `npm test -w web -- assignee-options.test.ts`; **Expected:** FAIL because helper is missing.
- [ ] **Step 3: Implement** the pure permission model using existing `can` semantics.
- [ ] **Step 4: Run** focused tests; **Expected:** PASS.
- [ ] **Step 5: Commit** `test/feat: define inline assignee permissions`.

### Task 2: Component giao việc nhanh

**Files:**
- Create: `web/src/components/InlineAssignee.tsx`
- Modify: `web/src/styles.css`
- Modify: `web/src/assignee-options.test.ts`

**Interfaces:**
- Consumes: `assigneeOptions` from Task 1.
- Produces: `<InlineAssignee issue={issue} project={project} onUpdated?={fn} />`.

- [ ] **Step 1: Add failing tests** for request payload normalization (`number` or `null`), disabled/busy state and error rollback through extracted pure transition helper.
- [ ] **Step 2: Run** focused tests; **Expected:** FAIL.
- [ ] **Step 3: Implement** accessible trigger/popover, outside-click close, event propagation guards, PATCH call, toast handling and cache refresh.
- [ ] **Step 4: Run** tests and web typecheck; **Expected:** PASS.
- [ ] **Step 5: Commit** `feat: add inline assignee editor`.

### Task 3: Gắn component vào hai màn hình

**Files:**
- Modify: `web/src/pages/IssueList.tsx`
- Modify: `web/src/pages/Plan.tsx`
- Modify: `web/src/types.ts`

**Interfaces:**
- Consumes: `InlineAssignee` from Task 2.

- [ ] **Step 1: Add failing type/behavior fixtures** proving IssueList resolves project by `issue.project_key` and Plan uses its project context.
- [ ] **Step 2: Run** focused tests/typecheck; **Expected:** FAIL until integrations exist.
- [ ] **Step 3: Replace** static assignee cells in the two screens; retain static rendering when the helper marks the issue non-editable.
- [ ] **Step 4: Run** web tests, typecheck and build; **Expected:** PASS.
- [ ] **Step 5: Commit** `feat: edit assignees from issue rows`.

