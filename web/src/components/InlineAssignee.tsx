import { useState } from 'react';
import { api, refreshAll } from '../api';
import { can, useMe, useProject } from '../hooks';
import type { Issue, Project } from '../types';
import { assigneeAccess } from '../assignee-options';
import { Avatar, toast, toastError } from './ui';

export function InlineAssignee({ issue, project: supplied }: { issue: Issue; project?: Project }) {
  const { data: me } = useMe();
  const { data: loaded } = useProject(supplied ? undefined : issue.project_key);
  const project = supplied ?? loaded;
  const [busy, setBusy] = useState(false);
  const member = project?.members.some((m) => m.id === me?.id) ?? false;
  const access = me && project ? assigneeAccess({
    assigneeId: issue.assignee_id, meId: me.id, isMember: member, canAssign: can(project.permissions, 'issue.assign'),
  }) : null;

  const change = async (raw: string) => {
    if (!project || !me || busy) return;
    const assigneeId = raw ? Number(raw) : null;
    if (assigneeId === issue.assignee_id) return;
    setBusy(true);
    try {
      await api.patch(`/issues/${issue.key}`, { assignee_id: assigneeId });
      toast(`${issue.key}: đã đổi người thực hiện`);
      await refreshAll();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  if (!access?.editable) return <div className="row gap-xs"><Avatar name={issue.assignee_name} src={issue.assignee_avatar_url} size={22} /><span className="small">{issue.assignee_name || 'Chưa giao'}</span></div>;
  const choices = access.selfOnly ? project!.members.filter((m) => m.id === me!.id) : project!.members;
  return (
    <div className="inline-assignee row gap-xs" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <Avatar name={issue.assignee_name} src={issue.assignee_avatar_url} size={22} />
      <select value={issue.assignee_id ?? ''} disabled={busy} aria-label={`Người thực hiện ${issue.key}`} onChange={(e) => change(e.target.value)}>
        {access.allowUnassign && <option value="">Chưa giao</option>}
        {access.selfOnly && <option value="" disabled>Chưa giao</option>}
        {choices.map((m) => <option key={m.id} value={m.id}>{m.id === me!.id ? `Tôi · ${m.full_name}` : m.full_name}</option>)}
      </select>
    </div>
  );
}
