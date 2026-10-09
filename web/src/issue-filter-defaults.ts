export function issueListAssignee(param: string | null): { control: string; api?: string } {
  const control = param || 'me';
  return control === 'all' ? { control } : { control, api: control };
}

/** null means the current account is still loading. */
export function defaultAssignees(userId?: number): number[] | null {
  return userId == null ? null : [userId];
}
