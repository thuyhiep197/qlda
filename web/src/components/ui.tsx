import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Bookmark, Bug, Check, ChevronDown, ChevronsDown, ChevronsUp, ChevronUp, Equal, Info, ListTree, SlidersHorizontal, UserRound, X, Zap, type LucideIcon } from 'lucide-react';
import type { Category, IssueType, Priority, SubType } from '../types';
import { colorOf, initials, PRIORITY_LABELS, TYPE_LABELS, typeTip } from '../util';

// ---------------------------------------------------------------------------
// Biểu tượng
// ---------------------------------------------------------------------------
const TYPE_COLORS: Record<IssueType, string> = {
  epic: '#904ee2', story: '#63ba3c', task: '#4bade8', bug: '#e5493a', subtask: '#4bade8',
};

const TYPE_GLYPHS: Record<IssueType, LucideIcon> = {
  epic: Zap, story: Bookmark, task: Check, bug: Bug, subtask: ListTree,
};

/** Biểu tượng loại issue: ô màu như Jira, hình vẽ theo bộ Lucide. Việc con có loại (Story/Task/Bug) hiện biểu tượng của loại đó kèm dấu góc "việc con". */
export function TypeIcon({ type, subtype, size = 16 }: { type: IssueType; subtype?: SubType | null; size?: number }) {
  const shown: IssueType = type === 'subtask' && subtype ? subtype : type;
  const child = shown !== type;
  const Glyph = TYPE_GLYPHS[shown];
  const tip = child ? `${TYPE_LABELS[shown]} (việc con)` : typeTip(type);
  return (
    <span className={`type-icon${child ? ' type-icon-child' : ''}`} role="img" aria-label={tip} data-tip={tip}
      style={{ width: size, height: size, background: TYPE_COLORS[shown], borderRadius: Math.max(3, size / 5) }}>
      <Glyph size={Math.round(size * 0.72)} color="#fff" strokeWidth={shown === 'task' ? 3 : 2.5} aria-hidden />
    </span>
  );
}

const PRIO: Record<Priority, { color: string; Icon: LucideIcon }> = {
  highest: { color: '#c9372c', Icon: ChevronsUp },
  high: { color: '#e2483d', Icon: ChevronUp },
  medium: { color: '#e2b203', Icon: Equal },
  low: { color: '#1d7afc', Icon: ChevronDown },
  lowest: { color: '#1d7afc', Icon: ChevronsDown },
};

export function PriorityIcon({ priority, size = 16 }: { priority: Priority; size?: number }) {
  const { color, Icon } = PRIO[priority];
  return <Icon size={size} color={color} strokeWidth={2.5} className="prio-icon" aria-label={PRIORITY_LABELS[priority]} data-tip={PRIORITY_LABELS[priority]} />;
}

export function Avatar({ name, size = 24 }: { name?: string | null; size?: number }) {
  if (!name) {
    return <span className="avatar avatar-empty" style={{ width: size, height: size }} title="Chưa giao">
      <UserRound size={Math.round(size * 0.62)} strokeWidth={2.2} aria-hidden />
    </span>;
  }
  return (
    <span className="avatar" title={name} style={{ width: size, height: size, fontSize: size * 0.4, background: colorOf(name) }}>
      {initials(name)}
    </span>
  );
}

export function StatusBadge({ name, category }: { name: string; category: Category }) {
  return <span className={`status status-${category}`}>{name}</span>;
}

export function Lozenge({ children, tone = 'default' }: { children: ReactNode; tone?: string }) {
  return <span className={`lozenge lozenge-${tone}`}>{children}</span>;
}

export function Spinner() {
  return <div className="spinner-wrap"><div className="spinner" /></div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><div className="empty-title">{title}</div>{children}</div>;
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({ title, onClose, children, footer, width = 560 }: {
  title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------
marked.setOptions({ breaks: true, gfm: true });
const MENTION_RE = /(^|[\s(>])@([a-z0-9][a-z0-9._-]*[a-z0-9_-]|[a-z0-9])/gi;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Hiển thị Markdown; @tên_đăng_nhập của người dùng có thật được tô nổi bật bằng họ tên; bấm ảnh để xem cỡ lớn. */
export function Markdown({ text, users }: { text: string; users?: { username: string; full_name: string }[] }) {
  const html = useMemo(() => {
    const byName = new Map((users ?? []).map((u) => [u.username.toLowerCase(), u.full_name]));
    const withMentions = byName.size
      ? text.replace(MENTION_RE, (m, pre: string, name: string) => {
        const full = byName.get(name.toLowerCase());
        return full ? `${pre}<span class="mention" title="@${escapeHtml(name)}">@${escapeHtml(full)}</span>` : m;
      })
      : text;
    return DOMPurify.sanitize(marked.parse(withMentions, { async: false }) as string);
  }, [text, users]);
  return (
    <div className="md" dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.tagName === 'IMG') { e.stopPropagation(); window.open((t as HTMLImageElement).src, '_blank', 'noopener'); }
      }} />
  );
}

// ---------------------------------------------------------------------------
// Thông báo (toast)
// ---------------------------------------------------------------------------
type Toast = { id: number; text: string; tone: 'error' | 'success' };
let listeners: ((t: Toast[]) => void)[] = [];
let toasts: Toast[] = [];
let seq = 0;
export function toast(text: string, tone: Toast['tone'] = 'success') {
  const t = { id: ++seq, text, tone };
  toasts = [...toasts, t];
  listeners.forEach((l) => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    listeners.forEach((l) => l(toasts));
  }, tone === 'error' ? 6000 : 3000);
}
export const toastError = (e: unknown) => toast(e instanceof Error ? e.message : String(e), 'error');

