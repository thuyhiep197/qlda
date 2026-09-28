import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, refreshAll } from '../api';
import { useMe } from '../hooks';
import type { User } from '../types';
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
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [reset, setReset] = useState<User | null>(null);
  const [filter, setFilter] = useState('');

  const toggleActive = async (u: User) => {
    if (u.is_active && !confirm(`Khóa tài khoản ${u.full_name}? Người dùng sẽ không đăng nhập được nữa.`)) return;
    try { await api.patch(`/users/${u.id}`, { is_active: !u.is_active }); await refreshAll(); } catch (e) { toastError(e); }
  };

  const list = users?.filter((u) => !filter || `${u.full_name} ${u.username} ${u.email || ''}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Người dùng</h1>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Tạo tài khoản</button>
      </div>
      <input className="filter-input" placeholder="Tìm theo tên, tên đăng nhập, email" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {isLoading ? <Spinner /> : (
        <table className="table">
          <thead><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Email</th><th>Quyền hệ thống</th><th className="num">Số dự án</th><th>Đăng nhập gần nhất</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>
            {list?.map((u) => (
              <tr key={u.id} className={u.is_active ? '' : 'inactive'}>
                <td><div className="row gap-sm"><Avatar name={u.full_name} size={26} /> {u.full_name}</div></td>
                <td>@{u.username}</td>
                <td>{u.email}</td>
                <td>{u.is_admin ? <span className="lozenge lozenge-purple">Quản trị hệ thống</span> : 'Người dùng'}</td>
                <td className="num">{u.project_count}</td>
                <td className="small">{u.last_login_at ? fmtDateTime(u.last_login_at) : <span className="muted">Chưa đăng nhập</span>}</td>
                <td>{u.is_active ? <span className="lozenge lozenge-green">Hoạt động</span> : <span className="lozenge lozenge-red">Đã khóa</span>}</td>
                <td className="num nowrap">
                  <button className="btn btn-subtle btn-sm" onClick={() => setEditing(u)}>Sửa</button>
                  <button className="btn btn-subtle btn-sm" onClick={() => setReset(u)}>Đặt lại mật khẩu</button>
                  {u.id !== me?.id && <button className="btn btn-subtle btn-sm" onClick={() => toggleActive(u)}>{u.is_active ? 'Khóa' : 'Mở khóa'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && <UserModal user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {reset && <ResetModal user={reset} onClose={() => setReset(null)} />}
    </div>
  );
}

function UserModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { data: me } = useMe();
  const [username, setUsername] = useState(user?.username || '');
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isAdmin, setIsAdmin] = useState(!!user?.is_admin);
  const [password, setPassword] = useState(() => (user ? '' : genPassword()));
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (user) {
        await api.patch(`/users/${user.id}`, { full_name: fullName, email, is_admin: isAdmin });
        toast('Đã lưu');
        onClose();
      } else {
        await api.post('/users', { username, full_name: fullName, email, is_admin: isAdmin, password });
        setCreated({ username, password });
      }
      await refreshAll();
    } catch (err) { toastError(err); }
  };

  if (created) {
    return (
      <Modal title="Đã tạo tài khoản" onClose={onClose} footer={<><div className="spacer" /><button className="btn btn-primary" onClick={onClose}>Xong</button></>}>
        <p>Gửi thông tin đăng nhập sau cho người dùng. Họ sẽ được yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên.</p>
        <pre className="credentials">{`Địa chỉ: ${location.origin}\nTên đăng nhập: ${created.username}\nMật khẩu: ${created.password}`}</pre>
        <button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(`Địa chỉ: ${location.origin}\nTên đăng nhập: ${created.username}\nMật khẩu: ${created.password}`); toast('Đã sao chép'); }}>Sao chép</button>
      </Modal>
    );
  }

  return (
    <Modal title={user ? `Sửa: ${user.full_name}` : 'Tạo tài khoản'} onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="user-form">{user ? 'Lưu' : 'Tạo tài khoản'}</button>
    </>}>
      <form id="user-form" className="stack" onSubmit={submit}>
        <label className="field"><span>Tên đăng nhập *</span>
          <input value={username} disabled={!!user} onChange={(e) => setUsername(e.target.value.toLowerCase())} required pattern="[a-z0-9._\-]{3,50}"
            placeholder="VD: nguyen.van.a" /></label>
        <label className="field"><span>Họ tên *</span><input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>
        <label className="field"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {!user && (
          <label className="field"><span>Mật khẩu tạm (tối thiểu 8 ký tự)</span>
            <div className="row gap-xs">
              <input className="grow" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
              <button type="button" className="btn" onClick={() => setPassword(genPassword())}>Tạo ngẫu nhiên</button>
            </div></label>
        )}
        <label className="check">
          <input type="checkbox" checked={isAdmin} disabled={user?.id === me?.id} onChange={(e) => setIsAdmin(e.target.checked)} />
          <span>Quản trị hệ thống <small className="muted">(toàn quyền: quản lý người dùng, vai trò, tạo dự án, truy cập mọi dự án)</small></span>
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
            <input className="grow" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
            <button type="button" className="btn" onClick={() => setPassword(genPassword())}>Tạo ngẫu nhiên</button>
          </div></label>
      )}
    </Modal>
  );
}
