import { useState, type FormEvent } from 'react';
import { api, refreshAll } from '../api';
import type { Project, Sprint } from '../types';
import { addDays, today } from '../util';
import { Modal, toast, toastError } from './ui';

export function StartSprintModal({ project, sprint, onClose, mode = 'start' }: {
  project: Project; sprint: Sprint; onClose: () => void; mode?: 'start' | 'edit';
}) {
  const [name, setName] = useState(sprint.name);
  const [goal, setGoal] = useState(sprint.goal || '');
  const [start, setStart] = useState(sprint.start_date || today());
  const [end, setEnd] = useState(sprint.end_date || addDays(sprint.start_date || today(), 14));

  const setWeeks = (w: number) => setEnd(addDays(start, w * 7));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const body = { name, goal, start_date: start, end_date: end };
      if (mode === 'start') await api.post(`/projects/${project.key}/sprints/${sprint.id}/start`, body);
      else await api.patch(`/projects/${project.key}/sprints/${sprint.id}`, body);
      toast(mode === 'start' ? `Đã bắt đầu ${name}` : 'Đã lưu sprint');
      await refreshAll();
      onClose();
    } catch (err) { toastError(err); }
  };

  return (
    <Modal title={mode === 'start' ? 'Bắt đầu sprint' : 'Sửa sprint'} onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="sprint-form">{mode === 'start' ? 'Bắt đầu' : 'Lưu'}</button>
    </>}>
      <form id="sprint-form" onSubmit={submit} className="stack">
        {mode === 'start' && <p className="muted">Sprint có {sprint.issue_count ?? 0} issue · {sprint.points ?? 0} story point.</p>}
        <label className="field"><span>Tên sprint *</span><input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <div className="field"><span>Thời lượng</span>
          <div className="row gap-xs">{[1, 2, 3, 4].map((w) => <button type="button" key={w} className="btn btn-sm" onClick={() => setWeeks(w)}>{w} tuần</button>)}</div>
        </div>
        <div className="form-grid">
          <label className="field"><span>Ngày bắt đầu *</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
          <label className="field"><span>Ngày kết thúc *</span><input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required /></label>
        </div>
        <label className="field"><span>Mục tiêu sprint</span><textarea rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} /></label>
      </form>
    </Modal>
  );
}

export function CompleteSprintModal({ project, sprint, futureSprints, doneCount, openCount, onClose }: {
  project: Project; sprint: Sprint; futureSprints: Sprint[]; doneCount: number; openCount: number; onClose: () => void;
}) {
  const [moveTo, setMoveTo] = useState<string>('backlog');
  const submit = async () => {
    try {
      await api.post(`/projects/${project.key}/sprints/${sprint.id}/complete`, { move_to: moveTo });
      toast(`Đã hoàn thành ${sprint.name}`);
      await refreshAll();
      onClose();
    } catch (err) { toastError(err); }
  };
  return (
    <Modal title={`Hoàn thành ${sprint.name}`} onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" onClick={submit}>Hoàn thành sprint</button>
    </>}>
      <div className="stack">
        <p>Sprint có <b>{doneCount}</b> issue đã hoàn thành và <b>{openCount}</b> issue chưa hoàn thành.</p>
        {openCount > 0 && (
          <label className="field"><span>Chuyển các issue chưa hoàn thành sang</span>
            <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="backlog">Backlog</option>
              <option value="new">Sprint mới</option>
              {futureSprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
      </div>
    </Modal>
  );
}
