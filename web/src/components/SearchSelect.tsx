import { useEffect, useRef, useState, type KeyboardEvent, type RefObject, type SelectHTMLAttributes } from 'react';
import { Check, Search } from 'lucide-react';
import { filterOptions, placePopover, readOptions, type SelectOption } from '../search-select';

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
  const [options, setOptions] = useState<SelectOption[] | null>(null);
  const show = () => {
    const el = ref.current;
    if (!el || el.disabled) return;
    setOptions(readOptions(el));
  };
  const focusSelect = () => ref.current?.focus({ preventScroll: true });
  return (
    <>
      <select ref={ref} value={value} onChange={onChange} {...rest}
        onMouseDown={(e) => { onMouseDown?.(e); if (e.button === 0) { e.preventDefault(); focusSelect(); if (options) setOptions(null); else show(); } }}
        onKeyDown={(e) => { onKeyDown?.(e); if (e.key === 'Enter' || e.key === ' ' || (e.altKey && e.key === 'ArrowDown')) { e.preventDefault(); show(); } }}>
        {children}
      </select>
      {options && (
        <SearchPopover options={options} anchor={ref} value={String(value)}
          onPick={(v) => { setOptions(null); focusSelect(); if (v !== String(value)) onChange({ target: { value: v } }); }}
          onClose={() => { setOptions(null); focusSelect(); }} />
      )}
    </>
  );
}

function SearchPopover({ options, anchor, value, onPick, onClose }: {
  options: SelectOption[]; anchor: RefObject<HTMLSelectElement | null>; value: string; onPick: (v: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const place = () => { const el = anchor.current; return el ? placePopover(el.getBoundingClientRect(), window.innerWidth, window.innerHeight) : null; };
  const [pos, setPos] = useState(place);
  const list = filterOptions(options, q);
  const pickable = list.filter((o) => !o.disabled);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    box.current?.querySelector('input')?.focus({ preventScroll: true });
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) close.current(); };
    // Cuộn trang / khung, đổi cỡ cửa sổ: bảng nổi bám theo ô chọn; ô đã ra khỏi màn hình thì đóng.
    // (Trước đây cuộn là đóng ngay — ô ở gần mép khung Sửa dự án tự cuộn khi bấm nên bảng vừa mở đã đóng.)
    const onMove = (e: Event) => {
      if (box.current?.contains(e.target as Node)) return;
      const p = place();
      if (p) setPos(p); else close.current();
    };
    const onResize = onMove;
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
  if (!pos) return null;
  let lastGroup: string | null = null;
  return (
    <div className="picker-pop search-select-pop" ref={box} style={pos}>
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
