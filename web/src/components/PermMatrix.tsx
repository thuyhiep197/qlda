import { Fragment, useEffect, useRef } from 'react';
import type { PermAction, PermissionCatalog } from '../types';

// Xem tất cả đứng cạnh (bên trái) cột Tất cả
const ACTION_ORDER: PermAction[] = ['view', 'create', 'edit', 'delete', 'export', 'import', 'view_all'];

/** Ô tick hỗ trợ trạng thái "một phần" (một số quyền trong hàng/nhóm được bật). */
function TriCheck({ state, onChange, disabled, title }: {
  state: 'all' | 'some' | 'none'; onChange: (v: boolean) => void; disabled?: boolean; title?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === 'some'; }, [state]);
  return <input ref={ref} type="checkbox" checked={state === 'all'} disabled={disabled} data-tip={title}
    onChange={() => onChange(state !== 'all')} />;
}

/**
 * Ma trận phân quyền: Phân hệ → Module → Chức năng × Hành động (Xem, Thêm, Sửa, Xóa, Tải, Import).
 * Tick từng ô, cả hàng (một chức năng), cả cột / cả module, hoặc cả phân hệ.
 * Xem = chỉ khách hàng / dự án mình tham gia (Tài liệu nội bộ: tệp mình tải lên); Xem tất cả (cột riêng) = của mọi người.
 * Phân hệ chỉ hiện với người dùng khi có ít nhất một ô Xem / Xem tất cả của module nào trong phân hệ.
 * Ô có nghĩa riêng ở chức năng đó (VD Xóa = Lưu trữ) ghi tên ngay cạnh ô tick.
 * mark(p): 'allow' khi là quyền cấp thêm riêng cho người dùng (chế độ phân quyền theo người dùng).
 * locked(p): quyền theo nhóm (chế độ theo người dùng) — luôn tích, không bỏ được; ô tích hàng loạt bỏ qua ô khóa.
 */
export function PermMatrix({ catalog, has, onSet, mark, locked, readOnly }: {
  catalog: PermissionCatalog;
  has: (perm: string) => boolean;
  onSet: (perms: string[], value: boolean) => void;
  mark?: (perm: string) => 'allow' | 'deny' | undefined;
  locked?: (perm: string) => boolean;
  readOnly?: boolean;
}) {
  const set = (perms: string[], value: boolean) => onSet(locked ? perms.filter((x) => !locked(x)) : perms, value);
  const stateOf = (perms: string[]): 'all' | 'some' | 'none' => {
    const n = perms.filter(has).length;
    return n === 0 ? 'none' : n === perms.length ? 'all' : 'some';
  };
  return (
    <div className="table-wrap">
      <table className="table matrix perm-matrix">
        <thead>
          <tr>
            <th>Chức năng</th>
            {ACTION_ORDER.map((a) => <th key={a} className="center">{catalog.actions[a]}</th>)}
            <th className="center" data-tip="Bật/tắt mọi hành động của chức năng">Tất cả</th>
          </tr>
        </thead>
        <tbody>
          {catalog.subsystems.map((s) => {
            const groups = catalog.groups.filter((g) => g.subsystem === s.key);
            const all = groups.flatMap((g) => g.features.flatMap((f) => f.actions.map((a) => `${f.key}.${a}`)));
            return (
              <Fragment key={s.key}>
                <tr className="perm-subsystem">
                  <td colSpan={ACTION_ORDER.length + 1}>{s.label}</td>
                  <td className="center"><TriCheck state={stateOf(all)} disabled={readOnly} onChange={(v) => set(all, v)} title={`Toàn bộ ${s.label}`} /></td>
                </tr>
                {groups.map((g) => <GroupRows key={g.key} g={g} catalog={catalog} has={has} onSet={set} mark={mark} locked={locked} readOnly={readOnly} stateOf={stateOf} />)}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Một module: dòng tiêu đề (bật/tắt theo cột hoặc cả module) và các chức năng */
function GroupRows({ g, catalog, has, onSet, mark, locked, readOnly, stateOf }: {
  g: PermissionCatalog['groups'][number]; catalog: PermissionCatalog; has: (perm: string) => boolean; onSet: (perms: string[], value: boolean) => void;
  mark?: (perm: string) => 'allow' | 'deny' | undefined; locked?: (perm: string) => boolean; readOnly?: boolean; stateOf: (perms: string[]) => 'all' | 'some' | 'none';
}) {
  const groupPerms = g.features.flatMap((f) => f.actions.map((a) => `${f.key}.${a}`));
  return (
    <>
      <tr className="group-row perm-group">
        <td>{g.label}</td>
        {ACTION_ORDER.map((a) => {
          const col = g.features.filter((f) => f.actions.includes(a)).map((f) => `${f.key}.${a}`);
          return <td key={a} className="center">{col.length > 0 &&
            <TriCheck state={stateOf(col)} disabled={readOnly} onChange={(v) => onSet(col, v)} title={`${catalog.actions[a]}: cả ${g.label}`} />}</td>;
        })}
        <td className="center"><TriCheck state={stateOf(groupPerms)} disabled={readOnly} onChange={(v) => onSet(groupPerms, v)} title={`Toàn bộ ${g.label}`} /></td>
      </tr>
      {g.features.map((f) => {
        const row = f.actions.map((a) => `${f.key}.${a}`);
        return (
          <tr key={f.key}>
            <td className="perm-feature">
              <span>{f.label}</span>
              {f.hint && <span className="muted small"> · {f.hint}</span>}
            </td>
            {ACTION_ORDER.map((a) => {
              if (!f.actions.includes(a)) return <td key={a} className="center perm-na" />;
              const p = `${f.key}.${a}`;
              const m = mark?.(p);
              const own = f.actionLabels?.[a];
              const lock = !!locked?.(p);
              return (
                <td key={a} className={`center ${m ? `perm-${m}` : ''}`}
                  data-tip={[f.actionHints?.[a], lock ? 'Theo nhóm người dùng' : m === 'allow' ? 'Cấp thêm riêng cho người này' : ''].filter(Boolean).join(' · ') || undefined}>
                  <label className="perm-cell">
                    <input type="checkbox" checked={has(p)} disabled={readOnly || lock} onChange={() => onSet([p], !has(p))} aria-label={`${f.label}: ${own ?? catalog.actions[a]}`} />
                    {own && <span className="perm-own">{own}</span>}
                  </label>
                </td>
              );
            })}
            <td className="center"><TriCheck state={stateOf(row)} disabled={readOnly} onChange={(v) => onSet(row, v)} /></td>
          </tr>
        );
      })}
    </>
  );
}
