import { useState } from 'react';
import { api, refreshAll } from '../api';
import { can, useProject } from '../hooks';
import type { Issue, Project } from '../types';
import { assigneeAccess } from '../assignee-options';
import { Avatar, toast, toastError } from './ui';
import { SearchSelect } from './SearchSelect';

export function InlineAssignee({ issue, project: supplied }: { issue: Issue; project?: Project }) {
  const { data: loaded } = useProject(supplied ? undefined : issue.project_key);
  const project = supplied ?? loaded;
  const [busy, setBusy] = useState(false);
  const access = project ? assigneeAccess({ canAssign: can(project.permissions, 'issue.assign') }) : null;

  const change = async (raw: string) => {
    if (!project || busy) return;
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
  return (
    <div className="inline-assignee row gap-xs" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <Avatar name={issue.assignee_name} src={issue.assignee_avatar_url} size={22} />
      <SearchSelect value={issue.assignee_id ?? ''} disabled={busy} aria-label={`Người thực hiện ${issue.key}`} onChange={(e) => change(e.target.value)}>
        {access.allowUnassign && <option value="">Chưa giao</option>}
        {project!.members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
      </SearchSelect>
    </div>
  );
}
