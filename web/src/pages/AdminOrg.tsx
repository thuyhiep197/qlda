import { useState, type FormEvent } from 'react';
import { FolderPlus, Pencil, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { api, refreshAll } from '../api';
import { hasPerm, useDepartments, useMe, useStaff, useUsersBasic } from '../hooks';
import type { Department, StaffMember, StaffPosition } from '../types';
import { fold } from '../customer-filter';
import { STAFF_POSITION_LABELS } from '../util';
import { Modal, Spinner, toast, toastError } from '../components/ui';

const posLabel = (p: string) => STAFF_POSITION_LABELS.find((x) => x.key === p);
/** Tên đầy đủ của phòng ban theo cấp, VD "Phòng Dự án › Dev" (bỏ Ban Giám đốc ở gốc) */
const depPath = (deps: Department[], d: Department): string => {
  const parent = deps.find((x) => x.id === d.parent_id);
  return parent && parent.parent_id ? `${depPath(deps, parent)} › ${d.name}` : d.name;
};

/**
 * Quản trị → Danh mục → Phòng ban & Nhân sự: sơ đồ tổ chức (Ban Giám đốc đứng đầu, dưới là các phòng),
 * mỗi phòng liệt kê nhân sự với vị trí và tài khoản đăng nhập.
 */
export default function AdminOrg() {
  const { data: me } = useMe();
  const { data: deps, isLoading } = useDepartments();
  const { data: staff } = useStaff();
  const [q, setQ] = useState('');
  const [editDep, setEditDep] = useState<Partial<Department> | null>(null);
  const [editStaff, setEditStaff] = useState<Partial<StaffMember> | null>(null);
  const canDep = { create: hasPerm(me, 'department.create'), edit: hasPerm(me, 'department.edit'), del: hasPerm(me, 'department.delete') };
  const canStaff = { create: hasPerm(me, 'staff.create'), edit: hasPerm(me, 'staff.edit'), del: hasPerm(me, 'staff.delete') };
  if (isLoading || !deps) return <div className="page"><Spinner /></div>;

  const match = (x: StaffMember) => !q.trim() || fold(`${x.full_name} ${x.username ?? ''} ${x.positions.split(',').map((p) => posLabel(p)?.label ?? '').join(' ')}`).includes(fold(q.trim()));
  const children = (id: number | null) => deps.filter((d) => d.parent_id === id);
  const unassigned = (staff ?? []).filter((x) => !x.department_id);
  const removeDep = async (d: Department) => {
    if (!confirm(`Xóa ${d.name}?`)) return;
    try { await api.del(`/departments/${d.id}`); toast('Đã xóa'); await refreshAll(); } catch (e) { toastError(e); }
  };
  const removeStaff = async (x: StaffMember) => {
    if (!confirm(`Xóa ${x.full_name} khỏi danh mục? Dự án đã ghi tên người này vẫn giữ nguyên.`)) return;
    try { await api.del(`/staff/${x.id}`); toast('Đã xóa'); await refreshAll(); } catch (e) { toastError(e); }
  };

  // Tổng nhân sự của phòng ban, gồm cả các nhóm / bộ phận bên trong
  const total = (d: Department): number => d.staff.length + children(d.id).reduce((n, k) => n + total(k), 0);
  const actions = (d: Department, kind: 'phòng ban' | 'nhóm') => <>
    {canStaff.create && <button className="icon-btn" aria-label={`Thêm nhân sự vào ${d.name}`} data-tip="Thêm nhân sự" onClick={() => setEditStaff({ department_id: d.id, positions: '' })}><Plus size={14} /></button>}
    {canDep.edit && <button className="icon-btn" aria-label={`Sửa ${d.name}`} data-tip={`Sửa ${kind}`} onClick={() => setEditDep(d)}><Pencil size={14} /></button>}
    {canDep.del && <button className="icon-btn" aria-label={`Xóa ${d.name}`} data-tip={`Xóa ${kind}`} onClick={() => removeDep(d)}><Trash2 size={14} /></button>}
  </>;
  const people = (d: Department) => d.staff.filter(match).map((x) => <StaffRow key={x.id} x={x} onEdit={canStaff.edit ? () => setEditStaff(x) : undefined} onDelete={canStaff.del ? () => removeStaff(x) : undefined} />);
  // Nhóm / bộ phận bên trong một phòng (cấp 3 trở xuống): hiện thành từng mục trong ô của phòng
  const section = (d: Department): React.ReactNode => (
    <div key={d.id} className="org-section">
      <div className="org-section-head"><span className="grow ellipsis"><b>{d.name}</b> <span className="muted small">· {total(d)}</span></span>{actions(d, 'nhóm')}</div>
      {people(d)}
      {children(d.id).map(section)}
      {!total(d) && <div className="muted small org-empty">Chưa có nhân sự</div>}
    </div>
  );
  const card = (d: Department, nested: boolean) => (
    <div className="org-card">
      <div className="org-card-head">
        <div className="grow" style={{ minWidth: 0 }}><b className="ellipsis">{d.name}</b><div className="muted small">{d.code} · {total(d)} nhân sự</div></div>
        {canDep.create && nested && <button className="icon-btn" aria-label={`Thêm nhóm vào ${d.name}`} data-tip="Thêm nhóm / bộ phận" onClick={() => setEditDep({ parent_id: d.id })}><FolderPlus size={14} /></button>}
        {actions(d, 'phòng ban')}
      </div>
      <div className="org-staff">
        {people(d)}
        {nested && children(d.id).map(section)}
        {!total(d) && <div className="muted small">Chưa có nhân sự</div>}
      </div>
    </div>
  );
  // Vẽ cây: Ban Giám đốc ở trên; hàng dưới là các phòng, nhóm / bộ phận của mỗi phòng nằm trong ô của phòng đó
  const tree = (d: Department, level: number): React.ReactNode => {
    const kids = children(d.id);
    return (
      <div key={d.id} className="org-node">
        {card(d, level > 0)}
        {level === 0 && kids.length > 0 && <div className="org-children">{kids.map((k) => tree(k, 1))}</div>}
      </div>
    );
  };

  return (
    <div className="page org-page">
      <div className="page-head">
        <h1>Phòng ban & Nhân sự</h1>
        <div className="spacer" />
        <div className="cw-search" style={{ width: 240 }}><Search size={14} /><input placeholder="Tìm nhân sự, vị trí…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {canDep.create && <button className="btn" onClick={() => setEditDep({ parent_id: deps.find((d) => !d.parent_id)?.id ?? null })}>+ Thêm phòng ban</button>}
        {canStaff.create && <button className="btn btn-primary" onClick={() => setEditStaff({ positions: '' })}>+ Thêm nhân sự</button>}
      </div>
      <p className="muted small">Mỗi nhân sự thuộc một phòng ban, có vị trí (BGĐ, KD, AM, BA/PM, Dev, Tester, HC) và gắn với tài khoản đăng nhập. Mã vị trí hiện cạnh tên Người thực hiện / phối hợp trong hành trình khách hàng; nhân sự Kinh doanh, AM được chọn làm Nhân viên phụ trách khách hàng.</p>
      <div className="org-tree">{children(null).map((d) => tree(d, 0))}</div>
      {unassigned.length > 0 && (
        <div className="org-card org-unassigned">
          <div className="org-card-head"><b className="grow">Chưa xếp phòng ban ({unassigned.length})</b></div>
          <div className="org-staff">{unassigned.filter(match).map((x) => <StaffRow key={x.id} x={x} onEdit={canStaff.edit ? () => setEditStaff(x) : undefined} onDelete={canStaff.del ? () => removeStaff(x) : undefined} />)}</div>
        </div>
      )}
      {editDep && <DepModal d={editDep} deps={deps} onClose={() => setEditDep(null)} />}
      {editStaff && <StaffModal x={editStaff} deps={deps} onClose={() => setEditStaff(null)} />}
    </div>
  );
}

function StaffRow({ x, onEdit, onDelete }: { x: StaffMember; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <div className={`org-person ${onEdit ? 'editable' : ''}`} onClick={onEdit}>
      <UserRound size={14} className="muted" />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="ellipsis">{x.full_name}{x.note && <span className="muted small"> ({x.note})</span>}</div>
        <div className="row gap-xs" style={{ flexWrap: 'wrap' }}>
          {x.positions.split(',').filter(Boolean).map((p) => <span key={p} className="unit-chip">{posLabel(p)?.code ?? p}</span>)}
          {x.username ? <span className="muted small">@{x.username}</span> : <span className="small warn-text" data-tip="Gắn tài khoản để người này nhận việc và xem khách hàng mình phụ trách">Chưa gắn tài khoản</span>}
        </div>
      </div>
      {onDelete && <button className="icon-btn" aria-label={`Xóa ${x.full_name}`} data-tip="Xóa" onClick={(e) => { e.stopPropagation(); onDelete(); }}><Trash2 size={13} /></button>}
    </div>
  );
}

function DepModal({ d, deps, onClose }: { d: Partial<Department>; deps: Department[]; onClose: () => void }) {
  const [code, setCode] = useState(d.code ?? '');
  const [name, setName] = useState(d.name ?? '');
  const [parent, setParent] = useState(d.parent_id ? String(d.parent_id) : '');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const body = { code, name, parent_id: parent || null };
      if (d.id) await api.patch(`/departments/${d.id}`, body); else await api.post('/departments', body);
      toast('Đã lưu');
      await refreshAll();
      onClose();
    } catch (err) { toastError(err); }
  };
  return (
    <Modal title={d.id ? 'Sửa phòng ban' : 'Thêm phòng ban'} width={460} onClose={onClose} footer={<>
      <div className="spacer" /><button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="dep-form">{d.id ? 'Lưu' : 'Thêm'}</button>
    </>}>
      <form id="dep-form" className="stack" onSubmit={submit}>
        <label className="field"><span>Tên phòng ban *</span><input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Phòng Kinh doanh" /></label>
        <label className="field"><span>Mã *</span><input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="VD: P.KD" /></label>
        <label className="field"><span>Trực thuộc</span>
          <select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">— Cấp cao nhất —</option>
            {deps.filter((x) => x.id !== d.id).map((x) => <option key={x.id} value={x.id}>{depPath(deps, x)}</option>)}
          </select></label>
      </form>
    </Modal>
  );
}

