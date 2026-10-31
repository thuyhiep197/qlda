import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useMe } from '../hooks';
import { Spinner } from '../components/ui';
import { PermMatrix } from '../components/PermMatrix';
import type { PermissionCatalog, UserPermView } from '../types';

/** Quyền của tôi: ma trận quyền thực tế của chính tài khoản (chỉ xem); ô được cấp riêng (ngoài nhóm) có đánh dấu */
export function MyPermissions() {
  const { data: me } = useMe();
  const { data: catalog } = useQuery<PermissionCatalog>({ queryKey: ['permissions'], queryFn: () => api.get('/permissions') });
  const { data: view } = useQuery<UserPermView>({ queryKey: ['my-permissions', me?.id], queryFn: () => api.get(`/users/${me!.id}/permissions`), enabled: !!me });
  if (!catalog || !view) return <Spinner />;
  const has = new Set(view.effective);
  return (
    <div className="help-myperms">
      <p>
        Nhóm người dùng: <b>{view.is_admin ? 'Quản trị hệ thống (toàn quyền)' : view.role_name ?? 'Chưa có nhóm'}</b>
        {Object.keys(view.overrides).length > 0 && <> · có <b>{Object.keys(view.overrides).length}</b> quyền được cấp riêng (ô có đánh dấu)</>}
      </p>
      <PermMatrix catalog={catalog} readOnly has={(p) => view.is_admin || has.has(p)} onSet={() => undefined}
        mark={(p) => view.overrides[p]} />
    </div>
  );
}
