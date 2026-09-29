import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errMsg, queryClient } from '../api';
import { useMe } from '../hooks';
import type { Me } from '../types';
import { applyTheme, type ThemePref } from '../theme';
import { fmtDateTime } from '../util';
import { Avatar, toast, toastError } from '../components/ui';
import { ChangePasswordForm } from './ChangePassword';
import { Bell, Lock, Palette, UserRound, type LucideIcon } from 'lucide-react';

type Tab = 'profile' | 'appearance' | 'notifications' | 'security';
const TABS: [Tab, string, LucideIcon][] = [
  ['profile', 'Hồ sơ', UserRound],
  ['appearance', 'Giao diện', Palette],
  ['notifications', 'Thông báo', Bell],
  ['security', 'Bảo mật', Lock],
];

/** Cài đặt tài khoản cá nhân (như "Personal settings" của Jira). */
export default function Profile() {
  const { data: me } = useMe();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'profile';
  if (!me) return null;
  return (
    <div className="page">
      <div className="account-head">
        <Avatar name={me.full_name} size={56} />
        <div>
          <h1>{me.full_name}</h1>
          <div className="muted">@{me.username}{me.role_name ? ` · ${me.role_name}` : ''}{me.is_admin ? ' · Quản trị hệ thống' : ''}</div>
        </div>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav">
          {TABS.map(([k, label, Icon]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setParams({ tab: k }, { replace: true })}><Icon size={16} /> {label}</button>
          ))}
        </nav>
        <div className="settings-body">
          {tab === 'profile' && <ProfileTab me={me} />}
          {tab === 'appearance' && <AppearanceTab me={me} />}
          {tab === 'notifications' && <NotificationsTab me={me} />}
          {tab === 'security' && <SecurityTab me={me} />}
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ me }: { me: Me }) {
  const [fullName, setFullName] = useState(me.full_name);
  const [email, setEmail] = useState(me.email || '');
  const [phone, setPhone] = useState(me.phone || '');
  const [jobTitle, setJobTitle] = useState(me.job_title || '');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch('/auth/profile', { full_name: fullName, email, phone, job_title: jobTitle });
      toast('Đã lưu hồ sơ');
      await queryClient.invalidateQueries();
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h3>Thông tin cá nhân</h3>
      <div className="form-grid">
        <label className="field"><span>Họ tên *</span><input value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={100} /></label>
        <label className="field"><span>Chức danh</span><input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="VD: Business Analyst" maxLength={100} /></label>
        <label className="field"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span>Điện thoại</span><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="VD: 0912 345 678" /></label>
      </div>
      <div className="form-grid">
        <label className="field"><span>Tên đăng nhập</span><input value={me.username} disabled /></label>
        <label className="field" data-tip="Vai trò do quản trị hệ thống gán, quyết định quyền trên các dự án"><span>Vai trò</span><input value={me.role_name || '—'} disabled /></label>
      </div>
      <div className="muted small">
        Tài khoản tạo lúc {fmtDateTime(me.created_at)}{me.last_login_at ? ` · Đăng nhập gần nhất ${fmtDateTime(me.last_login_at)}` : ''}
      </div>
      <div><button className="btn btn-primary" disabled={busy}>Lưu</button></div>
    </form>
  );
}

const THEMES: { key: ThemePref; label: string; hint: string }[] = [
  { key: 'light', label: 'Sáng', hint: 'Nền sáng, phù hợp văn phòng' },
  { key: 'dark', label: 'Tối', hint: 'Nền tối, dịu mắt khi làm lâu hoặc buổi tối' },
  { key: 'system', label: 'Theo hệ thống', hint: 'Tự đổi theo chế độ sáng/tối của máy tính' },
];

async function savePrefs(body: Record<string, unknown>) {
  await api.put('/auth/preferences', body);
  await queryClient.invalidateQueries({ queryKey: ['me'] });
}

function AppearanceTab({ me }: { me: Me }) {
  const cur = me.preferences?.theme || 'system';
  const pick = async (t: ThemePref) => {
    applyTheme(t);
    try { await savePrefs({ theme: t }); toast('Đã đổi giao diện'); } catch (e) { toastError(e); }
  };
  return (
    <div className="card stack">
      <h3>Giao diện</h3>
      <p className="muted small">Lựa chọn được lưu theo tài khoản — đăng nhập trên máy khác vẫn giữ nguyên.</p>
      <div className="theme-cards">
        {THEMES.map((t) => (
          <button key={t.key} type="button" className={`theme-card ${cur === t.key ? 'active' : ''}`} onClick={() => pick(t.key)} aria-pressed={cur === t.key}>
            <span className={`theme-preview theme-preview-${t.key}`}><i /><i /><i /></span>
            <b>{t.label}</b>
            <span className="muted small">{t.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const NOTIFY: { key: 'mention' | 'assigned' | 'comment' | 'status'; label: string }[] = [
  { key: 'mention', label: 'Có người @nhắc đến tôi' },
  { key: 'assigned', label: 'Tôi được giao một issue' },
  { key: 'comment', label: 'Issue tôi theo dõi có bình luận mới' },
  { key: 'status', label: 'Issue tôi theo dõi đổi trạng thái' },
];

function NotificationsTab({ me }: { me: Me }) {
  const on = (k: string) => (me.preferences?.notify as Record<string, boolean> | undefined)?.[k] !== false;
  const toggle = async (k: string, v: boolean) => {
    try { await savePrefs({ notify: { [k]: v } }); } catch (e) { toastError(e); }
  };
  return (
    <div className="card stack">
      <h3>Thông báo trên chuông</h3>
      <p className="muted small">Chọn những thông báo muốn nhận. Tắt một loại thì chuông không báo loại đó nữa (các thông báo đã có vẫn giữ nguyên).</p>
      {NOTIFY.map((n) => (
        <label key={n.key} className="switch-row">
          <span>{n.label}</span>
          <input type="checkbox" className="switch" checked={on(n.key)} onChange={(e) => toggle(n.key, e.target.checked)} />
        </label>
      ))}
    </div>
  );
}

function SecurityTab({ me }: { me: Me }) {
  const [busy, setBusy] = useState(false);
  const logoutOthers = async () => {
    if (!confirm('Đăng xuất tài khoản khỏi mọi máy tính/điện thoại khác? Phiên trên máy này vẫn giữ.')) return;
    setBusy(true);
    try { await api.post('/auth/logout-others'); toast('Đã đăng xuất các thiết bị khác'); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <div className="card">
        <h3>Đổi mật khẩu</h3>
        <ChangePasswordForm />
        <p className="muted small mt-sm">Đổi mật khẩu sẽ đăng xuất tài khoản trên các thiết bị khác.</p>
      </div>
      <div className="card stack">
        <h3>Phiên đăng nhập</h3>
        <p className="muted small">
          Nếu từng đăng nhập trên máy lạ hoặc nghi ngờ lộ mật khẩu, hãy đăng xuất khỏi mọi thiết bị khác và đổi mật khẩu.
          {me.last_login_at ? ` Lần đăng nhập gần nhất: ${fmtDateTime(me.last_login_at)}.` : ''}
        </p>
        <div><button className="btn" disabled={busy} onClick={logoutOthers}>Đăng xuất khỏi mọi thiết bị khác</button></div>
      </div>
    </div>
  );
}
