import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, refreshAll } from '../api';
import { can, useVersions } from '../hooks';
import type { Version } from '../types';
import { fmtDate, isOverdue, today } from '../util';
import { Empty, Modal, Spinner, toast, toastError } from '../components/ui';
import { useProjectCtx } from './ProjectLayout';
import { DateInput } from '../components/fields';

const STATUS: Record<Version['status'], [string, string]> = {
  unreleased: ['Chưa phát hành', 'default'],
  released: ['Đã phát hành', 'green'],
  archived: ['Lưu trữ', 'purple'],
};

/** Phiên bản phát hành (Releases) như Jira: gom issue theo đợt bàn giao, theo dõi tiến độ, đánh dấu phát hành. */
export default function Releases() {
  const project = useProjectCtx();
  const { data: versions, isLoading } = useVersions(project.key);
  const [editing, setEditing] = useState<Version | 'new' | null>(null);
  const [releasing, setReleasing] = useState<Version | null>(null);
  const manage = can(project.permissions, 'sprint.manage');

  const patch = async (v: Version, body: Record<string, unknown>, msg: string) => {
    try { await api.patch(`/projects/${project.key}/versions/${v.id}`, body); toast(msg); await refreshAll(); } catch (e) { toastError(e); }
  };
  const del = async (v: Version) => {
    if (!confirm(`Xóa phiên bản "${v.name}"? ${v.issue_count} issue sẽ được bỏ gán phiên bản (issue không bị xóa).`)) return;
    try { await api.del(`/projects/${project.key}/versions/${v.id}`); toast('Đã xóa phiên bản'); await refreshAll(); } catch (e) { toastError(e); }
  };

  if (isLoading || !versions) return <Spinner />;
  return (
    <div className="page-pad">
      <div className="page-head">
        <div>
          <h2>Phát hành</h2>
          <div className="muted small">Mỗi phiên bản là một đợt bàn giao (VD: v1.0, Nghiệm thu đợt 1). Gán issue vào phiên bản trong chi tiết issue, form tạo issue hoặc thao tác hàng loạt.</div>
        </div>
        <div className="spacer" />
        {manage && <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Tạo phiên bản</button>}
      </div>
      {!versions.length ? <Empty title="Chưa có phiên bản nào"><p className="muted">Tạo phiên bản để gom các issue cần bàn giao cùng đợt.</p></Empty> : (
        <table className="table">
          <thead>
            <tr><th>Phiên bản</th><th>Trạng thái</th><th style={{ width: '28%' }}>Tiến độ</th><th>Ngày bắt đầu</th><th>Ngày phát hành</th><th>Mô tả</th><th /></tr>
          </thead>
          <tbody>
            {versions.map((v) => {
              const pct = v.issue_count ? Math.round((v.done_count / v.issue_count) * 100) : 0;
              const late = v.status === 'unreleased' && v.release_date && v.release_date < today();
              return (
                <tr key={v.id}>
                  <td><Link to={`/p/${project.key}/issues?version=${v.id}`}><b>{v.name}</b></Link></td>
                  <td><span className={`lozenge lozenge-${STATUS[v.status][1]}`}>{STATUS[v.status][0]}</span></td>
                  <td>
                    <div className="progress" data-tip={`${v.done_count} xong · ${v.inprogress_count} đang làm · ${v.issue_count - v.done_count - v.inprogress_count} chưa làm · ${v.done_points}/${v.points} điểm`}>
                      <div style={{ width: `${pct}%` }} />
                      <div className="progress-ip" style={{ width: `${v.issue_count ? (v.inprogress_count / v.issue_count) * 100 : 0}%` }} />
                    </div>
                    <span className="muted small">{v.done_count}/{v.issue_count} issue ({pct}%)</span>
                  </td>
                  <td className="small">{fmtDate(v.start_date)}</td>
                  <td className={`small ${late ? 'overdue' : ''}`}>{fmtDate(v.release_date)}{late ? ' · trễ hạn' : ''}{v.released_at ? <div className="muted">phát hành {fmtDate(v.released_at)}</div> : null}</td>
                  <td className="small">{v.description}</td>
                  <td className="num nowrap">
                    {manage && v.status === 'unreleased' && <button className="btn btn-sm" onClick={() => setReleasing(v)}>Phát hành</button>}
                    {manage && v.status === 'released' && <button className="btn btn-subtle btn-sm" onClick={() => patch(v, { status: 'unreleased' }, 'Đã hủy phát hành')}>Hủy phát hành</button>}
                    {manage && v.status !== 'archived' && <button className="btn btn-subtle btn-sm" onClick={() => patch(v, { status: 'archived' }, 'Đã lưu trữ')}>Lưu trữ</button>}
                    {manage && v.status === 'archived' && <button className="btn btn-subtle btn-sm" onClick={() => patch(v, { status: 'released' }, 'Đã khôi phục')}>Khôi phục</button>}
                    {manage && <button className="btn btn-subtle btn-sm" onClick={() => setEditing(v)}>Sửa</button>}
                    {manage && <button className="btn btn-subtle btn-sm" onClick={() => del(v)}>Xóa</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {editing && <VersionModal version={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {releasing && <ReleaseModal version={releasing} others={versions.filter((v) => v.status === 'unreleased' && v.id !== releasing.id)} onClose={() => setReleasing(null)} />}
    </div>
  );
}

function VersionModal({ version, onClose }: { version: Version | null; onClose: () => void }) {
  const project = useProjectCtx();
  const [name, setName] = useState(version?.name || '');
  const [description, setDescription] = useState(version?.description || '');
  const [start, setStart] = useState(version?.start_date || '');
  const [release, setRelease] = useState(version?.release_date || '');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const body = { name, description, start_date: start || null, release_date: release || null };
      if (version) await api.patch(`/projects/${project.key}/versions/${version.id}`, body);
      else await api.post(`/projects/${project.key}/versions`, body);
      toast(version ? 'Đã lưu phiên bản' : 'Đã tạo phiên bản');
      await refreshAll();
      onClose();
    } catch (err) { toastError(err); }
  };
  return (
    <Modal title={version ? `Sửa phiên bản ${version.name}` : 'Tạo phiên bản'} onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="version-form">{version ? 'Lưu' : 'Tạo'}</button>
    </>}>
      <form id="version-form" className="stack" onSubmit={submit}>
        <label className="field"><span>Tên phiên bản *</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} required placeholder="VD: v1.0, Nghiệm thu đợt 1" /></label>
        <div className="form-grid">
          <label className="field"><span>Ngày bắt đầu</span><DateInput value={start} onChange={setStart} /></label>
          <label className="field"><span>Ngày phát hành dự kiến</span><DateInput value={release} min={start || undefined} onChange={setRelease} /></label>
        </div>
        <label className="field"><span>Mô tả</span><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      </form>
    </Modal>
  );
}

function ReleaseModal({ version, others, onClose }: { version: Version; others: Version[]; onClose: () => void }) {
  const project = useProjectCtx();
  const open = version.issue_count - version.done_count;
  const [moveTo, setMoveTo] = useState('');
  const submit = async () => {
    try {
      const r = await api.post<{ moved: number }>(`/projects/${project.key}/versions/${version.id}/release`, { move_open_to: moveTo ? Number(moveTo) : null });
      toast(`Đã phát hành ${version.name}${r.moved ? `, chuyển ${r.moved} issue chưa xong` : ''}`);
      await refreshAll();
      onClose();
    } catch (e) { toastError(e); }
  };
  return (
    <Modal title={`Phát hành ${version.name}`} onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" onClick={submit}>Phát hành</button>
    </>}>
      <div className="stack">
        <p>Phiên bản có <b>{version.done_count}</b> issue đã xong và <b>{open}</b> issue chưa xong.</p>
        {open > 0 && (
          <label className="field"><span>Các issue chưa xong</span>
            <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="">Giữ nguyên trong {version.name}</option>
              {others.map((v) => <option key={v.id} value={v.id}>Chuyển sang {v.name}</option>)}
            </select>
          </label>
        )}
        {open > 0 && isOverdue({ due_date: version.release_date, status_category: 'todo' }) && <div className="muted small">Phiên bản đã quá ngày phát hành dự kiến.</div>}
      </div>
    </Modal>
  );
}
