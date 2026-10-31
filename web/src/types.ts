export type IssueType = 'epic' | 'story' | 'task' | 'bug' | 'subtask';
export type SubType = 'story' | 'task' | 'bug';
export type Priority = 'highest' | 'high' | 'medium' | 'low' | 'lowest';
export type Category = 'todo' | 'inprogress' | 'done';

export interface Me {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  is_admin: number;
  must_change_password: number;
  phone?: string | null;
  job_title?: string | null;
    avatar_url?: string | null;
  role_name?: string | null;
  /** Quyền thực tế của tài khoản ở mọi dự án (nhóm người dùng + quyền riêng) */
  permissions?: string[];
  /** Có ô Xem nào của phân hệ Dự án (không có thì ẩn phân hệ Dự án) — giữ cho tương thích, dùng subsystems */
  project_module?: boolean;
  /** Các phân hệ thấy được (dashboard, customer, project, docs, admin): có ô Xem / Xem tất cả của module nào trong phân hệ */
  subsystems?: string[];
  created_at?: string;
  last_login_at?: string | null;
  preferences?: { theme?: 'light' | 'dark' | 'system'; notify?: Partial<Record<'mention' | 'assigned' | 'comment' | 'status', boolean>>;
    /** Hướng dẫn sử dụng: đã xem tour lần đầu; mục "Có gì mới" mới nhất đã đọc */
    tour_done?: boolean; help_seen?: string };
}

export interface UserBasic {
  id: number;
  username: string;
  full_name: string;
    avatar_url?: string | null;
  default_role_id?: number | null;
  default_role_name?: string | null;
  /** Phòng ban, vị trí của tài khoản: tên đầy đủ / tên ngắn (nhóm gần nhất, VD BA), vị trí (kd, am, ba_pm…), mã vị trí chính (KD, AM, BA…) và mọi mã */
  department_id?: number | null;
  department_name?: string | null;
  department_short?: string | null;
  department_order?: number | null;
  positions?: string[];
  department_code?: string | null;
  position_codes?: string[];
}

/** Phòng ban trong sơ đồ tổ chức (parent_id = phòng ban cấp trên) kèm nhân sự */
export interface Department {
  id: number; code: string; name: string; parent_id: number | null; position: number; staff: StaffMember[];
  /** Vị trí được chọn khi thêm nhân sự vào phòng ban (VD Phòng Kinh doanh: kd, am); preset_position = vị trí tích sẵn của nhóm */
  allowed_positions: StaffPosition[]; preset_position: StaffPosition | null;
}

export interface User extends UserBasic {
  email: string | null;
  is_admin: number;
  is_active: number;
  must_change_password: number;
  created_at: string;
  last_login_at: string | null;
  memberships: Membership[];
  /** Số quyền cấp thêm riêng (ngoài nhóm) */
  extra_permissions?: number;
  default_role_id: number | null;
  default_role_name: string | null;
}

export interface Membership {
  project_id: number;
  project_key: string;
  project_name: string;
  role_id: number;
  role_name: string;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  permissions: string[];
  /** Số tài khoản thuộc nhóm */
  usage: number;
  /** Số lượt tham gia dự án đang mang nhóm này (còn > 0 thì chưa xóa được nhóm) */
  project_usage: number;
  /** Nhóm Quản trị hệ thống: thuộc nhóm = quản trị hệ thống, toàn quyền cố định */
  is_admin: number;
}

export type PermAction = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'import' | 'view_all';
export interface FeatureDef {
  key: string; label: string; hint?: string; actions: PermAction[]; actionHints?: Partial<Record<PermAction, string>>;
  /** Tên riêng của hành động ở chức năng này (hiện trong ô), VD Xóa → Lưu trữ */
  actionLabels?: Partial<Record<PermAction, string>>;
}
/** Ma trận phân quyền: Phân hệ → Module (groups, mỗi module thuộc một phân hệ) → Chức năng → Hành động */
export interface PermissionCatalog {
  actions: Record<PermAction, string>;
  subsystems: { key: string; label: string }[];
  groups: { key: string; label: string; subsystem: string; features: FeatureDef[] }[];
}
export interface UserPermView {
  user_id: number; full_name: string; is_admin: boolean; role_name: string | null;
  group: string[]; overrides: Record<string, 'allow' | 'deny'>; effective: string[];
}

export interface Status {
  id: number;
  project_id: number;
  name: string;
  category: Category;
  position: number;
  wip_limit: number | null;
}

