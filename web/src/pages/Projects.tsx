import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api, refreshAll } from '../api';
import { useMe, useUsersBasic } from '../hooks';
import type { ProjectSummary } from '../types';
import { colorOf } from '../util';
import { Empty, Modal, Spinner, toast, toastError } from '../components/ui';

export default function Projects() {
  const { data: me } = useMe();
  const [archived, setArchived] = useState(false);
  const { data: projects, isLoading } = useQuery<ProjectSummary[]>({
    queryKey: ['projects', archived],
    queryFn: () => api.get(`/projects${archived ? '?archived=1' : ''}`),
  });
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('');

  const toggleArchive = async (p: ProjectSummary) => {
    const action = p.is_archived ? 'Khôi phục' : 'Lưu trữ';
    if (!confirm(`${action} dự án ${p.name}?${p.is_archived ? '' : ' Dự án sẽ bị ẩn khỏi danh sách của mọi người.'}`)) return;
    try {
      await api.post(`/projects/${p.key}/archive`, { archived: !p.is_archived });
      toast(`Đã ${action.toLowerCase()} dự án`);
      await refreshAll();
    } catch (e) { toastError(e); }
  };

  const list = projects?.filter((p) => !filter || `${p.name} ${p.key}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Dự án</h1>
        <div className="spacer" />
        {!!me?.is_admin && <label className="check"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Xem dự án đã lưu trữ</label>}
        {!!me?.is_admin && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Tạo dự án</button>}
      </div>
      <input className="filter-input" placeholder="Lọc theo tên hoặc mã dự án" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {isLoading ? <Spinner /> : !list?.length ? (
        <Empty title={archived ? 'Không có dự án lưu trữ' : 'Chưa có dự án nào'}>
          {!me?.is_admin && <p className="muted">Liên hệ quản trị viên để được thêm vào dự án.</p>}
        </Empty>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Tên dự án</th><th>Mã</th><th>Loại</th><th>Trưởng dự án</th><th>Vai trò của tôi</th><th className="num">Issue mở</th><th className="num">Thành viên</th>{!!me?.is_admin && <th />}</tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/p/${p.key}`} className="row gap-sm"><span className="proj-dot" style={{ background: colorOf(p.key) }}>{p.key.slice(0, 2)}</span> <b>{p.name}</b></Link></td>
                <td>{p.key}</td>
                <td>{p.type === 'scrum' ? 'Scrum' : 'Kanban'}</td>
                <td>{p.lead_name}</td>
                <td>{p.my_role || (me?.is_admin ? <span className="muted">Quản trị hệ thống</span> : '')}</td>
                <td className="num">{p.open_count}</td>
                <td className="num">{p.member_count}</td>
                {!!me?.is_admin && <td className="num"><button className="btn btn-subtle btn-sm" onClick={() => toggleArchive(p)}>{p.is_archived ? 'Khôi phục' : 'Lưu trữ'}</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {creating && <CreateProjectModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data: users } = useUsersBasic();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [type, setType] = useState<'scrum' | 'kanban'>('scrum');
  const [lead, setLead] = useState(String(me?.id ?? ''));
  const [description, setDescription] = useState('');

  const suggestKey = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'D')
    .split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/projects', { name, key, type, lead_id: Number(lead), description });
      toast('Đã tạo dự án');
      await refreshAll();
      onClose();
      navigate(`/p/${key.toUpperCase()}`);
    } catch (err) { toastError(err); }
  };

  return (
    <Modal title="Tạo dự án" onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="create-project">Tạo dự án</button>
    </>}>
      <form id="create-project" onSubmit={submit} className="stack">
        <label className="field"><span>Tên dự án *</span>
          <input autoFocus value={name} required onChange={(e) => { setName(e.target.value); if (!keyTouched) setKey(suggestKey(e.target.value)); }} /></label>
        <label className="field"><span>Mã dự án * <small className="muted">(dùng làm tiền tố mã issue, VD: QLVB-12)</small></span>
          <input value={key} required pattern="[A-Za-z][A-Za-z0-9]{1,9}" onChange={(e) => { setKeyTouched(true); setKey(e.target.value.toUpperCase()); }} /></label>
        <div className="field"><span>Mô hình quản lý</span>
          <div className="choice-cards">
            <label className={`choice ${type === 'scrum' ? 'active' : ''}`}>
              <input type="radio" checked={type === 'scrum'} onChange={() => setType('scrum')} />
              <b>Scrum</b><span className="muted small">Làm việc theo sprint, có backlog, biểu đồ khối lượng còn lại, năng suất sprint</span>
            </label>
            <label className={`choice ${type === 'kanban' ? 'active' : ''}`}>
              <input type="radio" checked={type === 'kanban'} onChange={() => setType('kanban')} />
              <b>Kanban</b><span className="muted small">Luồng công việc liên tục, giới hạn việc đang thực hiện</span>
            </label>
          </div>
        </div>
        <label className="field"><span>Trưởng dự án <small className="muted">(tự được thêm vào dự án)</small></span>
          <select value={lead} onChange={(e) => setLead(e.target.value)}>
            {users?.map((u) => <option key={u.id} value={u.id}>{u.full_name} (@{u.username}){u.default_role_name ? ` · ${u.default_role_name}` : ''}</option>)}
          </select></label>
        <label className="field"><span>Mô tả</span>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      </form>
    </Modal>
  );
}
