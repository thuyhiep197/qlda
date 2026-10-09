import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, qs, refreshAll } from '../api';
import { can, useComponents, useIssueModal, useProject, useProjects, useSprints, useStaff, useVersions } from '../hooks';
import { Plus } from 'lucide-react';
import type { Issue, IssueType, Priority } from '../types';
import { PRIORITIES, PRIORITY_LABELS, projectDevOptions, TYPE_LABELS, typeTip } from '../util';
import { Modal, toast, toastError, TypeIcon } from './ui';

const TYPE_HINTS: Record<IssueType, string> = {
  story: 'Chức năng nhìn từ phía người dùng, thường có tiêu chí chấp nhận',
  task: 'Đầu việc cần làm (kỹ thuật, tài liệu, cấu hình...)',
  bug: 'Lỗi cần sửa',
  epic: 'Giai đoạn lớn chứa nhiều Story/Task/Bug, hiển thị trên Kế hoạch tổng quan',
  subtask: 'Việc nhỏ nằm dưới một Story, Task hoặc Bug',
};
import { LabelsInput, DateInput } from './fields';
import { MentionTextarea } from './MentionTextarea';

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
  const { data: versions } = useVersions(key || undefined);
  const { data: components } = useComponents(key || undefined);
  const { data: staff } = useStaff();

  const [type, setType] = useState<IssueType>(defaults?.type || 'story');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [assignee, setAssignee] = useState('');
  const [parent, setParent] = useState(defaults?.parent_id ? String(defaults.parent_id) : '');
  const [sprint, setSprint] = useState(defaults?.sprint_id ? String(defaults.sprint_id) : '');
  const [points, setPoints] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimate, setEstimate] = useState('');
  const [version, setVersion] = useState('');
  const [component, setComponent] = useState('');
  const [dev, setDev] = useState('');
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
        project_key: key, type, summary, description, note, priority,
        assignee_id: assignee || null,
        parent_id: type === 'epic' ? null : parent || null,
        sprint_id: type === 'epic' || type === 'subtask' ? null : sprint || null,
        status_id: defaults?.status_id,
        story_points: points || null, labels, start_date: startDate || null, due_date: dueDate || null,
        original_estimate: type !== 'epic' && estimate.trim() ? estimate : null, version_id: type !== 'subtask' && version ? Number(version) : null,
        component_id: type !== 'subtask' && type !== 'epic' && component ? Number(component) : null,
        dev_id: type !== 'epic' && dev ? Number(dev) : null,
      });
      toast(`Đã tạo ${issue.key}`);
      await refreshAll();
      if (more) {
        setSummary(''); setDescription(''); setNote(''); setPoints('');
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
          <select value={key} onChange={(e) => { setKey(e.target.value); setParent(''); setSprint(''); setAssignee(''); setVersion(''); setComponent(''); }}>
            {projects?.map((p) => <option key={p.key} value={p.key}>{p.name} ({p.key})</option>)}
          </select>
        </label>
        <div className="field span-2">
          <span>Loại issue *</span>
          <div className="type-picker" role="radiogroup" aria-label="Loại issue">
            {types.map((t) => (
              <button type="button" key={t} role="radio" aria-checked={type === t} data-tip={typeTip(t)}
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
          <span>Mô tả <small className="muted">(hỗ trợ định dạng văn bản)</small></span>
          <MentionTextarea rows={6} value={description} onChange={setDescription} members={project?.members ?? []} />
        </label>
        <label className="field span-2">
          <span>Ghi chú <small className="muted">({note.length}/100 ký tự)</small></span>
          <textarea rows={2} value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} />
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
            <span>Điểm ước lượng</span>
            <input type="number" min={0} step={0.5} value={points} onChange={(e) => setPoints(e.target.value)} />
          </label>
        )}
        {type !== 'epic' && (
          <label className="field" data-tip="1d = 8 giờ, 1w = 5 ngày; số không đơn vị là giờ">
            <span>Ước lượng thời gian</span>
            <input value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="VD: 2d, 4h 30m" />
          </label>
        )}
        {type !== 'subtask' && type !== 'epic' && !!components?.length && (
          <label className="field">
            <span>Mô-đun</span>
            <select value={component} onChange={(e) => setComponent(e.target.value)}>
              <option value="">— Không có —</option>
              {components.map((c) => <option key={c.id} value={c.id}>{c.name}{c.lead_name ? ` (BA: ${c.lead_name})` : ''}</option>)}
            </select>
          </label>
        )}
        {type !== 'epic' && (
          <label className="field">
            <span>Dev phụ trách</span>
            <select value={dev} onChange={(e) => setDev(e.target.value)}>
              <option value="">— Chưa có —</option>
              {projectDevOptions(staff, project?.dev ?? (key ? '' : undefined))
                .map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </label>
        )}
        {type !== 'subtask' && (versions?.some((v) => v.status === 'unreleased') ?? false) && (
          <label className="field">
            <span>Phiên bản phát hành</span>
            <select value={version} onChange={(e) => setVersion(e.target.value)}>
              <option value="">— Không có —</option>
              {versions?.filter((v) => v.status === 'unreleased').map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          <span>Ngày bắt đầu</span>
          <DateInput value={startDate} onChange={setStartDate} />
        </label>
        <label className="field">
          <span>Hạn hoàn thành</span>
          <DateInput value={dueDate} min={startDate || undefined} onChange={setDueDate} />
        </label>
        <div className="field span-2">
          <span>Nhãn</span>
          <LabelsInput value={labels} onChange={setLabels} suggestions={project?.labels} />
        </div>
      </form>
    </Modal>
  );
}

/** Nút "Tạo Epic" trên các trang kế hoạch: mở form tạo issue đặt sẵn loại Epic, tạo xong mở luôn epic đó. */
export function CreateEpicButton({ project, small = true }: { project: { key: string; permissions?: string[] }; small?: boolean }) {
  const [creating, setCreating] = useState(false);
  const { open } = useIssueModal();
  if (!can(project.permissions, 'issue.create')) return null;
  return (
    <>
      <button className={`btn btn-primary ${small ? 'btn-sm' : ''}`} onClick={() => setCreating(true)}
        data-tip="Tạo giai đoạn lớn chứa nhiều Story/Task/Bug">
        <Plus size={14} strokeWidth={2.5} /> Tạo Epic
      </button>
      {creating && <CreateIssueModal projectKey={project.key} defaults={{ type: 'epic' }}
        onClose={() => setCreating(false)} onCreated={(issue) => open(issue.key)} />}
    </>
  );
}
