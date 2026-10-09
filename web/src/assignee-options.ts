export interface AssigneeAccessInput {
  assigneeId: number | null;
  meId: number;
  isMember: boolean;
  canAssign: boolean;
}

export function assigneeAccess({ assigneeId, isMember, canAssign }: AssigneeAccessInput) {
  const selfOnly = !canAssign;
  return {
    editable: canAssign || (isMember && assigneeId == null),
    selfOnly,
    allowUnassign: canAssign,
  };
}
