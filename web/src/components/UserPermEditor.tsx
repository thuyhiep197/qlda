import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, queryClient, refreshAll } from '../api';
import { hasPerm, useMe } from '../hooks';
import type { PermissionCatalog, UserPermView } from '../types';
import { PermMatrix } from './PermMatrix';
import { Spinner, toast, toastError } from './ui';
import { extraPerms } from '../perm-user';

/**
 * Phân quyền theo người dùng: quyền thực tế = quyền của nhóm (tích sẵn, khóa) + quyền cấp thêm riêng (tích thêm ô ngoài nhóm).
 * Dùng ở Phân quyền → Theo người dùng và nút Phân quyền trên dòng Người dùng.
 */
export function UserPermEditor({ userId, onSaved, onDirty }: { userId: number; onSaved?: () => void; onDirty?: (dirty: boolean) => void }) {
  const { data: me } = useMe();
  const { data: catalog } = useQuery<PermissionCatalog>({ queryKey: ['permissions'], queryFn: () => api.get('/permissions') });
  const { data: view } = useQuery<UserPermView>({ queryKey: ['user-perms', userId], queryFn: () => api.get(`/users/${userId}/permissions`) });
  const [extra, setExtra] = useState<Set<string> | null>(null);
  useEffect(() => { setExtra(null); onDirty?.(false); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!catalog || !view) return <Spinner />;

  const group = new Set(view.group);
  const cur = extra ?? new Set(Object.keys(view.overrides));
  const has = (p: string) => group.has(p) || cur.has(p);
  const onSet = (perms: string[], value: boolean) => {
    const n = new Set(cur);
    for (const p of perms) if (value) n.add(p); else n.delete(p);
    setExtra(n); onDirty?.(true);
  };
  const canEdit = hasPerm(me, 'role.edit') && !view.is_admin;
  const save = async () => {
    try {
      await api.put(`/users/${userId}/permissions`, { overrides: Object.fromEntries(extraPerms(group, cur).map((p) => [p, 'allow'])) });
      toast(`Đã lưu quyền của ${view.full_name}`);
      setExtra(null); onDirty?.(false);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['user-perms', userId] }), refreshAll()]);
      onSaved?.();
    } catch (e) { toastError(e); }
  };
  const nExtra = extraPerms(group, cur).length;

  return (
    <div className="stack">
      <div className="row gap-sm wrap">
        <div className="perm-legend small grow">
          <span>Nhóm người dùng: <b>{view.role_name || 'Chưa có'}</b></span>
          <span><i style={{ background: 'var(--surface)' }} />Theo nhóm (khóa)</span>
          <span><i style={{ background: 'var(--st-done-bg)' }} />Cấp thêm riêng ({nExtra})</span>
        </div>
        {canEdit && nExtra > 0 && <button className="btn btn-subtle btn-sm" onClick={() => onSet([...cur], false)}>Bỏ hết quyền riêng</button>}
        {canEdit && <button className="btn btn-primary" disabled={extra === null} onClick={save}>Lưu thay đổi</button>}
      </div>
      {view.is_admin && <div className="form-error">Tài khoản Quản trị hệ thống luôn có toàn quyền; không cần phân quyền riêng.</div>}
      <PermMatrix catalog={catalog} has={has} onSet={onSet} locked={(p) => group.has(p)} mark={(p) => (!group.has(p) && cur.has(p) ? 'allow' : undefined)} readOnly={!canEdit} />
      <p className="muted small">Ô đã tích sẵn và khóa là quyền theo nhóm (sửa ở tab Theo nhóm người dùng). Tích thêm ô khác để cấp thêm quyền riêng cho người này. Quyền thực tế = quyền nhóm + quyền riêng.</p>
    </div>
  );
}
