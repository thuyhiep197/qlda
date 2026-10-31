import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, refreshAll } from '../api';
import { Search } from 'lucide-react';
import { hasPerm, useMe, useRoles } from '../hooks';
import type { PermissionCatalog, User, UserBasic } from '../types';
import { HelpTip, Spinner, toast, toastError } from '../components/ui';
import { PermMatrix } from '../components/PermMatrix';
import { UserPermEditor } from '../components/UserPermEditor';
import { fold } from '../customer-filter';
import { HelpButton } from '../help/HelpMenu';

/**
 * Phân quyền, 2 tab: Theo nhóm người dùng (bảng quyền Chức năng × Hành động gán mặc định cho người thuộc nhóm)
 * và Theo người dùng (quyền nhóm + quyền cấp thêm riêng cho từng người).
 */
export default function AdminRoles() {
  const [tab, setTab] = useState<'roles' | 'users'>('roles');
  const tabs = (
    <div className="tabs tabs-sm mb-sm">
      <button className={tab === 'roles' ? 'active' : ''} onClick={() => setTab('roles')}>Theo nhóm người dùng</button>
      <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Theo người dùng</button>
    </div>
  );
  return tab === 'roles' ? <RolesTab tabs={tabs} /> : <UsersTab tabs={tabs} />;
}

/** Theo người dùng: danh sách người (bên trái), ma trận quyền nhóm (khóa) + quyền cấp thêm riêng (bên phải) */
function UsersTab({ tabs }: { tabs: React.ReactNode }) {
  const { data: me } = useMe();
  // Có Người dùng – Xem: danh sách đầy đủ (kèm số quyền riêng); chỉ có Phân quyền – Xem: danh sách rút gọn tài khoản đang hoạt động
  const full = hasPerm(me, 'user.view');
  const { data: users } = useQuery<(UserBasic & Partial<Pick<User, 'is_active' | 'extra_permissions'>>)[]>({
    queryKey: full ? ['users'] : ['users-basic'], queryFn: () => api.get(full ? '/users' : '/users/basic') });
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const list = (users ?? []).filter((u) => u.is_active !== 0 && (!q.trim() || fold(`${u.full_name} ${u.username} ${u.default_role_name ?? ''}`).includes(fold(q.trim()))));
  const cur = list.find((u) => u.id === selected) ?? list[0];
  const pick = (id: number) => {
    if (dirty && !confirm('Người dùng hiện tại có thay đổi chưa lưu. Bỏ thay đổi?')) return;
    setSelected(id);
  };
  return (
    <div className="page">
      <div className="page-head">
        <h1>Nhóm người dùng & phân quyền <HelpButton /></h1>
        <HelpTip text="Quyền thực tế của một người = quyền của nhóm người dùng + quyền cấp thêm riêng cho người đó. Quyền nhóm sửa ở tab Theo nhóm người dùng." />
      </div>
      {tabs}
      {!users ? <Spinner /> : (
        <div className="perm-layout">
          <aside className="perm-groups">
            <div className="cw-search mb-sm"><Search size={13} /><input placeholder="Tìm người, nhóm…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            {list.map((u) => (
              <button key={u.id} className={u.id === cur?.id ? 'active' : ''} onClick={() => pick(u.id)}>
                <b>{u.full_name}</b>
                <span className="muted small">{u.default_role_name ?? 'Chưa có nhóm'}{u.extra_permissions ? ` · +${u.extra_permissions} quyền riêng` : ''}</span>
              </button>
            ))}
            {!list.length && <div className="muted small pad">Không tìm thấy</div>}
          </aside>
          {cur && (
            <section className="perm-main">
              <h2 className="mb-sm">{cur.full_name} <span className="muted small">@{cur.username}</span></h2>
              <UserPermEditor key={cur.id} userId={cur.id} onDirty={setDirty} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/** Theo nhóm người dùng: mỗi nhóm có bảng quyền Chức năng × Hành động, gán mặc định cho người thuộc nhóm. */
function RolesTab({ tabs }: { tabs: React.ReactNode }) {
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
      const r = await api.post<{ id: number }>('/roles', { name, permissions: ['plan.view', 'issue.view', 'comment.view', 'comment.create'] });
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
  // Mọi quyền trong danh mục — nhóm Quản trị hệ thống hiển thị và sao chép như toàn quyền
  const allPerms = catalog.groups.flatMap((g) => g.features.flatMap((f) => f.actions.map((a) => `${f.key}.${a}`)));
  const permsOf = (r: (typeof roles)[number]) => (r.is_admin ? allPerms : r.permissions);
  const copyFrom = (id: string) => {
    const src = roles.find((r) => String(r.id) === id);
    if (src) { setDraft(new Set(permsOf(src))); setDirty(true); }
  };
  const fixed = !!role?.is_admin;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Nhóm người dùng & phân quyền <HelpButton /></h1>
        <HelpTip text="Quyền của nhóm được gán mặc định cho mọi người thuộc nhóm. Muốn cấp thêm quyền cho riêng một người, dùng tab Theo người dùng. Nhóm Quản trị hệ thống luôn có toàn quyền." />
        <div className="spacer" />
        {hasPerm(me, 'role.create') && <button className="btn" onClick={create}>+ Tạo nhóm</button>}
      </div>
      {tabs}

      <div className="perm-layout">
        <aside className="perm-groups">
          {roles.map((r) => (
            <button key={r.id} className={r.id === role?.id ? 'active' : ''} onClick={() => pick(r.id)}>
              <b>{r.name}</b>
              <span className="muted small">{r.usage} người · {r.is_admin ? 'Toàn quyền' : `${r.permissions.length} quyền`}</span>
            </button>
          ))}
        </aside>

        {role && (
          <section className="perm-main">
            <div className="row gap-sm wrap mb-sm">
              <h2 className="grow">{role.name}{role.description && <span className="muted small"> — {role.description}</span>}</h2>
              {canEdit && !fixed && (
                <select value="" onChange={(e) => copyFrom(e.target.value)} data-tip="Chép bảng quyền của nhóm khác làm điểm bắt đầu">
                  <option value="">Sao chép quyền từ nhóm…</option>
                  {roles.filter((r) => r.id !== role.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
              {canEdit && !fixed && <button className="btn btn-sm" onClick={rename}>Đổi tên</button>}
              {hasPerm(me, 'role.delete') && role.usage === 0 && !role.project_usage && !fixed && <button className="btn btn-sm btn-subtle danger" onClick={remove}>Xóa nhóm</button>}
              {canEdit && !fixed && <button className="btn btn-primary" disabled={!dirty} onClick={save}>Lưu thay đổi</button>}
            </div>
            {fixed && <p className="muted small mb-sm">Người thuộc nhóm này là Quản trị hệ thống: luôn có toàn quyền trên mọi phân hệ, dự án, khách hàng. Quyền của nhóm cố định, không sửa được. Cấp / gỡ quản trị bằng cách đổi nhóm của tài khoản ở Người dùng.</p>}
            <PermMatrix catalog={catalog} has={(p) => fixed || draft.has(p)} onSet={onSet} readOnly={!canEdit || fixed} />
            <p className="muted small">Ô trống: hành động không áp dụng cho chức năng đó. Ô "Tất cả" ở mỗi dòng bật/tắt mọi hành động của chức năng; dòng tiêu đề nhóm bật/tắt theo cột hoặc cả nhóm chức năng.</p>
          </section>
        )}
      </div>
    </div>
  );
}
