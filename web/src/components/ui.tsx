import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { Category, IssueType, Priority } from '../types';
import { colorOf, initials, PRIORITY_LABELS, typeTip } from '../util';

// ---------------------------------------------------------------------------
// Biểu tượng
// ---------------------------------------------------------------------------
const TYPE_COLORS: Record<IssueType, string> = {
  epic: '#904ee2', story: '#63ba3c', task: '#4bade8', bug: '#e5493a', subtask: '#4bade8',
};

export function TypeIcon({ type, size = 16 }: { type: IssueType; size?: number }) {
  const c = TYPE_COLORS[type];
  const paths: Record<IssueType, ReactNode> = {
    epic: <path d="M9.2 3 5 9h3l-1.2 4L11 7H8l1.2-4Z" fill="#fff" />,
    story: <path d="M5.5 4h5v8l-2.5-2-2.5 2V4Z" fill="#fff" />,
    task: <path d="m5 8.2 2 2 4-4.4" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    bug: <circle cx="8" cy="8" r="3" fill="#fff" />,
    subtask: <><rect x="4.5" y="4.5" width="4" height="4" rx=".5" stroke="#fff" fill="none" /><rect x="7.5" y="7.5" width="4" height="4" rx=".5" fill="#fff" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-label={typeTip(type)} role="img" className="type-icon" data-tip={typeTip(type)}>
      <rect width="16" height="16" rx="3" fill={c} />
      {paths[type]}
    </svg>
  );
}

const PRIO: Record<Priority, { color: string; d: string }> = {
  highest: { color: '#c9372c', d: 'M3 9l5-5 5 5M3 13l5-5 5 5' },
  high: { color: '#e2483d', d: 'M3 11l5-5 5 5' },
  medium: { color: '#e2b203', d: 'M3 6h10M3 10h10' },
  low: { color: '#1d7afc', d: 'M3 5l5 5 5-5' },
  lowest: { color: '#1d7afc', d: 'M3 3l5 5 5-5M3 7l5 5 5-5' },
};

export function PriorityIcon({ priority, size = 16 }: { priority: Priority; size?: number }) {
  const p = PRIO[priority];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="prio-icon">
      <title>{PRIORITY_LABELS[priority]}</title>
      <path d={p.d} stroke={p.color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Avatar({ name, size = 24 }: { name?: string | null; size?: number }) {
  if (!name) {
    return <span className="avatar avatar-empty" style={{ width: size, height: size }} title="Chưa giao">
      <svg viewBox="0 0 16 16" width={size * 0.6} height={size * 0.6}><circle cx="8" cy="5.5" r="3" fill="currentColor" /><path d="M2 15c0-3.3 2.7-5 6-5s6 1.7 6 5" fill="currentColor" /></svg>
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
          <button className="icon-btn" onClick={onClose} aria-label="Đóng">✕</button>
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
          borderTopColor: pos.above ? '#172b4d' : 'transparent',
          borderBottomColor: pos.above ? 'transparent' : '#172b4d',
        }} />
      )}
    </>
  );
}