export interface Member extends UserBasic {
  email: string | null;
  is_active: number;
  role_id: number;
  role_name: string;
}

export interface Sprint {
  id: number;
  project_id: number;
  name: string;
  goal: string | null;
  state: 'future' | 'active' | 'closed';
  start_date: string | null;
  end_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  committed_points: number | null;
  completed_points: number | null;
  issue_count?: number;
  points?: number;
  done_points?: number;
}

export type StaffPosition = 'bgd' | 'kd' | 'am' | 'ba_pm' | 'dev' | 'tester' | 'hc';
/** Danh mục nhân sự dùng chung; positions: các vị trí cách nhau dấu phẩy */
export interface StaffMember {
  id: number;
  full_name: string;
  positions: string;
  note: string | null;
  /** Tài khoản đăng nhập gắn với nhân sự (để phân quyền khách hàng phụ trách) */
  user_id?: number | null;
  username?: string | null;
  /** Phòng ban (sơ đồ tổ chức) */
  department_id?: number | null;
  department_name?: string | null;
  /** Quản lý trực tiếp (một nhân sự khác) */
  manager_id?: number | null;
  manager_name?: string | null;
}

export interface ProjectSummary {
  id: number;
  key: string;
  name: string;
  description: string | null;
  type: 'scrum' | 'kanban';
  lead_id: number;
  lead_name: string;
  member_count: number;
  open_count: number;
  issue_count: number;
  my_role: string | null;
  is_archived: number;
  /** Trạng thái tự tính theo giai đoạn Epic đang chạy (project_status = trạng thái ghim tay) */
  status_auto: string | null;
  status_reason: string;
  customer_id: number | null;
  customer: string | null;
  priority: string | null;
  project_status: string | null;
  /** Họ tên người theo vai trò (BA/PM, Dev, Tester, AM), cách nhau dấu phẩy */
  ba_names: string | null;
  dev_names: string | null;
  tester_names: string | null;
  am_names: string | null;
}

export interface Project {
  id: number;
  key: string;
  name: string;
  description: string | null;
  type: 'scrum' | 'kanban';
  lead_id: number;
  customer_id: number | null;
  customer: string | null;
  /** Khách hàng của dự án: không có quyền Thông tin khách hàng – Xem thì chỉ có id, tên (contacts rỗng, sales_project null) */
  customer_info: (Pick<Customer, 'id' | 'name'> & Partial<Pick<Customer, 'code' | 'status' | 'province_name' | 'ward_name' | 'source' | 'kd_names' | 'am_names'>> & { contacts: CustomerContact[];
    /** Dự án của khách hàng (phía Kinh doanh) đã chuyển sang sản xuất thành dự án này — cần thêm quyền Dự án của khách hàng – Xem */
    sales_project: { id: number; code: string; name: string; status: string | null; product_name: string | null; kd_names: string | null; am_names: string | null } | null }) | null;
  priority: string | null;
  project_status: string | null;
  /** Người theo vai trò: id tài khoản và họ tên — chính là thành viên dự án */
  ba_ids: number[]; dev_ids: number[]; tester_ids: number[]; am_ids: number[];
  ba_names: string | null; dev_names: string | null; tester_names: string | null; am_names: string | null;
  workflow_strict: number;
  statuses: Status[];
  members: Member[];
  /** Người được gợi ý nhắc (@) trong issue: thành viên + người được xem tất cả dự án */
  mention_members?: UserBasic[];
  /** Luồng chuyển; issue_type = '' là luồng chung */
  transitions: { issue_type: string; from_status_id: number; to_status_id: number }[];
  /** Loại issue → trạng thái được dùng (loại không có trong đây dùng mọi trạng thái) */
  type_statuses: Partial<Record<IssueType, number[]>>;
  active_sprint: Sprint | null;
  active_sprints: Sprint[];
  labels: string[];
  permissions: string[];
}

