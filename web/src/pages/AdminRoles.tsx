import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, refreshAll } from '../api';
import { hasPerm, useMe, useRoles } from '../hooks';
import type { PermissionCatalog } from '../types';
import { HelpTip, Spinner, toast, toastError } from '../components/ui';
import { PermMatrix } from '../components/PermMatrix';

/** Nhóm người dùng & phân quyền: mỗi nhóm có bảng quyền Chức năng × Hành động, gán mặc định cho người thuộc nhóm. */
export default function AdminRoles() {
  const { data: me } = useMe();
  const { data: roles } = useRoles();
  const { data: catalog } = useQuery<PermissionCatalog>({ queryKey: ['permissions'], queryFn: () => api.get('/permissions') });
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const canEdit = hasPerm(me, 'role.edit');

  const role = roles?.find((r) => r.id === selected) ?? roles?.[0];
  useEffect(() => {
    if (role) { setDraft(new Set(role.permissions)); setDirty(false); }
  }, [role?.id, roles]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!roles || !catalog) return <Spinner />;

  const pick = (id: number) => {
    if (dirty && !confirm('Nhóm hiện tại có thay đổi chưa lưu. Bỏ thay đổi?')) return;
    setSelected(id);
  };
  const onSet = (perms: string[], value: boolean) => {
    const n = new Set(draft);
    perms.forEach((p) => (value ? n.add(p) : n.delete(p)));
    setDraft(n); setDirty(true);
  };
  const save = async () => {
    if (!role) return;
    try { await api.patch(`/roles/${role.id}`, { permissions: [...draft] }); toast(`Đã lưu quyền nhóm ${role.name}`); setDirty(false); await refreshAll(); }
    catch (e) { toastError(e); }
  };
  const create = async () => {
    const name = prompt('Tên nhóm người dùng mới (VD: Kiểm thử, Khách hàng):');
    if (!name?.trim()) return;
    try {
      const r = await api.post<{ id: number }>('/roles', { name, permissions: ['dashboard.view', 'plan.view', 'issue.view', 'comment.view', 'comment.create'] });
      await refreshAll(); setSelected(r.id);
    } catch (e) { toastError(e); }
  };
  const rename = async () => {
    if (!role) return;
    const name = prompt('Đổi tên nhóm:', role.name);
    if (!name?.trim() || name === role.name) return;
    const description = prompt('Mô tả nhóm (tùy chọn):', role.description || '') ?? role.description;
    try { await api.patch(`/roles/${role.id}`, { name, description }); await refreshAll(); } catch (e) { toastError(e); }
  };
  const remove = async () => {
    if (!role || !confirm(`Xóa nhóm "${role.name}"?`)) return;
    try { await api.del(`/roles/${role.id}`); toast('Đã xóa nhóm'); setSelected(null); await refreshAll(); } catch (e) { toastError(e); }
  };
  const copyFrom = (id: string) => {
    const src = roles.find((r) => String(r.id) === id);
    if (src) { setDraft(new Set(src.permissions)); setDirty(true); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Nhóm người dùng & phân quyền</h1>
        <HelpTip text="Quyền của nhóm được gán mặc định cho mọi người thuộc nhóm. Muốn cấp thêm hoặc bỏ bớt quyền cho riêng một người, vào Người dùng → Phân quyền. Quản trị hệ thống luôn có toàn quyền." />
        <div className="spacer" />
        {hasPerm(me, 'role.create') && <button className="btn" onClick={create}>+ Tạo nhóm</button>}
      </div>

      <div className="perm-layout">
        <aside className="perm-groups">
          {roles.map((r) => (
            <button key={r.id} className={r.id === role?.id ? 'active' : ''} onClick={() => pick(r.id)}>
              <b>{r.name}</b>
              <span className="muted small">{r.usage} người · {r.permissions.length} quyền</span>
            </button>
          ))}
        </aside>

        {role && (
          <section className="perm-main">
            <div className="row gap-sm wrap mb-sm">
              <h2 className="grow">{role.name}{role.description && <span className="muted small"> — {role.description}</span>}</h2>
              {canEdit && (
                <select value="" onChange={(e) => copyFrom(e.target.value)} data-tip="Chép bảng quyền của nhóm khác làm điểm bắt đầu">
                  <option value="">Sao chép quyền từ nhóm…</option>
                  {roles.filter((r) => r.id !== role.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
              {canEdit && <button className="btn btn-sm" onClick={rename}>Đổi tên</button>}
              {hasPerm(me, 'role.delete') && role.usage === 0 && <button className="btn btn-sm btn-subtle danger" onClick={remove}>Xóa nhóm</button>}
              {canEdit && <button className="btn btn-primary" disabled={!dirty} onClick={save}>Lưu thay đổi</button>}
            </div>
            <PermMatrix catalog={catalog} has={(p) => draft.has(p)} onSet={onSet} readOnly={!canEdit} />
            <p className="muted small">Ô trống: hành động không áp dụng cho chức năng đó. Ô "Tất cả" ở mỗi dòng bật/tắt mọi hành động của chức năng; dòng tiêu đề nhóm bật/tắt theo cột hoặc cả nhóm chức năng.</p>
          </section>
        )}
      </div>
    </div>
  );
}
