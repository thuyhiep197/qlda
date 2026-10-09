import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs, refreshAll } from '../api';
import { can, useComponents, useIssueModal, useMe, useProject, useProjects, useSprints, useUsersBasic, useVersions } from '../hooks';
import type { Issue, IssueDetail as TIssueDetail, IssueType, Priority, SubType, Worklog } from '../types';
import { FIELD_LABELS, fmtDate, fmtDateTime, fmtDuration, fmtSize, isOverdue, PRIORITIES, PRIORITY_LABELS, PROJECT_STATUSES, timeAgo, RELEASES_ENABLED, today, TYPE_LABELS } from '../util';
import { Avatar, Markdown, Modal, PriorityIcon, SideBadge, Spinner, StatusBadge, toast, toastError, TypeIcon } from './ui';
import { InlineText, LabelsInput, DateInput } from './fields';
import { MentionTextarea } from './MentionTextarea';
import { ArrowRightLeft, Copy, Eye, EyeOff, Flag, Link as LinkIcon, Paperclip, Plus, Timer, Trash2, X } from 'lucide-react';

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
  const { data: versions } = useVersions(issue?.project_key);
  const { data: components } = useComponents(issue?.project_key);
  const { data: epics } = useQuery<Issue[]>({
    queryKey: ['issues', 'epics', issue?.project_key],
    queryFn: () => api.get(`/issues${qs({ project: issue!.project_key, type: 'epic', sort: 'key' })}`),
    enabled: !!issue && issue.type !== 'epic' && issue.type !== 'subtask',
  });

  const [editDesc, setEditDesc] = useState(false);
  const [desc, setDesc] = useState('');
  const [tab, setTab] = useState<'comments' | 'worklog' | 'history'>('comments');
  const [logging, setLogging] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [moving, setMoving] = useState(false);
  const [comment, setComment] = useState('');
  const [editingComment, setEditingComment] = useState<{ id: number; body: string } | null>(null);
  const [childText, setChildText] = useState('');
  const [childType, setChildType] = useState<SubType | ''>('');
  const [linkForm, setLinkForm] = useState<{ type: string; key: string } | null>(null);
  const [addingChild, setAddingChild] = useState(false);
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

  // Như Jira: sub-task "Chuyển thành issue" (thuộc Epic của issue cha cũ); issue "Chuyển thành sub-task" (chọn issue cha)
  const changeType = async (type: IssueType) => {
    if (type !== 'subtask') {
      if (issue.type === 'subtask' && !confirm(`Chuyển ${issue.key} thành ${TYPE_LABELS[type]}? Issue sẽ tách khỏi ${issue.parent_key} và thuộc Epic của issue đó (nếu có).`)) return;
      return save({ type });
    }
    const key = prompt('Chuyển thành Sub-task — nhập mã issue cha (Story/Task/Bug), VD: QLTB-12')?.trim().toUpperCase();
    if (!key) return;
    try {
      const parent = await api.get<Issue>(`/issues/${key}`);
      await save({ type, parent_id: parent.id });
    } catch (e) { toastError(e); }
  };

  // Trạng thái hợp lệ theo workflow của loại issue và luồng chuyển (server đã tính sẵn)
  // Epic đã có Story/Task/Bug: trạng thái tự động theo các việc bên trong (server tính)
  const workKids = issue.type === 'epic' ? issue.children.filter((c) => c.type !== 'subtask') : [];
  const epicAuto = workKids.length > 0;
  const allowedStatuses = project?.statuses.filter((s) => issue.next_status_ids.includes(s.id)) ?? [];

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
        parent_id: issue.id,
        ...(issue.type === 'epic' ? { type: childType || 'story' } : { type: 'subtask', subtype: childType || 'task' }),
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

  const toggleFlag = async () => {
    if (issue.flagged) { await save({ flagged: false }); return; }
    const note = window.prompt('Lý do đánh dấu quan trọng (không bắt buộc) — sẽ gửi kèm thông báo cho người thực hiện và người theo dõi:', '');
    if (note === null) return;
    await save({ flagged: true, flag_note: note });
  };

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
          <span className="row gap-xs"><TypeIcon type={issue.type} subtype={issue.subtype} size={14} /> <Link to={`/browse/${issue.key}`}>{issue.key}</Link></span>
        </div>
        <div className="row gap-xs">
          {canEdit && (
            <button className={`icon-btn ${issue.flagged ? 'flag-on' : ''}`} data-tip={issue.flagged ? 'Bỏ đánh dấu quan trọng' : 'Đánh dấu quan trọng (người thực hiện và người theo dõi nhận thông báo)'}
              aria-pressed={!!issue.flagged} onClick={toggleFlag}><Flag size={16} fill={issue.flagged ? 'currentColor' : 'none'} /></button>
          )}
          <button className="icon-btn" data-tip="Sao chép liên kết" onClick={copyLink}><LinkIcon size={16} /></button>
          {can(perms, 'issue.create') && (
            <button className="icon-btn" data-tip="Nhân bản issue" onClick={() => setCloning(true)}><Copy size={16} /></button>
          )}
          {can(perms, 'issue.delete') && issue.type !== 'subtask' && (
            <button className="icon-btn" data-tip="Chuyển sang dự án khác" onClick={() => setMoving(true)}><ArrowRightLeft size={16} /></button>
          )}
          {can(perms, 'issue.delete') && <button className="icon-btn" data-tip="Xóa issue" onClick={deleteIssue}><Trash2 size={16} /></button>}
          {onClose && <button className="icon-btn" data-tip="Đóng" onClick={onClose}><X size={18} /></button>}
        </div>
      </div>
      {!!issue.flagged && <div className="flag-banner"><Flag size={14} fill="currentColor" /> Issue được đánh dấu <b>quan trọng</b>{canEdit && <a className="small" onClick={toggleFlag}>Bỏ đánh dấu</a>}</div>}
      {logging && <LogWorkModal issue={issue} onClose={() => setLogging(false)} />}
      {cloning && <CloneModal issue={issue} onClose={() => setCloning(false)} onDone={(key) => { setCloning(false); open(key); }} />}
      {moving && <MoveProjectModal issue={issue} onClose={() => setMoving(false)} onDone={(key) => { setMoving(false); open(key); }} />}

      <div className="issue-cols">
        <div className="issue-main">
          <InlineText className="issue-title" value={issue.summary} disabled={!canEdit} onSave={(v) => save({ summary: v })} />

          <section>
            <h4>Mô tả</h4>
            {editDesc ? (
              <div className="stack">
                <MentionTextarea rows={10} autoFocus value={desc} onChange={setDesc} members={project?.members ?? []} issueKey={issue.key}
                  placeholder="Định dạng văn bản: **đậm**, - danh sách, `mã`, [liên kết](url)" />
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

          {/* Hàng thêm nhanh: thay cho các mục trống */}
          {(() => {
            const canChild = issue.type !== 'subtask' && can(perms, 'issue.create') && !issue.children.length && !addingChild;
            const canLink = canEdit && !issue.links.length && !linkForm;
            const canFile = can(perms, 'attachment.create') && !issue.attachments.length;
            if (!canChild && !canLink && !canFile) return null;
            return (
              <div className="quick-add">
                {canChild && <button className="btn btn-subtle btn-sm" onClick={() => setAddingChild(true)}><Plus size={14} /> {issue.type === 'epic' ? 'Story/Task/Bug' : 'Việc con'}</button>}
                {canLink && <button className="btn btn-subtle btn-sm" onClick={() => setLinkForm({ type: 'relates', key: '' })}><LinkIcon size={14} /> Liên kết issue</button>}
                {canFile && <button className="btn btn-subtle btn-sm" onClick={() => fileRef.current?.click()}><Paperclip size={14} /> Tệp đính kèm</button>}
              </div>
            );
          })()}

          {issue.type !== 'subtask' && (issue.children.length > 0 || addingChild) && (
            <section>
              <h4>
                {issue.type === 'epic' ? 'Các issue trong epic' : 'Việc con'}
                {issue.child_count > 0 && <span className="muted small"> · {issue.child_done}/{issue.child_count} hoàn thành</span>}
              </h4>
              {issue.child_count > 0 && <div className="progress"><div style={{ width: `${childPct}%` }} /></div>}
              <div className="child-list">
                {issue.children.map((c) => (
                  <div key={c.id} className="child-row" onClick={() => open(c.key)}>
                    <TypeIcon type={c.type} subtype={c.subtype} />
                    <span className="issue-key">{c.key}</span>
                    <span className={`ellipsis grow ${c.status_category === 'done' ? 'done-text' : ''}`}>{c.summary}</span>
                    <PriorityIcon priority={c.priority} />
                    {c.story_points != null && <span className="points" data-tip="Điểm ước lượng">{c.story_points}</span>}
                    <Avatar name={c.assignee_name} src={c.assignee_avatar_url} size={22} />
                    <StatusBadge name={c.status_name} category={c.status_category} />
                  </div>
                ))}
              </div>
              {can(perms, 'issue.create') && (
                <form onSubmit={addChild} className="row gap-xs mt-sm">
                  <select value={childType || (issue.type === 'epic' ? 'story' : 'task')} onChange={(e) => setChildType(e.target.value as SubType)}
                    aria-label="Loại việc" data-tip={issue.type === 'epic' ? 'Loại đầu việc' : 'Loại việc con: vẫn đi theo sprint của việc cha và tính vào tiến độ việc cha'}>
                    {(['story', 'task', 'bug'] as const).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </select>
                  <input className="grow" autoFocus={addingChild && !issue.children.length} value={childText} onChange={(e) => setChildText(e.target.value)}
                    placeholder={issue.type === 'epic' ? '+ Thêm đầu việc vào epic (gõ tiêu đề rồi Enter)' : '+ Thêm việc con (gõ tiêu đề rồi Enter)'} />
                </form>
              )}
            </section>
          )}

          {(issue.links.length > 0 || linkForm) && <section>
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
                }}><X size={14} /></button>}
              </div>
            ))}
          </section>}

          <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
          {issue.attachments.length > 0 && <section>
            <h4 className="row">
              Tệp đính kèm {issue.attachments.length > 0 && <span className="muted small">({issue.attachments.length})</span>}
              {can(perms, 'attachment.create') && <>
                <button className="btn btn-subtle btn-sm" onClick={() => fileRef.current?.click()}>+ Tải lên</button>
              </>}
            </h4>
            <div className="attachments"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (can(perms, 'attachment.create')) upload(e.dataTransfer.files); }}>
              {issue.attachments.map((a) => (
                <div key={a.id} className="attachment">
                  {/^image\/(png|jpe?g|gif|webp|bmp)$/.test(a.mime || '')
                    ? <img src={`/api/issues/attachments/${a.id}?inline=1`} alt={a.filename} />
                    : <div className="file-icon">{a.filename.split('.').pop()?.toUpperCase().slice(0, 4)}</div>}
                  <div className="attachment-info">
                    {can(perms, 'attachment.export') ? <a href={`/api/issues/attachments/${a.id}`} className="ellipsis" title={a.filename}>{a.filename}</a>
                      : <span className="ellipsis" data-tip="Bạn không có quyền tải tệp về máy">{a.filename}</span>}
                    <div className="muted small">{fmtSize(a.size)} · {a.uploader_name}</div>
                  </div>
                  {(a.uploader_id === me?.id || can(perms, 'attachment.delete_any')) &&
                    <button className="icon-btn" title="Xóa" onClick={() => deleteAttachment(a.id, a.filename)}><X size={14} /></button>}
                </div>
              ))}
            </div>
          </section>}

          <section>
            <div className="tabs tabs-sm">
              {can(perms, 'comment.view') && <button className={tab === 'comments' ? 'active' : ''} onClick={() => setTab('comments')}>Bình luận ({issue.comments.length})</button>}
              {can(perms, 'worklog.view') && <button className={tab === 'worklog' ? 'active' : ''} onClick={() => setTab('worklog')}>Nhật ký giờ ({fmtDuration(issue.time_spent) || '0h'})</button>}
              <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Lịch sử thay đổi</button>
            </div>
            {tab === 'worklog' && can(perms, 'worklog.view') && <WorklogList issue={issue} meId={me?.id} isAdmin={can(perms, 'worklog.delete')} onLog={can(perms, 'worklog.create') ? () => setLogging(true) : undefined} />}
            {tab === 'comments' && can(perms, 'comment.view') && (
              <div className="stack">
                {can(perms, 'comment.create') && (
                  <form onSubmit={addComment} className="comment-form">
                    <Avatar name={me?.full_name} src={me?.avatar_url} size={30} />
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
                    <Avatar name={c.author_name} src={c.author_avatar_url} size={30} />
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
                      {(c.author_id === me?.id || can(perms, 'comment.edit') || can(perms, 'comment.delete')) && editingComment?.id !== c.id && (
                        <div className="comment-actions">
                          {(c.author_id === me?.id || can(perms, 'comment.edit')) && <a onClick={() => setEditingComment({ id: c.id, body: c.body })}>Sửa</a>}
                          {(c.author_id === me?.id || can(perms, 'comment.delete')) && <a onClick={() => deleteComment(c.id)}>Xóa</a>}
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
                    <Avatar name={h.user_name} src={h.user_avatar_url} size={22} />
                    <div>
                      <b>{h.user_name || 'Hệ thống'}</b>{' '}
                      {h.field === 'created' ? 'đã tạo issue'
                        : h.field === 'worklog' ? <>đã ghi <b>{h.new_label}</b> làm việc</>
                        : h.field === 'cloned' ? <>đã tạo issue này bằng cách nhân bản <b>{h.new_label}</b></>
                        : h.field === 'moved' ? <>đã chuyển issue từ <b>{h.old_label}</b> sang <b>{h.new_label}</b></>
                        : <>
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
          {epicAuto ? (
            <div className="row gap-xs" data-tip="Tất cả Hoàn thành → Hoàn thành · tất cả Cần làm → Cần làm · còn lại → Đang thực hiện">
              <span className={`status-select status-${issue.status_category} status-static`}>{issue.status_name}</span>
              <span className="muted small">Tự động theo {workKids.length} việc bên trong</span>
            </div>
          ) : (
            <select className={`status-select status-${issue.status_category}`} value={issue.status_id} disabled={!canTransition}
              onChange={(e) => save({ status_id: Number(e.target.value) })}>
              {allowedStatuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

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
            <div className="row gap-xs"><Avatar name={issue.reporter_name} src={issue.reporter_avatar_url} size={22} /> {issue.reporter_name}</div>

            <div className="prop-label">Ghi chú</div>
            <InlineText value={issue.note || ''} maxLength={100} disabled={!canEdit} placeholder="—"
              onSave={(v) => save({ note: v })} />

            {issue.type !== 'epic' && <>
              <div className="prop-label">Loại</div>
              <select value={issue.type} disabled={!canEdit} onChange={(e) => changeType(e.target.value as IssueType)}>
                {(['story', 'task', 'bug', 'subtask'] as IssueType[]).map((t) => <option key={t} value={t}>
                  {t === issue.type ? TYPE_LABELS[t] : issue.type === 'subtask' ? `Chuyển thành ${TYPE_LABELS[t]}` : t === 'subtask' ? 'Chuyển thành Sub-task…' : TYPE_LABELS[t]}
                </option>)}
              </select>
            </>}
            {issue.type === 'subtask' && <>
              <div className="prop-label">Loại việc con</div>
              <div className="row gap-xs">
                <TypeIcon type={issue.type} subtype={issue.subtype} />
                <select value={issue.subtype ?? ''} disabled={!canEdit} onChange={(e) => save({ subtype: e.target.value || null })}>
                  {(['story', 'task', 'bug'] as const).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  <option value="">Chưa phân loại</option>
                </select>
              </div>
            </>}

            {issue.type === 'epic' && <>
              <div className="prop-label" data-tip="Giai đoạn trong vòng đời dự án. Trạng thái dự án tự cập nhật theo giai đoạn của Epic đang chạy. Để Tự động: hệ thống đoán theo tên Epic">Giai đoạn dự án</div>
              <select value={issue.phase ?? ''} disabled={!canEdit} onChange={(e) => save({ phase: e.target.value || null })}>
                <option value="">⚙ Tự động: {issue.phase_guess ?? 'không đoán được từ tên'}</option>
                {PROJECT_STATUSES.filter(([n]) => n !== 'Chưa bắt đầu').map(([n]) => <option key={n} value={n}>{n}</option>)}
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

            {issue.type !== 'epic' && (!!components?.length || issue.component_id) && <>
              <div className="prop-label" data-tip="Phân hệ chức năng (Component)">Mô-đun</div>
              {issue.type === 'subtask' ? <div>{issue.component_name || '—'}</div> : (
                <select value={issue.component_id ?? ''} disabled={!canEdit} onChange={(e) => save({ component_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">— Không có —</option>
                  {components?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <div className="prop-label" data-tip="Đầu mối nghiệp vụ và kiểm thử. Mặc định theo BA phụ trách của mô-đun; chọn người khác nếu issue này do BA khác phụ trách">BA phụ trách</div>
              <div className="row gap-xs">
                <select value={issue.ba_id ?? ''} disabled={!canEdit} onChange={(e) => save({ ba_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">{issue.component_default_lead_name ? `Theo mô-đun (${issue.component_default_lead_name})` : '— Chưa có —'}</option>
                  {[...(project?.members ?? [])].sort((a, b) => Number(!/BA/i.test(a.role_name || '')) - Number(!/BA/i.test(b.role_name || '')))
                    .map((m) => <option key={m.id} value={m.id}>{m.full_name}{m.role_name ? ` (${m.role_name})` : ''}</option>)}
                </select>
                <SideBadge side={issue.component_side} />
              </div>
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
              <div className="prop-label">Điểm ước lượng</div>
              <InlineText type="number" value={issue.story_points != null ? String(issue.story_points) : ''} disabled={!canEdit}
                placeholder="—" onSave={(v) => save({ story_points: v === '' ? null : Number(v) })} />
            </>}

            <div className="prop-label">Nhãn</div>
            {canEdit
              ? <LabelsInput value={issue.labels} onChange={(v) => save({ labels: v })} suggestions={project?.labels} />
              : <div>{issue.labels.map((l) => <span key={l} className="label-chip">{l}</span>)}{!issue.labels.length && <span className="muted">—</span>}</div>}

            {RELEASES_ENABLED && issue.type !== 'subtask' && <>
              <div className="prop-label" data-tip="Đợt bàn giao (Release) chứa issue này">Phiên bản</div>
              <select value={issue.version_id ?? ''} disabled={!canEdit && !can(perms, 'sprint.manage')}
                onChange={(e) => save({ version_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— Không có —</option>
                {versions?.filter((v) => v.status === 'unreleased' || v.id === issue.version_id)
                  .map((v) => <option key={v.id} value={v.id}>{v.name}{v.status === 'released' ? ' (đã phát hành)' : ''}</option>)}
              </select>
            </>}

            <div className="prop-label">Ngày bắt đầu</div>
            <DateInput value={issue.start_date} disabled={!canEdit} onChange={(v) => save({ start_date: v || null })} />

            <div className="prop-label">Hạn hoàn thành</div>
            <div>
              <DateInput value={issue.due_date} disabled={!canEdit} onChange={(v) => save({ due_date: v || null })} />
              {isOverdue(issue) && <div className="overdue small">Quá hạn</div>}
            </div>
          </div>

          {(issue.original_estimate != null || issue.time_spent > 0) ? <TimeTracking issue={issue} canEdit={canEdit} canLog={can(perms, 'worklog.create')} onLog={() => setLogging(true)} save={save} />
            : can(perms, 'worklog.create') && <button className="btn btn-subtle btn-sm side-link" onClick={() => setLogging(true)}><Timer size={14} /> Ghi thời gian làm việc</button>}

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
          {issue.watching ? <><EyeOff size={14} /> Bỏ theo dõi</> : <><Eye size={14} /> Theo dõi</>}
        </button>
      </div>
      <div className="watcher-list">
        {issue.watchers.map((w) => (
          <span key={w.id} className="watcher-chip" title={`@${w.username}`}>
            <Avatar name={w.full_name} src={w.avatar_url} size={20} /> {w.full_name}
            {canManage && w.id !== meId && (
              <button title="Bỏ khỏi danh sách theo dõi" onClick={() => call(() => api.del(`/issues/${issue.key}/watchers/${w.id}`))}><X size={12} /></button>
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

/** Theo dõi thời gian như Jira: ước lượng, đã làm, còn lại + thanh tiến độ. */
function TimeTracking({ issue, canEdit, canLog, onLog, save }: {
  issue: TIssueDetail; canEdit: boolean; canLog: boolean; onLog: () => void; save: (d: Record<string, unknown>) => Promise<void>;
}) {
  const spent = issue.time_spent || 0;
  const remaining = issue.remaining_estimate ?? 0;
  const total = Math.max(spent + remaining, issue.original_estimate ?? 0, 1);
  const over = issue.original_estimate != null && spent + remaining > issue.original_estimate;
  return (
    <div className="timetrack">
      <div className="row gap-xs">
        <span className="prop-label grow" data-tip="Thời gian ước lượng, đã làm và còn lại. 1d = 8 giờ, 1w = 5 ngày">Theo dõi thời gian</span>
        {canLog && <button className="btn btn-sm" onClick={onLog}><Timer size={14} /> Ghi thời gian</button>}
      </div>
      <div className="tt-bar" data-tip={`Đã làm ${fmtDuration(spent) || '0h'} · Còn lại ${fmtDuration(remaining) || '0h'}`}>
        <div className={over ? 'tt-spent over' : 'tt-spent'} style={{ width: `${(spent / total) * 100}%` }} />
      </div>
      <div className="tt-grid">
        <span className="muted small">Ước lượng</span>
        <InlineText value={fmtDuration(issue.original_estimate)} disabled={!canEdit} placeholder="Chưa ước lượng"
          onSave={(v) => save({ original_estimate: v.trim() || null })} />
        <span className="muted small">Đã làm</span>
        <span>{fmtDuration(spent) || '0h'}</span>
        <span className="muted small">Còn lại</span>
        <InlineText value={issue.remaining_estimate != null ? fmtDuration(issue.remaining_estimate) : ''} disabled={!canEdit} placeholder="—"
          onSave={(v) => save({ remaining_estimate: v.trim() || null })} />
      </div>
    </div>
  );
}

function LogWorkModal({ issue, onClose }: { issue: TIssueDetail; onClose: () => void }) {
  const [spent, setSpent] = useState('');
  const [date, setDate] = useState(today());
  const [comment, setComment] = useState('');
  const [mode, setMode] = useState<'auto' | 'set' | 'keep'>('auto');
  const [remaining, setRemaining] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/issues/${issue.key}/worklogs`, { time_spent: spent, work_date: date, comment, remaining: mode, remaining_value: remaining });
      toast('Đã ghi thời gian');
      await refreshAll();
      onClose();
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Ghi thời gian · ${issue.key}`} onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="logwork" disabled={busy || !spent.trim()}>Ghi</button>
    </>}>
      <form id="logwork" className="stack" onSubmit={submit}>
        <div className="form-grid">
          <label className="field"><span>Thời gian đã làm *</span>
            <input autoFocus value={spent} onChange={(e) => setSpent(e.target.value)} placeholder="VD: 2h 30m, 1d, 45m" /></label>
          <label className="field"><span>Ngày làm</span><DateInput value={date} max={today()} onChange={setDate} required /></label>
        </div>
        <div className="muted small">Cách ghi: <b>w</b> = tuần (5 ngày), <b>d</b> = ngày (8 giờ), <b>h</b> = giờ, <b>m</b> = phút. Ghi số không có đơn vị được hiểu là giờ.</div>
        <div className="field"><span>Thời gian còn lại</span>
          <label className="check"><input type="radio" checked={mode === 'auto'} onChange={() => setMode('auto')} /> Tự trừ vào thời gian còn lại
            {issue.remaining_estimate != null && <span className="muted small"> (hiện còn {fmtDuration(issue.remaining_estimate) || '0h'})</span>}</label>
          <label className="check"><input type="radio" checked={mode === 'set'} onChange={() => setMode('set')} /> Đặt lại thành
            <input style={{ width: 120 }} value={remaining} disabled={mode !== 'set'} onChange={(e) => setRemaining(e.target.value)} placeholder="VD: 4h" /></label>
          <label className="check"><input type="radio" checked={mode === 'keep'} onChange={() => setMode('keep')} /> Giữ nguyên</label>
        </div>
        <label className="field"><span>Nội dung công việc</span>
          <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Đã làm gì trong khoảng thời gian này" /></label>
      </form>
    </Modal>
  );
}

function WorklogList({ issue, meId, isAdmin, onLog }: { issue: TIssueDetail; meId?: number; isAdmin: boolean; onLog?: () => void }) {
  const { data: logs } = useQuery<Worklog[]>({ queryKey: ['worklogs', issue.key, issue.time_spent], queryFn: () => api.get(`/issues/${issue.key}/worklogs`) });
  const del = async (w: Worklog) => {
    if (!confirm(`Xóa ${fmtDuration(w.minutes)} ghi ngày ${fmtDate(w.work_date)}?`)) return;
    try { await api.del(`/issues/worklogs/${w.id}`); await refreshAll(); } catch (e) { toastError(e); }
  };
  if (!logs) return <Spinner />;
  return (
    <div className="stack">
      {onLog && <div><button className="btn btn-sm" onClick={onLog}><Timer size={14} /> Ghi thời gian</button></div>}
      {!logs.length && <div className="muted small">Chưa ai ghi thời gian cho issue này.</div>}
      {logs.map((w) => (
        <div key={w.id} className="history-row">
          <Avatar name={w.user_name} src={w.user_avatar_url} size={24} />
          <div className="grow">
            <b>{w.user_name}</b> đã làm <b>{fmtDuration(w.minutes)}</b> <span className="muted small">ngày {fmtDate(w.work_date)}</span>
            {w.comment && <div className="small">{w.comment}</div>}
          </div>
          {(w.user_id === meId || isAdmin) && <button className="icon-btn" data-tip="Xóa lần ghi này" onClick={() => del(w)}><X size={14} /></button>}
        </div>
      ))}
    </div>
  );
}

function CloneModal({ issue, onClose, onDone }: { issue: TIssueDetail; onClose: () => void; onDone: (key: string) => void }) {
  const [summary, setSummary] = useState(`Bản sao - ${issue.summary}`.slice(0, 255));
  const [subtasks, setSubtasks] = useState(issue.type !== 'epic' && issue.child_count > 0);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ key: string }>(`/issues/${issue.key}/clone`, { summary, include_subtasks: subtasks });
      toast(`Đã nhân bản thành ${r.key}`);
      await refreshAll();
      onDone(r.key);
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Nhân bản ${issue.key}`} onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" disabled={busy || !summary.trim()} onClick={submit}>Nhân bản</button>
    </>}>
      <div className="stack">
        <label className="field"><span>Tiêu đề issue mới</span><input value={summary} maxLength={255} onChange={(e) => setSummary(e.target.value)} /></label>
        {issue.type !== 'epic' && issue.child_count > 0 && (
          <label className="check"><input type="checkbox" checked={subtasks} onChange={(e) => setSubtasks(e.target.checked)} /> Nhân bản cả {issue.child_count} sub-task</label>
        )}
        <p className="muted small">Issue mới giữ loại, mô tả, độ ưu tiên, người thực hiện, nhãn, điểm ước lượng, epic, sprint, phiên bản, ngày; bắt đầu ở trạng thái đầu tiên và được liên kết với {issue.key}. Bình luận, tệp đính kèm, nhật ký giờ không được sao chép.</p>
      </div>
    </Modal>
  );
}

function MoveProjectModal({ issue, onClose, onDone }: { issue: TIssueDetail; onClose: () => void; onDone: (key: string) => void }) {
  const { data: projects } = useProjects();
  const others = projects?.filter((p) => p.key !== issue.project_key) ?? [];
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!confirm(`Chuyển ${issue.key}${issue.child_count && issue.type !== 'epic' ? ` và ${issue.child_count} sub-task` : ''} sang dự án ${target}?`)) return;
    setBusy(true);
    try {
      const r = await api.post<{ to: string }>(`/issues/${issue.key}/move-project`, { project_key: target });
      toast(`Đã chuyển thành ${r.to}`);
      await refreshAll();
      onDone(r.to);
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Chuyển ${issue.key} sang dự án khác`} onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" disabled={busy || !target} onClick={submit}>Chuyển</button>
    </>}>
      <div className="stack">
        <label className="field"><span>Dự án đích</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="" disabled>— Chọn dự án —</option>
            {others.map((p) => <option key={p.key} value={p.key}>{p.name} ({p.key})</option>)}
          </select></label>
        <ul className="small muted">
          <li>Issue nhận mã mới của dự án đích; mã cũ <b>{issue.key}</b> vẫn mở được.</li>
          <li>Trạng thái chuyển sang trạng thái cùng nhóm của dự án đích; sprint, phiên bản, epic được bỏ trống.</li>
          {issue.type === 'epic' && <li>Các issue con của epic ở lại dự án hiện tại và được tách khỏi epic.</li>}
          {issue.type !== 'epic' && issue.child_count > 0 && <li>{issue.child_count} sub-task được chuyển theo.</li>}
          <li>Bình luận, tệp đính kèm, nhật ký giờ, lịch sử được giữ nguyên.</li>
        </ul>
      </div>
    </Modal>
  );
}
