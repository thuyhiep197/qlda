export function issueListAssignee(param: string | null): { control: string; api?: string } {
  const control = param || 'me';
  return control === 'all' ? { control } : { control, api: control };
}

/** null means the current account is still loading. */
export function defaultAssignees(userId?: number): number[] | null {
  return userId == null ? null : [userId];
}

interface Person { id: number; full_name: string }

/**
 * Lựa chọn của ô lọc Người thực hiện: người đang có việc và chính mình.
 * Gồm cả người không (còn) là thành viên dự án, VD người xem được mọi dự án vẫn lọc được việc của mình.
 */
export function planAssignees(assigned: Person[], me?: Person | null): Person[] {
  const byId = new Map<number, Person>();
  for (const p of [...(me ? [me] : []), ...assigned]) if (!byId.has(p.id)) byId.set(p.id, { id: p.id, full_name: p.full_name });
  return [...byId.values()].sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'));
}

/** Lựa chọn của ô Người thực hiện trên từng việc: luôn có người đang được giao, kể cả khi họ không (còn) là thành viên dự án — không thì ô hiện nhầm "Chưa giao" */
export function assigneeChoices<T extends Person>(members: T[], issue: { assignee_id: number | null; assignee_name?: string | null }): (T | Person)[] {
  if (issue.assignee_id == null || members.some((m) => m.id === issue.assignee_id)) return members;
  return [...members, { id: issue.assignee_id, full_name: issue.assignee_name ?? '' }];
}

/** Keeps the filter result but always includes issues created in this session, in the original order. */
export function withCreated<T extends { id: number }>(items: T[], matched: T[], createdIds: Set<number>): T[] {
  const ids = new Set(matched.map((i) => i.id));
  return items.filter((i) => ids.has(i.id) || createdIds.has(i.id));
}
