import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs, refreshAll } from '../api';
import { can, useIssueModal, useMe, useProject, useSprints, useUsersBasic } from '../hooks';
import type { Issue, IssueDetail as TIssueDetail, IssueType, Priority } from '../types';
import { FIELD_LABELS, fmtDate, fmtDateTime, fmtSize, isOverdue, PRIORITIES, PRIORITY_LABELS, timeAgo, TYPE_LABELS } from '../util';
import { Avatar, Markdown, PriorityIcon, Spinner, StatusBadge, toast, toastError, TypeIcon } from './ui';
import { InlineText, LabelsInput } from './fields';
import { MentionTextarea } from './MentionTextarea';

export default function IssueDetailModal({ issueKey }: { issueKey: string }) {
  const { close } = useIssueModal();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      // Esc trong ô nhập chỉ hủy thao tác sửa, không đóng cửa sổ
      if (e.key === 'Escape' && !t.closest('input, textarea, select') && !document.querySelector('.modal-backdrop .modal:not(.modal-issue)')) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal modal-issue" role="dialog" aria-modal="true">
        <IssueDetailView issueKey={issueKey} onClose={close} />
      </div>
    </div>
  );
}

const LINK_LABELS: Record<string, [string, string]> = {
  blocks: ['chặn', 'bị chặn bởi'],
  relates: ['liên quan tới', 'liên quan tới'],
  duplicates: ['trùng với', 'bị trùng bởi'],
};

