import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, refreshAll } from '../api';
import type { Project, Sprint } from '../types';
import { addDays, fmtDate, today } from '../util';
import { Modal, toast, toastError } from './ui';
import { DateInput } from './fields';

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
        {mode === 'start' && <p className="muted">Sprint có {sprint.issue_count ?? 0} issue · {sprint.points ?? 0} điểm ước lượng.</p>}
        <label className="field"><span>Tên sprint *</span><input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <div className="field"><span>Thời lượng</span>
          <div className="row gap-xs">{[1, 2, 3, 4].map((w) => <button type="button" key={w} className="btn btn-sm" onClick={() => setWeeks(w)}>{w} tuần</button>)}</div>
        </div>
        <div className="form-grid">
          <label className="field"><span>Ngày bắt đầu *</span><DateInput value={start} onChange={setStart} required /></label>
          <label className="field"><span>Ngày kết thúc *</span><DateInput value={end} min={start} onChange={setEnd} required /></label>
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

const dayDiff = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400_000);

/** Tăng số cuối cùng trong tên sprint: "QLTB Sprint 02" → "QLTB Sprint 03"; không có số thì thêm vào cuối. */
function bumpName(name: string, step: number, fallback: string) {
  const m = /(\d+)(?!.*\d)/.exec(name);
  if (!m) return `${fallback} ${step + 1}`;
  const n = String(Number(m[1]) + step).padStart(m[1].length, '0');
  return name.slice(0, m.index) + n + name.slice(m.index + m[1].length);
}

interface Draft { name: string; start_date: string; end_date: string }

/**
 * Tạo loạt sprint theo quy luật của các sprint đã có: độ dài sprint và nhịp giữa hai sprint liên tiếp
 * lấy từ 2 sprint gần nhất có ngày; tạo tiếp cho đến ngày kết thúc kế hoạch.
 */
export function SprintSeriesModal({ project, sprints, onClose }: { project: Project; sprints: Sprint[]; onClose: () => void }) {
  const dated = sprints.filter((s) => s.start_date && s.end_date).sort((a, b) => a.start_date!.localeCompare(b.start_date!));
  const last = dated[dated.length - 1];
  const prev = dated[dated.length - 2];
  const length = last ? dayDiff(last.start_date!, last.end_date!) : 13;
  const gapFromPrev = prev && last ? dayDiff(prev.start_date!, last.start_date!) : 0;
  const cadence = gapFromPrev > 0 ? gapFromPrev : length + 1;

  const [until, setUntil] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: planEnd } = useQuery<{ plan_end: string | null }>({
    queryKey: ['plan-end', project.key],
    queryFn: () => api.get(`/projects/${project.key}/sprints/plan-end`),
  });
  const end = until || planEnd?.plan_end || '';

  const generated = useMemo(() => {
    if (!last || !end) return [];
    const out: Draft[] = [];
    for (let k = 1; out.length < 100; k++) {
      const start = addDays(last.start_date!, cadence * k);
      if (start > end) break;
      out.push({ name: bumpName(last.name, k, `${project.key} Sprint`), start_date: start, end_date: addDays(start, length) });
    }
    return out;
  }, [last, end, cadence, length, project.key]);
  // Danh sách hiển thị: bản đã sửa tay (nếu có) hoặc bản tự sinh
  const list = drafts ?? generated;
  const edit = (i: number, patch: Partial<Draft>) => setDrafts(list.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ created: number }>(`/projects/${project.key}/sprints/batch`, { sprints: list });
      toast(`Đã tạo ${r.created} sprint`);
      await refreshAll();
      onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  return (
    <Modal title="Tạo loạt sprint theo quy luật" width={720} onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" disabled={busy || !list.length} onClick={submit}>Tạo {list.length} sprint</button>
    </>}>
      {!last ? (
        <p className="muted">Cần ít nhất một sprint đã đặt ngày bắt đầu và ngày kết thúc để làm mẫu. Hãy tạo 1–2 sprint đầu tiên, bấm <b>Sửa</b> để đặt ngày, rồi quay lại đây.</p>
      ) : (
        <div className="stack">
          <div className="series-rule">
            <div>Mẫu: {prev && <><b>{prev.name}</b> ({fmtDate(prev.start_date)} – {fmtDate(prev.end_date)}) và </>}
              <b>{last.name}</b> ({fmtDate(last.start_date)} – {fmtDate(last.end_date)})</div>
            <div className="muted small">Quy luật: mỗi sprint dài <b>{length + 1} ngày</b>, sprint sau bắt đầu cách sprint trước <b>{cadence} ngày</b>{!prev && ' (chỉ có 1 sprint mẫu nên các sprint nối tiếp nhau)'}.</div>
          </div>
          <label className="field" style={{ maxWidth: 260 }}><span>Tạo đến hết ngày</span>
            <DateInput value={end} min={last.end_date!} onChange={(v) => { setUntil(v); setDrafts(null); }} />
          </label>
          {!until && planEnd?.plan_end && <div className="muted small" style={{ marginTop: -8 }}>Mặc định: hạn hoàn thành muộn nhất trong kế hoạch dự án ({fmtDate(planEnd.plan_end)}).</div>}
          {!list.length ? <p className="muted">Không có sprint nào cần tạo thêm trước ngày này.</p> : (
            <div className="series-table">
              <table className="table">
                <thead><tr><th>#</th><th>Tên sprint</th><th>Bắt đầu</th><th>Kết thúc</th></tr></thead>
                <tbody>
                  {list.map((d, i) => (
                    <tr key={i}>
                      <td className="muted">{i + 1}</td>
                      <td><input value={d.name} onChange={(e) => edit(i, { name: e.target.value })} /></td>
                      <td><DateInput value={d.start_date} onChange={(v) => v && edit(i, { start_date: v })} /></td>
                      <td><DateInput value={d.end_date} min={d.start_date} onChange={(v) => v && edit(i, { end_date: v })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="muted small">Có thể sửa tên, ngày từng sprint trước khi tạo. Sprint được tạo ở trạng thái chưa bắt đầu; bắt đầu từng sprint ở Backlog như bình thường.</div>
        </div>
      )}
    </Modal>
  );
}
