import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(import.meta.dirname, '../../data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'qlda.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const cache = new Map<string, StatementSync>();
function stmt(sql: string) {
  let s = cache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    cache.set(sql, s);
  }
  return s;
}

type Param = SQLInputValue | undefined | boolean;
const norm = (params: Param[]) =>
  params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p)) as SQLInputValue[];

export function all<T = any>(sql: string, ...params: Param[]): T[] {
  return stmt(sql).all(...norm(params)).map((r) => ({ ...r })) as T[];
}
export function get<T = any>(sql: string, ...params: Param[]): T | undefined {
  const r = stmt(sql).get(...norm(params));
  return r ? ({ ...r } as T) : undefined;
}
export function run(sql: string, ...params: Param[]) {
  const r = stmt(sql).run(...norm(params));
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
}

let depth = 0;
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

export const now = () => new Date().toISOString();
/** Ngày hiện tại theo múi giờ máy chủ (TZ), dạng YYYY-MM-DD */
export const localDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Migrations: mỗi phần tử là một phiên bản schema, chạy tuần tự theo PRAGMA user_version.
// Chỉ THÊM phần tử mới vào cuối mảng, không sửa các phần tử đã phát hành.
// ---------------------------------------------------------------------------
const TS = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";
/** Migration: nhóm người dùng / quyền riêng của người dùng có quyền `from` thì được thêm các quyền `add` */
const grantWith = (from: string, add: string[]) => `
   UPDATE roles SET permissions = json_insert(permissions, ${add.map((p) => `'$[#]', '${p}'`).join(', ')})
     WHERE EXISTS (SELECT 1 FROM json_each(roles.permissions) WHERE value = '${from}');
   INSERT OR IGNORE INTO user_permissions(user_id, permission, effect)
     SELECT u.user_id, a.value, u.effect FROM user_permissions u, json_each('${JSON.stringify(add)}') a WHERE u.permission = '${from}';`;
/** Migration: thêm nhóm người dùng nếu đã có dữ liệu (cài mới thì nhóm mặc định do seedRoles tạo) và chưa có nhóm cùng tên */
const addRole = (name: string, description: string, permissions: string[]) => `
   INSERT INTO roles(name, description, permissions) SELECT '${name}', '${description}', '${JSON.stringify(permissions)}'
     WHERE EXISTS (SELECT 1 FROM roles) AND NOT EXISTS (SELECT 1 FROM roles WHERE name = '${name}');`;
const PROJECT_VIEW_ROLE = ['dashboard.view', 'plan.view', 'plan.export', 'issue.view', 'comment.view', 'attachment.view', 'attachment.export', 'component.view'];
// Khớp SALES_PERMISSIONS, BOARD_PERMISSIONS ở permissions.ts (db.ts không import permissions.ts)
const SALES_ROLE = [...PROJECT_VIEW_ROLE, 'customer.view', 'customer.create', 'customer.edit', 'sales_project.view', 'sales_project.create', 'sales_project.edit',
  'journey.view', 'journey.create', 'journey.edit', 'journey.delete', 'ctask.view', 'ctask.create', 'ctask.edit',
  'cfile.view', 'cfile.create', 'cfile.export', 'ctalk.view', 'ctalk.create', 'product.view', 'geo.view', 'department.view', 'staff.view'];
const BOARD_ROLE = [...SALES_ROLE, 'customer_all.view'];
/** Các ô quyền của phân hệ Dự án lúc thêm ô Dự án – Xem (v30), dạng danh sách SQL — khớp PROJECT_MODULE_PERMISSIONS ở permissions.ts */
const PROJECT_MODULE_CELLS = ['project.create', 'project.edit', 'project.delete', 'project.view_all', 'plan.view', 'plan.export',
  'sprint.view', 'sprint.create', 'sprint.edit', 'sprint.delete', 'backlog.view', 'backlog.edit', 'search.view', 'search.export',
  'issue.view', 'issue.create', 'issue.edit', 'issue.delete', 'issue.import', 'issue_own.edit', 'assign.edit', 'transition.edit',
  'comment.view', 'comment.create', 'comment.edit', 'comment.delete', 'attachment.view', 'attachment.create', 'attachment.delete', 'attachment.export',
  'worklog.view', 'worklog.create', 'worklog.delete'].map((p) => `'${p}'`).join(', ');
/** Migration: mọi nhóm người dùng (trừ nhóm Quản trị hệ thống — vốn toàn quyền) được thêm các ô quyền `add` còn thiếu; chạy lại không nhân đôi */
const grantAllRoles = (add: string[]) => add.map((p) => `
   UPDATE roles SET permissions = json_insert(permissions, '$[#]', '${p}')
     WHERE is_admin = 0 AND NOT EXISTS (SELECT 1 FROM json_each(roles.permissions) WHERE value = '${p}');`).join('');
