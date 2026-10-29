import { z, type ZodRawShape } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { QldaClient, QldaError } from './client.ts';

type Kind = 'read' | 'write' | 'delete';

const key = z.string().describe('Mã issue, VD: DEMO-12');
const projectKey = z.string().describe('Mã dự án, VD: DEMO');
const id = z.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng YYYY-MM-DD');
const nullableId = z.number().int().positive().nullable();
const issueType = z.enum(['epic', 'story', 'task', 'bug', 'subtask']);
const priority = z.enum(['highest', 'high', 'medium', 'low', 'lowest']);
const extra = z.record(z.unknown()).optional().describe('Trường khác gửi kèm nguyên trạng vào body (khi API có trường chưa liệt kê ở trên)');

/** Trường issue dùng chung cho tạo / sửa */
const issueFields = {
  summary: z.string().max(255).optional().describe('Tiêu đề'),
  description: z.string().nullable().optional().describe('Mô tả (Markdown, hỗ trợ @username để nhắc)'),
  note: z.string().nullable().optional().describe('Ghi chú'),
  priority: priority.optional(),
  assignee_id: nullableId.optional().describe('ID người thực hiện (xem qlda_get_project → members)'),
  parent_id: nullableId.optional().describe('ID issue cha (Epic cho story/task/bug; issue cha cho subtask)'),
  sprint_id: nullableId.optional().describe('ID sprint; null = backlog'),
  status_id: id.optional().describe('ID trạng thái (xem qlda_get_project → statuses)'),
  story_points: z.number().nullable().optional(),
  labels: z.array(z.string()).optional().describe('Nhãn'),
  start_date: date.nullable().optional(),
  due_date: date.nullable().optional().describe('Hạn hoàn thành'),
  version_id: nullableId.optional(),
  component_id: nullableId.optional().describe('ID mô-đun'),
  ba_id: nullableId.optional().describe('BA phụ trách'),
  dev_id: nullableId.optional().describe('Dev phụ trách'),
  subtype: z.string().nullable().optional().describe('Loại của subtask: story/task/bug'),
  original_estimate: z.string().nullable().optional().describe('Ước lượng, VD "1d 2h", "90m"'),
  remaining_estimate: z.string().nullable().optional().describe('Thời gian còn lại, VD "3h"'),
  flagged: z.boolean().optional().describe('Gắn cờ'),
  phase: z.string().nullable().optional().describe('Giai đoạn (Epic)'),
};

const compact = (v: Record<string, unknown>) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined));

function withExtra<T extends { extra?: Record<string, unknown> }>(args: T) {
  const { extra: more, ...fields } = args;
  return { ...compact(fields as Record<string, unknown>), ...(more ?? {}) };
}