export interface Issue {
  id: number;
  project_id: number;
  project_key: string;
  project_name: string;
  number: number;
  key: string;
  type: IssueType;
  summary: string;
  description: string | null;
  note: string | null;
  status_id: number;
  status_name: string;
  status_category: Category;
  priority: Priority;
  assignee_id: number | null;
  assignee_name: string | null;
  assignee_avatar_url?: string | null;
  reporter_id: number | null;
  reporter_name: string | null;
  reporter_avatar_url?: string | null;
  parent_id: number | null;
  parent_key: string | null;
  parent_summary: string | null;
  parent_type: IssueType | null;
  sprint_id: number | null;
  sprint_name: string | null;
  sprint_state: string | null;
  story_points: number | null;
  labels: string[];
  start_date: string | null;
  due_date: string | null;
  rank: number;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  child_count: number;
  child_done: number;
  version_id: number | null;
  version_name: string | null;
  version_status: string | null;
  component_id: number | null;
  component_name: string | null;
  component_side: Side | null;
  component_lead_id: number | null;
  component_lead_name: string | null;
  /** BA phụ trách chọn riêng trên issue (null = theo mô-đun) */
  ba_id: number | null;
  /** Dev phụ trách chọn từ danh mục nhân sự có vị trí Dev. */
  dev_id: number | null;
  dev_name: string | null;
  component_default_lead_name: string | null;
  /** Loại của việc con (Sub-task): story / task / bug; null = việc con thường */
  subtype: SubType | null;
  /** Epic: giai đoạn dự án chọn tay (null = tự đoán theo tên, xem phase_guess) */
  phase?: string | null;
  phase_guess?: string | null;
  /** 1 = đánh dấu quan trọng (⚑) */
  flagged?: number;
  original_estimate: number | null;
  remaining_estimate: number | null;
  /** Giờ đã ghi (phút) — chỉ có khi có quyền Ghi thời gian làm việc – Xem */
  time_spent?: number;
}

export interface HistoryItem {
  id: number;
  field: string;
  old_label: string | null;
  new_label: string | null;
  created_at: string;
  user_name: string | null;
  user_avatar_url?: string | null;
}

export interface IssueDetail extends Issue {
  children: (Pick<Issue, 'id' | 'key' | 'type' | 'subtype' | 'summary' | 'priority' | 'story_points' | 'assignee_id' | 'assignee_name' | 'assignee_avatar_url' | 'status_name' | 'status_category'>)[];
  comments: { id: number; author_id: number; author_name: string; author_avatar_url?: string | null; body: string; created_at: string; updated_at: string | null }[];
  attachments: { id: number; filename: string; mime: string; size: number; created_at: string; uploader_id: number; uploader_name: string; uploader_avatar_url?: string | null }[];
  links: { id: number; type: string; direction: 'in' | 'out'; key: string; summary: string; issue_type: IssueType; status_name: string; status_category: Category }[];
  history: HistoryItem[];
  can_edit: boolean;
  permissions: string[];
  /** Trạng thái có thể chuyển tới (đã tính workflow của loại issue), gồm trạng thái hiện tại */
  next_status_ids: number[];
  watchers: { id: number; username: string; full_name: string; avatar_url?: string | null }[];
  watching: boolean;
}

export type Side = 'so' | 'truong' | 'chung';

/** Mô-đun (Component theo Jira) và BA phụ trách. */
export interface Component {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  side: Side | null;
  lead_id: number | null;
  lead_name: string | null;
  position: number;
  issue_count: number;
  done_count: number;
}

export interface Version {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  start_date: string | null;
  release_date: string | null;
  status: 'unreleased' | 'released' | 'archived';
  released_at: string | null;
  issue_count: number;
  done_count: number;
  inprogress_count: number;
  points: number;
  done_points: number;
}

export interface Worklog {
  id: number;
  issue_id: number;
  user_id: number;
  user_name: string;
  user_avatar_url?: string | null;
  work_date: string;
  minutes: number;
  comment: string | null;
  created_at: string;
}

export interface SavedFilter {
  id: number;
  user_id: number;
  owner_name: string;
  project_id: number | null;
  project_key: string | null;
  project_name: string | null;
  name: string;
  query: string;
  shared: number;
}

/** Khách hàng (cơ quan/đơn vị) — cấp 1 của phân hệ Khách hàng; dự án sản xuất gắn với khách hàng qua customer_id */
export interface Customer {
  id: number;
  /** Mã khách hàng — tự sinh từ tên, không sửa */
  code: string | null;
  name: string;
  /** Mã tỉnh/thành phố, phường/xã theo Danh mục địa chính */
  province_code: string | null;
  ward_code: string | null;
  province_name?: string | null;
  ward_name?: string | null;
  source: string | null;
  /** Tình trạng — nhập tay */
  is_archived: number;
  status: string;
  /** Kinh doanh phụ trách, AM hỗ trợ: họ tên, cách nhau dấu phẩy */
  kd_names?: string | null;
  am_names?: string | null;
  /** Tôi là Kinh doanh / AM của khách hàng hoặc của một dự án của khách hàng */
  is_mine?: number;
  created_at: string;
  updated_at: string;
  /** Sản phẩm của các dự án (để tìm kiếm) */
  product_name?: string | null;
  project_count?: number;
  contact_count?: number;
  last_activity_date?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  open_tasks?: number;
  /** Các dự án của khách hàng (cấp 2) */
  sales_projects?: SalesProject[];
}