/** Nhóm quản trị hệ thống (roles.is_admin = 1): thuộc nhóm này là toàn quyền; ma trận quyền của nhóm không dùng */
export const ADMIN_ROLE_NAME = 'Quản trị hệ thống';
/** Mỗi phiên bản: câu lệnh SQL, hoặc hàm (khi cần xử lý dữ liệu bằng code) — chạy trong cùng giao dịch */
const migrations: (string | (() => void))[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    full_name TEXT NOT NULL,
    email TEXT,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ${TS},
    last_login_at TEXT
  );

  CREATE TABLE roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    permissions TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT ${TS}
  );

  CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL CHECK (type IN ('scrum','kanban')),
    lead_id INTEGER REFERENCES users(id),
    issue_seq INTEGER NOT NULL DEFAULT 0,
    sprint_seq INTEGER NOT NULL DEFAULT 0,
    workflow_strict INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ${TS}
  );

  CREATE TABLE project_members (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    role_id INTEGER NOT NULL REFERENCES roles(id),
    created_at TEXT NOT NULL DEFAULT ${TS},
    PRIMARY KEY (project_id, user_id)
  );

  CREATE TABLE statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('todo','inprogress','done')),
    position INTEGER NOT NULL DEFAULT 0,
    wip_limit INTEGER
  );

  CREATE TABLE transitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    from_status_id INTEGER NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
    to_status_id INTEGER NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
    UNIQUE (from_status_id, to_status_id)
  );

  CREATE TABLE sprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    goal TEXT,
    state TEXT NOT NULL DEFAULT 'future' CHECK (state IN ('future','active','closed')),
    start_date TEXT,
    end_date TEXT,
    started_at TEXT,
    completed_at TEXT,
    committed_points REAL,
    completed_points REAL,
    committed_issues INTEGER,
    completed_issues INTEGER,
    created_at TEXT NOT NULL DEFAULT ${TS}
  );

  CREATE TABLE issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    key TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('epic','story','task','bug','subtask')),
    summary TEXT NOT NULL,
    description TEXT,
    status_id INTEGER NOT NULL REFERENCES statuses(id),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('highest','high','medium','low','lowest')),
    assignee_id INTEGER REFERENCES users(id),
    reporter_id INTEGER REFERENCES users(id),
    parent_id INTEGER REFERENCES issues(id) ON DELETE SET NULL,
    sprint_id INTEGER REFERENCES sprints(id) ON DELETE SET NULL,
    story_points REAL,
    labels TEXT,
    start_date TEXT,
    due_date TEXT,
    rank REAL NOT NULL DEFAULT 0,
    resolved_at TEXT,
    created_at TEXT NOT NULL DEFAULT ${TS},
    updated_at TEXT NOT NULL DEFAULT ${TS}
  );
  CREATE INDEX idx_issues_project ON issues(project_id, rank);
  CREATE INDEX idx_issues_sprint ON issues(sprint_id);
  CREATE INDEX idx_issues_parent ON issues(parent_id);
  CREATE INDEX idx_issues_assignee ON issues(assignee_id);

  CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${TS},
    updated_at TEXT
  );
  CREATE INDEX idx_comments_issue ON comments(issue_id);

  CREATE TABLE attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    uploader_id INTEGER NOT NULL REFERENCES users(id),
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime TEXT,
    size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ${TS}
  );
  CREATE INDEX idx_attachments_issue ON attachments(issue_id);

  CREATE TABLE issue_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    field TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    old_label TEXT,
    new_label TEXT,
    created_at TEXT NOT NULL DEFAULT ${TS}
  );
  CREATE INDEX idx_history_issue ON issue_history(issue_id, created_at);
  CREATE INDEX idx_history_time ON issue_history(created_at);

  CREATE TABLE issue_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('blocks','relates','duplicates')),
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT ${TS},
    UNIQUE (source_id, target_id, type)
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // v2: thu hồi phiên đăng nhập cũ khi đổi/cấp lại mật khẩu
  `ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;`,
  // v3: vai trò chính của tài khoản (Dev, BA...), dùng làm mặc định khi thêm vào dự án
  `ALTER TABLE users ADD COLUMN default_role_id INTEGER REFERENCES roles(id);
   UPDATE users SET default_role_id = (SELECT pm.role_id FROM project_members pm WHERE pm.user_id = users.id
     ORDER BY pm.created_at LIMIT 1) WHERE default_role_id IS NULL;
   UPDATE users SET default_role_id = (SELECT id FROM roles WHERE permissions LIKE '%project.admin%' ORDER BY id LIMIT 1)
     WHERE default_role_id IS NULL AND is_admin = 1;
   UPDATE project_members SET role_id = (SELECT u.default_role_id FROM users u WHERE u.id = project_members.user_id)
     WHERE (SELECT u.default_role_id FROM users u WHERE u.id = project_members.user_id) IS NOT NULL;`,
  // v4: quyền mới "Nhập issue từ file" cho các vai trò đang được quản lý sprint/backlog
  `UPDATE roles SET permissions = json_insert(permissions, '$[#]', 'issue.import')
     WHERE permissions LIKE '%"sprint.manage"%' AND permissions NOT LIKE '%"issue.import"%';`,
  // v5: người theo dõi issue (watcher) và thông báo trong ứng dụng
  `CREATE TABLE issue_watchers (
     issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES users(id),
     created_at TEXT NOT NULL DEFAULT ${TS},
     PRIMARY KEY (issue_id, user_id)
   );
   CREATE INDEX idx_watchers_user ON issue_watchers(user_id);
   CREATE TABLE notifications (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL REFERENCES users(id),
     actor_id INTEGER REFERENCES users(id),
     issue_id INTEGER REFERENCES issues(id) ON DELETE CASCADE,
     type TEXT NOT NULL,
     text TEXT,
     created_at TEXT NOT NULL DEFAULT ${TS},
     read_at TEXT
   );
   CREATE INDEX idx_notifications_user ON notifications(user_id, created_at);
   INSERT OR IGNORE INTO issue_watchers(issue_id, user_id) SELECT id, reporter_id FROM issues WHERE reporter_id IS NOT NULL;
   INSERT OR IGNORE INTO issue_watchers(issue_id, user_id) SELECT id, assignee_id FROM issues WHERE assignee_id IS NOT NULL;
   INSERT OR IGNORE INTO issue_watchers(issue_id, user_id) SELECT DISTINCT issue_id, author_id FROM comments;`,
  // v6: workflow theo loại issue — tập trạng thái riêng cho từng loại; luồng chuyển riêng theo loại
  // (issue_type = '' là luồng chung cho mọi loại chưa đặt luồng riêng)
  `CREATE TABLE type_statuses (
     project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     issue_type TEXT NOT NULL,
     status_id INTEGER NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
     PRIMARY KEY (project_id, issue_type, status_id)
   );
   CREATE TABLE transitions_v6 (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     issue_type TEXT NOT NULL DEFAULT '',
     from_status_id INTEGER NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
     to_status_id INTEGER NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
     UNIQUE (project_id, issue_type, from_status_id, to_status_id)
   );
   INSERT INTO transitions_v6(project_id, issue_type, from_status_id, to_status_id)
     SELECT project_id, '', from_status_id, to_status_id FROM transitions;
   DROP TABLE transitions;
   ALTER TABLE transitions_v6 RENAME TO transitions;`,
  // v7: ghi thời gian làm việc, phiên bản phát hành, bộ lọc đã lưu
  `ALTER TABLE issues ADD COLUMN original_estimate INTEGER;   -- phút
   ALTER TABLE issues ADD COLUMN remaining_estimate INTEGER;  -- phút
   CREATE TABLE worklogs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES users(id),
     work_date TEXT NOT NULL,
     minutes INTEGER NOT NULL CHECK (minutes > 0),
     comment TEXT,
     created_at TEXT NOT NULL DEFAULT ${TS},
     updated_at TEXT
   );
   CREATE INDEX idx_worklogs_issue ON worklogs(issue_id);
   CREATE INDEX idx_worklogs_user_date ON worklogs(user_id, work_date);
   CREATE TABLE versions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     description TEXT,
     start_date TEXT,
     release_date TEXT,
     status TEXT NOT NULL DEFAULT 'unreleased' CHECK (status IN ('unreleased','released','archived')),
     released_at TEXT,
     position INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT ${TS},
     UNIQUE (project_id, name)
   );
   ALTER TABLE issues ADD COLUMN version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL;
   CREATE INDEX idx_issues_version ON issues(version_id);
   CREATE TABLE saved_filters (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL REFERENCES users(id),
     project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     query TEXT NOT NULL,
     shared INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT ${TS}
   );
   -- Cài đặt cá nhân: giao diện sáng/tối, thông báo muốn nhận (JSON); thông tin liên hệ
   ALTER TABLE users ADD COLUMN preferences TEXT NOT NULL DEFAULT '{}';
   ALTER TABLE users ADD COLUMN phone TEXT;
   ALTER TABLE users ADD COLUMN job_title TEXT;`,
  // v8: mô-đun (như Component của Jira) — mỗi mô-đun có BA phụ trách, thuộc side Sở/Trường/Chung
  `CREATE TABLE components (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     description TEXT,
     side TEXT,
     lead_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     position INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT ${TS},
     UNIQUE (project_id, name)
   );
   ALTER TABLE issues ADD COLUMN component_id INTEGER REFERENCES components(id) ON DELETE SET NULL;
   CREATE INDEX idx_issues_component ON issues(component_id);`,
  // v9: phân quyền riêng theo người dùng — cho phép thêm hoặc chặn từng quyền ngoài quyền của nhóm
  `CREATE TABLE user_permissions (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     permission TEXT NOT NULL,
     effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
     PRIMARY KEY (user_id, permission)
   );`,
  // v10: BA phụ trách riêng cho từng issue (bỏ trống = theo BA phụ trách của mô-đun)
  `ALTER TABLE issues ADD COLUMN ba_id INTEGER REFERENCES users(id) ON DELETE SET NULL;`,
  // v11: ảnh/tệp dán hoặc gửi kèm trong bình luận, mô tả (không hiện ở mục Tệp đính kèm của issue)
  `ALTER TABLE attachments ADD COLUMN inline INTEGER NOT NULL DEFAULT 0;
   UPDATE attachments SET inline = 1 WHERE filename LIKE 'anh-dan-%' OR EXISTS (
     SELECT 1 FROM comments c WHERE c.issue_id = attachments.issue_id
       AND (c.body LIKE '%/attachments/' || attachments.id || ')%' OR c.body LIKE '%/attachments/' || attachments.id || '?%')
   ) OR EXISTS (
     SELECT 1 FROM issues i WHERE i.id = attachments.issue_id
       AND (i.description LIKE '%/attachments/' || attachments.id || ')%' OR i.description LIKE '%/attachments/' || attachments.id || '?%')
   );`,
  // v12: nhật ký bảo mật (đăng nhập, thao tác quản trị)
  `CREATE TABLE audit_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     at TEXT NOT NULL,
     user_id INTEGER,
     username TEXT,
     action TEXT NOT NULL,
     target TEXT,
     detail TEXT,
     ip TEXT,
     user_agent TEXT
   );
   CREATE INDEX idx_audit_at ON audit_log(at);
   CREATE INDEX idx_audit_action ON audit_log(action);`,
  // v13: loại của việc con (Sub-task) — Story / Task / Bug; NULL = việc con thường
  `ALTER TABLE issues ADD COLUMN subtype TEXT;`,
  // v14: thông tin quản lý dự án (theo bảng quản lý dự án của BA): khách hàng, ưu tiên, trạng thái dự án, nhân sự
  `ALTER TABLE projects ADD COLUMN customer TEXT;
   ALTER TABLE projects ADD COLUMN priority TEXT;
   ALTER TABLE projects ADD COLUMN project_status TEXT;
   ALTER TABLE projects ADD COLUMN pm TEXT;
   ALTER TABLE projects ADD COLUMN ba TEXT;
   ALTER TABLE projects ADD COLUMN dev TEXT;
   ALTER TABLE projects ADD COLUMN tester TEXT;
   ALTER TABLE projects ADD COLUMN sales TEXT;`,
  // v15: giai đoạn dự án của Epic (NULL = tự đoán theo tên); trạng thái dự án = giai đoạn (project_status giờ là trạng thái ghim tay, NULL = tự động)
  `ALTER TABLE issues ADD COLUMN phase TEXT;
   UPDATE projects SET project_status = NULL WHERE project_status NOT IN
     ('Chưa bắt đầu','Trình chủ trương','Lập HSYC','Khảo sát, phân tích','Xây dựng','Kiểm thử','Triển khai','Nghiệm thu','Hỗ trợ vận hành');`,
  // v16: danh mục nhân sự dùng chung (vị trí BA/PM, Tester, AM, Dev); dự án gộp PM vào BA (thành BA/PM), Kinh doanh đổi thành AM
  `CREATE TABLE staff (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     full_name TEXT NOT NULL UNIQUE,
     positions TEXT NOT NULL DEFAULT '',
     note TEXT,
     created_at TEXT NOT NULL DEFAULT ${TS}
   );
   INSERT INTO staff(full_name, positions, note) VALUES
     ('Nguyễn Thị Thúy Hiệp', 'ba_pm,tester', NULL),
     ('Hoàng Thanh Trang', 'ba_pm,tester', NULL),
     ('Nguyễn Hồng Nhung', 'ba_pm,tester,am', NULL),
     ('Phạm Hải Đăng', 'ba_pm,tester', NULL),
     ('Nguyễn Phương Anh', 'ba_pm,tester', NULL),
     ('Nguyễn Minh Hiếu', 'ba_pm', 'TTS'),
     ('Phạm Văn Phương', 'am', NULL),
     ('Nguyễn Văn Chuyền', 'am', NULL),
     ('Hoàng Toàn', 'am', NULL),
     ('Phan Hồng Đạt', 'dev', NULL),
     ('Nhữ Đình Nhật', 'dev', NULL),
     ('Nhữ Xuân Việt', 'dev', NULL),
     ('Nguyễn Đức Anh', 'dev', NULL),
     ('Lưu Văn Đông', 'dev', NULL),
     ('Nguyễn Hữu Tùng', 'dev', NULL),
     ('Ngô Giản Tuy', 'dev', NULL),
     ('Phạm Hoàng Anh', 'dev', NULL),
     ('Nguyễn Huy', 'dev', NULL),
     ('Nguyễn Anh Tuấn', 'dev', NULL),
     ('Phạm Tuấn Anh', 'dev', NULL),
     ('Trần Ngọc Tú', 'dev', NULL);
   UPDATE projects SET ba = CASE WHEN pm IS NULL OR pm = '' THEN ba WHEN ba IS NULL OR ba = '' THEN pm WHEN ba = pm THEN ba ELSE pm || ', ' || ba END;
   ALTER TABLE projects DROP COLUMN pm;
   ALTER TABLE projects RENAME COLUMN sales TO am;`,
  // v17: đánh dấu issue quan trọng (⚑, như Flag của Jira) — thông báo của issue này vào tab Quan trọng
  `ALTER TABLE issues ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0;`,
  // v18: ảnh đại diện do người dùng tự tải lên
  `ALTER TABLE users ADD COLUMN avatar TEXT;`,
  // v19: ghi chú ngắn cho issue
  `ALTER TABLE issues ADD COLUMN note TEXT;`,
  // v20: Dev phụ trách issue, chọn từ danh mục nhân sự vị trí Dev
  `ALTER TABLE issues ADD COLUMN dev_id INTEGER REFERENCES staff(id) ON DELETE SET NULL;`,
  // v21: phân hệ Quản lý khách hàng — thông tin cơ quan/đơn vị, đầu mối liên hệ, hành trình khách hàng (quy trình I–IV),
  // công việc kinh doanh, tài liệu, trao đổi (làm việc với KH + thảo luận nội bộ); thông báo gắn với khách hàng;
  // danh mục Loại sản phẩm & Sản phẩm (mô tả sản phẩm tự điền vào khách hàng khi chọn); Danh mục địa chính (tỉnh/thành phố, phường/xã — nạp sẵn khi khởi động).
  // Dự án gắn với khách hàng qua projects.customer_id (projects.customer giữ tên để hiển thị); tạo sẵn khách hàng từ các dự án hiện có.
  // Nhóm người dùng được tạo dự án thì được toàn quyền với khách hàng và danh mục sản phẩm.
  // Phòng ban (sơ đồ tổ chức): Ban Giám đốc đứng đầu, dưới là các phòng; nhân sự thuộc phòng ban
  `CREATE TABLE departments (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     code TEXT NOT NULL UNIQUE COLLATE NOCASE,
     name TEXT NOT NULL,
     parent_id INTEGER REFERENCES departments(id),
     position INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT ${TS}
   );
   INSERT INTO departments(code, name, position) VALUES ('BGĐ', 'Ban Giám đốc', 0);
   INSERT INTO departments(code, name, parent_id, position) VALUES
     ('P.KD', 'Phòng Kinh doanh', 1, 1), ('P.DA', 'Phòng Dự án', 1, 2), ('P.SP', 'Phòng Sản phẩm', 1, 3), ('P.HC', 'Phòng Hành chính', 1, 4);
   -- Phòng Kinh doanh chia Sale / AM; Phòng Dự án, Phòng Sản phẩm chia nhóm Dev / BA / Tester; Phòng Hành chính chia Kế toán / Nhân sự / Hành chính nhân sự
   INSERT INTO departments(code, name, parent_id, position) SELECT 'P.KD.' || c.code, c.name, p.id, p.position * 10 + c.pos FROM departments p,
     (SELECT 'SALE' AS code, 'Sale' AS name, 1 AS pos UNION ALL SELECT 'AM', 'AM', 2) c WHERE p.code = 'P.KD';
   INSERT INTO departments(code, name, parent_id, position) SELECT p.code || '.' || c.code, c.name, p.id, p.position * 10 + c.pos FROM departments p,
     (SELECT 'DEV' AS code, 'Dev' AS name, 1 AS pos UNION ALL SELECT 'BA', 'BA', 2 UNION ALL SELECT 'TEST', 'Tester', 3) c WHERE p.code IN ('P.DA', 'P.SP');
   INSERT INTO departments(code, name, parent_id, position) SELECT 'P.HC.' || c.code, c.name, p.id, p.position * 10 + c.pos FROM departments p,
     (SELECT 'KT' AS code, 'Kế toán' AS name, 1 AS pos UNION ALL SELECT 'NS', 'Nhân sự', 2 UNION ALL SELECT 'HCNS', 'Hành chính nhân sự', 3) c WHERE p.code = 'P.HC';
   ALTER TABLE staff ADD COLUMN department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL;
   -- Quản lý trực tiếp của nhân sự (một nhân sự khác)
   ALTER TABLE staff ADD COLUMN manager_id INTEGER REFERENCES staff(id) ON DELETE SET NULL;
   -- Nhân sự đang có: KD → nhóm Sale, AM → nhóm AM (Phòng Kinh doanh); còn lại → nhóm của Phòng Dự án theo vị trí (BA trước, rồi Dev, Tester)
   UPDATE staff SET department_id = (SELECT id FROM departments WHERE code = CASE
     WHEN ',' || positions || ',' LIKE '%,kd,%' THEN 'P.KD.SALE'
     WHEN ',' || positions || ',' LIKE '%,am,%' THEN 'P.KD.AM'
     WHEN ',' || positions || ',' LIKE '%,ba_pm,%' THEN 'P.DA.BA'
     WHEN ',' || positions || ',' LIKE '%,dev,%' THEN 'P.DA.DEV'
     ELSE 'P.DA.TEST' END);
   CREATE TABLE geo_provinces (
     code TEXT PRIMARY KEY,
     name TEXT NOT NULL UNIQUE,
     created_at TEXT NOT NULL DEFAULT ${TS}
   );
   CREATE TABLE geo_wards (
     code TEXT PRIMARY KEY,
     province_code TEXT NOT NULL REFERENCES geo_provinces(code),
     name TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT ${TS},
     UNIQUE (province_code, name)
   );
   CREATE TABLE product_types (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL UNIQUE COLLATE NOCASE,
     -- 1 = loại "Dự án": sản phẩm loại này chính là các dự án của phân hệ Dự án
     is_project INTEGER NOT NULL DEFAULT 0,
     position INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT ${TS}
   );
   INSERT INTO product_types(name, is_project, position) VALUES ('Dự án', 1, 0), ('Sản phẩm có sẵn', 0, 1);
   CREATE TABLE products (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     type_id INTEGER NOT NULL REFERENCES product_types(id),
     name TEXT NOT NULL,
     description TEXT,
     -- Sản phẩm loại Dự án: dự án tương ứng (tạo dự án → tự có trong danh mục; dự án đang có được đưa vào khi khởi động)
     project_id INTEGER UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL DEFAULT ${TS},
     UNIQUE (type_id, name)
   );
   -- Danh sách sản phẩm có sẵn của công ty (mô tả bổ sung sau trong Danh mục sản phẩm)
   INSERT INTO products(type_id, name) SELECT t.id, p.name FROM product_types t, (
     SELECT 'Trợ lý VBĐH (imate)' AS name UNION ALL SELECT 'Trợ lý công chức AI' UNION ALL SELECT 'Trợ lý họp thông minh'
     UNION ALL SELECT 'Phần mềm quản lý chợ' UNION ALL SELECT 'Phần mềm thu phí VSMT'
     UNION ALL SELECT 'Trợ lý tư vấn pháp luật cho người dân & doanh nghiệp') p
   WHERE t.name = 'Sản phẩm có sẵn';
   CREATE TABLE customers (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL UNIQUE COLLATE NOCASE,
     province_code TEXT REFERENCES geo_provinces(code),
     ward_code TEXT REFERENCES geo_wards(code),
     product_type_id INTEGER REFERENCES product_types(id) ON DELETE SET NULL,
     product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
     product_description TEXT,
     source TEXT,
     status TEXT NOT NULL DEFAULT 'Mới',
     created_by INTEGER REFERENCES users(id),
     created_at TEXT NOT NULL DEFAULT ${TS},
     updated_at TEXT NOT NULL DEFAULT ${TS}
   );
   -- Nhân viên phụ trách khách hàng (Kinh doanh/AM trong Danh mục nhân sự); nhân sự gắn với tài khoản đăng nhập để phân quyền xem khách hàng
   ALTER TABLE staff ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
   CREATE UNIQUE INDEX idx_staff_user ON staff(user_id) WHERE user_id IS NOT NULL;
   UPDATE staff SET user_id = (SELECT u.id FROM users u WHERE u.full_name = staff.full_name AND u.is_active = 1
     AND (SELECT COUNT(*) FROM users u2 WHERE u2.full_name = staff.full_name) = 1);
   CREATE TABLE customer_owners (
     customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
     staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
     PRIMARY KEY (customer_id, staff_id)
   );
   CREATE INDEX idx_customer_owners_staff ON customer_owners(staff_id);
   CREATE TABLE customer_contacts (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
     full_name TEXT NOT NULL,
     phone TEXT,
     email TEXT,
     position INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT ${TS}
   );
   CREATE INDEX idx_customer_contacts ON customer_contacts(customer_id);
   CREATE TABLE customer_files (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
     uploader_id INTEGER REFERENCES users(id),
     filename TEXT NOT NULL,
     stored_name TEXT NOT NULL,
     mime TEXT,
     size INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT ${TS}
   );
   CREATE INDEX idx_customer_files ON customer_files(customer_id);
   CREATE TABLE customer_activities (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
     user_id INTEGER REFERENCES users(id),
     kind TEXT NOT NULL DEFAULT 'note',
     activity_date TEXT NOT NULL,
     content TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT ${TS}
   );
   CREATE INDEX idx_customer_activities ON customer_activities(customer_id, activity_date);
   CREATE TABLE journey_steps (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
     position INTEGER NOT NULL,
     depth INTEGER NOT NULL,
     code TEXT,
     title TEXT NOT NULL,
     unit TEXT,
     support TEXT,
     status TEXT NOT NULL DEFAULT 'todo',
     assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     due_date TEXT,
     ping_days INTEGER NOT NULL DEFAULT 0,
     pinged_on TEXT,
     note TEXT,
     updated_at TEXT
   );
   CREATE INDEX idx_journey_customer ON journey_steps(customer_id, position);
   -- Người phối hợp của bước (có thể nhiều người, VD BA + DEV); người thực hiện = journey_steps.assignee_id
   CREATE TABLE journey_step_supporters (
     step_id INTEGER NOT NULL REFERENCES journey_steps(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     PRIMARY KEY (step_id, user_id)
   );
   CREATE INDEX idx_step_supporters_user ON journey_step_supporters(user_id);
   ALTER TABLE customer_files ADD COLUMN step_id INTEGER REFERENCES journey_steps(id) ON DELETE SET NULL;
   -- Trao đổi theo từng bước của hành trình
   ALTER TABLE customer_activities ADD COLUMN step_id INTEGER REFERENCES journey_steps(id) ON DELETE CASCADE;
   -- Tài liệu nội bộ: thư mục nhiều cấp (parent_id NULL = thư mục gốc), tài liệu (folder_id NULL = để ở gốc)
   CREATE TABLE doc_folders (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     parent_id INTEGER REFERENCES doc_folders(id),
     name TEXT NOT NULL,
     created_by INTEGER REFERENCES users(id),
     created_at TEXT NOT NULL DEFAULT ${TS}
   );
   CREATE INDEX idx_doc_folders_parent ON doc_folders(parent_id);
   CREATE TABLE doc_files (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     folder_id INTEGER REFERENCES doc_folders(id),
     filename TEXT NOT NULL,
     stored_name TEXT NOT NULL,
     mime TEXT,
     size INTEGER NOT NULL DEFAULT 0,
     uploader_id INTEGER REFERENCES users(id),
     created_at TEXT NOT NULL DEFAULT ${TS}
   );
   CREATE INDEX idx_doc_files_folder ON doc_files(folder_id);
   CREATE INDEX idx_customer_activities_step ON customer_activities(step_id);
   CREATE TABLE customer_tasks (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     description TEXT,
     assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     due_date TEXT,
     status TEXT NOT NULL DEFAULT 'todo',
     created_by INTEGER REFERENCES users(id),
     created_at TEXT NOT NULL DEFAULT ${TS},
     updated_at TEXT,
     done_at TEXT
   );
   CREATE INDEX idx_customer_tasks ON customer_tasks(customer_id);
   CREATE INDEX idx_customer_tasks_assignee ON customer_tasks(assignee_id, status);
   ALTER TABLE notifications ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE;
   ALTER TABLE notifications ADD COLUMN link TEXT;
   INSERT OR IGNORE INTO customers(name, status) SELECT DISTINCT customer, 'Đã ký hợp đồng' FROM projects WHERE customer IS NOT NULL AND TRIM(customer) <> '';
   ALTER TABLE projects ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
   UPDATE projects SET customer_id = (SELECT c.id FROM customers c WHERE c.name = projects.customer COLLATE NOCASE) WHERE customer IS NOT NULL;
   CREATE INDEX idx_projects_customer ON projects(customer_id);
   UPDATE roles SET permissions = json_insert(permissions, '$[#]', 'customer.view', '$[#]', 'customer_all.view', '$[#]', 'customer.create', '$[#]', 'customer.edit', '$[#]', 'customer.delete',
       '$[#]', 'product.view', '$[#]', 'product.create', '$[#]', 'product.edit', '$[#]', 'product.delete',
       '$[#]', 'geo.view', '$[#]', 'geo.create', '$[#]', 'geo.edit', '$[#]', 'geo.delete',
       '$[#]', 'department.view', '$[#]', 'department.create', '$[#]', 'department.edit', '$[#]', 'department.delete',
       '$[#]', 'document.edit', '$[#]', 'document.delete')
     WHERE permissions LIKE '%"project.create"%' AND permissions NOT LIKE '%"customer.view"%';`,
  // v22: phân hệ Khách hàng (Phòng Kinh doanh, AM dùng chính) quản lý theo khách hàng (cấp 1) và các dự án của khách hàng (cấp 2).
  // Khách hàng: mã khách hàng (tự sinh từ tên khi khởi động), Kinh doanh phụ trách / AM hỗ trợ (customer_owners.role = kd | am).
  // Dự án của khách hàng: mã = mã khách hàng + số, Kinh doanh / AM (sales_project_owners.role), BA/PM, sản phẩm, ghi chú;
  // tình trạng tự động theo phần đang chạy của hành trình (quy trình I–IV) riêng của dự án.
  // Phân hệ Dự án gắn dự án sản xuất với dự án của khách hàng (sales_projects.project_id).
  // Công việc, tài liệu, trao đổi gắn được với một dự án (NULL = chung của khách hàng).
  // Dữ liệu cũ: không tự tạo dự án của khách hàng; hành trình cũ ở cấp khách hàng bỏ đi; người phụ trách cũ chia theo vị trí (Sale → Kinh doanh, AM → AM).
  // Khách hàng, dự án của khách hàng chỉ lưu trữ (không xóa). Ma trận quyền phân hệ Khách hàng theo module (dự án, hành trình, công việc, tài liệu, trao đổi).
  // Thêm nhóm người dùng Kinh doanh, AM, Ban Giám đốc.
  `ALTER TABLE customers ADD COLUMN code TEXT;
   CREATE UNIQUE INDEX idx_customers_code ON customers(code) WHERE code IS NOT NULL;
   ALTER TABLE customer_owners ADD COLUMN role TEXT NOT NULL DEFAULT 'kd';
   UPDATE customer_owners SET role = 'am' WHERE staff_id IN (SELECT id FROM staff
     WHERE ',' || positions || ',' LIKE '%,am,%' AND ',' || positions || ',' NOT LIKE '%,kd,%');
   CREATE TABLE sales_projects (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
     code TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL,
     product_type_id INTEGER REFERENCES product_types(id) ON DELETE SET NULL,
     product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
     product_description TEXT,
     -- BA/PM: họ tên chọn từ Danh mục nhân sự, cách nhau dấu phẩy (như projects.ba)
     ba TEXT,
     note TEXT,
     -- Dự án sản xuất ở phân hệ Dự án — do phía Dự án gắn khi tạo / sửa dự án
     project_id INTEGER UNIQUE REFERENCES projects(id) ON DELETE SET NULL,
     created_by INTEGER REFERENCES users(id),
     created_at TEXT NOT NULL DEFAULT ${TS},
     updated_at TEXT NOT NULL DEFAULT ${TS}
   );
   CREATE INDEX idx_sales_projects_customer ON sales_projects(customer_id);
   CREATE TABLE sales_project_owners (
     sales_project_id INTEGER NOT NULL REFERENCES sales_projects(id) ON DELETE CASCADE,
     staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
     role TEXT NOT NULL DEFAULT 'kd',
     PRIMARY KEY (sales_project_id, staff_id)
   );
   CREATE INDEX idx_sales_project_owners_staff ON sales_project_owners(staff_id);
   DELETE FROM journey_steps;
   ALTER TABLE journey_steps ADD COLUMN sales_project_id INTEGER REFERENCES sales_projects(id) ON DELETE CASCADE;
   CREATE INDEX idx_journey_sales_project ON journey_steps(sales_project_id, position);
   -- Phần III, IV đồng bộ với đầu việc trùng tên của dự án sản xuất: giá trị của đầu việc ở lần đồng bộ trước
   ALTER TABLE journey_steps ADD COLUMN synced_issue_id INTEGER REFERENCES issues(id) ON DELETE SET NULL;
   ALTER TABLE journey_steps ADD COLUMN synced_status TEXT;
   ALTER TABLE journey_steps ADD COLUMN synced_due TEXT;
   ALTER TABLE customer_tasks ADD COLUMN sales_project_id INTEGER REFERENCES sales_projects(id) ON DELETE CASCADE;
   ALTER TABLE customer_files ADD COLUMN sales_project_id INTEGER REFERENCES sales_projects(id) ON DELETE CASCADE;
   ALTER TABLE customer_activities ADD COLUMN sales_project_id INTEGER REFERENCES sales_projects(id) ON DELETE CASCADE;
   CREATE INDEX idx_customer_tasks_sp ON customer_tasks(sales_project_id);
   CREATE INDEX idx_customer_files_sp ON customer_files(sales_project_id);
   CREATE INDEX idx_customer_activities_sp ON customer_activities(sales_project_id);
   -- Lưu trữ thay cho xóa: khách hàng, dự án của khách hàng đã lưu trữ ẩn khỏi danh sách (xem lại / mở lại được)
   ALTER TABLE customers ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE sales_projects ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
   -- Ma trận phân quyền phân hệ Khách hàng theo module: quyền Khách hàng cũ chuyển sang các module tương ứng (Xóa → Lưu trữ / Xóa)
   ${grantWith('customer.view', ['sales_project.view', 'journey.view', 'ctask.view', 'cfile.view', 'cfile.export', 'ctalk.view'])}
   ${grantWith('customer.create', ['sales_project.create'])}
   ${grantWith('customer.edit', ['sales_project.edit', 'journey.create', 'journey.edit', 'journey.delete', 'ctask.create', 'ctask.edit', 'cfile.create', 'ctalk.create'])}
   ${grantWith('customer.delete', ['sales_project.delete', 'ctask.delete', 'cfile.delete', 'ctalk.delete'])}
   ${addRole('Kinh doanh', 'Phòng Kinh doanh (Sale): khách hàng, dự án của khách hàng, hành trình bán hàng; xem tiến độ dự án sản xuất', SALES_ROLE)}
   ${addRole('AM', 'Phòng Kinh doanh (AM): chăm sóc khách hàng, dự án của khách hàng, hành trình bán hàng; xem tiến độ dự án sản xuất', SALES_ROLE)}
   ${addRole('Ban Giám đốc', 'Như Kinh doanh (thêm, sửa trên khách hàng, dự án mình phụ trách) + xem tất cả khách hàng, dự án của khách hàng', BOARD_ROLE)}`,
  // v23: Lịch gọi điện của dự án của khách hàng — đặt lịch ngày gọi, giao người gọi; đến ngày chưa xác nhận thì nhắc và cảnh báo
  `CREATE TABLE customer_calls (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
     sales_project_id INTEGER NOT NULL REFERENCES sales_projects(id) ON DELETE CASCADE,
     call_date TEXT NOT NULL,
     assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     note TEXT,
     -- planned: chờ gọi · done: đã gọi · failed: chưa gọi được
     status TEXT NOT NULL DEFAULT 'planned',
     result TEXT,
     done_at TEXT,
     done_by INTEGER REFERENCES users(id),
     pinged_on TEXT,
     created_by INTEGER REFERENCES users(id),
     created_at TEXT NOT NULL DEFAULT ${TS},
     updated_at TEXT
   );
   CREATE INDEX idx_customer_calls_sp ON customer_calls(sales_project_id, status, call_date);
   -- Dev, Tester của dự án của khách hàng: họ tên chọn từ Danh mục nhân sự, cách nhau dấu phẩy (như BA/PM)
   ALTER TABLE sales_projects ADD COLUMN dev TEXT;
   ALTER TABLE sales_projects ADD COLUMN tester TEXT;`,
  // v24: nhóm "Quản trị hệ thống" thay cho ô tích quản trị — thuộc nhóm này là quản trị hệ thống (toàn quyền).
  // Chỉ tài khoản admin vào nhóm (người dùng chốt 2026-10-21); chưa có tài khoản admin đang hoạt động thì giữ các quản trị hiện tại.
  // Cài mới (chưa có nhóm nào): seedRoles tạo nhóm này cùng các nhóm mặc định.
  `ALTER TABLE roles ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
   INSERT INTO roles(name, description, permissions, is_admin)
     SELECT '${ADMIN_ROLE_NAME}', 'Toàn quyền: quản lý người dùng, phân quyền, mọi phân hệ, mọi dự án, mọi khách hàng', '[]', 1
     WHERE EXISTS (SELECT 1 FROM roles) AND NOT EXISTS (SELECT 1 FROM roles WHERE is_admin = 1);
   UPDATE users SET default_role_id = (SELECT id FROM roles WHERE is_admin = 1)
     WHERE is_admin = 1 AND (username = 'admin' OR NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin' AND is_admin = 1 AND is_active = 1));
   UPDATE users SET is_admin = CASE WHEN default_role_id IS NOT NULL AND default_role_id = (SELECT id FROM roles WHERE is_admin = 1) THEN 1 ELSE 0 END;
   UPDATE project_members SET role_id = (SELECT default_role_id FROM users WHERE users.id = project_members.user_id)
     WHERE user_id IN (SELECT id FROM users WHERE is_admin = 1);`,
  // v25: bỏ dòng "Phạm vi" — thay bằng cột Xem tất cả ở Thông tin khách hàng và Dự án (giữ nguyên quyền đã cấp)
  `UPDATE roles SET permissions = REPLACE(REPLACE(permissions, '"customer_all.view"', '"customer.view_all"'), '"project_all.view"', '"project.view_all"');
   UPDATE user_permissions SET permission = 'customer.view_all' WHERE permission = 'customer_all.view';
   UPDATE user_permissions SET permission = 'project.view_all' WHERE permission = 'project_all.view';`,
  // v26: người = tài khoản. Danh mục nhân sự gộp vào Người dùng (mỗi tài khoản có phòng ban, vị trí, quản lý);
  // Sale / AM / BA/PM / Dev / Tester của khách hàng, dự án của khách hàng, dự án sản xuất lưu theo id tài khoản;
  // thành viên dự án sản xuất = Trưởng dự án + những người được chọn ở các vai trò. Tên không khớp tài khoản nào thì bỏ (ghi ra log).
  migrateV26,
  // v27: danh mục Tình trạng khách hàng (thêm, sửa, ngừng / dùng lại, kéo thả sắp xếp); khách hàng vẫn lưu tên tình trạng
  `CREATE TABLE customer_statuses (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL UNIQUE COLLATE NOCASE,
     position INTEGER NOT NULL DEFAULT 0,
     is_active INTEGER NOT NULL DEFAULT 1,
     created_at TEXT NOT NULL DEFAULT ${TS}
   );
   INSERT INTO customer_statuses(name, position) VALUES ('Mới', 1), ('Đang tư vấn', 2), ('Chờ phản hồi', 3), ('Đang làm sản phẩm', 4), ('Đã ký hợp đồng', 5), ('Đã thanh toán', 6);
   INSERT OR IGNORE INTO customer_statuses(name, position) SELECT DISTINCT TRIM(status), 100 FROM customers WHERE status IS NOT NULL AND TRIM(status) <> '';`,
  // v28: xóa hẳn mọi khách hàng (người dùng yêu cầu 2026-10-21, nhập lại từ CRM cũ): dự án KH, hành trình, công việc, tài liệu,
  // trao đổi, lịch gọi, đầu mối, người phụ trách xóa theo; dự án sản xuất giữ nguyên, chỉ gỡ liên kết khách hàng. Bản sao lưu trước nâng cấp giữ dữ liệu cũ.
  `DELETE FROM customers;`,
  // v29: bỏ Trưởng dự án — thành viên dự án chỉ còn người ở các ô BA/PM, Dev, Tester, AM (cột lead_id giữ lại, không dùng)
  `DELETE FROM project_members;
   INSERT OR IGNORE INTO project_members(project_id, user_id, role_id)
     SELECT pp.project_id, u.id, u.default_role_id FROM project_people pp JOIN users u ON u.id = pp.user_id WHERE u.default_role_id IS NOT NULL;`,
  // v30: thêm ô "Dự án – Xem" (project.view) = xem tab Thông tin dự án. Giữ nguyên năng lực hiện có: nhóm người dùng có ô nào của
  // phân hệ Dự án được cấp project.view; người dùng có quyền riêng thuộc phân hệ Dự án mà nhóm của họ không có project.view cũng được cấp riêng.
  // Thêm phân hệ Dashboard (ô dashboard.view) và các ô Xem, Xem tất cả, Thêm, Tải về của Tài liệu nội bộ (trước đây ai cũng dùng được):
  // cấp cho mọi nhóm để không ai mất quyền đang có (quản trị bớt sau); ô Sửa / Xóa tài liệu giữ nguyên.
  `UPDATE roles SET permissions = json_insert(permissions, '$[#]', 'project.view')
     WHERE NOT EXISTS (SELECT 1 FROM json_each(roles.permissions) WHERE value = 'project.view')
       AND EXISTS (SELECT 1 FROM json_each(roles.permissions) WHERE value IN (${PROJECT_MODULE_CELLS}));
   INSERT OR IGNORE INTO user_permissions(user_id, permission, effect)
     SELECT DISTINCT up.user_id, 'project.view', 'allow' FROM user_permissions up
     WHERE up.effect = 'allow' AND up.permission IN (${PROJECT_MODULE_CELLS})
       AND NOT EXISTS (SELECT 1 FROM users u JOIN roles r ON r.id = u.default_role_id, json_each(r.permissions) j
         WHERE u.id = up.user_id AND j.value = 'project.view');
   ${grantAllRoles(['dashboard.view', 'document.view', 'document.view_all', 'document.create', 'document.export'])}`,
];