export function registerTools(server: McpServer, api: QldaClient, opts: { readOnly?: boolean } = {}) {
  const tool = <S extends ZodRawShape>(name: string, kind: Kind, description: string, shape: S,
    run: (args: z.objectOutputType<S, z.ZodTypeAny>) => Promise<unknown>) => {
    if (opts.readOnly && kind !== 'read') return;
    server.registerTool(name, {
      description,
      inputSchema: shape,
      annotations: { readOnlyHint: kind === 'read', destructiveHint: kind === 'delete', openWorldHint: false },
    }, (async (args: any) => {
      try {
        const out = await run(args);
        return { content: [{ type: 'text' as const, text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }] };
      } catch (e) {
        const msg = e instanceof QldaError ? `QLDA trả lỗi ${e.status}: ${e.message}` : String((e as Error)?.message ?? e);
        return { isError: true, content: [{ type: 'text' as const, text: msg }] };
      }
    }) as any);
  };

  // -------------------------------------------------------------------------
  // Tài khoản, tìm kiếm, thông báo
  // -------------------------------------------------------------------------
  tool('qlda_whoami', 'read', 'Tài khoản đang dùng: thông tin, nhóm quyền, danh sách quyền và phân hệ thấy được.', {},
    async () => {
      const me = await api.get('/auth/me');
      return { ...me, server: api.baseUrl };
    });

  tool('qlda_search', 'read', 'Tìm nhanh toàn hệ thống (khách hàng, dự án, issue, bước hành trình, tài liệu) theo từ khóa — không dấu cũng được.',
    { q: z.string().min(2) }, ({ q }) => api.get('/search', { q }));

  tool('qlda_list_users', 'read', 'Danh sách người dùng (id, username, họ tên) để tra ID khi giao việc, thêm người theo dõi…', {},
    () => api.get('/users/basic'));

  tool('qlda_list_notifications', 'read', 'Thông báo của tôi (50 mới nhất) và số chưa đọc.',
    { important_only: z.boolean().optional() },
    ({ important_only }) => api.get('/notifications', { tab: important_only ? 'important' : undefined }));

  tool('qlda_mark_notifications_read', 'write', 'Đánh dấu đã đọc một thông báo (truyền id) hoặc tất cả (bỏ trống id).',
    { id: id.optional() },
    ({ id }) => (id ? api.post(`/notifications/${id}/read`) : api.post('/notifications/read-all')));

  // -------------------------------------------------------------------------
  // Dự án
  // -------------------------------------------------------------------------
  tool('qlda_list_projects', 'read', 'Danh sách dự án tôi được vào: mã, tên, loại scrum/kanban, trưởng dự án, số issue mở, trạng thái.',
    { archived: z.boolean().optional().describe('true = xem dự án đã lưu trữ') },
    ({ archived }) => api.get('/projects', { archived: archived ? 1 : undefined }));

  tool('qlda_get_project', 'read',
    'Chi tiết một dự án: trạng thái (statuses), thành viên (members), workflow chuyển trạng thái, sprint đang chạy. Dùng để tra status_id, user id.',
    { project_key: projectKey }, ({ project_key }) => api.get(`/projects/${enc(project_key)}`));

  tool('qlda_create_project', 'write', 'Tạo dự án mới.', {
    key: z.string().regex(/^[A-Za-z][A-Za-z0-9]{1,9}$/).describe('Mã 2–10 ký tự, bắt đầu bằng chữ'),
    name: z.string(),
    type: z.enum(['scrum', 'kanban']).optional(),
    description: z.string().optional(),
    extra,
  }, (a) => api.post('/projects', withExtra(a)));

  tool('qlda_update_project', 'write', 'Sửa thông tin dự án (tên, mô tả, loại, các trường thông tin khác qua extra).', {
    project_key: projectKey,
    name: z.string().optional(),
    description: z.string().nullable().optional(),
    type: z.enum(['scrum', 'kanban']).optional(),
    extra,
  }, ({ project_key, ...a }) => api.patch(`/projects/${enc(project_key)}`, withExtra(a)));

  tool('qlda_archive_project', 'write', 'Lưu trữ hoặc khôi phục dự án.', {
    project_key: projectKey, archived: z.boolean().default(true),
  }, ({ project_key, archived }) => api.post(`/projects/${enc(project_key)}/archive`, { archived }));

  // -------------------------------------------------------------------------
  // Issue
  // -------------------------------------------------------------------------
  tool('qlda_list_issues', 'read',
    'Lọc issue. Các bộ lọc dạng danh sách nhận nhiều giá trị. assignee/reporter/ba nhận "me"; assignee/dev/version/component/parent nhận "none".', {
      project: projectKey.optional(),
      q: z.string().optional().describe('Từ khóa trong tiêu đề / mã / mô tả'),
      type: z.array(issueType).optional(),
      status: z.array(id).optional().describe('ID trạng thái'),
      statusCategory: z.array(z.enum(['todo', 'inprogress', 'done'])).optional(),
      priority: z.array(priority).optional(),
      assignee: z.array(z.union([z.literal('me'), z.literal('none'), z.number()])).optional(),
      reporter: z.union([z.literal('me'), z.number()]).optional(),
      ba: z.union([z.literal('me'), z.number()]).optional(),
      dev: z.union([z.literal('none'), z.number()]).optional(),
      sprint: z.union([z.enum(['backlog', 'active', 'open']), z.number()]).optional(),
      version: z.union([z.literal('none'), z.number()]).optional(),
      component: z.union([z.literal('none'), z.number()]).optional(),
      parent: z.union([z.literal('none'), z.number()]).optional().describe('ID issue cha'),
      keys: z.array(z.string()).optional(),
      label: z.string().optional(),
      customer: z.number().optional().describe('ID khách hàng'),
      excludeSubtasks: z.boolean().optional(),
      excludeEpics: z.boolean().optional(),
      hideDoneOlderThanDays: z.number().optional(),
      sort: z.enum(['rank', 'created', 'updated', 'key', 'priority', 'due']).optional(),
      limit: z.number().int().min(1).max(5000).default(100),
      full: z.boolean().optional().describe('true = trả đủ mọi cột; mặc định rút gọn'),
    }, async ({ full, excludeSubtasks, excludeEpics, ...f }) => {
      const rows = await api.get<any[]>('/issues', {
        ...(f as any), excludeSubtasks: excludeSubtasks ? '1' : undefined, excludeEpics: excludeEpics ? '1' : undefined,
      });
      return { count: rows.length, issues: full ? rows : rows.map(slimIssue) };
    });

  tool('qlda_get_issue', 'read',
    'Chi tiết issue: mô tả, việc con, bình luận, tệp đính kèm, liên kết, người theo dõi, next_status_ids (trạng thái chuyển được).', {
      key, include_history: z.boolean().optional().describe('Kèm lịch sử thay đổi (mặc định không)'),
    }, async ({ key, include_history }) => {
      const issue = await api.get(`/issues/${enc(key)}`);
      if (!include_history) delete issue.history;
      delete issue.permissions;
      return issue;
    });

  tool('qlda_create_issue', 'write', 'Tạo issue (epic/story/task/bug/subtask).', {
    project_key: projectKey,
    type: issueType.default('task'),
    ...issueFields,
    summary: z.string().min(1).max(255).describe('Tiêu đề'),
    extra,
  }, (a) => api.post('/issues', withExtra(a)));

  tool('qlda_update_issue', 'write', 'Sửa issue: chỉ gửi các trường cần đổi. Muốn xóa giá trị thì truyền null.', {
    key, type: issueType.optional(), ...issueFields, extra,
  }, ({ key, ...a }) => api.patch(`/issues/${enc(key)}`, withExtra(a)));

  tool('qlda_transition_issue', 'write',
    'Chuyển trạng thái issue theo TÊN trạng thái (không phân biệt hoa thường, VD "Đang làm") hoặc status_id; kiểm tra workflow trước.', {
      key, status: z.union([z.string(), z.number()]).describe('Tên hoặc ID trạng thái đích'),
      comment: z.string().optional().describe('Bình luận kèm theo'),
    }, async ({ key, status, comment }) => {
      const issue = await api.get(`/issues/${enc(key)}`);
      const project = await api.get(`/projects/${enc(issue.project_key)}`);
      const statuses: { id: number; name: string }[] = project.statuses;
      const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
      const target = typeof status === 'number'
        ? statuses.find((s) => s.id === status)
        : statuses.find((s) => fold(s.name) === fold(status)) ?? statuses.find((s) => fold(s.name).includes(fold(status)));
      const allowed = statuses.filter((s) => issue.next_status_ids.includes(s.id)).map((s) => `${s.name} (#${s.id})`);
      if (!target) throw new Error(`Không thấy trạng thái "${status}". Chuyển được tới: ${allowed.join(', ')}`);
      if (!issue.next_status_ids.includes(target.id)) {
        throw new Error(`Workflow không cho chuyển ${issue.status_name} → ${target.name}. Chuyển được tới: ${allowed.join(', ')}`);
      }
      const updated = await api.patch(`/issues/${enc(key)}`, { status_id: target.id });
      if (comment) await api.post(`/issues/${enc(key)}/comments`, { body: comment });
      return slimIssue(updated);
    });

  tool('qlda_move_issue', 'write', 'Đổi sprint / trạng thái và vị trí (như kéo thả trên board, backlog).', {
    key, sprint_id: nullableId.optional(), status_id: id.optional(),
    after_id: id.optional().describe('Đặt sau issue có id này'), before_id: id.optional().describe('Đặt trước issue có id này'),
  }, ({ key, ...a }) => api.post(`/issues/${enc(key)}/move`, compact(a)));

  tool('qlda_bulk_update_issues', 'write',
    'Sửa hàng loạt tối đa 500 issue: sprint_id, assignee_id, status_id, priority, version_id, component_id, ba_id, dev_id; hoặc xóa (delete=true).', {
      keys: z.array(z.string()).min(1).max(500),
      changes: z.object({
        sprint_id: nullableId.optional(), assignee_id: nullableId.optional(), status_id: id.optional(), priority: priority.optional(),
        version_id: nullableId.optional(), component_id: nullableId.optional(), ba_id: nullableId.optional(), dev_id: nullableId.optional(),
      }).optional(),
      delete: z.boolean().optional().describe('XÓA tất cả issue đã chọn'),
    }, (a) => api.post('/issues/bulk', compact(a)));

  tool('qlda_clone_issue', 'write', 'Nhân bản issue (có thể kèm subtask).', {
    key, summary: z.string().optional(), include_subtasks: z.boolean().optional(), extra,
  }, ({ key, ...a }) => api.post(`/issues/${enc(key)}/clone`, withExtra(a)));

  tool('qlda_move_issue_to_project', 'write', 'Chuyển issue sang dự án khác (đổi mã issue).', {
    key, project_key: projectKey, extra,
  }, ({ key, ...a }) => api.post(`/issues/${enc(key)}/move-project`, withExtra(a)));

  tool('qlda_delete_issue', 'delete', 'XÓA issue vĩnh viễn.', { key }, ({ key }) => api.del(`/issues/${enc(key)}`));

  // Bình luận
  tool('qlda_add_comment', 'write', 'Bình luận vào issue (hỗ trợ @username để nhắc).', { key, body: z.string().min(1) },
    ({ key, body }) => api.post(`/issues/${enc(key)}/comments`, { body }));
  tool('qlda_edit_comment', 'write', 'Sửa bình luận.', { comment_id: id, body: z.string().min(1) },
    ({ comment_id, body }) => api.patch(`/issues/comments/${comment_id}`, { body }));
  tool('qlda_delete_comment', 'delete', 'Xóa bình luận.', { comment_id: id },
    ({ comment_id }) => api.del(`/issues/comments/${comment_id}`));

  // Liên kết, người theo dõi
  tool('qlda_link_issues', 'write', 'Liên kết hai issue.', {
    key, target_key: z.string(), type: z.enum(['blocks', 'relates', 'duplicates']).default('relates'),
  }, ({ key, ...a }) => api.post(`/issues/${enc(key)}/links`, a));
  tool('qlda_unlink_issues', 'delete', 'Gỡ liên kết (link_id lấy từ qlda_get_issue → links).', { link_id: id },
    ({ link_id }) => api.del(`/issues/links/${link_id}`));
  tool('qlda_watch_issue', 'write', 'Theo dõi issue (mặc định chính tôi; truyền user_id để thêm người khác).', { key, user_id: id.optional() },
    ({ key, user_id }) => api.post(`/issues/${enc(key)}/watchers`, compact({ user_id })));
  tool('qlda_unwatch_issue', 'write', 'Bỏ theo dõi issue.', { key, user_id: id.describe('ID người bỏ theo dõi (của tôi: xem qlda_whoami)') },
    ({ key, user_id }) => api.del(`/issues/${enc(key)}/watchers/${user_id}`));

  // Tệp đính kèm
  tool('qlda_upload_attachments', 'write', 'Đính kèm tệp trên máy vào issue.', {
    key, file_paths: z.array(z.string()).min(1).describe('Đường dẫn tuyệt đối tới tệp'),
  }, ({ key, file_paths }) => api.upload(`/issues/${enc(key)}/attachments`, 'files', file_paths));
  tool('qlda_download_attachment', 'read', 'Tải tệp đính kèm về máy.', {
    attachment_id: id, save_to: z.string().describe('Thư mục hoặc đường dẫn tệp đích'),
  }, ({ attachment_id, save_to }) => api.download(`/issues/attachments/${attachment_id}`, save_to));
  tool('qlda_delete_attachment', 'delete', 'Xóa tệp đính kèm.', { attachment_id: id },
    ({ attachment_id }) => api.del(`/issues/attachments/${attachment_id}`));

  // Giờ công
  tool('qlda_list_worklogs', 'read', 'Giờ công đã ghi của một issue.', { key },
    ({ key }) => api.get(`/issues/${enc(key)}/worklogs`));
  tool('qlda_log_work', 'write', 'Ghi giờ làm việc cho issue.', {
    key,
    time_spent: z.string().describe('VD "2h 30m", "1d"'),
    work_date: date.optional().describe('Ngày làm (mặc định hôm nay)'),
    comment: z.string().optional(),
    remaining: z.enum(['auto', 'set', 'keep']).optional().describe('auto = trừ vào thời gian còn lại (mặc định)'),
    remaining_value: z.string().optional().describe('Khi remaining = set'),
  }, ({ key, ...a }) => api.post(`/issues/${enc(key)}/worklogs`, compact({ ...a, work_date: a.work_date ?? today() })));
  tool('qlda_update_worklog', 'write', 'Sửa giờ đã ghi (chỉ của mình).', {
    worklog_id: id, time_spent: z.string().optional(), work_date: date.optional(), comment: z.string().optional(),
  }, ({ worklog_id, ...a }) => api.patch(`/issues/worklogs/${worklog_id}`, compact(a)));
  tool('qlda_delete_worklog', 'delete', 'Xóa giờ đã ghi.', { worklog_id: id },
    ({ worklog_id }) => api.del(`/issues/worklogs/${worklog_id}`));

  // -------------------------------------------------------------------------
  // Sprint
  // -------------------------------------------------------------------------
  tool('qlda_list_sprints', 'read', 'Sprint của dự án kèm số issue / điểm.', {
    project_key: projectKey, state: z.array(z.enum(['future', 'active', 'closed'])).optional(),
  }, ({ project_key, state }) => api.get(`/projects/${enc(project_key)}/sprints`, { state }));
  tool('qlda_create_sprint', 'write', 'Tạo sprint (tên để trống thì tự đặt).', {
    project_key: projectKey, name: z.string().optional(), goal: z.string().optional(),
  }, ({ project_key, ...a }) => api.post(`/projects/${enc(project_key)}/sprints`, compact(a)));
  tool('qlda_update_sprint', 'write', 'Sửa sprint chưa đóng.', {
    project_key: projectKey, sprint_id: id, name: z.string().optional(), goal: z.string().nullable().optional(),
    start_date: date.nullable().optional(), end_date: date.nullable().optional(),
  }, ({ project_key, sprint_id, ...a }) => api.patch(`/projects/${enc(project_key)}/sprints/${sprint_id}`, compact(a)));
  tool('qlda_start_sprint', 'write', 'Bắt đầu sprint (cần ngày kết thúc).', {
    project_key: projectKey, sprint_id: id, end_date: date, start_date: date.optional(), name: z.string().optional(), goal: z.string().optional(),
  }, ({ project_key, sprint_id, ...a }) => api.post(`/projects/${enc(project_key)}/sprints/${sprint_id}/start`, compact(a)));
  tool('qlda_complete_sprint', 'write', 'Hoàn thành sprint đang chạy; issue chưa xong chuyển tới backlog, sprint mới ("new") hoặc ID sprint khác.', {
    project_key: projectKey, sprint_id: id, move_to: z.union([z.enum(['backlog', 'new']), z.number()]).default('backlog'),
  }, ({ project_key, sprint_id, move_to }) => api.post(`/projects/${enc(project_key)}/sprints/${sprint_id}/complete`, { move_to }));
  tool('qlda_delete_sprint', 'delete', 'Xóa sprint.', { project_key: projectKey, sprint_id: id },
    ({ project_key, sprint_id }) => api.del(`/projects/${enc(project_key)}/sprints/${sprint_id}`));

  // -------------------------------------------------------------------------
  // Phiên bản, mô-đun
  // -------------------------------------------------------------------------
  tool('qlda_list_versions', 'read', 'Phiên bản (release) của dự án.', { project_key: projectKey },
    ({ project_key }) => api.get(`/projects/${enc(project_key)}/versions`));
  tool('qlda_save_version', 'write', 'Tạo (bỏ trống version_id) hoặc sửa phiên bản.', {
    project_key: projectKey, version_id: id.optional(), name: z.string().optional(), description: z.string().nullable().optional(),
    start_date: date.nullable().optional(), release_date: date.nullable().optional(),
    status: z.enum(['unreleased', 'released', 'archived']).optional(),
  }, ({ project_key, version_id, ...a }) => (version_id
    ? api.patch(`/projects/${enc(project_key)}/versions/${version_id}`, compact(a))
    : api.post(`/projects/${enc(project_key)}/versions`, compact(a))));
  tool('qlda_release_version', 'write', 'Phát hành phiên bản; issue chưa xong chuyển sang phiên bản move_open_to (nếu có).', {
    project_key: projectKey, version_id: id, move_open_to: id.optional(),
  }, ({ project_key, version_id, move_open_to }) => api.post(`/projects/${enc(project_key)}/versions/${version_id}/release`, compact({ move_open_to })));
  tool('qlda_delete_version', 'delete', 'Xóa phiên bản.', { project_key: projectKey, version_id: id },
    ({ project_key, version_id }) => api.del(`/projects/${enc(project_key)}/versions/${version_id}`));

  tool('qlda_list_components', 'read', 'Mô-đun của dự án (kèm người phụ trách).', { project_key: projectKey },
    ({ project_key }) => api.get(`/projects/${enc(project_key)}/components`));
  tool('qlda_save_component', 'write', 'Tạo (bỏ trống component_id) hoặc sửa mô-đun.', {
    project_key: projectKey, component_id: id.optional(), name: z.string().optional(), description: z.string().nullable().optional(),
    lead_id: nullableId.optional(), side: z.string().optional(), position: z.number().optional(),
  }, ({ project_key, component_id, ...a }) => (component_id
    ? api.patch(`/projects/${enc(project_key)}/components/${component_id}`, compact(a))
    : api.post(`/projects/${enc(project_key)}/components`, compact(a))));
  tool('qlda_delete_component', 'delete', 'Xóa mô-đun.', { project_key: projectKey, component_id: id },
    ({ project_key, component_id }) => api.del(`/projects/${enc(project_key)}/components/${component_id}`));

  // -------------------------------------------------------------------------
  // Báo cáo
  // -------------------------------------------------------------------------
  tool('qlda_my_dashboard', 'read', 'Dashboard cá nhân: việc của tôi, quá hạn, chờ kiểm thử, hoạt động gần đây.', {},
    () => api.get('/reports/dashboard'));
  tool('qlda_project_report', 'read',
    'Báo cáo dự án: summary (tổng quan), dashboard, velocity, burndown (cần sprint_id), roadmap, sprint-report (cần sprint_id), worklogs (from/to).', {
      project_key: projectKey,
      report: z.enum(['summary', 'dashboard', 'velocity', 'burndown', 'roadmap', 'sprint-report', 'worklogs']),
      sprint_id: id.optional(),
      from: date.optional(), to: date.optional(), days: z.number().optional(),
    }, ({ project_key, report, sprint_id, ...q }) => api.get(`/reports/projects/${enc(project_key)}/${report}`, { sprint: sprint_id, ...q }));

  // -------------------------------------------------------------------------
  // Bộ lọc đã lưu
  // -------------------------------------------------------------------------
  tool('qlda_list_filters', 'read', 'Bộ lọc issue đã lưu (của tôi và được chia sẻ).', {}, () => api.get('/filters'));
  tool('qlda_save_filter', 'write', 'Lưu bộ lọc mới (bỏ trống filter_id) hoặc sửa. query là chuỗi query string, VD "assignee=me&statusCategory=inprogress".', {
    filter_id: id.optional(), name: z.string(), query: z.string(), project_key: projectKey.optional(), shared: z.boolean().optional(),
  }, ({ filter_id, ...a }) => (filter_id ? api.patch(`/filters/${filter_id}`, compact(a)) : api.post('/filters', compact(a))));
  tool('qlda_delete_filter', 'delete', 'Xóa bộ lọc đã lưu.', { filter_id: id }, ({ filter_id }) => api.del(`/filters/${filter_id}`));

  // -------------------------------------------------------------------------
  // Khách hàng (phân hệ Kinh doanh)
  // -------------------------------------------------------------------------
  tool('qlda_list_customers', 'read', 'Danh sách khách hàng tôi được xem.', { archived: z.boolean().optional() },
    ({ archived }) => api.get('/customers', { archived: archived ? 1 : undefined }));
  tool('qlda_get_customer', 'read', 'Chi tiết khách hàng: liên hệ, dự án của khách hàng, hoạt động, tệp.', { customer_id: id },
    ({ customer_id }) => api.get(`/customers/${customer_id}`));
  tool('qlda_save_customer', 'write',
    'Tạo (bỏ trống customer_id) hoặc sửa khách hàng. Truyền các trường trong data (VD name, status, province_code, kd_ids, am_ids, contacts…).', {
      customer_id: id.optional(), data: z.record(z.unknown()),
    }, ({ customer_id, data }) => (customer_id ? api.patch(`/customers/${customer_id}`, data) : api.post('/customers', data)));
  tool('qlda_add_customer_activity', 'write', 'Ghi hoạt động chăm sóc khách hàng.', {
    customer_id: id, data: z.record(z.unknown()).describe('Nội dung hoạt động; có thể kèm step_id, sales_project_id'),
  }, ({ customer_id, data }) => api.post(`/customers/${customer_id}/activities`, data));
  tool('qlda_customer_work_summary', 'read', 'Tổng hợp công việc khách hàng (hành trình, cuộc gọi, việc).', {},
    () => api.get('/customers/summary'));

  // -------------------------------------------------------------------------
  // Tài liệu
  // -------------------------------------------------------------------------
  tool('qlda_list_docs', 'read', 'Thư mục và tệp tài liệu (lọc theo thư mục / từ khóa).', {
    folder: id.optional(), q: z.string().optional(),
  }, async ({ folder, q }) => ({ folders: await api.get('/docs/folders'), files: await api.get('/docs/files', { folder, q }) }));
  tool('qlda_upload_doc', 'write', 'Tải tệp trên máy lên kho tài liệu.', { file_paths: z.array(z.string()).min(1), folder: id.optional() },
    ({ file_paths, folder }) => api.upload('/docs/files', 'files', file_paths, { folder }));
  tool('qlda_download_doc', 'read', 'Tải tài liệu về máy.', { file_id: id, save_to: z.string() },
    ({ file_id, save_to }) => api.download(`/docs/files/${file_id}/download`, save_to));

  // -------------------------------------------------------------------------
  // Danh mục
  // -------------------------------------------------------------------------
  tool('qlda_list_catalog', 'read', 'Danh mục: departments (phòng ban), staff (nhân sự), products, product-types, customer-statuses, provinces.', {
    catalog: z.enum(['departments', 'staff', 'products', 'product-types', 'customer-statuses', 'provinces']),
  }, ({ catalog }) => api.get({
    departments: '/departments', staff: '/staff', products: '/products', 'product-types': '/products/types',
    'customer-statuses': '/customer-statuses', provinces: '/geo/provinces',
  }[catalog]));

  // -------------------------------------------------------------------------
  // Gọi API bất kỳ — phủ mọi chức năng còn lại (quản trị, hành trình khách hàng, workflow…)
  // -------------------------------------------------------------------------
  tool('qlda_api_request', 'delete',
    'Gọi trực tiếp REST API QLDA cho chức năng chưa có tool riêng. path bắt đầu sau /api, VD "/admin/users", "/projects/DEMO/workflow", '
    + '"/customers/3/projects/5/journey". Vẫn theo phân quyền của tài khoản.', {
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      path: z.string(),
      query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
      body: z.unknown().optional(),
    }, ({ method, path, query, body }) => api.request(method, path, { query, body }));
}

const enc = (s: string) => encodeURIComponent(s.trim().toUpperCase());
/** Ngày hôm nay theo giờ máy (YYYY-MM-DD) */
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

function slimIssue(i: any) {
  return compact({
    id: i.id, key: i.key, type: i.type, subtype: i.subtype ?? undefined, summary: i.summary,
    status: i.status_name, status_id: i.status_id, status_category: i.status_category, priority: i.priority,
    assignee: i.assignee_name ?? undefined, assignee_id: i.assignee_id ?? undefined,
    parent: i.parent_key ?? undefined, sprint: i.sprint_name ?? undefined, sprint_id: i.sprint_id ?? undefined,
    story_points: i.story_points ?? undefined, due_date: i.due_date ?? undefined, labels: i.labels?.length ? i.labels : undefined,
    flagged: i.flagged ? true : undefined, updated_at: i.updated_at,
  });
}
