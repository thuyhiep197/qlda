import { Fragment, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, refreshAll } from '../api';
import { useRoles } from '../hooks';
import type { PermissionDef } from '../types';
import { Spinner, toast, toastError } from '../components/ui';

export default function AdminRoles() {
  const { data: roles } = useRoles();
  const { data: perms } = useQuery<PermissionDef[]>({ queryKey: ['permissions'], queryFn: () => api.get('/permissions') });
  const [draft, setDraft] = useState<Record<number, string[]>>({});
  const [dirty, setDirty] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (roles) {
      setDraft(Object.fromEntries(roles.map((r) => [r.id, r.permissions])));
      setDirty(new Set());
    }
  }, [roles]);

  if (!roles || !perms) return <Spinner />;

  const toggle = (roleId: number, p: string) => {
    const cur = draft[roleId] || [];
    setDraft({ ...draft, [roleId]: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] });
    setDirty(new Set(dirty).add(roleId));
  };

  const save = async () => {
    try {
      for (const id of dirty) await api.patch(`/roles/${id}`, { permissions: draft[id] });
      toast('Đã lưu phân quyền');
      await refreshAll();
    } catch (e) { toastError(e); }
  };

  const create = async () => {
    const name = prompt('Tên vai trò mới (VD: Tech Lead, Khách hàng):');
    if (!name?.trim()) return;
    try { await api.post('/roles', { name, permissions: ['comment.create'] }); await refreshAll(); } catch (e) { toastError(e); }
  };

  const rename = async (id: number, old: string) => {
    const name = prompt('Đổi tên vai trò:', old);
    if (!name?.trim() || name === old) return;
    try { await api.patch(`/roles/${id}`, { name }); await refreshAll(); } catch (e) { toastError(e); }
  };

  const remove = async (id: number, name: string) => {
    if (!confirm(`Xóa vai trò "${name}"?`)) return;
    try { await api.del(`/roles/${id}`); toast('Đã xóa vai trò'); await refreshAll(); } catch (e) { toastError(e); }
  };

  const groups = [...new Set(perms.map((p) => p.group))];

  return (
    <div className="page">
      <div className="page-head">
        <h1>Vai trò & quyền</h1>
        <div className="spacer" />
        <button className="btn" onClick={create}>+ Tạo vai trò</button>
        <button className="btn btn-primary" disabled={!dirty.size} onClick={save}>Lưu thay đổi</button>
      </div>
      <p className="muted">
        Mỗi thành viên dự án được gán <b>một vai trò</b> trong từng dự án. Một người có thể là PM ở dự án này nhưng là Người xem ở dự án khác.
        Mọi thành viên đều được <b>xem</b> dự án; bảng dưới quy định các quyền thao tác.
        Tài khoản <b>Quản trị hệ thống</b> có toàn quyền trên mọi dự án.
      </p>
      <div className="table-wrap">
        <table className="table matrix roles-matrix">
          <thead>
            <tr>
              <th>Quyền</th>
              {roles.map((r) => (
                <th key={r.id}>
                  <div className="role-head">
                    <a onClick={() => rename(r.id, r.name)} title="Đổi tên">{r.name}</a>
                    <span className="muted small">{r.usage} thành viên</span>
                    {r.usage === 0 && <a className="small danger" onClick={() => remove(r.id, r.name)}>Xóa</a>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr className="group-row"><td colSpan={roles.length + 1}>{g}</td></tr>
                {perms.filter((p) => p.group === g).map((p) => (
                  <tr key={p.key}>
                    <td>{p.label}</td>
                    {roles.map((r) => (
                      <td key={r.id} className="center">
                        <input type="checkbox" checked={draft[r.id]?.includes(p.key) ?? false} onChange={() => toggle(r.id, p.key)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
