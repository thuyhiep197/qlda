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
  role_name?: string | null;
  /** Quyền thực tế của tài khoản ở mọi dự án (nhóm người dùng + quyền riêng) */
  permissions?: string[];
  created_at?: string;
  last_login_at?: string | null;
  preferences?: { theme?: 'light' | 'dark' | 'system'; notify?: Partial<Record<'mention' | 'assigned' | 'comment' | 'status', boolean>> };
}

export interface UserBasic {
  id: number;
  username: string;
  full_name: string;
  default_role_id?: number | null;
  default_role_name?: string | null;
}

export interface User extends UserBasic {
  email: string | null;
  is_admin: number;
  is_active: number;
  must_change_password: number;
  created_at: string;
  last_login_at: string | null;
  memberships: Membership[];
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
  usage: number;
}

export type PermAction = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'import';
export interface FeatureDef { key: string; label: string; hint?: string; actions: PermAction[]; actionHints?: Partial<Record<PermAction, string>> }
export interface PermissionCatalog { actions: Record<PermAction, string>; groups: { key: string; label: string; features: FeatureDef[] }[] }
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

export type StaffPosition = 'ba_pm' | 'tester' | 'am' | 'dev';
/** Danh mục nhân sự dùng chung; positions: các vị trí cách nhau dấu phẩy */
export interface StaffMember {
  id: number;
  full_name: string;
  positions: string;
  note: string | null;
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
  customer: string | null;
  priority: string | null;
  project_status: string | null;
  ba: string | null;
  dev: string | null;
  tester: string | null;
  am: string | null;
}

export interface Project {
  id: number;
  key: string;
  name: string;
  description: string | null;
  type: 'scrum' | 'kanban';
  lead_id: number;
  lead: { id: number; full_name: string } | null;
  customer: string | null;
  priority: string | null;
  project_status: string | null;
  ba: string | null;
  dev: string | null;
  tester: string | null;
  am: string | null;
  workflow_strict: number;
  statuses: Status[];
  members: Member[];
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
  status_id: number;
  status_name: string;
  status_category: Category;
  priority: Priority;
  assignee_id: number | null;
  assignee_name: string | null;
  reporter_id: number | null;
  reporter_name: string | null;
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
  component_default_lead_name: string | null;
  /** Loại của việc con (Sub-task): story / task / bug; null = việc con thường */
  subtype: SubType | null;
  /** Epic: giai đoạn dự án chọn tay (null = tự đoán theo tên, xem phase_guess) */
  phase?: string | null;
  phase_guess?: string | null;
  original_estimate: number | null;
  remaining_estimate: number | null;
  time_spent: number;
}

export interface HistoryItem {
  id: number;
  field: string;
  old_label: string | null;
  new_label: string | null;
  created_at: string;
  user_name: string | null;
}

export interface IssueDetail extends Issue {
  children: (Pick<Issue, 'id' | 'key' | 'type' | 'subtype' | 'summary' | 'priority' | 'story_points' | 'assignee_id' | 'assignee_name' | 'status_name' | 'status_category'>)[];
  comments: { id: number; author_id: number; author_name: string; body: string; created_at: string; updated_at: string | null }[];
  attachments: { id: number; filename: string; mime: string; size: number; created_at: string; uploader_id: number; uploader_name: string }[];
  links: { id: number; type: string; direction: 'in' | 'out'; key: string; summary: string; issue_type: IssueType; status_name: string; status_category: Category }[];
  history: HistoryItem[];
  can_edit: boolean;
  permissions: string[];
  /** Trạng thái có thể chuyển tới (đã tính workflow của loại issue), gồm trạng thái hiện tại */
  next_status_ids: number[];
  watchers: { id: number; username: string; full_name: string }[];
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
