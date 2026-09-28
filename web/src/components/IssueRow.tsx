import type { Issue } from '../types';
import { colorOf, fmtDate, isOverdue } from '../util';
import { Avatar, PriorityIcon, StatusBadge, TypeIcon } from './ui';

export function EpicTag({ issue }: { issue: Pick<Issue, 'parent_key' | 'parent_summary' | 'parent_type'> }) {
  if (!issue.parent_key || issue.parent_type !== 'epic') return null;
  const c = colorOf(issue.parent_key);
  return <span className="epic-tag" style={{ color: c, borderColor: c }} title={issue.parent_key}>{issue.parent_summary}</span>;
}

/** Một dòng issue gọn (backlog, danh sách). */
export function IssueLine({ issue, onOpen }: { issue: Issue; onOpen: () => void }) {
  return (
    <div className="issue-line" onClick={onOpen}>
      <TypeIcon type={issue.type} />
      <span className={`issue-key ${issue.status_category === 'done' ? 'done-text' : ''}`}>{issue.key}</span>
      <span className="ellipsis grow">{issue.summary}</span>
      {issue.labels.slice(0, 2).map((l) => <span key={l} className="label-chip sm">{l}</span>)}
      <EpicTag issue={issue} />
      {issue.due_date && <span className={`small ${isOverdue(issue) ? 'overdue' : 'muted'}`}>{fmtDate(issue.due_date)}</span>}
      <StatusBadge name={issue.status_name} category={issue.status_category} />
      <PriorityIcon priority={issue.priority} />
      <span className="points" title="Story point">{issue.story_points ?? '-'}</span>
      <Avatar name={issue.assignee_name} size={24} />
    </div>
  );
}
