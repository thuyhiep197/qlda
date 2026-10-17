import { useEffect, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { useUsersBasic } from '../hooks';
import { fold } from '../customer-filter';

/**
 * Ô chọn người (một hoặc nhiều) dạng bảng nổi: tìm theo tên, nhóm theo phòng ban;
 * phòng ban gợi ý (VD theo quy trình mẫu: KD, BA+DEV) được đưa lên đầu.
 */
export function UserPickerPopover({ value, multi, prefer, onChange, onClose }: {
  value: number[]; multi?: boolean; prefer?: string | null; onChange: (ids: number[]) => void; onClose: () => void;
}) {
  const { data: users } = useUsersBasic();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(value);
  const box = useRef<HTMLDivElement>(null);
  const preferred = (prefer ?? '').split('+').map((x) => x.trim().toUpperCase()).filter(Boolean);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) done(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  });
  const done = () => { if (multi && sel.join() !== value.join()) onChange(sel); onClose(); };
  const pick = (id: number) => {
    if (!multi) { onChange(sel[0] === id ? [] : [id]); onClose(); return; }
    setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  };
  const list = (users ?? []).filter((u) => !q.trim() || fold(`${u.full_name} ${u.username} ${u.department_name ?? ''} ${(u.position_codes ?? []).join(' ')}`).includes(fold(q.trim())));
  // Người có vị trí theo quy trình (VD KD, BA) lên đầu; sau đó theo thứ tự phòng ban trong sơ đồ tổ chức
  const fits = (u: (typeof list)[number]) => (u.position_codes ?? []).some((c) => preferred.includes(c.toUpperCase()));
  list.sort((a, b) => Number(fits(b)) - Number(fits(a)) || (a.department_order ?? 99) - (b.department_order ?? 99) || a.full_name.localeCompare(b.full_name, 'vi'));
  let lastGroup: string | null | undefined;
  return (
    <div className="picker-pop" ref={box} onClick={(e) => e.stopPropagation()}>
      <div className="cw-search"><Search size={13} /><input autoFocus placeholder="Tìm người…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="picker-list">
        {!multi && sel.length > 0 && <button className="picker-item muted" onClick={() => { onChange([]); onClose(); }}>— Bỏ giao —</button>}
        {list.map((u) => {
          const group = fits(u) ? `Theo quy trình: ${preferred.join(' + ')}` : u.department_name ?? 'Chưa xếp phòng ban';
          const head = group !== lastGroup ? <div className="picker-group">{group}</div> : null;
          lastGroup = group;
          return (
            <div key={u.id}>
              {head}
              <button className={`picker-item ${sel.includes(u.id) ? 'on' : ''}`} onClick={() => pick(u.id)}>
                <span className="picker-check">{sel.includes(u.id) && <Check size={13} />}</span>
                <span className="grow ellipsis">{u.full_name}</span>
                {u.department_code && <span className="unit-chip">{u.department_code}</span>}
              </button>
            </div>
          );
        })}
        {!list.length && <div className="muted small pad">Không tìm thấy</div>}
      </div>
      {multi && <div className="picker-foot"><span className="muted small">Đã chọn {sel.length}</span><div className="spacer" /><button className="btn btn-primary btn-sm" onClick={done}>Xong</button></div>}
    </div>
  );
}

/** Tên người kèm mã phòng ban (tự theo tài khoản) */
export function PersonChip({ name, dept }: { name: string; dept?: string | null }) {
  return <span className="person-chip">{dept && <span className="unit-chip">{dept}</span>}<span className="ellipsis">{name}</span></span>;
}
