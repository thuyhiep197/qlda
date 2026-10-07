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
const migrations: string[] = [
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
];

export function migrate() {
  const current = Number((db.prepare('PRAGMA user_version').get() as any).user_version);
  for (let v = current; v < migrations.length; v++) {
    tx(() => {
      db.exec(migrations[v]);
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
