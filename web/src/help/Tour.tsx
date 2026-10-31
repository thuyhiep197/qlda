import { useEffect, useLayoutEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, queryClient } from '../api';
import { hasSubsystem, useMe, type SubsystemKey } from '../hooks';
import { START_ID, endTour, startTour, useTourOpen } from './articles';

interface Step { target?: string; title: string; text: string; sub?: SubsystemKey }
/** Các bước giới thiệu nhanh; bước gắn với phân hệ chỉ hiện khi tài khoản thấy phân hệ đó */
export const TOUR_STEPS: Step[] = [
  { title: 'Chào mừng bạn đến với QLDA', text: 'Hướng dẫn nhanh này giới thiệu các phần chính của công cụ trong vài bước. Bạn có thể bỏ qua và xem lại bất cứ lúc nào từ nút "?" trên thanh trên cùng.' },
  { target: '[data-tour="nav-dashboard"]', sub: 'dashboard', title: 'Dashboard', text: 'Trang tổng quan: việc của tôi, việc chờ kiểm thử, khách hàng và hành trình bạn phụ trách, hoạt động gần đây.' },
  { target: '[data-tour="nav-customer"]', sub: 'customer', title: 'Khách hàng', text: 'Quản lý khách hàng, dự án của khách hàng và hành trình bán hàng (Giải pháp → Hợp đồng → Triển khai → Nghiệm thu – Thanh toán).' },
  { target: '[data-tour="nav-project"]', sub: 'project', title: 'Dự án', text: 'Dự án sản xuất: kế hoạch, sprint, backlog, danh sách issue và tiến độ.' },
  { target: '[data-tour="nav-docs"]', sub: 'docs', title: 'Tài liệu nội bộ', text: 'Kho tài liệu dùng chung theo thư mục nhiều cấp.' },
  { target: '[data-tour="nav-admin"]', sub: 'admin', title: 'Quản trị', text: 'Người dùng, phân quyền và các danh mục dùng chung.' },
  { target: '[data-tour="search"]', title: 'Tìm kiếm nhanh', text: 'Gõ mã issue (VD DEMO-12), tên công việc, dự án hoặc khách hàng để mở ngay.' },
  { target: '[data-tour="bell"]', title: 'Thông báo', text: 'Khi có người nhắc tên bạn, giao việc, bình luận hoặc đổi trạng thái việc của bạn, chuông sẽ báo ở đây.' },
  { target: '[data-tour="help"]', title: 'Hướng dẫn sử dụng', text: 'Mục này ở cuối thanh bên, mở hướng dẫn của đúng màn hình đang dùng, Trung tâm hướng dẫn, mục Có gì mới và Quyền của tôi.' },
  { target: '[data-tour="user"]', title: 'Tài khoản của bạn', text: 'Cài đặt tài khoản: thông tin cá nhân, ảnh đại diện, giao diện sáng/tối, loại thông báo muốn nhận, đổi mật khẩu.' },
  { title: 'Sẵn sàng!', text: 'Mở "Bắt đầu nhanh theo vai trò" để xem các việc thường làm hằng ngày của vai trò bạn.' },
];

/** Tour hướng dẫn nhanh: tự mở một lần ở lần đăng nhập đầu tiên (chưa có tour_done); mở lại từ nút "?" */
export default function Tour() {
  const { data: me } = useMe();
  const open = useTourOpen();
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const steps = TOUR_STEPS.filter((s) => !s.sub || hasSubsystem(me, s.sub));
  const step = steps[Math.min(i, steps.length - 1)];

  useEffect(() => { if (me && !me.preferences?.tour_done) startTour(); }, [me?.id]);
  useEffect(() => { if (open) setI(0); }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = step?.target ? document.querySelector(step.target) : null;
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 0 && r.height > 0 ? r : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, step]);
  if (!open || !me || !step) return null;

  const finish = async (thenStart = false) => {
    endTour();
    if (thenStart) navigate(`/help/${START_ID}`);
    if (!me.preferences?.tour_done) {
      try { await api.put('/auth/preferences', { tour_done: true }); await queryClient.invalidateQueries({ queryKey: ['me'] }); } catch { /* lần sau hiện lại */ }
    }
  };
  const last = i >= steps.length - 1;
  // Hộp giải thích: cạnh vùng được tô sáng (bên phải nếu vùng ở thanh bên, bên dưới nếu ở thanh trên), không có vùng thì giữa màn hình
  const W = 320;
  const style: React.CSSProperties = !rect ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
    : rect.left < 260 && rect.top > 60 ? { left: rect.right + 14, top: Math.max(12, Math.min(rect.top, window.innerHeight - 220)) }
    : { left: Math.max(12, Math.min(rect.left + rect.width / 2 - W / 2, window.innerWidth - W - 12)), top: rect.bottom + 12 };
  return (
    <div className="tour" role="dialog" aria-label="Hướng dẫn nhanh">
      {rect ? <div className="tour-spot" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} />
        : <div className="tour-dim" />}
      <div className="tour-pop" style={{ ...style, width: W }}>
        <div className="muted small">Bước {i + 1}/{steps.length}</div>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        <div className="tour-foot">
          <button className="btn btn-sm" onClick={() => finish()}>{last ? 'Đóng' : 'Bỏ qua'}</button>
          <span style={{ flex: 1 }} />
          {i > 0 && <button className="btn btn-sm" onClick={() => setI(i - 1)}>Trước</button>}
          {last ? <button className="btn btn-sm btn-primary" onClick={() => finish(true)}>Bắt đầu nhanh</button>
            : <button className="btn btn-sm btn-primary" onClick={() => setI(i + 1)}>Tiếp</button>}
        </div>
      </div>
    </div>
  );
}