/** Dự án của khách hàng — do Kinh doanh tạo; mã = mã khách hàng + số; hành trình bán hàng (quy trình I–IV) riêng.
 *  Phía phân hệ Dự án gắn dự án sản xuất với dự án này (project_id). */
export interface SalesProject {
  id: number;
  /** Đã lưu trữ (ẩn khỏi danh sách) */
  is_archived: number;
  customer_id: number;
  customer_name: string;
  code: string;
  name: string;
  product_type_id: number | null;
  product_id: number | null;
  product_description: string | null;
  note: string | null;
  project_id: number | null;
  created_at: string;
  updated_at: string;
  product_type_name: string | null;
  product_name: string | null;
  project_key: string | null;
  project_name: string | null;
  /** Họ tên người theo vai trò (Sale, AM, BA/PM, Dev, Tester), cách nhau dấu phẩy */
  kd_names: string | null;
  am_names: string | null;
  ba_names: string | null;
  dev_names: string | null;
  tester_names: string | null;
  /** Chỉ có khi được xem Công việc của khách hàng */
  open_tasks?: number;
  /** Tình trạng tự động theo phần đang chạy của hành trình; null = chưa áp dụng quy trình */
  status: string | null;
  /** % bước đã hoàn thành (null = chưa áp dụng quy trình), số bước quá hạn */
  journey_pct?: number | null;
  /** Có khi được xem Hành trình (thiếu thì coi như 0) */
  journey_overdue?: number;
  /** Lịch gọi đã đến ngày mà chưa xác nhận: ngày sớm nhất, số ngày quá, số lịch */
  call_alert: CallAlert | null;
}
export interface CallAlert { date: string; late: number; count: number }
/** Lịch gọi điện của dự án của khách hàng: planned = chờ gọi, done = đã gọi, failed = chưa gọi được */
export interface CustomerCall {
  id: number; customer_id: number; sales_project_id: number; call_date: string; assignee_id: number | null; assignee_name: string | null;
  note: string | null; status: 'planned' | 'done' | 'failed'; result: string | null; done_at: string | null; done_by_name: string | null;
  created_by: number | null; created_by_name: string | null; created_at: string;
}
export interface SalesProjectDetail extends SalesProject {
  /** Được thêm / sửa / lưu trữ trên dự án này */
  can_manage: boolean;
  /** Người theo vai trò (id tài khoản) */
  kd_ids: number[];
  am_ids: number[];
  ba_ids: number[];
  dev_ids: number[];
  tester_ids: number[];
  tasks: CustomerTask[];
  files: CustomerFile[];
  /** Trao đổi của dự án (không thuộc bước nào) */
  activities: CustomerActivity[];
  calls: CustomerCall[];
  /** Người tham gia dự án — chỉ giao việc, lịch gọi, bước cho những người này */
  member_ids: number[];
  /** Người được gợi ý nhắc (@) trong trao đổi */
  mention_ids: number[];
  /** Dự án sản xuất đã gắn (phân hệ Dự án) */
  production: {
    id: number; key: string; name: string; project_status: string | null; status_auto: string; is_archived: number;
    total_issues: number; done_issues: number; accessible: boolean;
  } | null;
}

/** Đầu mối liên hệ — đầu mối đầu tiên là đầu mối chính */
export interface CustomerContact {
  id: number;
  full_name: string;
  phone: string | null;
  email: string | null;
}

export interface CustomerFile {
  id: number;
  filename: string;
  mime: string | null;
  size: number;
  created_at: string;
  uploader_id: number | null;
  uploader_name: string | null;
  /** Tài liệu kết quả của một bước trong hành trình */
  step_id?: number | null;
  step_title?: string | null;
  sales_project_id?: number | null;
  sales_project_name?: string | null;
}

