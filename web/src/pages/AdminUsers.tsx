import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, refreshAll } from '../api';
import { hasPerm, useMe, useProjects, useRoles } from '../hooks';
import type { PermissionCatalog, User, UserPermView } from '../types';
import { PermMatrix } from '../components/PermMatrix';
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
        <table className="table">
          <thead><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Nhóm người dùng</th><th>Dự án tham gia</th><th>Email</th><th>Đăng nhập gần nhất</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>
            {list?.map((u) => (
              <tr key={u.id} className={u.is_active ? '' : 'inactive'}>
                <td><div className="row gap-sm"><Avatar name={u.full_name} src={u.avatar_url} size={26} /> {u.full_name}</div></td>
                <td>@{u.username}</td>
                <td className="nowrap">
                  {u.default_role_name ? <span className="lozenge lozenge-default">{u.default_role_name}</span> : <span className="small danger">Chưa chọn</span>}
                  {!!u.is_admin && <> <span className="lozenge lozenge-purple">Quản trị</span></>}
                </td>
                <td>
                  <div className="membership-chips">
                    {u.memberships.map((m) => <span key={m.project_id} className="label-chip" title={m.project_name}>{m.project_key}</span>)}
                    {!u.memberships.length && <span className="muted small">{u.is_admin ? 'Mọi dự án (quản trị)' : 'Chưa tham gia dự án'}</span>}
                  </div>
                </td>
                <td>{u.email}</td>
                <td className="small">{u.last_login_at ? fmtDateTime(u.last_login_at) : <span className="muted">Chưa đăng nhập</span>}</td>
                <td>{u.is_active ? <span className="lozenge lozenge-green">Hoạt động</span> : <span className="lozenge lozenge-red">Đã khóa</span>}</td>
                <td className="num nowrap">
                  {(hasPerm(me, 'role.view') || hasPerm(me, 'role.edit')) && <button className="btn btn-subtle btn-sm" onClick={() => setPermUser(u)}>Phân quyền</button>}
                  {hasPerm(me, 'user.edit') && <button className="btn btn-subtle btn-sm" onClick={() => setEditing(u)}>Sửa</button>}
                  {hasPerm(me, 'user.edit') && <button className="btn btn-subtle btn-sm" onClick={() => setReset(u)}>Đặt lại mật khẩu</button>}
                  {u.id !== me?.id && hasPerm(me, u.is_active ? 'user.delete' : 'user.edit') && <button className="btn btn-subtle btn-sm" onClick={() => toggleActive(u)}>{u.is_active ? 'Khóa' : 'Mở khóa'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && <UserModal user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {reset && <ResetModal user={reset} onClose={() => setReset(null)} />}
      {permUser && <UserPermModal user={permUser} onClose={() => setPermUser(null)} />}
    </div>
  );
}

function UserModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { data: me } = useMe();
  const { data: projects } = useProjects();
  const { data: roles } = useRoles();
  const [username, setUsername] = useState(user?.username || '');
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isAdmin, setIsAdmin] = useState(!!user?.is_admin);
  const [roleId, setRoleId] = useState(user?.default_role_id ? String(user.default_role_id) : '');
  const [projectIds, setProjectIds] = useState<number[]>(() => user?.memberships.map((m) => m.project_id) ?? []);
  const [password, setPassword] = useState(() => (user ? '' : genPassword()));
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const role = roles?.find((r) => String(r.id) === roleId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const body = { full_name: fullName, email, is_admin: isAdmin, default_role_id: Number(roleId), project_ids: projectIds };
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
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
              <option value="" disabled>— Chọn nhóm —</option>
              {roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select></label>
        </div>
        {role && (
          <div className="muted small">
            <b>{role.name}</b>: {role.description || ''}. Quyền của nhóm được gán mặc định, áp dụng trên mọi dự án người dùng tham gia. Cấp thêm hoặc bỏ bớt quyền riêng bằng nút Phân quyền.
          </div>
        )}
        {!user && (
          <label className="field"><span>Mật khẩu tạm (≥ 10 ký tự, có chữ và số)</span>
            <div className="row gap-xs">
              <input className="grow" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required />
              <button type="button" className="btn" onClick={() => setPassword(genPassword())}>Tạo ngẫu nhiên</button>
            </div></label>
        )}
        <div className="field"><span>Dự án được tham gia</span>
          <div className="check-list">
            {projects?.map((p) => (
              <label key={p.id} className="check">
                <input type="checkbox" checked={projectIds.includes(p.id)}
                  onChange={(e) => setProjectIds(e.target.checked ? [...projectIds, p.id] : projectIds.filter((x) => x !== p.id))} />
                {p.name} <span className="muted small">({p.key})</span>
              </label>
            ))}
            {!projects?.length && <div className="muted small">Chưa có dự án nào. Tạo dự án ở mục Tất cả dự án rồi quay lại thêm sau.</div>}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={isAdmin} disabled={user?.id === me?.id} onChange={(e) => setIsAdmin(e.target.checked)} />
          <span>Quản trị hệ thống <small className="muted">(toàn quyền: quản lý người dùng, phân quyền, tạo dự án, truy cập mọi dự án)</small></span>
        </label>
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
  const { data: me } = useMe();
  const { data: catalog } = useQuery<PermissionCatalog>({ queryKey: ['permissions'], queryFn: () => api.get('/permissions') });
  const { data: view } = useQuery<UserPermView>({ queryKey: ['user-perms', user.id], queryFn: () => api.get(`/users/${user.id}/permissions`) });
  const [overrides, setOverrides] = useState<Record<string, 'allow' | 'deny'> | null>(null);
  const cur = overrides ?? view?.overrides ?? {};
  const group = new Set(view?.group ?? []);
  const has = (p: string) => (cur[p] === 'allow' ? true : cur[p] === 'deny' ? false : group.has(p));
  const onSet = (perms: string[], value: boolean) => {
    const n = { ...cur };
    for (const p of perms) {
      if (value === group.has(p)) delete n[p]; // trùng quyền nhóm → không cần ghi riêng
      else n[p] = value ? 'allow' : 'deny';
    }
    setOverrides(n);
  };
  const save = async () => {
    try {
      await api.put(`/users/${user.id}/permissions`, { overrides: cur });
      toast(`Đã lưu phân quyền của ${user.full_name}`);
      await refreshAll();
      onClose();
    } catch (e) { toastError(e); }
  };
  const canEdit = hasPerm(me, 'role.edit') && !view?.is_admin;
  const nAllow = Object.values(cur).filter((v) => v === 'allow').length;
  const nDeny = Object.values(cur).filter((v) => v === 'deny').length;

  return (
    <Modal title={`Phân quyền: ${user.full_name}`} width={980} onClose={onClose} footer={<>
      {canEdit && (nAllow + nDeny > 0) && <button className="btn btn-subtle" onClick={() => setOverrides({})}>Khôi phục theo nhóm</button>}
      <div className="spacer" />
      <button className="btn" onClick={onClose}>{canEdit ? 'Hủy' : 'Đóng'}</button>
      {canEdit && <button className="btn btn-primary" onClick={save}>Lưu</button>}
    </>}>
      {!catalog || !view ? <Spinner /> : (
        <div className="stack">
          <div className="perm-legend small">
            <span>Nhóm người dùng: <b>{view.role_name || 'Chưa có'}</b></span>
            <span><i style={{ background: 'var(--surface)' }} />Theo nhóm</span>
            <span><i style={{ background: 'var(--st-done-bg)' }} />Cấp thêm riêng ({nAllow})</span>
            <span><i style={{ background: 'var(--red-bg)' }} />Chặn riêng ({nDeny})</span>
          </div>
          {view.is_admin && <div className="form-error">Tài khoản Quản trị hệ thống luôn có toàn quyền; phân quyền riêng không áp dụng.</div>}
          <PermMatrix catalog={catalog} has={has} onSet={onSet} mark={(p) => cur[p]} readOnly={!canEdit} />
          <p className="muted small">Tick thêm ô chưa có trong nhóm để cấp thêm quyền; bỏ tick ô của nhóm để chặn quyền đó với riêng người này. Đổi quyền của nhóm thì người này vẫn giữ phần cấp thêm/chặn riêng.</p>
        </div>
      )}
    </Modal>
  );
}
