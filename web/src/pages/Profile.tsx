import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errMsg, queryClient } from '../api';
import { useMe } from '../hooks';
import type { Me } from '../types';
import { applyTheme, type ThemePref } from '../theme';
import { useQuery } from '@tanstack/react-query';
import { fmtDate, fmtDateTime } from '../util';
import { Avatar, toast, toastError } from '../components/ui';
import { ChangePasswordForm } from './ChangePassword';
import { Bell, Lock, Palette, UserRound, type LucideIcon } from 'lucide-react';
import { validateAvatarFile } from '../avatar-client';

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
        <Avatar name={me.full_name} src={me.avatar_url} size={56} />
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
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => avatarFile ? URL.createObjectURL(avatarFile) : null, [avatarFile]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const pickAvatar = (file?: File) => {
    if (!file) return;
    const error = validateAvatarFile(file);
    if (error) { toast(error, 'error'); return; }
    setAvatarFile(file);
  };
  const saveAvatar = async () => {
    if (!avatarFile) return;
    setAvatarBusy(true);
    try {
      const body = new FormData(); body.append('avatar', avatarFile);
      await api.post('/auth/avatar', body);
      setAvatarFile(null); toast('Đã cập nhật ảnh đại diện'); await queryClient.invalidateQueries();
    } catch (e) { toastError(e); } finally { setAvatarBusy(false); }
  };
  const removeAvatar = async () => {
    setAvatarBusy(true);
    try { await api.del('/auth/avatar'); setAvatarFile(null); toast('Đã xóa ảnh đại diện'); await queryClient.invalidateQueries(); }
    catch (e) { toastError(e); } finally { setAvatarBusy(false); }
  };
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
      <div className="avatar-editor">
        <Avatar name={me.full_name} src={preview || me.avatar_url} size={72} />
        <div className="avatar-editor-actions">
          <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pickAvatar(e.target.files?.[0])} />
          <div className="row gap-sm wrap">
            <button type="button" className="btn btn-sm" disabled={avatarBusy} onClick={() => input.current?.click()}>Đổi ảnh</button>
            {avatarFile && <button type="button" className="btn btn-primary btn-sm" disabled={avatarBusy} onClick={saveAvatar}>Lưu ảnh</button>}
            {(me.avatar_url || avatarFile) && <button type="button" className="btn btn-subtle btn-sm danger" disabled={avatarBusy} onClick={avatarFile ? () => setAvatarFile(null) : removeAvatar}>{avatarFile ? 'Hủy' : 'Xóa ảnh'}</button>}
          </div>
          <span className="muted small">JPEG, PNG hoặc WebP · tối đa 2 MB</span>
        </div>
      </div>
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

const NOTIFY: { key: 'mention' | 'assigned' | 'comment' | 'status' | 'flag'; label: string }[] = [
  { key: 'mention', label: 'Có người @nhắc đến tôi' },
  { key: 'assigned', label: 'Tôi được giao một issue' },
  { key: 'comment', label: 'Issue tôi theo dõi có bình luận mới' },
  { key: 'status', label: 'Issue tôi theo dõi đổi trạng thái' },
  { key: 'flag', label: 'Issue của tôi / tôi theo dõi được đánh dấu quan trọng' },
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
      <ApiKeysCard />
    </div>
  );
}

interface ApiKey { id: number; name: string; prefix: string; created_at: string; expires_at: string | null; last_used_at: string | null; last_used_ip: string | null }

/** API key cá nhân cho trợ lý AI (MCP) / script: gọi API với quyền của chính mình, không cần mật khẩu. */
function ApiKeysCard() {
  const { data: keys = [], refetch } = useQuery<ApiKey[]>({ queryKey: ['api-keys'], queryFn: () => api.get('/auth/api-keys') });
  const [name, setName] = useState('');
  const [days, setDays] = useState('90');
  // Key đang hiện nguyên văn (vừa tạo hoặc bấm Xem), theo id
  const [shown, setShown] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const k = await api.post<{ id: number; key: string }>('/auth/api-keys', { name, expires_days: Number(days) });
      setShown((s) => ({ ...s, [k.id]: k.key })); setName(''); await refetch();
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };
  const reveal = async (k: ApiKey) => {
    if (shown[k.id]) { setShown(({ [k.id]: _, ...s }) => s); return; }
    try { const r = await api.get<{ key: string }>(`/auth/api-keys/${k.id}/reveal`); setShown((s) => ({ ...s, [k.id]: r.key })); } catch (err) { toastError(err); }
  };
  const copy = async (k: ApiKey) => {
    try {
      const key = shown[k.id] ?? (await api.get<{ key: string }>(`/auth/api-keys/${k.id}/reveal`)).key;
      await navigator.clipboard?.writeText(key); toast('Đã sao chép API key');
    } catch (err) { toastError(err); }
  };
  const revoke = async (k: ApiKey) => {
    if (!confirm(`Thu hồi API key "${k.name}"? Công cụ đang dùng key này sẽ không truy cập được nữa.`)) return;
    try { await api.del(`/auth/api-keys/${k.id}`); toast('Đã thu hồi API key'); await refetch(); } catch (err) { toastError(err); }
  };
  return (
    <div className="card stack">
      <h3>API key</h3>
      <p className="muted small">
        Dùng cho trợ lý AI (Claude qua MCP) hoặc script gọi QLDA thay bạn, với đúng quyền của tài khoản này. Không chia sẻ key cho người khác.
        Đổi mật khẩu sẽ thu hồi mọi API key.
      </p>
      <form className="row" style={{ gap: 8 }} onSubmit={create}>
        <input placeholder="Tên key, VD: Claude trên máy làm việc" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required style={{ flex: 1 }} />
        <select value={days} onChange={(e) => setDays(e.target.value)} aria-label="Thời hạn">
          <option value="30">30 ngày</option>
          <option value="90">90 ngày</option>
          <option value="365">1 năm</option>
          <option value="0">Không hết hạn</option>
        </select>
        <button className="btn" disabled={busy}>Tạo API key</button>
      </form>
      {keys.length > 0 && (
        <table className="table">
          <thead><tr><th>Tên</th><th>Key</th><th>Tạo lúc</th><th>Hết hạn</th><th>Dùng gần nhất</th><th /></tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td><code style={{ wordBreak: 'break-all' }}>{shown[k.id] ?? `${k.prefix}…`}</code></td>
                <td>{fmtDateTime(k.created_at)}</td>
                <td>{k.expires_at ? fmtDate(k.expires_at) : 'Không'}</td>
                <td>{k.last_used_at ? `${fmtDateTime(k.last_used_at)}${k.last_used_ip ? ` · ${k.last_used_ip}` : ''}` : 'Chưa dùng'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-sm" onClick={() => reveal(k)}>{shown[k.id] ? 'Ẩn' : 'Xem'}</button>{' '}
                  <button className="btn btn-sm" onClick={() => copy(k)}>Sao chép</button>{' '}
                  <button className="btn btn-sm" onClick={() => revoke(k)}>Thu hồi</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