export type StepStatus = 'todo' | 'doing' | 'done';
/** Bước trong hành trình khách hàng; depth 0 = phần I–IV, 1 = giai đoạn, 2 = đầu việc, 3 = việc chi tiết */
export interface JourneyStep {
  id: number; position: number; depth: number; code: string | null; title: string; unit: string | null; support: string | null;
  status: StepStatus; assignee_id: number | null; assignee_name: string | null; due_date: string | null; ping_days: number; note: string | null;
  /** Phòng ban của người thực hiện (tự theo tài khoản); unit/support = phòng theo quy trình mẫu khi chưa giao người */
  assignee_dept: string | null;
  supporters: { id: number; full_name: string; dept: string | null }[];
  files: { id: number; filename: string; size: number }[];
  /** Số trao đổi của bước */
  talk_count: number;
  /** Phần III, IV: bước đang theo đầu việc trùng tên của dự án sản xuất */
  synced_issue_id: number | null;
}
/** Chi tiết một bước (như một issue của kinh doanh): đường dẫn phần/giai đoạn, trao đổi, tài liệu */
export interface StepDetail extends Omit<JourneyStep, 'files'> {
  path: { id: number; code: string | null; title: string }[];
  activities: CustomerActivity[];
  files: CustomerFile[];
  ping_options: number[];
  sales_project_id: number | null;
  sales_project_name: string | null;
  member_ids: number[];
  /** Người được gợi ý nhắc (@) trong trao đổi */
  mention_ids: number[];
}
export interface JourneySection { id: number; title: string; total: number; done: number; doing: number; overdue: number }
export interface JourneyData {
  steps: JourneyStep[];
  progress: { sections: JourneySection[]; current: JourneyStep | null; total: number; done: number; pct: number };
  ping_days: number[];
}

/** Công việc kinh doanh của khách hàng */
export interface CustomerTask {
  id: number; customer_id: number; title: string; description: string | null; assignee_id: number | null; assignee_name: string | null;
  due_date: string | null; status: StepStatus; created_by: number | null; created_by_name: string | null; created_at: string; done_at: string | null;
  customer_name?: string;
  sales_project_id: number | null;
  sales_project_name: string | null;
}

/** Danh mục địa chính */
export interface GeoProvince { code: string; name: string; ward_count: number; customer_count: number }
export interface GeoWard { code: string; province_code: string; name: string; customer_count: number }

/** is_project = 1: loại "Dự án" — sản phẩm loại này chính là các dự án (tạo dự án → tự có trong danh mục) */
export interface ProductType { id: number; name: string; is_project: number; position: number; product_count: number }
export interface Product {
  id: number; type_id: number; type_name: string; name: string; description: string | null; customer_count: number;
  is_project: number; project_id: number | null; project_key: string | null; project_archived: number | null;
}

/** Trao đổi: làm việc với khách hàng (gọi điện, gặp mặt, email, ghi chú) hoặc thảo luận nội bộ */
export type ActivityKind = 'call' | 'meeting' | 'email' | 'note' | 'internal';
export interface CustomerActivity {
  id: number;
  customer_id: number;
  user_id: number | null;
  user_name: string | null;
  kind: ActivityKind;
  activity_date: string;
  content: string;
  created_at: string;
  step_id?: number | null;
  step_title?: string | null;
}

export interface CustomerProject {
  id: number; key: string; name: string; type: 'scrum' | 'kanban'; priority: string | null; project_status: string | null; is_archived: number;
  ba: string | null; dev: string | null; tester: string | null; am: string | null; lead_name: string | null;
  total_issues: number; done_issues: number; overdue_issues: number; start_date: string | null; end_date: string | null;
  status_auto: string | null; status_reason: string;
  /** Người xem là thành viên dự án (mới mở được dự án, xem được công việc) */
  accessible: boolean;
}

export interface CustomerDetail extends Customer {
  /** Được thêm / sửa / lưu trữ trên khách hàng này (mình phụ trách, thực hiện hoặc phối hợp; xem tất cả chỉ để xem) */
  can_manage: boolean;
  /** Người tham gia (gộp mọi dự án) — chỉ giao việc chung cho những người này */
  member_ids: number[];
  /** Người được gợi ý nhắc (@) trong trao đổi */
  mention_ids: number[];
  /** Sale, AM (id nhân sự) */
  kd_ids: number[];
  am_ids: number[];
  contacts: CustomerContact[];
  files: CustomerFile[];
  tasks: CustomerTask[];
  /** Các dự án của khách hàng kèm tiến độ hành trình */
  sales_projects: SalesProject[];
  activities: CustomerActivity[];
  projects: CustomerProject[];
  recent: { id: number; field: string; new_label: string; created_at: string; user_name: string; user_avatar_url?: string | null; key: string; summary: string; type: IssueType; project_key: string }[];
}

/** Danh mục Tình trạng khách hàng (thứ tự theo position; ngừng sử dụng thì không chọn được nữa) */
export interface CustomerStatus { id: number; name: string; position: number; is_active: number; customer_count: number }
