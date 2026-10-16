import type { IssueType } from './types';

/** Các loại có thể chọn khi đổi loại issue (khớp với server): Sub-task và Epic không đổi trực tiếp cho nhau. */
export function typeOptions(current: IssueType): IssueType[] {
  if (current === 'epic') return ['epic', 'story', 'task', 'bug'];
  if (current === 'subtask') return ['story', 'task', 'bug', 'subtask'];
  return ['story', 'task', 'bug', 'subtask', 'epic'];
}
