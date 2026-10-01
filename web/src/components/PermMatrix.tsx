import { Fragment, useEffect, useRef } from 'react';
import type { PermAction, PermissionCatalog } from '../types';

const ACTION_ORDER: PermAction[] = ['view', 'create', 'edit', 'delete', 'export', 'import'];

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
 * Ma trận phân quyền: Nhóm chức năng → Chức năng × Hành động (Xem, Thêm, Sửa, Xóa, Tải, Import).
 * Tick từng ô, cả hàng (một chức năng), cả cột trong nhóm, hoặc cả nhóm chức năng.
 * mark(p): 'allow' | 'deny' khi quyền khác với quyền của nhóm người dùng (chế độ phân quyền riêng theo người).
 */
export function PermMatrix({ catalog, has, onSet, mark, readOnly }: {
  catalog: PermissionCatalog;
  has: (perm: string) => boolean;
  onSet: (perms: string[], value: boolean) => void;
  mark?: (perm: string) => 'allow' | 'deny' | undefined;
  readOnly?: boolean;
}) {
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
          {catalog.groups.map((g) => {
            const groupPerms = g.features.flatMap((f) => f.actions.map((a) => `${f.key}.${a}`));
            return (
              <Fragment key={g.key}>
                <tr className="group-row perm-group">
                  <td>{g.label}</td>
                  {ACTION_ORDER.map((a) => {
                    const col = g.features.filter((f) => f.actions.includes(a)).map((f) => `${f.key}.${a}`);
                    return <td key={a} className="center">{col.length > 0 &&
                      <TriCheck state={stateOf(col)} disabled={readOnly} onChange={(v) => onSet(col, v)} title={`${catalog.actions[a]}: cả nhóm ${g.label}`} />}</td>;
                  })}
                  <td className="center"><TriCheck state={stateOf(groupPerms)} disabled={readOnly} onChange={(v) => onSet(groupPerms, v)} title={`Toàn bộ nhóm ${g.label}`} /></td>
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
                        return (
                          <td key={a} className={`center ${m ? `perm-${m}` : ''}`}
                            data-tip={[f.actionHints?.[a], m === 'allow' ? 'Cấp thêm riêng cho người này' : m === 'deny' ? 'Đã chặn riêng với người này' : ''].filter(Boolean).join(' · ') || undefined}>
                            <input type="checkbox" checked={has(p)} disabled={readOnly} onChange={() => onSet([p], !has(p))} aria-label={`${f.label}: ${catalog.actions[a]}`} />
                          </td>
                        );
                      })}
                      <td className="center"><TriCheck state={stateOf(row)} disabled={readOnly} onChange={(v) => onSet(row, v)} /></td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
