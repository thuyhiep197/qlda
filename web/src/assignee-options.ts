export interface AssigneeAccessInput {
  assigneeId: number | null;
  meId: number;
  isMember: boolean;
  canAssign: boolean;
  canEdit?: boolean;
}

export function assigneeAccess({ assigneeId, isMember, canAssign, canEdit = false }: AssigneeAccessInput) {
  const selfOnly = !canAssign;
  return {
    editable: canAssign || (isMember && canEdit && assigneeId == null),
    selfOnly,
    allowUnassign: canAssign,
  };
}
