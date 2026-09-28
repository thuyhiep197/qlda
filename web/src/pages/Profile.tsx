import { useState, type FormEvent } from 'react';
import { api, queryClient } from '../api';
import { useMe } from '../hooks';
import { toast, toastError } from '../components/ui';
import { ChangePasswordForm } from './ChangePassword';

export default function Profile() {
  const { data: me } = useMe();
  const [fullName, setFullName] = useState(me?.full_name || '');
  const [email, setEmail] = useState(me?.email || '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.patch('/auth/profile', { full_name: fullName, email });
      toast('Đã lưu hồ sơ');
      await queryClient.invalidateQueries();
    } catch (err) { toastError(err); }
  };

  return (
    <div className="page">
      <h1>Hồ sơ cá nhân</h1>
      <div className="two-col">
        <form className="card stack" onSubmit={submit}>
          <h3>Thông tin</h3>
          <label className="field"><span>Tên đăng nhập</span><input value={me?.username || ''} disabled /></label>
          <label className="field"><span>Họ tên</span><input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>
          <label className="field"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <div><button className="btn btn-primary">Lưu</button></div>
        </form>
        <div className="card">
          <h3>Đổi mật khẩu</h3>
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  );
}