function StaffModal({ x, deps, onClose }: { x: Partial<StaffMember>; deps: Department[]; onClose: () => void }) {
  const { data: users } = useUsersBasic();
  const [d, setD] = useState({
    full_name: x.full_name ?? '', positions: (x.positions ?? '').split(',').filter(Boolean) as StaffPosition[], note: x.note ?? '',
    user_id: x.user_id ? String(x.user_id) : '', department_id: x.department_id ? String(x.department_id) : '',
  });
  const toggle = (p: StaffPosition) => setD({ ...d, positions: d.positions.includes(p) ? d.positions.filter((v) => v !== p) : [...d.positions, p] });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const body = { full_name: d.full_name, positions: d.positions, note: d.note, user_id: d.user_id || null, department_id: d.department_id || null };
      if (x.id) await api.patch(`/staff/${x.id}`, body); else await api.post('/staff', body);
      toast(x.id ? 'Đã lưu' : 'Đã thêm nhân sự');
      await refreshAll();
      onClose();
    } catch (err) { toastError(err); }
  };
  return (
    <Modal title={x.id ? 'Sửa nhân sự' : 'Thêm nhân sự'} onClose={onClose} footer={<>
      <div className="spacer" /><button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="staff-form">{x.id ? 'Lưu' : 'Thêm'}</button>
    </>}>
      <form id="staff-form" className="stack" onSubmit={submit}>
        <label className="field"><span>Họ tên *</span><input autoFocus required value={d.full_name} onChange={(e) => setD({ ...d, full_name: e.target.value })} placeholder="VD: Nguyễn Văn A" /></label>
        <label className="field"><span>Phòng ban</span>
          <select value={d.department_id} onChange={(e) => setD({ ...d, department_id: e.target.value })}>
            <option value="">— Chưa xếp phòng ban —</option>
            {deps.map((x2) => <option key={x2.id} value={x2.id}>{depPath(deps, x2)}</option>)}
          </select></label>
        <div className="field"><span>Vị trí * <small className="muted">(chọn một hoặc nhiều)</small></span>
          <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
            {STAFF_POSITION_LABELS.map((p) => (
              <label key={p.key} className="check"><input type="checkbox" checked={d.positions.includes(p.key)} onChange={() => toggle(p.key)} /> {p.label} <span className="muted small">({p.code})</span></label>
            ))}
          </div>
        </div>
        <label className="field"><span>Tài khoản đăng nhập <small className="muted">(để nhận việc, xem khách hàng mình phụ trách)</small></span>
          <select value={d.user_id} onChange={(e) => setD({ ...d, user_id: e.target.value })}>
            <option value="">— Chưa gắn —</option>
            {users?.map((u) => <option key={u.id} value={u.id}>{u.full_name} (@{u.username})</option>)}
          </select></label>
        <label className="field"><span>Ghi chú</span><input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="VD: TTS, CTV…" /></label>
      </form>
    </Modal>
  );
}
