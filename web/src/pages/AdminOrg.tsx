import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
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
 * mỗi phòng liệt kê tài khoản người dùng thuộc phòng với vị trí. Nhân sự = tài khoản (tạo tài khoản ở Người dùng).
 * Sơ đồ phòng ban chỉ hiện khi có Phòng ban – Xem; nhân sự chỉ hiện khi có Nhân sự – Xem (chỉ có Nhân sự – Xem: danh sách nhân sự theo phòng ban).
 */
export default function AdminOrg() {
  const { data: me } = useMe();
  const { data: deps, isLoading } = useDepartments();
  const { data: users } = useUsersBasic();
  const [q, setQ] = useState('');
  const [editDep, setEditDep] = useState<Partial<Department> | null>(null);
  const [editStaff, setEditStaff] = useState<Partial<StaffMember> | null>(null);
  const canDep = { create: hasPerm(me, 'department.create'), edit: hasPerm(me, 'department.edit'), del: hasPerm(me, 'department.delete') };
  const canStaff = { create: hasPerm(me, 'staff.create'), edit: hasPerm(me, 'staff.edit'), del: hasPerm(me, 'staff.delete') };
  const seeDeps = hasPerm(me, 'department.view'), seeStaff = hasPerm(me, 'staff.view');
  const { data: staffList } = useQuery<StaffMember[]>({ queryKey: ['staff'], queryFn: () => api.get('/staff'), enabled: !seeDeps && seeStaff });
  if (isLoading || !deps) return <div className="page"><Spinner /></div>;

  const match = (x: StaffMember) => !q.trim() || fold(`${x.full_name} ${x.username ?? ''} ${x.positions.split(',').map((p) => posLabel(p)?.label ?? '').join(' ')}`).includes(fold(q.trim()));
  const children = (id: number | null) => deps.filter((d) => d.parent_id === id);
  // Tài khoản chưa xếp phòng ban: bấm để xếp vào phòng
  const unassigned = (users ?? []).filter((u) => !u.department_id);
  const removeDep = async (d: Department) => {
    if (!confirm(`Xóa ${d.name}?`)) return;
    try { await api.del(`/departments/${d.id}`); toast('Đã xóa'); await refreshAll(); } catch (e) { toastError(e); }
  };
  const removeStaff = async (x: StaffMember) => {
    if (!confirm(`Bỏ ${x.full_name} khỏi phòng ban? Tài khoản vẫn còn; khách hàng, dự án đã chọn người này giữ nguyên.`)) return;
    try { await api.del(`/staff/${x.id}`); toast('Đã bỏ khỏi phòng ban'); await refreshAll(); } catch (e) { toastError(e); }
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
  // Mỗi phòng ban / nhóm là một ô; ô chỉ liệt kê nhân sự trực tiếp của nó, các nhóm con là các nhánh ngang hàng bên dưới
  const card = (d: Department, level: number) => {
    const kids = children(d.id);
    const own = d.staff.length;
    return (
      <div className={`org-card org-level-${Math.min(level, 2)}`}>
        <div className="org-card-head">
          <div className="grow" style={{ minWidth: 0 }}>
            <b className="ellipsis">{d.name}</b>
            <div className="muted small">{d.code}{seeStaff ? ` · ${kids.length ? `${total(d)} nhân sự · ${kids.length} ${level === 0 ? 'phòng' : 'nhóm'}` : `${own} nhân sự`}` : kids.length ? ` · ${kids.length} ${level === 0 ? 'phòng' : 'nhóm'}` : ''}</div>
          </div>
          {canDep.create && level > 0 && <button className="icon-btn" aria-label={`Thêm nhóm vào ${d.name}`} data-tip="Thêm nhóm / bộ phận" onClick={() => setEditDep({ parent_id: d.id })}><FolderPlus size={14} /></button>}
          {actions(d, level > 1 ? 'nhóm' : 'phòng ban')}
        </div>
        {seeStaff && (own > 0 || !kids.length) && <div className="org-staff">
          {people(d)}
          {!own && <div className="muted small org-empty">Chưa có nhân sự</div>}
        </div>}
      </div>
    );
  };
  // Vẽ cây: Ban Giám đốc → các phòng → các nhóm (mỗi cấp là một hàng ngang, có đường nối)
  const tree = (d: Department, level: number): React.ReactNode => {
    const kids = children(d.id);
    return (
      <div key={d.id} className="org-node">
        {card(d, level)}
        {kids.length > 0 && <div className="org-children">{kids.map((k) => tree(k, level + 1))}</div>}
      </div>
    );
  };

  return (
    <div className="page org-page">
      <div className="page-head">
        <h1>Phòng ban & Nhân sự</h1>
        <div className="spacer" />
        {seeStaff && <div className="cw-search" style={{ width: 240 }}><Search size={14} /><input placeholder="Tìm nhân sự, vị trí…" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
        {canDep.create && <button className="btn" onClick={() => setEditDep({ parent_id: deps.find((d) => !d.parent_id)?.id ?? null })}>+ Thêm phòng ban</button>}
        {canStaff.create && <button className="btn btn-primary" onClick={() => setEditStaff({ positions: '' })}>+ Xếp người vào phòng</button>}
      </div>
      <p className="muted small">Nhân sự là tài khoản người dùng (tạo ở Quản trị → Người dùng). Mỗi người thuộc một phòng ban, có vị trí (BGĐ, KD, AM, BA/PM, Dev, Tester, HC). Vị trí quyết định người đó được chọn ở vai trò nào: Sale, AM của khách hàng; BA/PM, Dev, Tester, AM của dự án. Mã vị trí hiện cạnh tên trong hành trình khách hàng.</p>
      {seeDeps ? <div className="org-tree">{children(null).map((d) => tree(d, 0))}</div>
        : seeStaff && <div className="org-card"><div className="org-staff">
          {(staffList ?? []).filter(match).map((x) => <div key={x.id}>
            <StaffRow x={x} onEdit={canStaff.edit ? () => setEditStaff(x) : undefined} onDelete={canStaff.del ? () => removeStaff(x) : undefined} />
            {x.department_name && <div className="muted small" style={{ paddingLeft: 22 }}>{x.department_name}</div>}
          </div>)}
        </div></div>}
      {seeStaff && unassigned.length > 0 && (
        <div className="org-card org-unassigned">
          <div className="org-card-head"><b className="grow">Tài khoản chưa xếp phòng ban ({unassigned.length})</b></div>
          <div className="org-staff">{unassigned.filter((u) => !q.trim() || fold(`${u.full_name} ${u.username}`).includes(fold(q.trim()))).map((u) => (
            <div key={u.id} className={`org-person ${canStaff.create ? 'editable' : ''}`} onClick={canStaff.create ? () => setEditStaff({ user_id: u.id, positions: '' }) : undefined}
              data-tip={canStaff.create ? 'Bấm để xếp vào phòng ban' : undefined}>
              <UserRound size={14} className="muted" />
              <div className="grow ellipsis">{u.full_name} <span className="muted small">@{u.username}</span></div>
            </div>))}</div>
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
        {x.manager_name && <div className="muted small ellipsis">Quản lý: {x.manager_name}</div>}
        <div className="row gap-xs" style={{ flexWrap: 'wrap' }}>
          {x.positions.split(',').filter(Boolean).map((p) => <span key={p} className="unit-chip">{posLabel(p)?.code ?? p}</span>)}
          {x.username && <span className="muted small">@{x.username}</span>}
        </div>
      </div>
      {onDelete && <button className="icon-btn" aria-label={`Bỏ ${x.full_name} khỏi phòng ban`} data-tip="Bỏ khỏi phòng ban" onClick={(e) => { e.stopPropagation(); onDelete(); }}><Trash2 size={13} /></button>}
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
  const { data: staff } = useStaff();
  const depOf = (id: string) => deps.find((x2) => String(x2.id) === id);
  // Phòng cấp phòng (con trực tiếp của Ban Giám đốc) chứa một phòng ban / nhóm — để xếp người cùng phòng lên trước
  const depRoot = (id: number | null | undefined): number | null => {
    let cur = deps.find((x2) => x2.id === id);
    while (cur && cur.parent_id && deps.find((x2) => x2.id === cur!.parent_id)?.parent_id) cur = deps.find((x2) => x2.id === cur!.parent_id);
    return cur?.id ?? null;
  };
  const startDep = x.department_id ? String(x.department_id) : '';
  const [d, setD] = useState({
    note: x.note ?? '', user_id: x.user_id ? String(x.user_id) : '', department_id: startDep,
    manager_id: x.manager_id ? String(x.manager_id) : '',
    // Thêm mới vào một nhóm: tích sẵn vị trí của nhóm (VD nhóm Sale → Sale)
    positions: (x.id ? (x.positions ?? '').split(',').filter(Boolean) : depOf(startDep)?.preset_position ? [depOf(startDep)!.preset_position!] : []) as StaffPosition[],
  });
  // Vị trí được chọn theo phòng ban (Kinh doanh: Sale, AM; Dự án / Sản phẩm: Dev, BA/PM, Tester…)
  const allowed = depOf(d.department_id)?.allowed_positions ?? STAFF_POSITION_LABELS.map((p) => p.key);
  const dropped = d.positions.filter((p) => !allowed.includes(p));
  const changeDep = (id: string) => {
    const dep = depOf(id);
    const keep = d.positions.filter((p) => (dep?.allowed_positions ?? allowed).includes(p));
    setD({ ...d, department_id: id, positions: keep.length ? keep : dep?.preset_position ? [dep.preset_position] : [] });
  };
  const toggle = (p: StaffPosition) => setD({ ...d, positions: d.positions.includes(p) ? d.positions.filter((v) => v !== p) : [...d.positions, p] });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const body = { positions: d.positions.filter((p) => allowed.includes(p)), note: d.note, user_id: d.user_id || null, department_id: d.department_id || null, manager_id: d.manager_id || null };
      if (x.id) await api.patch(`/staff/${x.id}`, body); else await api.post('/staff', body);
      toast(x.id ? 'Đã lưu' : 'Đã xếp vào phòng ban');
      await refreshAll();
      onClose();
    } catch (err) { toastError(err); }
  };
  return (
    <Modal title={x.id ? `Sửa: ${x.full_name}` : 'Xếp người vào phòng ban'} onClose={onClose} footer={<>
      <div className="spacer" /><button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="staff-form">{x.id ? 'Lưu' : 'Thêm'}</button>
    </>}>
      <form id="staff-form" className="stack" onSubmit={submit}>
        {!x.id && <label className="field"><span>Tài khoản * <small className="muted">(tài khoản chưa thuộc phòng ban nào)</small></span>
          <select autoFocus required value={d.user_id} onChange={(e) => setD({ ...d, user_id: e.target.value })}>
            <option value="">— Chọn tài khoản —</option>
            {users?.filter((u) => !u.department_id || String(u.id) === d.user_id).map((u) => <option key={u.id} value={u.id}>{u.full_name} (@{u.username})</option>)}
          </select></label>}
        <label className="field"><span>Phòng ban</span>
          <select value={d.department_id} onChange={(e) => changeDep(e.target.value)}>
            <option value="">— Chưa xếp phòng ban —</option>
            {deps.map((x2) => <option key={x2.id} value={x2.id}>{depPath(deps, x2)}</option>)}
          </select></label>
        <div className="field"><span>Vị trí * <small className="muted">(chọn một hoặc nhiều)</small></span>
          <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
            {STAFF_POSITION_LABELS.filter((p) => allowed.includes(p.key)).map((p) => (
              <label key={p.key} className="check"><input type="checkbox" checked={d.positions.includes(p.key)} onChange={() => toggle(p.key)} /> {p.label} <span className="muted small">({p.code})</span></label>
            ))}
          </div>
          {dropped.length > 0 && <small className="warn-text">Vị trí {dropped.map((p) => STAFF_POSITION_LABELS.find((x2) => x2.key === p)?.label ?? p).join(', ')} không thuộc phòng ban này, sẽ bị bỏ khi lưu</small>}
        </div>
        <label className="field"><span>Quản lý</span>
          <select value={d.manager_id} onChange={(e) => setD({ ...d, manager_id: e.target.value })}>
            <option value="">— Không có —</option>
            {/* Người cùng phòng lên trước; không chọn được chính mình */}
            {[...(staff ?? [])].filter((m) => m.id !== x.id)
              .sort((a, b) => Number(depRoot(b.department_id) === depRoot(Number(d.department_id) || null)) - Number(depRoot(a.department_id) === depRoot(Number(d.department_id) || null)) || a.full_name.localeCompare(b.full_name, 'vi'))
              .map((m) => <option key={m.id} value={m.id}>{m.full_name}{m.department_name ? ` — ${m.department_name}` : ''}</option>)}
          </select></label>
        <label className="field"><span>Ghi chú</span><input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="VD: TTS, CTV…" /></label>
      </form>
    </Modal>
  );
}
