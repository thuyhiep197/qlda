import { useRef, useState, type FormEvent } from 'react';
import { api, errMsg, queryClient } from '../api';
import { PasswordInput } from '../components/fields';
import { ACCENT_LOGIN_HINT, hasAccent } from '../password';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Đang gửi thì bỏ qua lần gửi tiếp (giữ Enter / bấm nhiều lần từng gửi nhiều yêu cầu cách nhau vài ms → mỗi lần bị tính một lần sai)
  const sending = useRef(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/login', { username, password });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">
          <img src="/favicon.svg" width={40} height={40} alt="" />
          <div>
            <div className="auth-title">QLDA</div>
            <div className="muted">Hệ thống quản lý dự án nội bộ</div>
          </div>
        </div>
        <label className="field">
          <span>Tên đăng nhập</span>
          <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          <span>Mật khẩu</span>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          {hasAccent(password) && <span className="muted small">{ACCENT_LOGIN_HINT}</span>}
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        <div className="muted small center">Quên mật khẩu? Liên hệ quản trị viên để được cấp lại.</div>
      </form>
    </div>
  );
}
