import { Fragment, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Lock, LockOpen, Pencil, ShieldCheck } from 'lucide-react';
import { api, refreshAll } from '../api';
import { canManageAccountPermissions, hasPerm, useDepartments, useMe, useRoles } from '../hooks';
import { suggestPlacement } from '../people';
import { matchAccount, suggestAccounts, userRowGroups } from '../user-groups';
import { STAFF_POSITION_LABELS } from '../util';
import type { User } from '../types';
import { UserPermEditor } from '../components/UserPermEditor';
import { fmtDateTime } from '../util';
import { Avatar, Modal, Spinner, toast, toastError } from '../components/ui';
import { HelpButton } from '../help/HelpMenu';

const genPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(arr, (n) => chars[n % chars.length]).join('') + '@1';
};

const BY_ROLE_KEY = 'qlda:users-by-role';

/** Ô tìm tài khoản: gõ đến đâu hiện gợi ý đến đó (không phân biệt dấu); bấm hoặc ↑ ↓ Enter để chọn, Esc để đóng */
function AccountSearch({ users, value, onChange, onPick }: {
  users: User[]; value: string; onChange: (v: string) => void; onPick: (u: User) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = open ? suggestAccounts(users, value) : [];
  const pick = (u: User) => { onPick(u); setOpen(false); };
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!hits.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(hits[Math.min(active, hits.length - 1)]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  return (
    <div className="account-search">
      <input className="filter-search" style={{ width: 300 }} placeholder="Tìm theo tên, tên đăng nhập, email" value={value} onKeyDown={keys}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} />
      {hits.length > 0 && (
        <div className="picker-pop account-search-pop" role="listbox">
          {hits.map((u, i) => (
            // onMouseDown + preventDefault: chọn trước khi ô tìm mất focus (blur đóng gợi ý)
            <button type="button" key={u.id} role="option" aria-selected={i === active} className={`picker-item ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(u); }}>
              <Avatar name={u.full_name} src={u.avatar_url} size={22} />
              <span className="grow ellipsis">{u.full_name} <span className="muted small">@{u.username}</span></span>
              {u.department_name && <span className="muted small ellipsis">{u.department_name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminUsers() {
  const { data: me } = useMe();
  const { data: users, isLoading } = useQuery<User[]>({ queryKey: ['users'], queryFn: () => api.get('/users') });
  const { data: roles } = useRoles();
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [reset, setReset] = useState<User | null>(null);
  const [permUser, setPermUser] = useState<User | null>(null);
  const [filter, setFilter] = useState('');
  // Tài khoản chọn từ gợi ý: bảng chỉ còn người đó (gõ tiếp thì bỏ chọn, lọc lại theo chữ)
  const [picked, setPicked] = useState<number | null>(null);
  const [roleFilter, setRoleFilter] = useState('');
  // Xếp theo nhóm người dùng, mỗi nhóm cách nhau một dòng trắng — nhớ trên từng máy
  const [byRole, setByRoleState] = useState(() => { try { return localStorage.getItem(BY_ROLE_KEY) === '1'; } catch { return false; } });
  const setByRole = (v: boolean) => { setByRoleState(v); try { localStorage.setItem(BY_ROLE_KEY, v ? '1' : '0'); } catch { /* bỏ qua */ } };

  const logoutAll = async () => {
    if (!confirm('Thu hồi phiên đăng nhập của TẤT CẢ mọi người (trừ bạn)? Mọi người phải đăng nhập lại. Dùng khi nghi tài khoản bị chiếm.')) return;
    try { const r = await api.post<{ count: number }>('/users/logout-all'); toast(`Đã đăng xuất ${r.count} tài khoản`); } catch (e) { toastError(e); }
  };

  const toggleActive = async (u: User) => {
    if (u.is_active && !confirm(`Khóa tài khoản ${u.full_name}? Người dùng sẽ không đăng nhập được nữa.`)) return;
    try { await api.patch(`/users/${u.id}`, { is_active: !u.is_active }); await refreshAll(); } catch (e) { toastError(e); }
  };

  const list = users?.filter((u) =>
    (picked != null ? u.id === picked : matchAccount(u, filter)) &&
    (!roleFilter || (roleFilter === 'none' ? !u.default_role_id : String(u.default_role_id) === roleFilter)));
  const missingRole = users?.filter((u) => !u.default_role_id).length ?? 0;
  // Không ai khớp ô tìm (VD đang gõ dở "Hoafng") → không có nhóm nào, bảng trống
  const groups = userRowGroups(list, byRole, roles ?? []);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Người dùng <HelpButton /></h1>
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
        <AccountSearch users={users ?? []} value={filter} onChange={(v) => { setFilter(v); setPicked(null); }}
          onPick={(u) => { setFilter(u.full_name); setPicked(u.id); }} />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">Mọi nhóm</option>
          {roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          <option value="none">Chưa có nhóm</option>
        </select>
        <label className="check small" data-tip="Xếp tài khoản theo nhóm người dùng, mỗi nhóm cách nhau một dòng trắng">
          <input type="checkbox" className="switch" checked={byRole} onChange={(e) => setByRole(e.target.checked)} /> Xếp theo nhóm
        </label>
        <span className="muted small">{list?.length ?? 0} tài khoản</span>
      </div>
      {isLoading ? <Spinner /> : (
        // Bảng gọn: cột co theo nội dung, dự án tham gia xếp ngang; thao tác là biểu tượng (rê chuột xem tên)
        <div className="table-wrap">
        <table className="table users-table">
          <thead><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Phòng ban</th><th>Nhóm người dùng</th><th>Email</th><th>Đăng nhập gần nhất</th><th>Trạng thái</th><th className="num">Thao tác</th></tr></thead>
          <tbody>
            {groups.map((group, gi) => <Fragment key={group[0].default_role_id ?? 'none'}>
            {byRole && <tr className={`group-gap ${gi > 0 ? 'spaced' : ''}`}>
              <td colSpan={8}>{group[0].default_role_name ?? 'Chưa có nhóm'} <span className="muted">· {group.length}</span></td>
            </tr>}
            {group.map((u) => (
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
                  {hasPerm(me, 'role.view') && <button className="icon-btn" aria-label="Phân quyền" data-tip="Phân quyền" onClick={() => setPermUser(u)}><ShieldCheck size={16} /></button>}
                  {/* Tài khoản Quản trị hệ thống: chỉ quản trị hệ thống được sửa, đặt lại mật khẩu, khóa / mở khóa */}
                  {hasPerm(me, 'user.edit') && (!u.is_admin || !!me?.is_admin) && <button className="icon-btn" aria-label="Sửa" data-tip="Sửa" onClick={() => setEditing(u)}><Pencil size={16} /></button>}
                  {hasPerm(me, 'user.edit') && (!u.is_admin || !!me?.is_admin) && <button className="icon-btn" aria-label="Đặt lại mật khẩu" data-tip="Đặt lại mật khẩu" onClick={() => setReset(u)}><KeyRound size={16} /></button>}
                  {u.id !== me?.id && hasPerm(me, u.is_active ? 'user.delete' : 'user.edit') && (!u.is_admin || !!me?.is_admin) && (u.is_active
                    ? <button className="icon-btn" aria-label="Khóa tài khoản" data-tip="Khóa tài khoản" onClick={() => toggleActive(u)}><Lock size={16} /></button>
                    : <button className="icon-btn" aria-label="Mở khóa tài khoản" data-tip="Mở khóa tài khoản" onClick={() => toggleActive(u)}><LockOpen size={16} /></button>)}
                </td>
              </tr>
            ))}
            </Fragment>)}
            {!groups.length && <tr><td colSpan={8} className="muted">Không có tài khoản nào khớp</td></tr>}
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
  const { data: me } = useMe();
  const { data: allRoles } = useRoles();
  // Người có đủ quyền quản lý tài khoản được gán mọi nhóm thường; người khác chỉ gán nhóm nằm trong quyền của mình.
  // Nhóm Quản trị hệ thống và việc tự đổi nhóm vẫn dành riêng cho quản trị hệ thống.
  const roles = allRoles?.filter((r) => !!me?.is_admin || (!r.is_admin && canManageAccountPermissions(me)) || r.id === user?.default_role_id
    || (!r.is_admin && r.permissions.every((p) => hasPerm(me, p))));
  const ownRole = !me?.is_admin && user?.id === me?.id;
  // Phòng ban + vị trí: bắt buộc khi tạo tài khoản (nằm trong Tài khoản – Thêm); sửa lại sau cần Nhân sự – Sửa
  const canPlace = !user || hasPerm(me, 'staff.edit');
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
  // Tài khoản Quản trị hệ thống không nằm trong sơ đồ Phòng ban & Nhân sự nên không bắt buộc
  const needPlace = !user && !role?.is_admin;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (canPlace && depId && !positions.length) { toastError(new Error('Chọn ít nhất một vị trí')); return; }
    try {
      const body = { full_name: fullName, email, default_role_id: Number(roleId), ...(canPlace ? { department_id: depId || null, positions: depId ? positions : [] } : {}) };
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
            <select value={roleId} onChange={(e) => pickRole(e.target.value)} required disabled={ownRole} data-tip={ownRole ? 'Không tự đổi nhóm của chính mình' : undefined}>
              <option value="" disabled>— Chọn nhóm —</option>
              {roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select></label>
        </div>
        {role && (
          <div className="muted small">
            <b>{role.name}</b>: {role.description || ''}. {role.is_admin
              ? 'Tài khoản thuộc nhóm này là Quản trị hệ thống, luôn có toàn quyền.'
              : 'Quyền của nhóm được gán mặc định, áp dụng trên mọi dự án người dùng tham gia. Cấp thêm quyền riêng bằng nút Phân quyền.'}
          </div>
        )}
        {canPlace && <div className="form-grid">
          <label className="field"><span>Phòng ban{needPlace ? ' *' : ''} <small className="muted">(sơ đồ Phòng ban & Nhân sự)</small></span>
            <select value={depId} onChange={(e) => pickDep(e.target.value)} required={needPlace}>
              <option value="" disabled={needPlace}>{needPlace ? '— Chọn phòng ban —' : '— Chưa xếp phòng ban —'}</option>
              {deps?.map((d) => <option key={d.id} value={d.id}>{depName(d.id)}</option>)}
            </select></label>
          {depId && <div className="field"><span>Vị trí * <small className="muted">(chọn một hoặc nhiều)</small></span>
            <div className="row gap-sm" style={{ flexWrap: 'wrap', minHeight: 34, alignItems: 'center' }}>
              {STAFF_POSITION_LABELS.filter((p) => (allowed as string[]).includes(p.key)).map((p) => (
                <label key={p.key} className="check"><input type="checkbox" checked={positions.includes(p.key)}
                  onChange={() => { setPlaceTouched(true); setPositions(positions.includes(p.key) ? positions.filter((x) => x !== p.key) : [...positions, p.key]); }} /> {p.label}</label>
              ))}
            </div></div>}
        </div>}
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
  const [password, setPassword] = useState<string | null>(null);
  const submit = async () => {
    try { setPassword((await api.post<{ password: string }>(`/users/${user.id}/reset-password`)).password); } catch (e) { toastError(e); }
  };
  return (
    <Modal title={`Đặt lại mật khẩu: ${user.full_name}`} onClose={onClose} footer={<>
      <div className="spacer" />
      {password ? <button className="btn btn-primary" onClick={onClose}>Xong</button> : <>
        <button className="btn" onClick={onClose}>Hủy</button>
        <button className="btn btn-primary" onClick={submit}>Đặt lại</button>
      </>}
    </>}>
      {password ? (
        <>
          <p>Mật khẩu mới của <b>@{user.username}</b>. Người dùng sẽ phải đổi mật khẩu khi đăng nhập:</p>
          <pre className="credentials">{password}</pre>
        </>
      ) : (
        <p>Mật khẩu của <b>@{user.username}</b> sẽ được đặt về mật khẩu tạm mặc định <b>qlda@868686</b>. Người dùng sẽ phải đổi mật khẩu khi đăng nhập.</p>
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
