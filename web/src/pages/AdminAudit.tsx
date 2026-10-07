import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '../api';
import { fmtDateTime } from '../util';
import { HelpTip, Spinner } from '../components/ui';

interface AuditRow { id: number; at: string; user_id: number | null; username: string | null; action: string; target: string | null; detail: string | null; ip: string | null; user_agent: string | null }

const ACTIONS: Record<string, { label: string; danger?: boolean }> = {
  login: { label: 'Đăng nhập' },
  login_failed: { label: 'Đăng nhập thất bại', danger: true },
  login_blocked: { label: 'Bị chặn do sai mật khẩu nhiều lần', danger: true },
  password_changed: { label: 'Tự đổi mật khẩu' },
  password_reset: { label: 'Đặt lại mật khẩu cho người khác', danger: true },
  logout_others: { label: 'Đăng xuất các thiết bị khác' },
  logout_all: { label: 'Đăng xuất tất cả mọi người', danger: true },
  user_created: { label: 'Tạo tài khoản', danger: true },
  user_updated: { label: 'Sửa tài khoản' },
  user_permissions: { label: 'Phân quyền riêng cho người dùng', danger: true },
  role_created: { label: 'Tạo nhóm người dùng' },
  role_updated: { label: 'Sửa nhóm người dùng' },
  role_permissions: { label: 'Đổi quyền của nhóm', danger: true },
  role_deleted: { label: 'Xóa nhóm người dùng' },
  project_created: { label: 'Tạo dự án' },
  project_archived: { label: 'Lưu trữ / mở lại dự án' },
  member_added: { label: 'Thêm thành viên dự án' },
  member_removed: { label: 'Xóa thành viên dự án' },
  staff_created: { label: 'Thêm vào danh mục nhân sự' },
  staff_updated: { label: 'Sửa danh mục nhân sự' },
  staff_deleted: { label: 'Xóa khỏi danh mục nhân sự' },
};

/** Rút gọn chuỗi trình duyệt: "Chrome · Windows" */
function device(ua: string | null) {
  if (!ua) return '';
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /curl|node|python|axios|Go-http/i.test(ua) ? 'Công cụ/script' : 'Khác';
  const o = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return [b, o].filter(Boolean).join(' · ');
}

function fmtDetail(d: string | null) {
  if (!d) return '';
  try {
    const o = JSON.parse(d);
    if (o && typeof o === 'object') return Object.entries(o).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') || '—' : typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
  } catch { /* chuỗi thường */ }
  return d;
}

/** Nhật ký bảo mật: ai đăng nhập từ đâu, đăng nhập sai, và mọi thao tác quản trị. */
export default function AdminAudit() {
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery<AuditRow[]>({
    queryKey: ['audit', action, q],
    queryFn: () => api.get(`/audit${qs({ action, q, limit: 1000 })}`),
    refetchInterval: 30_000,
  });
  const failed24h = (data ?? []).filter((r) => r.action === 'login_failed' && Date.now() - Date.parse(r.at) < 86400_000).length;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Nhật ký bảo mật</h1>
        <HelpTip text="Ghi lại mọi lần đăng nhập (thành công, thất bại), đổi/đặt lại mật khẩu và thao tác quản trị: tạo/sửa tài khoản, cấp quyền quản trị, đổi nhóm, phân quyền, dự án, thành viên. Lưu 365 ngày." />
      </div>
      {failed24h > 0 && <div className="form-error mb-sm">Có <b>{failed24h}</b> lần đăng nhập thất bại trong 24 giờ qua. Kiểm tra cột IP và tài khoản bị thử.</div>}
      <div className="filter-bar">
        <input className="filter-search" style={{ width: 280 }} placeholder="Tìm theo tài khoản, IP, nội dung…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={action} onChange={(e) => setAction(e.target.value)} className={action ? 'filter-on' : ''}>
          <option value="">Mọi hành động</option>
          {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="muted small">{data?.length ?? 0} dòng</span>
      </div>
      {isLoading ? <Spinner /> : (
        <div className="table-wrap">
          <table className="table audit-table">
            <thead><tr><th>Thời gian</th><th>Tài khoản</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th><th>IP</th><th>Thiết bị</th></tr></thead>
            <tbody>
              {data?.map((r) => {
                const a = ACTIONS[r.action] ?? { label: r.action };
                return (
                  <tr key={r.id} className={a.danger ? 'audit-danger' : ''}>
                    <td className="nowrap small">{fmtDateTime(r.at)}</td>
                    <td className="nowrap">{r.username || <span className="muted">—</span>}</td>
                    <td className="nowrap">{a.label}</td>
                    <td>{r.target}</td>
                    <td className="small">{fmtDetail(r.detail)}</td>
                    <td className="nowrap small">{r.ip}</td>
                    <td className="nowrap small" data-tip={r.user_agent || undefined}>{device(r.user_agent)}</td>
                  </tr>
                );
              })}
              {!data?.length && <tr><td colSpan={7} className="muted">Chưa có nhật ký.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
