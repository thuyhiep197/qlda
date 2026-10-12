export function issueListAssignee(param: string | null): { control: string; api?: string } {
  const control = param || 'me';
  return control === 'all' ? { control } : { control, api: control };
}

/** null means the current account is still loading. */
export function defaultAssignees(userId?: number): number[] | null {
  return userId == null ? null : [userId];
}

export function planAssigneeMembers<T extends { id: number }>(members: T[], assignedIds: Set<number>, currentUserId?: number): T[] {
  return members.filter((member) => member.id === currentUserId || assignedIds.has(member.id));
}

/** Keeps the filter result but always includes issues created in this session, in the original order. */
export function withCreated<T extends { id: number }>(items: T[], matched: T[], createdIds: Set<number>): T[] {
  const ids = new Set(matched.map((i) => i.id));
  return items.filter((i) => ids.has(i.id) || createdIds.has(i.id));
}
