import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { api, queryClient } from '../../api';
import { useMe, useUsersBasic } from '../../hooks';
import type { CustomerDetail, CustomerTask, StepStatus } from '../../types';
import { colorOf, fmtDate, lozengeOf, PROJECT_STATUSES, today } from '../../util';
import { Empty, toast, toastError } from '../../components/ui';
import { STEP_STATUS } from './Journey';

const TASK_STATUS: Record<StepStatus, string> = { todo: 'Cần làm', doing: 'Đang làm', done: 'Hoàn thành' };

/** Module Công việc: tab Kinh doanh (mặc định) và tab Tiến độ dự án (mở Kế hoạch chi tiết của dự án) */
export default function Tasks({ c, canEdit, canDeleteAll }: { c: CustomerDetail; canEdit: boolean; canDeleteAll: boolean }) {
  const [sub, setSub] = useState<'sales' | 'projects'>('sales');
  return (
    <div className="stack">
      <div className="seg" role="tablist" aria-label="Loại công việc">
        <button role="tab" aria-selected={sub === 'sales'} className={sub === 'sales' ? 'on' : ''} onClick={() => setSub('sales')}>
          Kinh doanh ({c.tasks.filter((t) => t.status !== 'done').length})</button>
        <button role="tab" aria-selected={sub === 'projects'} className={sub === 'projects' ? 'on' : ''} onClick={() => setSub('projects')}>
          Tiến độ dự án ({c.projects.filter((p) => !p.is_archived).length})</button>
      </div>
      {sub === 'sales' ? <SalesTasks c={c} canEdit={canEdit} canDeleteAll={canDeleteAll} /> : <ProjectProgress c={c} />}
    </div>
  );
}

