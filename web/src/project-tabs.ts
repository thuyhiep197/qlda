import type { Project } from './types';

/** Quyền Xem cần có để thấy từng tab. Thông tin: Dự án – Xem. */
export const TAB_PERM: Record<string, string> = {
  info: 'project.view', plan: 'plan.view', board: 'sprint.view', backlog: 'backlog.view', issues: 'search.view',
  roadmap: 'plan.view', releases: 'backlog.view',
};

/** Mở dự án → tab Thông tin; không có quyền xem thì tab đầu tiên được phép (không tab nào → null). */
const TAB_ORDER = ['info', 'plan', 'roadmap', 'board', 'issues', 'backlog'];
export function firstTab(project: Pick<Project, 'type' | 'permissions'>): string | null {
  return TAB_ORDER.find((t) => (t !== 'backlog' || project.type === 'scrum') && !!project.permissions?.includes(TAB_PERM[t])) ?? null;
}
