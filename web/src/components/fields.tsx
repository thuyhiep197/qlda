import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

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