function SalesTasks({ c, canEdit, canDeleteAll }: { c: CustomerDetail; canEdit: boolean; canDeleteAll: boolean }) {
  const { data: me } = useMe();
  const { data: users } = useUsersBasic();
  const [show, setShow] = useState<'open' | 'all'>('open');
  const [mine, setMine] = useState(false);
  const [d, setD] = useState({ title: '', assignee_id: '', due_date: '' });
  const now = today();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['customer', String(c.id)] });
  const list = c.tasks.filter((t) => (show === 'all' || t.status !== 'done') && (!mine || t.assignee_id === me?.id));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/customers/${c.id}/tasks`, { ...d, assignee_id: d.assignee_id || null, due_date: d.due_date || null });
      setD({ title: '', assignee_id: d.assignee_id, due_date: '' });
      await refresh();
    } catch (err) { toastError(err); }
  };
  const update = async (t: CustomerTask, body: object) => {
    try { await api.patch(`/customers/${c.id}/tasks/${t.id}`, body); await refresh(); } catch (e) { toastError(e); }
  };
  const remove = async (t: CustomerTask) => {
    if (!confirm(`Xóa công việc "${t.title}"?`)) return;
    try { await api.del(`/customers/${c.id}/tasks/${t.id}`); toast('Đã xóa'); await refresh(); } catch (e) { toastError(e); }
  };

  return (
    <div className="card">
      {canEdit && (
        <form className="task-add" onSubmit={add}>
          <input required placeholder="Việc cần làm với khách hàng, VD: Gửi báo giá giải pháp V.2" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} aria-label="Tên công việc" />
          <select value={d.assignee_id} onChange={(e) => setD({ ...d, assignee_id: e.target.value })} aria-label="Người thực hiện">
            <option value="">Người thực hiện…</option>
            {users?.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <input type="date" value={d.due_date} onChange={(e) => setD({ ...d, due_date: e.target.value })} aria-label="Hạn hoàn thành" />
          <button className="btn btn-primary">Thêm</button>
        </form>
      )}
      <div className="filter-bar">
        <div className="seg" role="group" aria-label="Lọc công việc">
          <button className={show === 'open' ? 'on' : ''} onClick={() => setShow('open')}>Chưa xong</button>
          <button className={show === 'all' ? 'on' : ''} onClick={() => setShow('all')}>Tất cả ({c.tasks.length})</button>
        </div>
        <label className="check small"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Việc của tôi</label>
      </div>
      {!list.length ? <Empty title={c.tasks.length ? 'Không có công việc phù hợp' : 'Chưa có công việc kinh doanh nào'} /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th style={{ width: 28 }} /><th>Công việc</th><th>Người thực hiện</th><th>Hạn</th><th>Trạng thái</th><th>Người tạo</th>{canEdit && <th />}</tr></thead>
          <tbody>{list.map((t) => {
            const late = t.status !== 'done' && t.due_date && t.due_date < now;
            return (
              <tr key={t.id} className={t.status === 'done' ? 'j-done' : ''}>
                <td><input type="checkbox" checked={t.status === 'done'} disabled={!canEdit} aria-label="Đánh dấu hoàn thành"
                  onChange={(e) => update(t, { status: e.target.checked ? 'done' : 'todo' })} /></td>
                <td><b>{t.title}</b>{t.description && <div className="muted small">{t.description}</div>}</td>
                <td>{canEdit
                  ? <select value={t.assignee_id ?? ''} onChange={(e) => update(t, { assignee_id: e.target.value || null })} aria-label="Người thực hiện">
                      <option value="">—</option>
                      {users?.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                  : t.assignee_name}</td>
                <td className={late ? 'overdue nowrap' : 'nowrap'}>{canEdit
                  ? <input type="date" value={t.due_date ?? ''} onChange={(e) => update(t, { due_date: e.target.value || null })} aria-label="Hạn" />
                  : fmtDate(t.due_date)}</td>
                <td>{canEdit
                  ? <select value={t.status} onChange={(e) => update(t, { status: e.target.value })} aria-label="Trạng thái">
                      {(Object.keys(TASK_STATUS) as StepStatus[]).map((k) => <option key={k} value={k}>{TASK_STATUS[k]}</option>)}
                    </select>
                  : <span className={`lozenge lozenge-${STEP_STATUS[t.status].tone}`}>{TASK_STATUS[t.status]}</span>}</td>
                <td className="small muted">{t.created_by_name}</td>
                {canEdit && <td>{(canDeleteAll || t.created_by === me?.id) &&
                  <button className="icon-btn" aria-label={`Xóa ${t.title}`} data-tip="Xóa" onClick={() => remove(t)}><Trash2 size={14} /></button>}</td>}
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
    </div>
  );
}

/** Tiến độ các dự án của khách hàng; bấm dự án → Kế hoạch chi tiết (phân hệ Quản lý dự án) */
function ProjectProgress({ c }: { c: CustomerDetail }) {
  const projects = c.projects.filter((p) => !p.is_archived);
  if (!projects.length) return <div className="card"><Empty title="Khách hàng chưa có dự án nào"><p className="muted">Gắn dự án với khách hàng ở Cài đặt dự án → Thông tin chung → Khách hàng.</p></Empty></div>;
  return (
    <div className="card table-wrap"><table className="table">
      <thead><tr><th>Dự án</th><th>Trạng thái</th><th>Tiến độ</th><th>Thời gian</th><th>BA/PM</th><th /></tr></thead>
      <tbody>{projects.map((p) => {
        const pct = p.total_issues ? Math.round((p.done_issues / p.total_issues) * 100) : 0;
        const st = p.project_status || p.status_auto;
        const name = <><span className="proj-dot" style={{ background: colorOf(p.key), flexShrink: 0 }}>{p.key.slice(0, 2)}</span> <b>{p.name}</b></>;
        return (
          <tr key={p.id}>
            <td>{p.accessible ? <Link to={`/p/${p.key}/plan`} className="row gap-sm">{name}</Link> : <span className="row gap-sm" data-tip="Bạn chưa là thành viên dự án này">{name}</span>}</td>
            <td>{st && <span className={lozengeOf(PROJECT_STATUSES, st)}>{st}</span>}</td>
            <td style={{ minWidth: 140 }}>{p.total_issues ? <>
              <div className="cust-bar"><div style={{ width: `${pct}%` }} /></div>
              <div className="muted small">{p.done_issues}/{p.total_issues} việc · {pct}%{p.overdue_issues ? <span className="overdue"> · {p.overdue_issues} quá hạn</span> : null}</div>
            </> : <span className="muted small">Chưa có việc</span>}</td>
            <td className="small nowrap">{p.start_date || p.end_date ? `${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}` : ''}</td>
            <td className="small">{p.ba}</td>
            <td className="nowrap">{p.accessible && <Link className="btn btn-sm" to={`/p/${p.key}/plan`}>Kế hoạch chi tiết →</Link>}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}
