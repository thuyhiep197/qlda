import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Lock, LockOpen, Pencil, ShieldCheck } from 'lucide-react';
import { api, refreshAll } from '../api';
import { hasPerm, useDepartments, useMe, useRoles } from '../hooks';
import { suggestPlacement } from '../people';
import { STAFF_POSITION_LABELS } from '../util';
import type { User } from '../types';
import { UserPermEditor } from '../components/UserPermEditor';
import { fmtDateTime } from '../util';
import { Avatar, Modal, Spinner, toast, toastError } from '../components/ui';

const genPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(arr, (n) => chars[n % chars.length]).join('') + '@1';
};

export default function AdminUsers() {
  const { data: me } = useMe();
  const { data: users, isLoading } = useQuery<User[]>({ queryKey: ['users'], queryFn: () => api.get('/users') });
  const { data: roles } = useRoles();
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [reset, setReset] = useState<User | null>(null);
  const [permUser, setPermUser] = useState<User | null>(null);
  const [filter, setFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const logoutAll = async () => {
    if (!confirm('Thu hồi phiên đăng nhập của TẤT CẢ mọi người (trừ bạn)? Mọi người phải đăng nhập lại. Dùng khi nghi tài khoản bị chiếm.')) return;
    try { const r = await api.post<{ count: number }>('/users/logout-all'); toast(`Đã đăng xuất ${r.count} tài khoản`); } catch (e) { toastError(e); }
  };

  const toggleActive = async (u: User) => {
    if (u.is_active && !confirm(`Khóa tài khoản ${u.full_name}? Người dùng sẽ không đăng nhập được nữa.`)) return;
    try { await api.patch(`/users/${u.id}`, { is_active: !u.is_active }); await refreshAll(); } catch (e) { toastError(e); }
  };

  const list = users?.filter((u) =>
    (!filter || `${u.full_name} ${u.username} ${u.email || ''}`.toLowerCase().includes(filter.toLowerCase())) &&
    (!roleFilter || (roleFilter === 'none' ? !u.default_role_id : String(u.default_role_id) === roleFilter)));
  const missingRole = users?.filter((u) => !u.default_role_id).length ?? 0;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Người dùng</h1>
        <div className="spacer" />
        {!!me?.is_admin && <button className="btn btn-danger" onClick={logoutAll} data-tip="Khẩn cấp: buộc mọi người (trừ bạn) đăng nhập lại ngay">Đăng xuất tất cả mọi người</button>}
        {hasPerm(me, 'user.create') && <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Tạo tài khoản</button>}
      </div>
      {missingRole > 0 && (
        <div className="form-error mb-sm">
          Có {missingRole} tài khoản chưa có nhóm người dùng. Bấm <b>Sửa</b> để chọn nhóm cho các tài khoản này.
        </div>
      )}
      <div className="filter-bar">
        <input className="filter-search" style={{ width: 300 }} placeholder="Tìm theo tên, tên đăng nhập, email" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">Mọi nhóm</option>
          {roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          <option value="none">Chưa có nhóm</option>
        </select>
        <span className="muted small">{list?.length ?? 0} tài khoản</span>
      </div>
      {isLoading ? <Spinner /> : (
        // Bảng gọn: cột co theo nội dung, dự án tham gia xếp ngang; thao tác là biểu tượng (rê chuột xem tên)
        <div className="table-wrap">
        <table className="table users-table">
          <thead><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Phòng ban</th><th>Nhóm người dùng</th><th>Email</th><th>Đăng nhập gần nhất</th><th>Trạng thái</th><th className="num">Thao tác</th></tr></thead>
          <tbody>
            {list?.map((u) => (
              <tr key={u.id} className={u.is_active ? '' : 'inactive'}>
                <td className="nowrap"><div className="row gap-sm"><Avatar name={u.full_name} src={u.avatar_url} size={24} /> {u.full_name}</div></td>
                <td className="nowrap">@{u.username}</td>
                <td className="small users-dept">{u.department_name ?? <span className="muted nowrap" data-tip="Chọn phòng ban ở nút Sửa hoặc Quản trị → Danh mục → Phòng ban & Nhân sự">Chưa gắn</span>}</td>
                <td className="nowrap">
                  {u.default_role_name ? <span className="lozenge lozenge-default">{u.default_role_name}</span> : <span className="small danger">Chưa chọn</span>}
                </td>
                <td className="small users-email">{u.email}</td>
                <td className="small nowrap">{u.last_login_at ? fmtDateTime(u.last_login_at) : <span className="muted">Chưa đăng nhập</span>}</td>
                <td className="nowrap">{u.is_active ? <span className="lozenge lozenge-green">Hoạt động</span> : <span className="lozenge lozenge-red">Đã khóa</span>}</td>
                <td className="num nowrap users-actions">
                  {(hasPerm(me, 'role.view') || hasPerm(me, 'role.edit')) && <button className="icon-btn" aria-label="Phân quyền" data-tip="Phân quyền" onClick={() => setPermUser(u)}><ShieldCheck size={16} /></button>}
                  {hasPerm(me, 'user.edit') && <button className="icon-btn" aria-label="Sửa" data-tip="Sửa" onClick={() => setEditing(u)}><Pencil size={16} /></button>}
                  {hasPerm(me, 'user.edit') && <button className="icon-btn" aria-label="Đặt lại mật khẩu" data-tip="Đặt lại mật khẩu" onClick={() => setReset(u)}><KeyRound size={16} /></button>}
                  {u.id !== me?.id && hasPerm(me, u.is_active ? 'user.delete' : 'user.edit') && (u.is_active
                    ? <button className="icon-btn" aria-label="Khóa tài khoản" data-tip="Khóa tài khoản" onClick={() => toggleActive(u)}><Lock size={16} /></button>
                    : <button className="icon-btn" aria-label="Mở khóa tài khoản" data-tip="Mở khóa tài khoản" onClick={() => toggleActive(u)}><LockOpen size={16} /></button>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {editing && <UserModal user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {reset && <ResetModal user={reset} onClose={() => setReset(null)} />}
      {permUser && <UserPermModal user={permUser} onClose={() => setPermUser(null)} />}
    </div>
  );
}

function UserModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { data: roles } = useRoles();
  const [username, setUsername] = useState(user?.username || '');
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [roleId, setRoleId] = useState(user?.default_role_id ? String(user.default_role_id) : '');
  // Phòng ban + vị trí (sơ đồ Phòng ban & Nhân sự): chọn nhóm thì gợi ý sẵn khi chưa xếp phòng; sửa lại được
  const { data: deps } = useDepartments();
  const [depId, setDepId] = useState(user?.department_id ? String(user.department_id) : '');
  const [positions, setPositions] = useState<string[]>(user?.positions ?? []);
  const [placeTouched, setPlaceTouched] = useState(!!user?.department_id);
  const dep = deps?.find((d) => String(d.id) === depId);
  const allowed = dep?.allowed_positions ?? [];
  const pickRole = (id: string) => {
    setRoleId(id);
    if (placeTouched) return;
    const s = suggestPlacement(roles?.find((r) => String(r.id) === id)?.name, deps ?? []);
    setDepId(s ? String(s.department_id) : ''); setPositions(s?.positions ?? []);
  };
  const pickDep = (id: string) => {
    setPlaceTouched(true); setDepId(id);
    const d = deps?.find((x) => String(x.id) === id);
    const keep = positions.filter((p) => (d?.allowed_positions as string[] | undefined)?.includes(p));
    setPositions(keep.length ? keep : d?.preset_position ? [d.preset_position] : []);
  };
  const depName = (id: number | null): string => {
    const d = deps?.find((x) => x.id === id);
    const parent = d && deps?.find((x) => x.id === d.parent_id);
    return !d ? '' : parent && parent.parent_id ? `${depName(parent.id)} › ${d.name}` : d.name;
  };

  const [password, setPassword] = useState(() => (user ? '' : genPassword()));
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const role = roles?.find((r) => String(r.id) === roleId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const body = { full_name: fullName, email, default_role_id: Number(roleId), department_id: depId || null, positions: depId ? positions : [] };
      if (user) {
        await api.patch(`/users/${user.id}`, body);
        toast('Đã lưu');
        onClose();
      } else {
        await api.post('/users', { ...body, username, password });
        setCreated({ username, password });
      }
      await refreshAll();
    } catch (err) { toastError(err); }
  };

  if (created) {
    const text = `Địa chỉ: ${location.origin}\nTên đăng nhập: ${created.username}\nMật khẩu: ${created.password}`;
    return (
      <Modal title="Đã tạo tài khoản" onClose={onClose} footer={<><div className="spacer" /><button className="btn btn-primary" onClick={onClose}>Xong</button></>}>
        <p>Gửi thông tin đăng nhập sau cho người dùng. Họ sẽ được yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên.</p>
        <pre className="credentials">{text}</pre>
        <button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(text); toast('Đã sao chép'); }}>Sao chép</button>
      </Modal>
    );
  }

  return (
    <Modal title={user ? `Sửa: ${user.full_name}` : 'Tạo tài khoản'} width={620} onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="user-form">{user ? 'Lưu' : 'Tạo tài khoản'}</button>
    </>}>
      <form id="user-form" className="stack" onSubmit={submit}>
        <div className="form-grid">
          <label className="field"><span>Tên đăng nhập *</span>
            <input value={username} disabled={!!user} onChange={(e) => setUsername(e.target.value.toLowerCase())} required pattern="[a-z0-9._\-]{3,50}"
              placeholder="VD: nguyen.van.a" /></label>
          <label className="field"><span>Họ tên *</span><input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>
          <label className="field"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>

          <label className="field"><span>Nhóm người dùng *</span>
            <select value={roleId} onChange={(e) => pickRole(e.target.value)} required>
              <option value="" disabled>— Chọn nhóm —</option>
              {roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select></label>
        </div>
        {role && (
          <div className="muted small">
            <b>{role.name}</b>: {role.description || ''}. {role.is_admin
              ? 'Tài khoản thuộc nhóm này là Quản trị hệ thống, luôn có toàn quyền.'
              : 'Quyền của nhóm được gán mặc định, áp dụng trên mọi dự án người dùng tham gia. Cấp thêm hoặc bỏ bớt quyền riêng bằng nút Phân quyền.'}
          </div>
        )}
        <div className="form-grid">
          <label className="field"><span>Phòng ban <small className="muted">(sơ đồ Phòng ban & Nhân sự)</small></span>
            <select value={depId} onChange={(e) => pickDep(e.target.value)}>
              <option value="">— Chưa xếp phòng ban —</option>
              {deps?.map((d) => <option key={d.id} value={d.id}>{depName(d.id)}</option>)}
            </select></label>
          {depId && <div className="field"><span>Vị trí * <small className="muted">(chọn một hoặc nhiều)</small></span>
            <div className="row gap-sm" style={{ flexWrap: 'wrap', minHeight: 34, alignItems: 'center' }}>
              {STAFF_POSITION_LABELS.filter((p) => (allowed as string[]).includes(p.key)).map((p) => (
                <label key={p.key} className="check"><input type="checkbox" checked={positions.includes(p.key)}
                  onChange={() => { setPlaceTouched(true); setPositions(positions.includes(p.key) ? positions.filter((x) => x !== p.key) : [...positions, p.key]); }} /> {p.label}</label>
              ))}
            </div></div>}
        </div>
        {!user && (
          <label className="field"><span>Mật khẩu tạm (≥ 10 ký tự, có chữ và số)</span>
            <div className="row gap-xs">
              <input className="grow" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required />
              <button type="button" className="btn" onClick={() => setPassword(genPassword())}>Tạo ngẫu nhiên</button>
            </div></label>
        )}
        {/* Không chọn dự án ở đây: vào dự án theo quyền Dự án – Xem tất cả và danh sách người tham gia của từng dự án */}
      </form>
    </Modal>
  );
}

function ResetModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState(genPassword);
  const [done, setDone] = useState(false);
  const submit = async () => {
    try { await api.post(`/users/${user.id}/reset-password`, { password }); setDone(true); } catch (e) { toastError(e); }
  };
  return (
    <Modal title={`Đặt lại mật khẩu: ${user.full_name}`} onClose={onClose} footer={<>
      <div className="spacer" />
      {done ? <button className="btn btn-primary" onClick={onClose}>Xong</button> : <>
        <button className="btn" onClick={onClose}>Hủy</button>
        <button className="btn btn-primary" onClick={submit}>Đặt lại</button>
      </>}
    </>}>
      {done ? (
        <>
          <p>Mật khẩu mới của <b>@{user.username}</b>. Người dùng sẽ phải đổi mật khẩu khi đăng nhập:</p>
          <pre className="credentials">{password}</pre>
        </>
      ) : (
        <label className="field"><span>Mật khẩu tạm mới</span>
          <div className="row gap-xs">
            <input className="grow" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} />
            <button type="button" className="btn" onClick={() => setPassword(genPassword())}>Tạo ngẫu nhiên</button>
          </div></label>
      )}
    </Modal>
  );
}

/**
 * Phân quyền riêng cho một người: bảng quyền tính sẵn theo nhóm của họ; tick thêm = cấp thêm (xanh),
 * bỏ tick quyền của nhóm = chặn (đỏ). Ô trùng với nhóm thì không lưu gì riêng.
 */
function UserPermModal({ user, onClose }: { user: User; onClose: () => void }) {
  return (
    <Modal title={`Phân quyền: ${user.full_name}`} width={980} onClose={onClose}>
      <UserPermEditor userId={user.id} onSaved={onClose} />
    </Modal>
  );
}
