import { useState, type FormEvent } from 'react';
import { api, errMsg, queryClient } from '../api';
import { toast } from '../components/ui';

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) return setError('Mật khẩu nhập lại không khớp');
    setBusy(true);
    try {
      await api.post('/auth/change-password', { current_password: cur, new_password: next });
      toast('Đã đổi mật khẩu');
      setCur(''); setNext(''); setConfirm('');
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      onDone?.();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack">
      <label className="field"><span>Mật khẩu hiện tại</span>
        <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required /></label>
      <label className="field"><span>Mật khẩu mới (tối thiểu 8 ký tự)</span>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
      <label className="field"><span>Nhập lại mật khẩu mới</span>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required /></label>
      {error && <div className="form-error">{error}</div>}
      <div><button className="btn btn-primary" disabled={busy}>Đổi mật khẩu</button></div>
    </form>
  );
}

export default function ChangePassword({ forced }: { forced?: boolean }) {
  const logout = async () => {
    await api.post('/auth/logout');
    queryClient.setQueryData(['me'], null);
  };
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-title">Đổi mật khẩu</div>
        {forced && <p className="muted">Đây là lần đăng nhập đầu tiên hoặc mật khẩu vừa được cấp lại. Vui lòng đặt mật khẩu mới để tiếp tục.</p>}
        <ChangePasswordForm />
        <button className="btn btn-link" onClick={logout}>Đăng xuất</button>
      </div>
    </div>
  );
}
