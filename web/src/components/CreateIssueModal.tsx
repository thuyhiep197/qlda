import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, qs, refreshAll } from '../api';
import { can, useProject, useProjects, useSprints } from '../hooks';
import type { Issue, IssueType, Priority } from '../types';
import { PRIORITIES, PRIORITY_LABELS, TYPE_LABELS } from '../util';
import { Modal, toast, toastError, TypeIcon } from './ui';

const TYPE_HINTS: Record<IssueType, string> = {
  story: 'Chức năng nhìn từ phía người dùng, thường có tiêu chí chấp nhận',
  task: 'Đầu việc cần làm (kỹ thuật, tài liệu, cấu hình...)',
  bug: 'Lỗi cần sửa',
  epic: 'Nhóm lớn chứa nhiều Story/Task/Bug, hiển thị trên Roadmap',
  subtask: 'Việc nhỏ nằm dưới một Story, Task hoặc Bug',
};
import { LabelsInput } from './fields';

interface Props {
  projectKey?: string;
  defaults?: Partial<{ type: IssueType; parent_id: number; sprint_id: number | null; status_id: number }>;
  onClose: () => void;
  onCreated?: (issue: Issue) => void;
}

export default function CreateIssueModal({ projectKey, defaults, onClose, onCreated }: Props) {
  const { data: projects } = useProjects();
  const [key, setKey] = useState(projectKey || '');
  useEffect(() => {
    if (!key && projects?.length) setKey(projects[0].key);
  }, [projects, key]);
  const { data: project } = useProject(key || undefined);
  const { data: sprints } = useSprints(key || undefined, 'future,active');

  const [type, setType] = useState<IssueType>(defaults?.type || 'story');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [assignee, setAssignee] = useState('');
  const [parent, setParent] = useState(defaults?.parent_id ? String(defaults.parent_id) : '');
  const [sprint, setSprint] = useState(defaults?.sprint_id ? String(defaults.sprint_id) : '');
  const [points, setPoints] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const parentTypes = type === 'subtask' ? 'story,task,bug' : 'epic';
  const { data: parents } = useQuery<Issue[]>({
    queryKey: ['issues', 'parents', key, parentTypes],
    queryFn: () => api.get(`/issues${qs({ project: key, type: parentTypes, statusCategory: type === 'subtask' ? 'todo,inprogress' : undefined, sort: 'key' })}`),
    enabled: !!key && type !== 'epic',
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const issue = await api.post<Issue>('/issues', {
        project_key: key, type, summary, description, priority,
        assignee_id: assignee || null,
        parent_id: type === 'epic' ? null : parent || null,
        sprint_id: type === 'epic' || type === 'subtask' ? null : sprint || null,
        status_id: defaults?.status_id,
        story_points: points || null, labels, start_date: startDate || null, due_date: dueDate || null,
      });
      toast(`Đã tạo ${issue.key}`);
      await refreshAll();
      if (more) {
        setSummary(''); setDescription(''); setPoints('');
      } else {
        onClose();
        onCreated?.(issue);
      }
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  const types: IssueType[] = ['story', 'task', 'bug', 'epic', 'subtask'];
  const canCreate = can(project?.permissions, 'issue.create');

  return (
    <Modal title="Tạo issue" onClose={onClose} width={640} footer={
      <>
        <label className="check"><input type="checkbox" checked={more} onChange={(e) => setMore(e.target.checked)} /> Tạo tiếp issue khác</label>
        <div className="spacer" />
        <button type="button" className="btn" onClick={onClose}>Hủy</button>
        <button type="submit" form="create-issue" className="btn btn-primary" disabled={busy || !summary.trim() || !canCreate}>Tạo</button>
      </>
    }>
      <form id="create-issue" onSubmit={submit} className="form-grid">
        <label className="field span-2">
          <span>Dự án *</span>
          <select value={key} onChange={(e) => { setKey(e.target.value); setParent(''); setSprint(''); setAssignee(''); }}>
            {projects?.map((p) => <option key={p.key} value={p.key}>{p.name} ({p.key})</option>)}
          </select>
        </label>
        <div className="field span-2">
          <span>Loại issue *</span>
          <div className="type-picker" role="radiogroup" aria-label="Loại issue">
            {types.map((t) => (
              <button type="button" key={t} role="radio" aria-checked={type === t} title={TYPE_HINTS[t]}
                className={`type-option ${type === t ? 'active' : ''}`}
                onClick={() => { setType(t); setParent(''); }}>
                <TypeIcon type={t} size={18} /> {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <small className="muted">{TYPE_HINTS[type]}</small>
        </div>
        {project && !canCreate && <div className="form-error span-2">Bạn không có quyền tạo issue trong dự án này.</div>}
        <label className="field span-2">
          <span>Tiêu đề *</span>
          <input autoFocus value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={255} required />
        </label>
        <label className="field span-2">
          <span>Mô tả <small className="muted">(hỗ trợ Markdown)</small></span>
          <textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {type !== 'epic' && (
          <label className="field span-2">
            <span>{type === 'subtask' ? 'Issue cha *' : 'Thuộc Epic'}</span>
            <select value={parent} onChange={(e) => setParent(e.target.value)} required={type === 'subtask'}>
              <option value="">{type === 'subtask' ? '— Chọn issue cha —' : '— Không thuộc epic —'}</option>
              {parents?.map((p) => <option key={p.id} value={p.id}>{p.key} · {p.summary}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          <span>Người thực hiện</span>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">— Chưa giao —</option>
            {project?.members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Độ ưu tiên</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </select>
        </label>
        {project?.type === 'scrum' && type !== 'epic' && type !== 'subtask' && (
          <label className="field">
            <span>Sprint</span>
            <select value={sprint} onChange={(e) => setSprint(e.target.value)}>
              <option value="">Backlog</option>
              {sprints?.map((s) => <option key={s.id} value={s.id}>{s.name}{s.state === 'active' ? ' (đang chạy)' : ''}</option>)}
            </select>
          </label>
        )}
        {type !== 'epic' && (
          <label className="field">
            <span>Story point</span>
            <input type="number" min={0} step={0.5} value={points} onChange={(e) => setPoints(e.target.value)} />
          </label>
        )}
        {type === 'epic' && (
          <label className="field">
            <span>Ngày bắt đầu</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
        )}
        <label className="field">
          <span>Hạn hoàn thành</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <div className="field span-2">
          <span>Nhãn</span>
          <LabelsInput value={labels} onChange={setLabels} suggestions={project?.labels} />
        </div>
      </form>
    </Modal>
  );
}