export function Toaster() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    listeners.push(setList);
    return () => { listeners = listeners.filter((l) => l !== setList); };
  }, []);
  return (
    <div className="toaster">
      {list.map((t) => <div key={t.id} className={`toast toast-${t.tone}`}>{t.text}</div>)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip: phần tử nào có thuộc tính data-tip sẽ hiện chú thích khi rê chuột hoặc focus bằng bàn phím.
// Hiển thị ở một lớp nổi cố định nên không bị cắt bởi khung cuộn/cửa sổ; tự đổi lên trên khi sát mép dưới.
// ---------------------------------------------------------------------------
export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; rect: DOMRect } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; arrowX: number; above: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current: Element | null = null;
    const show = (el: Element | null) => {
      if (el === current) return;
      current = el;
      const text = el?.getAttribute('data-tip');
      setTip(el && text ? { text, rect: el.getBoundingClientRect() } : null);
    };
    const find = (t: EventTarget | null) => (t instanceof Element ? t.closest('[data-tip]') : null);
    const over = (e: Event) => show(find(e.target));
    const hide = () => show(null);
    document.addEventListener('mouseover', over);
    document.addEventListener('focusin', over);
    document.addEventListener('focusout', hide);
    document.addEventListener('mousedown', hide);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('mouseover', over);
      document.removeEventListener('focusin', over);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('mousedown', hide);
      document.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tip || !box.current) { setPos(null); return; }
    const { width, height } = box.current.getBoundingClientRect();
    const r = tip.rect;
    const cx = r.left + r.width / 2;
    const left = Math.min(Math.max(cx - width / 2, 8), window.innerWidth - width - 8);
    const above = r.bottom + 8 + height > window.innerHeight - 8;
    setPos({ left, top: above ? r.top - 8 - height : r.bottom + 8, arrowX: Math.min(Math.max(cx, left + 10), left + width - 10), above });
  }, [tip]);

  if (!tip) return null;
  return (
    <>
      <div ref={box} className="tooltip-layer" role="tooltip"
        style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}>{tip.text}</div>
      {pos && (
        <div className="tooltip-arrow" style={{
          left: pos.arrowX - 5,
          top: pos.above ? pos.top + (box.current?.offsetHeight ?? 0) : pos.top - 10,
          borderTopColor: pos.above ? 'var(--tooltip-bg)' : 'transparent',
          borderBottomColor: pos.above ? 'transparent' : 'var(--tooltip-bg)',
        }} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Báo có phiên bản mới (server tự triển khai khi có bản cập nhật)
// ---------------------------------------------------------------------------
const bundleOf = (html: string) => /assets\/index-[\w-]+\.js/.exec(html)?.[0] ?? null;

/** Định kỳ và khi quay lại tab, so tệp JS chính của trang với bản trên server; khác thì mời tải lại. */
export function UpdateBanner() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const mine = bundleOf(document.documentElement.innerHTML);
    if (!mine) return; // chế độ dev
    const check = async () => {
      try {
        const html = await fetch('/', { cache: 'no-store' }).then((r) => r.text());
        const latest = bundleOf(html);
        if (latest && latest !== mine) setStale(true);
      } catch { /* mất mạng: thử lại lần sau */ }
    };
    const t = setInterval(check, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    check();
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  if (!stale) return null;
  return (
    <div className="update-banner" role="status">
      QLDA vừa có phiên bản mới.
      <button className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>Tải lại để cập nhật</button>
      <button className="icon-btn" aria-label="Để sau" onClick={() => setStale(false)}><X size={16} /></button>
    </div>
  );
}

/** Nhãn side của mô-đun: Sở / Trường / Chung. */
export function SideBadge({ side }: { side: 'so' | 'truong' | 'chung' | null | undefined }) {
  if (!side) return null;
  const tone = side === 'so' ? 'purple' : side === 'truong' ? 'blue' : 'default';
  const label = side === 'so' ? 'Sở' : side === 'truong' ? 'Trường' : 'Chung';
  return <span className={`lozenge lozenge-${tone}`}>{label}</span>;
}

/** Nút "Bộ lọc": gom các ô lọc ít dùng, mở ra thành một hàng riêng; hiện số bộ lọc đang bật. */
export function MoreFilters({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(count > 0);
  return (
    <>
      <button type="button" className={`btn btn-sm ${count ? 'more-on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <SlidersHorizontal size={14} /> Bộ lọc{count ? ` (${count})` : ''} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <div className="more-filters">{children}</div>}
    </>
  );
}

/** Biểu tượng ⓘ: gợi ý cách dùng, chỉ hiện khi rê chuột (thay cho các dòng "Mẹo…"). */
export function HelpTip({ text }: { text: string }) {
  return <span className="help-tip" data-tip={text} aria-label={text}><Info size={15} /></span>;
}