export function IssueDetailView({ issueKey, onClose }: { issueKey: string; onClose?: () => void }) {
  const navigate = useNavigate();
  const { open } = useIssueModal();
  const { data: me } = useMe();
  const { data: issue, isLoading, error } = useQuery<TIssueDetail>({
    queryKey: ['issue', issueKey],
    queryFn: () => api.get(`/issues/${issueKey}`),
  });
  const { data: project } = useProject(issue?.project_key);
  const { data: allUsers } = useUsersBasic();
  const { data: sprints } = useSprints(issue?.project_key, 'future,active');
  const { data: epics } = useQuery<Issue[]>({
    queryKey: ['issues', 'epics', issue?.project_key],
    queryFn: () => api.get(`/issues${qs({ project: issue!.project_key, type: 'epic', sort: 'key' })}`),
    enabled: !!issue && issue.type !== 'epic' && issue.type !== 'subtask',
  });

  const [editDesc, setEditDesc] = useState(false);
  const [desc, setDesc] = useState('');
  const [tab, setTab] = useState<'comments' | 'history'>('comments');
  const [comment, setComment] = useState('');
  const [editingComment, setEditingComment] = useState<{ id: number; body: string } | null>(null);
  const [childText, setChildText] = useState('');
  const [linkForm, setLinkForm] = useState<{ type: string; key: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (isLoading) return <Spinner />;
  if (error || !issue) {
    return <div className="pad">
      <p>{error instanceof Error ? error.message : 'Không tìm thấy issue'}</p>
      {onClose && <button className="btn" onClick={onClose}>Đóng</button>}
    </div>;
  }

  const perms = issue.permissions;
  const canEdit = issue.can_edit;
  const canAssign = can(perms, 'issue.assign');
  const canTransition = can(perms, 'issue.transition');

  const save = async (data: Record<string, unknown>) => {
    try {
      await api.patch(`/issues/${issue.key}`, data);
      await refreshAll();
    } catch (e) { toastError(e); }
  };

  const allowedStatuses = project?.statuses.filter((s) =>
    s.id === issue.status_id || !issue.workflow_strict ||
    issue.transitions.some((t) => t.from_status_id === issue.status_id && t.to_status_id === s.id)) ?? [];

  const addComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    try {
      await api.post(`/issues/${issue.key}/comments`, { body: comment });
      setComment('');
      await refreshAll();
    } catch (err) { toastError(err); }
  };

  const saveComment = async () => {
    if (!editingComment) return;
    try {
      await api.patch(`/issues/comments/${editingComment.id}`, { body: editingComment.body });
      setEditingComment(null);
      await refreshAll();
    } catch (err) { toastError(err); }
  };

  const deleteComment = async (id: number) => {
    if (!confirm('Xóa bình luận này?')) return;
    try { await api.del(`/issues/comments/${id}`); await refreshAll(); } catch (err) { toastError(err); }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('files', f));
    try {
      await api.post(`/issues/${issue.key}/attachments`, fd);
      toast('Đã tải tệp lên');
      await refreshAll();
    } catch (err) { toastError(err); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const deleteAttachment = async (id: number, name: string) => {
    if (!confirm(`Xóa tệp "${name}"?`)) return;
    try { await api.del(`/issues/attachments/${id}`); await refreshAll(); } catch (err) { toastError(err); }
  };

  const addChild = async (e: FormEvent) => {
    e.preventDefault();
    if (!childText.trim()) return;
    try {
      await api.post('/issues', {
        project_key: issue.project_key, summary: childText,
        type: issue.type === 'epic' ? 'story' : 'subtask', parent_id: issue.id,
      });
      setChildText('');
      await refreshAll();
    } catch (err) { toastError(err); }
  };

  const addLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!linkForm?.key.trim()) return;
    try {
      await api.post(`/issues/${issue.key}/links`, { type: linkForm.type, target_key: linkForm.key.trim() });
      setLinkForm(null);
      await refreshAll();
    } catch (err) { toastError(err); }
  };

  const deleteIssue = async () => {
    const extra = issue.type === 'epic' && issue.child_count ? ` Các issue con sẽ được tách khỏi epic.`
      : issue.child_count ? ` ${issue.child_count} sub-task cũng sẽ bị xóa.` : '';
    if (!confirm(`Xóa vĩnh viễn ${issue.key}?${extra}`)) return;
    try {
      await api.del(`/issues/${issue.key}`);
      toast(`Đã xóa ${issue.key}`);
      onClose ? onClose() : navigate(`/p/${issue.project_key}`);
      await refreshAll();
    } catch (err) { toastError(err); }
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(`${location.origin}/browse/${issue.key}`);
    toast('Đã sao chép liên kết');
  };

  const childPct = issue.child_count ? Math.round((issue.child_done / issue.child_count) * 100) : 0;

  return (
    <div className="issue-detail">
      <div className="issue-head">
        <div className="breadcrumb">
          <Link to={`/p/${issue.project_key}`}>{issue.project_name}</Link>
          {issue.parent_key && <>
            <span>/</span>
            <a onClick={() => open(issue.parent_key!)}><TypeIcon type={issue.parent_type!} size={14} /> {issue.parent_key}</a>
          </>}
          <span>/</span>
          <span className="row gap-xs"><TypeIcon type={issue.type} size={14} /> <Link to={`/browse/${issue.key}`}>{issue.key}</Link></span>
        </div>
        <div className="row gap-xs">
          <button className="icon-btn" title="Sao chép liên kết" onClick={copyLink}>🔗</button>
          {can(perms, 'issue.delete') && <button className="icon-btn" title="Xóa issue" onClick={deleteIssue}>🗑️</button>}
          {onClose && <button className="icon-btn" title="Đóng" onClick={onClose}>✕</button>}
        </div>
      </div>

      <div className="issue-cols">
        <div className="issue-main">
          <InlineText className="issue-title" value={issue.summary} disabled={!canEdit} onSave={(v) => save({ summary: v })} />

          <section>
            <h4>Mô tả</h4>
            {editDesc ? (
              <div className="stack">
                <MentionTextarea rows={10} autoFocus value={desc} onChange={setDesc} members={project?.members ?? []} issueKey={issue.key}
                  placeholder="Hỗ trợ Markdown: **đậm**, - danh sách, `code`, [link](url)" />
                <div className="row gap-xs">
                  <button className="btn btn-primary" onClick={async () => { await save({ description: desc }); setEditDesc(false); }}>Lưu</button>
                  <button className="btn" onClick={() => setEditDesc(false)}>Hủy</button>
                </div>
              </div>
            ) : (
              <div className={`desc ${canEdit ? 'editable' : ''}`} onClick={() => { if (canEdit) { setDesc(issue.description || ''); setEditDesc(true); } }}>
                {issue.description ? <Markdown text={issue.description} users={allUsers} /> : <span className="muted">{canEdit ? 'Bấm để thêm mô tả…' : 'Không có mô tả'}</span>}
              </div>
            )}
          </section>

          {issue.type !== 'subtask' && (
            <section>
              <h4>
                {issue.type === 'epic' ? 'Các issue trong epic' : 'Sub-task'}
                {issue.child_count > 0 && <span className="muted small"> · {issue.child_done}/{issue.child_count} hoàn thành</span>}
              </h4>
              {issue.child_count > 0 && <div className="progress"><div style={{ width: `${childPct}%` }} /></div>}
              <div className="child-list">
                {issue.children.map((c) => (
                  <div key={c.id} className="child-row" onClick={() => open(c.key)}>
                    <TypeIcon type={c.type} />
                    <span className="issue-key">{c.key}</span>
                    <span className={`ellipsis grow ${c.status_category === 'done' ? 'done-text' : ''}`}>{c.summary}</span>
                    <PriorityIcon priority={c.priority} />
                    {c.story_points != null && <span className="points">{c.story_points}</span>}
                    <Avatar name={c.assignee_name} size={22} />
                    <StatusBadge name={c.status_name} category={c.status_category} />
                  </div>
                ))}
              </div>
              {can(perms, 'issue.create') && (
                <form onSubmit={addChild} className="row gap-xs mt-sm">
                  <input className="grow" value={childText} onChange={(e) => setChildText(e.target.value)}
                    placeholder={issue.type === 'epic' ? '+ Thêm story vào epic (gõ tiêu đề rồi Enter)' : '+ Thêm sub-task (gõ tiêu đề rồi Enter)'} />
                </form>
              )}
            </section>
          )}

          <section>
            <h4 className="row">
              Liên kết issue
              {canEdit && !linkForm && <button className="btn btn-subtle btn-sm" onClick={() => setLinkForm({ type: 'relates', key: '' })}>+ Thêm</button>}
            </h4>
            {linkForm && (
              <form onSubmit={addLink} className="row gap-xs mb-sm">
                <select value={linkForm.type} onChange={(e) => setLinkForm({ ...linkForm, type: e.target.value })}>
                  <option value="relates">liên quan tới</option>
                  <option value="blocks">chặn</option>
                  <option value="duplicates">trùng với</option>
                </select>
                <input autoFocus placeholder="Mã issue, VD: DEMO-12" value={linkForm.key} onChange={(e) => setLinkForm({ ...linkForm, key: e.target.value })} />
                <button className="btn btn-primary">Liên kết</button>
                <button type="button" className="btn" onClick={() => setLinkForm(null)}>Hủy</button>
              </form>
            )}
            {issue.links.length === 0 && !linkForm && <div className="muted small">Chưa có liên kết</div>}
            {issue.links.map((l) => (
              <div key={`${l.id}-${l.direction}`} className="child-row" onClick={() => open(l.key)}>
                <span className="muted small link-type">{LINK_LABELS[l.type]?.[l.direction === 'out' ? 0 : 1]}</span>
                <TypeIcon type={l.issue_type} />
                <span className="issue-key">{l.key}</span>
                <span className="ellipsis grow">{l.summary}</span>
                <StatusBadge name={l.status_name} category={l.status_category} />
                {canEdit && <button className="icon-btn" title="Gỡ liên kết" onClick={async (e) => {
                  e.stopPropagation();
                  try { await api.del(`/issues/links/${l.id}`); await refreshAll(); } catch (err) { toastError(err); }
                }}>✕</button>}
              </div>
            ))}
          </section>

          <section>
            <h4 className="row">
              Tệp đính kèm {issue.attachments.length > 0 && <span className="muted small">({issue.attachments.length})</span>}
              {can(perms, 'attachment.create') && <>
                <button className="btn btn-subtle btn-sm" onClick={() => fileRef.current?.click()}>+ Tải lên</button>
                <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
              </>}
            </h4>
            <div className="attachments"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (can(perms, 'attachment.create')) upload(e.dataTransfer.files); }}>
              {issue.attachments.length === 0 && <div className="muted small">Kéo thả tệp vào đây để đính kèm</div>}
              {issue.attachments.map((a) => (
                <div key={a.id} className="attachment">
                  {/^image\/(png|jpe?g|gif|webp|bmp)$/.test(a.mime || '')
                    ? <img src={`/api/issues/attachments/${a.id}?inline=1`} alt={a.filename} />
                    : <div className="file-icon">{a.filename.split('.').pop()?.toUpperCase().slice(0, 4)}</div>}
                  <div className="attachment-info">
                    <a href={`/api/issues/attachments/${a.id}`} className="ellipsis" title={a.filename}>{a.filename}</a>
                    <div className="muted small">{fmtSize(a.size)} · {a.uploader_name}</div>
                  </div>
                  {(a.uploader_id === me?.id || can(perms, 'attachment.delete_any')) &&
                    <button className="icon-btn" title="Xóa" onClick={() => deleteAttachment(a.id, a.filename)}>✕</button>}
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="tabs tabs-sm">
              <button className={tab === 'comments' ? 'active' : ''} onClick={() => setTab('comments')}>Bình luận ({issue.comments.length})</button>
              <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Lịch sử thay đổi</button>
            </div>
            {tab === 'comments' && (
              <div className="stack">
                {can(perms, 'comment.create') && (
                  <form onSubmit={addComment} className="comment-form">
                    <Avatar name={me?.full_name} size={30} />
                    <div className="grow stack">
                      <MentionTextarea rows={comment ? 4 : 2} value={comment} onChange={setComment} members={project?.members ?? []} issueKey={issue.key}
                        placeholder="Viết bình luận… (Ctrl+Enter để gửi)"
                        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addComment(e as any); }} />
                      {comment && <div><button className="btn btn-primary">Gửi</button></div>}
                    </div>
                  </form>
                )}
                {[...issue.comments].reverse().map((c) => (
                  <div key={c.id} className="comment">
                    <Avatar name={c.author_name} size={30} />
                    <div className="grow">
                      <div className="comment-head">
                        <b>{c.author_name}</b>
                        <span className="muted small" title={fmtDateTime(c.created_at)}>{timeAgo(c.created_at)}{c.updated_at ? ' (đã sửa)' : ''}</span>
                      </div>
                      {editingComment?.id === c.id ? (
                        <div className="stack">
                          <MentionTextarea rows={4} value={editingComment.body} onChange={(v) => setEditingComment({ id: c.id, body: v })}
                            members={project?.members ?? []} issueKey={issue.key} />
                          <div className="row gap-xs">
                            <button className="btn btn-primary btn-sm" onClick={saveComment}>Lưu</button>
                            <button className="btn btn-sm" onClick={() => setEditingComment(null)}>Hủy</button>
                          </div>
                        </div>
                      ) : <Markdown text={c.body} users={allUsers} />}
                      {(c.author_id === me?.id || can(perms, 'comment.delete_any')) && editingComment?.id !== c.id && (
                        <div className="comment-actions">
                          <a onClick={() => setEditingComment({ id: c.id, body: c.body })}>Sửa</a>
                          <a onClick={() => deleteComment(c.id)}>Xóa</a>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === 'history' && (
              <div className="history">
                {issue.history.map((h) => (
                  <div key={h.id} className="history-row">
                    <Avatar name={h.user_name} size={22} />
                    <div>
                      <b>{h.user_name || 'Hệ thống'}</b>{' '}
                      {h.field === 'created' ? 'đã tạo issue' : <>
                        đã thay đổi <b>{FIELD_LABELS[h.field] || h.field}</b>
                        {h.field !== 'description' && <>: <span className="old">{fmtHist(h.field, h.old_label)}</span> → <span>{fmtHist(h.field, h.new_label)}</span></>}
                      </>}
                      <div className="muted small">{fmtDateTime(h.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="issue-side">
          <select className={`status-select status-${issue.status_category}`} value={issue.status_id} disabled={!canTransition}
            onChange={(e) => save({ status_id: Number(e.target.value) })}>
            {allowedStatuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <div className="props">
            <div className="prop-label">Người thực hiện</div>
            <div>
              <select value={issue.assignee_id ?? ''} disabled={!canAssign && !canEdit}
                onChange={(e) => save({ assignee_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— Chưa giao —</option>
                {project?.members.filter((m) => canAssign || m.id === me?.id || m.id === issue.assignee_id)
                  .map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
              {canEdit && issue.assignee_id !== me?.id && project?.members.some((m) => m.id === me?.id) &&
                <a className="small" onClick={() => save({ assignee_id: me!.id })}>Giao cho tôi</a>}
            </div>

            <div className="prop-label">Người tạo</div>
            <div className="row gap-xs"><Avatar name={issue.reporter_name} size={22} /> {issue.reporter_name}</div>

            {['story', 'task', 'bug'].includes(issue.type) && <>
              <div className="prop-label">Loại</div>
              <select value={issue.type} disabled={!canEdit} onChange={(e) => save({ type: e.target.value as IssueType })}>
                {(['story', 'task', 'bug'] as IssueType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </>}

            <div className="prop-label">Độ ưu tiên</div>
            <div className="row gap-xs">
              <PriorityIcon priority={issue.priority} />
              <select value={issue.priority} disabled={!canEdit} onChange={(e) => save({ priority: e.target.value as Priority })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>

            {issue.type !== 'epic' && issue.type !== 'subtask' && <>
              <div className="prop-label">Epic</div>
              <select value={issue.parent_id ?? ''} disabled={!canEdit} onChange={(e) => save({ parent_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— Không có —</option>
                {epics?.map((ep) => <option key={ep.id} value={ep.id}>{ep.key} · {ep.summary}</option>)}
              </select>
            </>}

            {project?.type === 'scrum' && issue.type !== 'epic' && <>
              <div className="prop-label">Sprint</div>
              {issue.type === 'subtask' ? <div>{issue.sprint_name || 'Backlog'}</div> : (
                <select value={issue.sprint_id ?? ''} disabled={!canEdit && !can(perms, 'sprint.manage')}
                  onChange={(e) => save({ sprint_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Backlog</option>
                  {issue.sprint_id && issue.sprint_state === 'closed' && <option value={issue.sprint_id}>{issue.sprint_name} (đã đóng)</option>}
                  {sprints?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </>}

            {issue.type !== 'epic' && <>
              <div className="prop-label">Story point</div>
              <InlineText type="number" value={issue.story_points != null ? String(issue.story_points) : ''} disabled={!canEdit}
                placeholder="—" onSave={(v) => save({ story_points: v === '' ? null : Number(v) })} />
            </>}

            <div className="prop-label">Nhãn</div>
            {canEdit
              ? <LabelsInput value={issue.labels} onChange={(v) => save({ labels: v })} suggestions={project?.labels} />
              : <div>{issue.labels.map((l) => <span key={l} className="label-chip">{l}</span>)}{!issue.labels.length && <span className="muted">—</span>}</div>}

            {issue.type === 'epic' && <>
              <div className="prop-label">Ngày bắt đầu</div>
              <input type="date" value={issue.start_date || ''} disabled={!canEdit} onChange={(e) => save({ start_date: e.target.value || null })} />
            </>}

            <div className="prop-label">Hạn hoàn thành</div>
            <div>
              <input type="date" value={issue.due_date || ''} disabled={!canEdit} onChange={(e) => save({ due_date: e.target.value || null })} />
              {isOverdue(issue) && <div className="overdue small">Quá hạn</div>}
            </div>
          </div>

          <Watchers issue={issue} members={project?.members ?? []} canManage={canEdit} meId={me?.id} />

          <div className="meta muted small">
            <div>Tạo: {fmtDateTime(issue.created_at)}</div>
            <div>Cập nhật: {fmtDateTime(issue.updated_at)}</div>
            {issue.resolved_at && <div>Hoàn thành: {fmtDateTime(issue.resolved_at)}</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function fmtHist(field: string, v: string | null) {
  if (v == null || v === '') return <i className="muted">trống</i>;
  if (field === 'priority') return PRIORITY_LABELS[v as Priority] || v;
  if (field === 'type') return TYPE_LABELS[v as IssueType] || v;
  if (field === 'due_date' || field === 'start_date') return fmtDate(v);
  return v;
}

/** Người theo dõi (Watcher) như Jira: nhận thông báo khi issue có bình luận mới hoặc đổi trạng thái. */
function Watchers({ issue, members, canManage, meId }: {
  issue: TIssueDetail; members: { id: number; full_name: string }[]; canManage: boolean; meId?: number;
}) {
  const [adding, setAdding] = useState(false);
  const call = async (fn: () => Promise<unknown>) => {
    try { await fn(); await refreshAll(); } catch (e) { toastError(e); }
  };
  const candidates = members.filter((m) => !issue.watchers.some((w) => w.id === m.id));
  return (
    <div className="watchers">
      <div className="row gap-xs">
        <span className="prop-label grow">Người theo dõi ({issue.watchers.length})</span>
        <button className="btn btn-sm" onClick={() => call(() => (issue.watching
          ? api.del(`/issues/${issue.key}/watchers/${meId}`)
          : api.post(`/issues/${issue.key}/watchers`, {})))}>
          {issue.watching ? '🔕 Bỏ theo dõi' : '👁 Theo dõi'}
        </button>
      </div>
      <div className="watcher-list">
        {issue.watchers.map((w) => (
          <span key={w.id} className="watcher-chip" title={`@${w.username}`}>
            <Avatar name={w.full_name} size={20} /> {w.full_name}
            {canManage && w.id !== meId && (
              <button title="Bỏ khỏi danh sách theo dõi" onClick={() => call(() => api.del(`/issues/${issue.key}/watchers/${w.id}`))}>×</button>
            )}
          </span>
        ))}
        {!issue.watchers.length && <span className="muted small">Chưa có ai theo dõi</span>}
      </div>
      {canManage && candidates.length > 0 && (adding ? (
        <select autoFocus defaultValue="" onBlur={() => setAdding(false)}
          onChange={(e) => { if (e.target.value) call(() => api.post(`/issues/${issue.key}/watchers`, { user_id: Number(e.target.value) })); setAdding(false); }}>
          <option value="" disabled>— Chọn thành viên —</option>
          {candidates.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
      ) : <a className="small" onClick={() => setAdding(true)}>+ Thêm người theo dõi</a>)}
    </div>
  );
}
