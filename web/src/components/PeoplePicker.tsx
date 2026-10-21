import { X } from 'lucide-react';
import { useUsersBasic } from '../hooks';
import { candidates, personLabel, ROLE_LABELS, type PeopleRole } from '../people';

/** Chọn nhiều tài khoản cho một vai trò (Sale, AM, BA/PM, Dev, Tester) — hiện "Họ tên (Phòng ban)"; người đã chọn từ trước vẫn giữ dù nay khác vị trí */
export function PeoplePicker({ role, value, onChange }: { role: PeopleRole; value: number[]; onChange: (v: number[]) => void }) {
  const { data: users } = useUsersBasic();
  const label = (id: number) => { const u = users?.find((x) => x.id === id); return u ? personLabel(u) : '…'; };
  return (
    <div className="staff-picker">
      {value.map((id) => (
        <span key={id} className="chip">{label(id)}
          <button type="button" aria-label={`Bỏ ${label(id)}`} onClick={() => onChange(value.filter((x) => x !== id))}><X size={12} /></button></span>
      ))}
      <select value="" onChange={(e) => e.target.value && onChange([...value, Number(e.target.value)])} aria-label={`Thêm ${ROLE_LABELS[role]}`}>
        <option value="">+ Thêm…</option>
        {candidates(users ?? [], role, value).map((u) => <option key={u.id} value={u.id}>{personLabel(u)}</option>)}
      </select>
    </div>
  );
}
