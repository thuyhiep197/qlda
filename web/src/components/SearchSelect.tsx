import { useEffect, useRef, useState, type KeyboardEvent, type SelectHTMLAttributes } from 'react';
import { Check, Search } from 'lucide-react';
import { filterOptions, readOptions, type SelectOption } from '../search-select';

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
  value: string | number;
  onChange: (e: { target: { value: string } }) => void;
};

/**
 * Ô chọn người có tìm kiếm: giữ nguyên ô select (kiểu dáng, các <option>), bấm vào thì mở bảng nổi
 * có ô Tìm theo tên thay cho danh sách thả xuống của trình duyệt. Bảng nổi nằm ngay cạnh ô (position: fixed) để các khung
 * đóng khi bấm ra ngoài (VD Giao cho…) vẫn coi là bấm bên trong.
 */
export function SearchSelect({ value, onChange, children, onMouseDown, onKeyDown, ...rest }: Props) {
  const ref = useRef<HTMLSelectElement>(null);
  const [open, setOpen] = useState<{ options: SelectOption[]; top: number; left: number; width: number } | null>(null);
  const show = () => {
    const el = ref.current;
    if (!el || el.disabled) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 260);
    setOpen({ options: readOptions(el), top: r.bottom + 2, left: Math.max(4, Math.min(r.left, window.innerWidth - width - 4)), width });
  };
  return (
    <>
      <select ref={ref} value={value} onChange={onChange} {...rest}
        onMouseDown={(e) => { onMouseDown?.(e); if (e.button === 0) { e.preventDefault(); ref.current?.focus(); if (open) setOpen(null); else show(); } }}
        onKeyDown={(e) => { onKeyDown?.(e); if (e.key === 'Enter' || e.key === ' ' || (e.altKey && e.key === 'ArrowDown')) { e.preventDefault(); show(); } }}>
        {children}
      </select>
      {open && (
        <SearchPopover {...open} value={String(value)}
          onPick={(v) => { setOpen(null); ref.current?.focus(); if (v !== String(value)) onChange({ target: { value: v } }); }}
          onClose={() => { setOpen(null); ref.current?.focus(); }} />
      )}
    </>
  );
}

function SearchPopover({ options, top, left, width, value, onPick, onClose }: {
  options: SelectOption[]; top: number; left: number; width: number; value: string; onPick: (v: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = filterOptions(options, q);
  const pickable = list.filter((o) => !o.disabled);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    box.current?.querySelector('input')?.focus({ preventScroll: true });
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) close.current(); };
    // Cuộn trang / đổi cỡ cửa sổ thì đóng (bảng nổi đặt theo vị trí ô chọn)
    const onMove = (e: Event) => { if (!box.current?.contains(e.target as Node)) close.current(); };
    const onResize = () => close.current();
    // Gắn sau cú bấm vừa mở bảng: nếu gắn ngay, chính cú bấm đó lan tới document và đóng bảng lại
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      window.addEventListener('scroll', onMove, true);
      window.addEventListener('resize', onResize);
    });
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown); window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onResize);
    };
  }, []);
  // Giữ dòng đang chọn trong khung (chỉ cuộn danh sách, không cuộn trang)
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('.picker-item.active');
    const listEl = box.current?.querySelector<HTMLElement>('.picker-list');
    if (!el || !listEl) return;
    if (el.offsetTop < listEl.scrollTop) listEl.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > listEl.scrollTop + listEl.clientHeight) listEl.scrollTop = el.offsetTop + el.offsetHeight - listEl.clientHeight;
  }, [active]);
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, pickable.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (pickable[active]) onPick(pickable[active].value); }
    else if (e.key === 'Tab') onClose();
  };
  const spaceBelow = window.innerHeight - top;
  const style = spaceBelow < 220 ? { bottom: window.innerHeight - top + 36, left, width } : { top, left, width };
  let lastGroup: string | null = null;
  return (
    <div className="picker-pop search-select-pop" ref={box} style={style}>
      <div className="cw-search"><Search size={13} />
        <input placeholder="Tìm…" value={q} onKeyDown={keys} onChange={(e) => { setQ(e.target.value); setActive(0); }} /></div>
      <div className="picker-list">
        {list.map((o, i) => {
          const head = o.group !== lastGroup && o.group ? <div className="picker-group">{o.group}</div> : null;
          lastGroup = o.group;
          const idx = pickable.indexOf(o);
          return (
            <div key={`${i}:${o.value}`}>
              {head}
              <button type="button" disabled={o.disabled}
                className={`picker-item ${o.value === value ? 'on' : ''} ${idx === active && idx >= 0 ? 'active' : ''}`}
                onMouseEnter={() => idx >= 0 && setActive(idx)} onClick={() => onPick(o.value)}>
                <span className="picker-check">{o.value === value && <Check size={13} />}</span>
                <span className="grow ellipsis">{o.label}</span>
              </button>
            </div>
          );
        })}
        {!list.length && <div className="muted small pad">Không tìm thấy</div>}
      </div>
    </div>
  );
}