function migrateV26() {
  db.exec(`ALTER TABLE users ADD COLUMN department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL;
    ALTER TABLE users ADD COLUMN positions TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE users ADD COLUMN staff_note TEXT;`);
  // Nhân sự "Nguyễn Huỳnh Bảo Hân" (chưa gắn tài khoản) chính là tài khoản "Nguyễn Bảo Hân" — người dùng xác nhận 2026-10-21
  const han = all<{ id: number }>("SELECT id FROM users WHERE full_name = 'Nguyễn Bảo Hân'");
  const hanId = han.length === 1 && !get('SELECT 1 FROM staff WHERE user_id = ?', han[0].id) ? han[0].id : null;
  if (hanId) run("UPDATE staff SET user_id = ? WHERE full_name = 'Nguyễn Huỳnh Bảo Hân' AND user_id IS NULL", hanId);
  db.exec(`UPDATE users SET
      department_id = (SELECT s.department_id FROM staff s WHERE s.user_id = users.id),
      positions = COALESCE((SELECT s.positions FROM staff s WHERE s.user_id = users.id), ''),
      staff_note = (SELECT s.note FROM staff s WHERE s.user_id = users.id),
      manager_id = (SELECT m.user_id FROM staff s JOIN staff m ON m.id = s.manager_id WHERE s.user_id = users.id);`);
  // Họ tên (ghi trong các trường người của dự án) → tài khoản gắn với nhân sự đó
  const byName = new Map(all<{ full_name: string; user_id: number }>('SELECT full_name, user_id FROM staff WHERE user_id IS NOT NULL').map((x) => [x.full_name, x.user_id]));
  if (hanId) { byName.set('Bảo Hân', hanId); byName.set('Nguyễn Huỳnh Bảo Hân', hanId); }
  const dropped: string[] = [];
  const idsOf = (text: string | null, where: string) => String(text ?? '').split(',').map((x) => x.trim()).filter(Boolean).flatMap((n) => {
    const id = byName.get(n);
    if (!id) dropped.push(`${where}: ${n}`);
    return id ? [id] : [];
  });
  db.exec(`CREATE TABLE customer_owners_v26 (
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      PRIMARY KEY (customer_id, user_id, role));
    INSERT OR IGNORE INTO customer_owners_v26(customer_id, user_id, role)
      SELECT co.customer_id, s.user_id, co.role FROM customer_owners co JOIN staff s ON s.id = co.staff_id WHERE s.user_id IS NOT NULL;
    DROP TABLE customer_owners;
    ALTER TABLE customer_owners_v26 RENAME TO customer_owners;
    CREATE INDEX idx_customer_owners_user ON customer_owners(user_id);
    CREATE TABLE sales_project_owners_v26 (
      sales_project_id INTEGER NOT NULL REFERENCES sales_projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      PRIMARY KEY (sales_project_id, user_id, role));
    INSERT OR IGNORE INTO sales_project_owners_v26(sales_project_id, user_id, role)
      SELECT o.sales_project_id, s.user_id, o.role FROM sales_project_owners o JOIN staff s ON s.id = o.staff_id WHERE s.user_id IS NOT NULL;
    DROP TABLE sales_project_owners;
    ALTER TABLE sales_project_owners_v26 RENAME TO sales_project_owners;
    CREATE INDEX idx_sales_project_owners_user ON sales_project_owners(user_id);
    CREATE TABLE project_people (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      PRIMARY KEY (project_id, user_id, role));
    CREATE INDEX idx_project_people_user ON project_people(user_id);
    ALTER TABLE issues ADD COLUMN dev_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    UPDATE issues SET dev_user_id = (SELECT s.user_id FROM staff s WHERE s.id = issues.dev_id) WHERE dev_id IS NOT NULL;
    -- Dev của issue nay là tài khoản: cột cũ (nhân sự) đổi tên để giữ lại, cột mới mang tên dev_id
    ALTER TABLE issues RENAME COLUMN dev_id TO dev_staff_id;
    ALTER TABLE issues RENAME COLUMN dev_user_id TO dev_id;`);
  for (const sp of all<{ id: number; code: string; ba: string | null; dev: string | null; tester: string | null }>('SELECT id, code, ba, dev, tester FROM sales_projects')) {
    for (const role of ['ba', 'dev', 'tester'] as const) {
      for (const id of idsOf(sp[role], `Dự án KH ${sp.code} · ${role}`)) run('INSERT OR IGNORE INTO sales_project_owners(sales_project_id, user_id, role) VALUES (?,?,?)', sp.id, id, role);
    }
  }
  for (const pr of all<{ id: number; key: string; ba: string | null; dev: string | null; tester: string | null; am: string | null }>('SELECT id, key, ba, dev, tester, am FROM projects')) {
    for (const role of ['ba', 'dev', 'tester', 'am'] as const) {
      for (const id of idsOf(pr[role], `Dự án ${pr.key} · ${role}`)) run('INSERT OR IGNORE INTO project_people(project_id, user_id, role) VALUES (?,?,?)', pr.id, id, role);
    }
  }
  // Thành viên dự án = Trưởng dự án + người ở các vai trò (vai trò trong dự án theo nhóm của tài khoản)
  db.exec(`DELETE FROM project_members;
    INSERT OR IGNORE INTO project_members(project_id, user_id, role_id)
      SELECT p.id, u.id, u.default_role_id FROM projects p JOIN users u ON u.id = p.lead_id WHERE u.default_role_id IS NOT NULL;
    INSERT OR IGNORE INTO project_members(project_id, user_id, role_id)
      SELECT pp.project_id, u.id, u.default_role_id FROM project_people pp JOIN users u ON u.id = pp.user_id WHERE u.default_role_id IS NOT NULL;`);
  // Tên cũ (dạng chữ) đã chuyển sang bảng người theo tài khoản — xóa để không hiện nhầm (bản sao lưu trước nâng cấp vẫn giữ)
  db.exec('UPDATE sales_projects SET ba = NULL, dev = NULL, tester = NULL; UPDATE projects SET ba = NULL, dev = NULL, tester = NULL, am = NULL;');
  if (dropped.length) console.log(`[db] v26: ${dropped.length} tên không khớp tài khoản nào, đã bỏ:\n  ${dropped.join('\n  ')}`);
}

export function migrate() {
  const current = Number((db.prepare('PRAGMA user_version').get() as any).user_version);
  // Có dữ liệu cũ cần nâng cấp → sao lưu nguyên trạng trước (tên không bắt đầu bằng "qlda-" nên không bị xoay vòng xóa)
  if (current > 0 && current < migrations.length) {
    const dir = path.join(DATA_DIR, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `truoc-nang-cap-v${current}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    console.log(`[db] đã sao lưu trước khi nâng cấp: ${file}`);
  }
  for (let v = current; v < migrations.length; v++) {
    tx(() => {
      const m = migrations[v];
      if (typeof m === 'function') m(); else db.exec(m);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
    console.log(`[db] migrated to schema v${v + 1}`);
  }
}

export function getSetting(key: string) {
  return get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value;
}
export function setSetting(key: string, value: string) {
  run('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}
