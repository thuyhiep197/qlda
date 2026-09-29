import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarDays, X } from 'lucide-react';

/** Ô nhập nhãn: gõ rồi Enter hoặc dấu phẩy để thêm. */
export function LabelsInput({ value, onChange, suggestions = [] }: {
  value: string[]; onChange: (v: string[]) => void; suggestions?: string[];
}) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const v = raw.trim().replace(/[,\s]+/g, '-');
    if (v && !value.includes(v)) onChange([...value, v]);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(text); }
    if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
  };
  const listId = useRef(`labels-${Math.random().toString(36).slice(2)}`).current;
  return (
    <div className="labels-input">
      {value.map((l) => (
        <span key={l} className="label-chip">{l}<button type="button" onClick={() => onChange(value.filter((x) => x !== l))} aria-label="Bỏ nhãn"><X size={12} /></button></span>
      ))}
      <input value={text} list={listId} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
        onBlur={() => text && add(text)} placeholder={value.length ? '' : 'Nhập nhãn rồi Enter'} />
      <datalist id={listId}>{suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

/** Văn bản sửa tại chỗ: bấm để sửa, Enter để lưu, Esc để hủy. */
export function InlineText({ value, onSave, disabled, className, placeholder, type = 'text' }: {
  value: string; onSave: (v: string) => void; disabled?: boolean; className?: string; placeholder?: string; type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  if (!editing || disabled) {
    return (
      <div className={`inline-view ${disabled ? '' : 'editable'} ${className || ''}`} onClick={() => !disabled && setEditing(true)}>
        {value || <span className="muted">{placeholder || 'Không có'}</span>}
      </div>
    );
  }
  const commit = () => { setEditing(false); if (text !== value) onSave(text); };
  return (
    <input autoFocus type={type} className={`inline-input ${className || ''}`} value={text} onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { setText(value); setEditing(false); }
      }} />
  );
}

const toIso = (text: string) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};
const toText = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/**
 * Ô nhập ngày dạng dd/mm/yyyy (ô ngày của trình duyệt hiển thị theo ngôn ngữ máy, thường là mm/dd/yyyy).
 * Giá trị vào/ra vẫn là yyyy-mm-dd. Gõ trực tiếp hoặc bấm biểu tượng lịch để chọn.
 */
export function DateInput({ value, onChange, min, max, disabled, required, className }: {
  value: string | null | undefined; onChange: (iso: string) => void;
  min?: string; max?: string; disabled?: boolean; required?: boolean; className?: string;
}) {
  const [text, setText] = useState(toText(value));
  const [bad, setBad] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => { setText(toText(value)); setBad(false); }, [value]);

  const commit = (t: string) => {
    if (!t.trim()) { setBad(false); if (value) onChange(''); return; }
    const iso = toIso(t);
    if (!iso || (min && iso < min) || (max && iso > max)) { setBad(true); return; }
    setBad(false);
    setText(toText(iso));
    if (iso !== value) onChange(iso);
  };
  // Tự thêm dấu "/" khi gõ số: 26092026 → 26/09/2026
  const type = (raw: string) => {
    let t = raw.replace(/[^\d/]/g, '');
    // Giữ nguyên nếu người dùng tự gõ dấu "/" (VD 5/9/2026); còn lại dựng lại từ các chữ số
    if (!/^\d{0,2}$|^\d{1,2}\/\d{0,2}$|^\d{1,2}\/\d{1,2}\/\d{0,4}$/.test(t)) {
      const d = t.replace(/\D/g, '').slice(0, 8);
      t = d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    }
    setText(t.slice(0, 10));
    setBad(false);
    if (toIso(t)) commit(t);
  };
  const openPicker = () => {
    const el = picker.current;
    if (!el || disabled) return;
    try { el.showPicker(); } catch { el.focus(); }
  };

  return (
    <span className={`date-input ${bad ? 'invalid' : ''} ${className ?? ''}`}>
      <input type="text" inputMode="numeric" placeholder="dd/mm/yyyy" value={text} disabled={disabled} required={required}
        pattern="\d{1,2}/\d{1,2}/\d{4}" title="Định dạng ngày/tháng/năm, VD: 26/09/2026"
        onChange={(e) => type(e.target.value)} onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { commit((e.target as HTMLInputElement).value); } }} />
      <button type="button" className="date-btn" tabIndex={-1} disabled={disabled} onClick={openPicker} aria-label="Chọn ngày"><CalendarDays size={16} /></button>
      <input ref={picker} type="date" className="date-native" tabIndex={-1} aria-hidden value={value || ''} min={min} max={max}
        onChange={(e) => { if (e.target.value) onChange(e.target.value); }} />
    </span>
  );
}
