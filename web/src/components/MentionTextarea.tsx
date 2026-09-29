import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { api, refreshAll } from '../api';
import type { UserBasic } from '../types';
import { Avatar, toastError } from './ui';

const fold = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Thành viên dự án để gợi ý khi gõ @ */
  members: UserBasic[];
  /** Có mã issue thì cho dán / kéo thả ảnh, tệp (tự lưu vào tệp đính kèm của issue) */
  issueKey?: string;
  rows?: number;
  placeholder?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}

/**
 * Ô soạn thảo kiểu Jira: gõ @ để nhắc thành viên (chèn @tên_đăng_nhập),
 * Ctrl+V ảnh chụp màn hình hoặc kéo thả tệp để đính kèm và chèn ngay vào nội dung.
 */
export function MentionTextarea({ value, onChange, members, issueKey, rows = 4, placeholder, autoFocus, onKeyDown }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(value);
  latest.current = value;
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null);
  const [active, setActive] = useState(0);
  const [uploading, setUploading] = useState(0);

  // Khớp theo đầu từ của họ tên (gõ @hung ra Lê Quốc Hùng) hoặc một phần tên đăng nhập
  const matches = query
    ? members.filter((m) => {
      const q = fold(query.text);
      return !q || fold(m.full_name).split(/\s+/).some((w) => w.startsWith(q)) || m.username.includes(q);
    }).slice(0, 8)
    : [];

  useEffect(() => { setActive(0); }, [query?.text]);

  const detect = (el: HTMLTextAreaElement) => {
    const before = el.value.slice(0, el.selectionStart);
    const m = before.match(/(^|[\s(])@([^\s@()]{0,30})$/);
    setQuery(m ? { start: el.selectionStart - m[2].length - 1, text: m[2] } : null);
  };

  const pick = (u: UserBasic) => {
    const el = ref.current;
    if (!el || !query) return;
    const caret = el.selectionStart;
    const insert = `@${u.username} `;
    onChange(value.slice(0, query.start) + insert + value.slice(caret));
    setQuery(null);
    const pos = query.start + insert.length;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos); });
  };

  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (query && matches.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); pick(matches[active]); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setQuery(null); return; }
    }
    onKeyDown?.(e);
  };

  /** Tải tệp lên issue rồi thay chỗ giữ chỗ bằng ảnh / liên kết Markdown. */
  const upload = async (files: File[]) => {
    if (!issueKey || !files.length) return;
    const el = ref.current;
    setQuery(null);
    const token = `![Đang tải ${files.length} tệp…]()`;
    const start = el?.selectionStart ?? latest.current.length;
    const end = el?.selectionEnd ?? start;
    const cur = latest.current;
    // Ảnh/tệp luôn nằm trên dòng riêng
    const before = start > 0 && cur[start - 1] !== '\n' ? '\n' : '';
    const after = cur[end] !== undefined && cur[end] !== '\n' ? '\n' : '';
    onChange(`${cur.slice(0, start)}${before}${token}${after}${cur.slice(end)}`);
    setUploading((n) => n + 1);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const res = await api.post<{ attachments: { id: number; filename: string; mime: string }[] }>(`/issues/${issueKey}/attachments`, fd);
      const md = res.attachments.map((a) => /^image\/(png|jpe?g|gif|webp|bmp)$/.test(a.mime)
        ? `![${a.filename}](/api/issues/attachments/${a.id}?inline=1)`
        : `[${a.filename}](/api/issues/attachments/${a.id})`).join('\n');
      onChange(latest.current.replace(token, md));
      await refreshAll();
    } catch (err) {
      onChange(latest.current.replace(token, ''));
      toastError(err);
    } finally {
      setUploading((n) => n - 1);
    }
  };

  const stamp = () => new Date().toISOString().replace(/\D/g, '').slice(0, 14);

  return (
    <div className="mention-box">
      <textarea
        ref={ref} rows={rows} value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={(e) => { onChange(e.target.value); detect(e.target); }}
        onKeyDown={keyDown}
        onKeyUp={(e) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) detect(e.currentTarget); }}
        onClick={(e) => detect(e.currentTarget)}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        onPaste={(e) => {
          if (!issueKey) return;
          const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
          if (!files.length) return;
          e.preventDefault();
          upload(files.map((f, i) => new File([f], `anh-dan-${stamp()}${i ? `-${i}` : ''}.${f.type.split('/')[1] || 'png'}`, { type: f.type })));
        }}
        onDragOver={(e) => { if (issueKey && e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
        onDrop={(e) => {
          if (!issueKey || !e.dataTransfer.files.length) return;
          e.preventDefault();
          e.stopPropagation();
          upload(Array.from(e.dataTransfer.files));
        }}
      />
      {query && matches.length > 0 && (
        <div className="mention-list" role="listbox">
          {matches.map((m, i) => (
            <div key={m.id} role="option" aria-selected={i === active} className={`mention-item ${i === active ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(m); }} onMouseEnter={() => setActive(i)}>
              <Avatar name={m.full_name} size={22} />
              <span>{m.full_name}</span>
              <span className="muted small">@{m.username}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mention-hint muted small">
        Gõ <b>@</b> để nhắc thành viên{issueKey ? <> · Dán (Ctrl+V) hoặc kéo thả ảnh, tệp vào đây</> : null}
        {uploading > 0 && <> · <b>Đang tải tệp lên…</b></>}
      </div>
    </div>
  );
}
