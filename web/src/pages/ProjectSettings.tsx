import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, refreshAll } from '../api';
import { useMe, useUsersBasic } from '../hooks';
import type { Category, IssueType, Status } from '../types';
import { CATEGORY_LABELS, statusesFor, TYPE_LABELS } from '../util';
import { Avatar, Modal, StatusBadge, toast, toastError, TypeIcon } from '../components/ui';
import { useProjectCtx } from './ProjectLayout';

export default function ProjectSettings() {
  const [tab, setTab] = useState<'general' | 'members' | 'workflow'>('general');
  return (
    <div className="page-pad">
      <div className="tabs tabs-sm">
        <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>Thông tin chung</button>
        <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>Thành viên & vai trò</button>
        <button className={tab === 'workflow' ? 'active' : ''} onClick={() => setTab('workflow')}>Trạng thái & workflow</button>
      </div>
      {tab === 'general' && <General />}
      {tab === 'members' && <Members />}
      {tab === 'workflow' && <Workflow />}
    </div>
  );
}

function General() {
  const project = useProjectCtx();
  const { data: me } = useMe();
  const navigate = useNavigate();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [type, setType] = useState(project.type);
  const [lead, setLead] = useState(String(project.lead_id));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.patch(`/projects/${project.key}`, { name, description, type, lead_id: Number(lead) });
      toast('Đã lưu thông tin dự án');
      await refreshAll();
    } catch (err) { toastError(err); }
  };
  const archive = async () => {
    if (!confirm(`Lưu trữ dự án ${project.name}? Dự án sẽ bị ẩn khỏi danh sách; có thể khôi phục trong mục Tất cả dự án.`)) return;
    try { await api.post(`/projects/${project.key}/archive`, { archived: true }); await refreshAll(); navigate('/projects'); } catch (err) { toastError(err); }
  };

  return (
    <form className="card narrow stack" onSubmit={submit}>
      <label className="field"><span>Tên dự án</span><input value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <label className="field"><span>Mã dự án</span><input value={project.key} disabled /></label>
      <label className="field"><span>Mô hình</span>
        <select value={type} onChange={(e) => setType(e.target.value as 'scrum' | 'kanban')}>
          <option value="scrum">Scrum</option><option value="kanban">Kanban</option>
        </select></label>
      <label className="field"><span>Trưởng dự án</span>
        <select value={lead} onChange={(e) => setLead(e.target.value)}>
          {project.members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select></label>
      <label className="field"><span>Mô tả</span><textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <div className="row gap-sm">
        <button className="btn btn-primary">Lưu</button>
        <div className="spacer" />
        {!!me?.is_admin && <button type="button" className="btn btn-danger" onClick={archive}>Lưu trữ dự án</button>}
      </div>
    </form>
  );
}

function Members() {
  const project = useProjectCtx();
  const { data: me } = useMe();
  const { data: users } = useUsersBasic();
  const [adding, setAdding] = useState(false);
  const [userIds, setUserIds] = useState<number[]>([]);
  const [q, setQ] = useState('');

  const remove = async (userId: number, name: string) => {
    if (!confirm(`Xóa ${name} khỏi dự án? Các issue đang giao cho người này vẫn được giữ nguyên.`)) return;
    try { await api.del(`/projects/${project.key}/members/${userId}`); await refreshAll(); } catch (e) { toastError(e); }
  };
  const add = async () => {
    try {
      await api.post(`/projects/${project.key}/members`, { user_ids: userIds });
      toast(`Đã thêm ${userIds.length} thành viên`);
      setAdding(false); setUserIds([]);
      await refreshAll();
    } catch (e) { toastError(e); }
  };
  const candidates = (users?.filter((u) => !project.members.some((m) => m.id === u.id)) ?? [])
    .filter((u) => !q || `${u.full_name} ${u.username} ${u.default_role_name || ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="card">
      <div className="card-head">
        <h3>Thành viên ({project.members.length})</h3>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Thêm thành viên</button>
      </div>
      <table className="table">
        <thead><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Email</th><th>Vai trò</th><th /></tr></thead>
        <tbody>
          {project.members.map((m) => (
            <tr key={m.id}>
              <td><div className="row gap-sm"><Avatar name={m.full_name} size={26} /> {m.full_name} {!m.is_active && <span className="lozenge lozenge-red">Đã khóa</span>}</div></td>
              <td>@{m.username}</td>
              <td>{m.email}</td>
              <td><span className="lozenge lozenge-default">{m.role_name}</span></td>
              <td className="num">{(m.id !== me?.id || me?.is_admin) && <button className="btn btn-subtle btn-sm" onClick={() => remove(m.id, m.full_name)}>Xóa khỏi dự án</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Thành viên dự án quyết định ai được vào dự án. Quyền của mỗi người lấy theo <b>vai trò của tài khoản</b>
        {me?.is_admin ? <> (đổi ở mục <b>Người dùng</b>)</> : null}. Quản trị hệ thống luôn có toàn quyền trên mọi dự án.
      </p>

      {adding && (
        <Modal title="Thêm thành viên" onClose={() => setAdding(false)} footer={<>
          <div className="spacer" />
          <button className="btn" onClick={() => setAdding(false)}>Hủy</button>
          <button className="btn btn-primary" disabled={!userIds.length} onClick={add}>Thêm {userIds.length || ''}</button>
        </>}>
          <div className="stack">
            <input autoFocus placeholder="Tìm theo tên hoặc vai trò (VD: Dev)" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="field"><span>Chọn người dùng ({candidates.length} người chưa tham gia)</span>
              <div className="check-list">
                {candidates.map((u) => (
                  <label key={u.id} className="check">
                    <input type="checkbox" checked={userIds.includes(u.id)}
                      onChange={(e) => setUserIds(e.target.checked ? [...userIds, u.id] : userIds.filter((x) => x !== u.id))} />
                    <Avatar name={u.full_name} size={22} /> {u.full_name} <span className="muted small">@{u.username}</span>
                    <span className="spacer" />
                    {u.default_role_name ? <span className="lozenge lozenge-default">{u.default_role_name}</span> : <span className="small danger">Chưa có vai trò</span>}
                  </label>
                ))}
                {!candidates.length && <div className="muted small">Không còn người dùng nào để thêm. Quản trị viên có thể tạo thêm tài khoản ở mục Người dùng.</div>}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

const WF_TYPES: IssueType[] = ['epic', 'story', 'task', 'bug', 'subtask'];

function Workflow() {
  const project = useProjectCtx();
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState<Category>('inprogress');
  const statuses = project.statuses;

  const patch = async (s: Status, data: Partial<Status>) => {
    try { await api.patch(`/projects/${project.key}/statuses/${s.id}`, data); await refreshAll(); } catch (e) { toastError(e); }
  };
  const move = async (idx: number, dir: -1 | 1) => {
    const ids = statuses.map((s) => s.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    try { await api.put(`/projects/${project.key}/statuses/order`, { ids }); await refreshAll(); } catch (e) { toastError(e); }
  };
  const del = async (s: Status) => {
    const others = statuses.filter((x) => x.id !== s.id);
    const target = prompt(`Xóa trạng thái "${s.name}". Nếu có issue đang ở trạng thái này, chúng sẽ được chuyển sang trạng thái nào?\n(Nếu loại issue không dùng trạng thái đó, tool tự chọn trạng thái cùng nhóm.)\nNhập số thứ tự:\n${others.map((o, i) => `${i + 1}. ${o.name}`).join('\n')}`, '1');
    if (target === null) return;
    const to = others[Number(target) - 1];
    if (!to) return toastError('Lựa chọn không hợp lệ');
    try { await api.del(`/projects/${project.key}/statuses/${s.id}?moveTo=${to.id}`); toast('Đã xóa trạng thái'); await refreshAll(); } catch (e) { toastError(e); }
  };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try { await api.post(`/projects/${project.key}/statuses`, { name: newName, category: newCat }); setNewName(''); await refreshAll(); } catch (err) { toastError(err); }
  };

  return (
    <div className="stack">
      <div className="card">
        <h3>1. Kho trạng thái của dự án (các cột trên bảng)</h3>
        <p className="muted small">Nhóm trạng thái quyết định cách tính tiến độ: <b>Hoàn thành</b> được tính là đã xong trong burndown, velocity và báo cáo. Giới hạn WIP cảnh báo khi cột có quá nhiều issue.</p>
        <table className="table">
          <thead><tr><th style={{ width: 70 }}>Thứ tự</th><th>Tên trạng thái</th><th>Nhóm</th><th>Giới hạn WIP</th><th>Dùng cho</th><th /></tr></thead>
          <tbody>
            {statuses.map((s, i) => (
              <tr key={s.id}>
                <td className="nowrap"><button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)}>↑</button><button className="icon-btn" disabled={i === statuses.length - 1} onClick={() => move(i, 1)}>↓</button></td>
                <td><input defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && patch(s, { name: e.target.value })} /></td>
                <td>
                  <select value={s.category} onChange={(e) => patch(s, { category: e.target.value as Category })}>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td><input type="number" min={0} style={{ width: 80 }} defaultValue={s.wip_limit ?? ''} placeholder="—"
                  onBlur={(e) => patch(s, { wip_limit: e.target.value ? Number(e.target.value) : 0 } as any)} /></td>
                <td><div className="row gap-xs">
                  {WF_TYPES.filter((t) => statusesFor(project, t).some((x) => x.id === s.id)).map((t) => <TypeIcon key={t} type={t} />)}
                </div></td>
                <td className="num"><button className="btn btn-subtle btn-sm" onClick={() => del(s)}>Xóa</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <form className="row gap-xs mt-sm" onSubmit={add}>
          <input placeholder="Tên trạng thái mới" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <select value={newCat} onChange={(e) => setNewCat(e.target.value as Category)}>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn">+ Thêm trạng thái</button>
        </form>
        {Object.keys(project.type_statuses ?? {}).length > 0 && (
          <p className="muted small mt-sm">Trạng thái mới thêm chưa thuộc các loại issue đã cấu hình riêng ở mục 2 — hãy tick để dùng.</p>
        )}
      </div>

      <TypeStatuses />
      <Transitions />
    </div>
  );
}

/** Mục 2: mỗi loại issue dùng những trạng thái nào (ma trận trạng thái × loại issue). */
function TypeStatuses() {
  const project = useProjectCtx();
  const statuses = project.statuses;
  const initial = () => Object.fromEntries(WF_TYPES.map((t) => [t, statusesFor(project, t).map((s) => s.id)])) as Record<IssueType, number[]>;
  const [sel, setSel] = useState(initial);
  const [confirm, setConfirm] = useState<{ type: IssueType; moves: { from: string; to: string; count: number }[] }[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSel(initial()); }, [project.statuses, project.type_statuses]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = WF_TYPES.filter((t) => {
    const cur = statusesFor(project, t).map((s) => s.id);
    return cur.length !== sel[t].length || cur.some((id) => !sel[t].includes(id));
  });
  const toggle = (t: IssueType, id: number) =>
    setSel({ ...sel, [t]: sel[t].includes(id) ? sel[t].filter((x) => x !== id) : [...sel[t], id] });
  const body = (t: IssueType, dry: boolean) => ({
    issue_type: t, dry_run: dry,
    status_ids: sel[t].length === statuses.length ? null : statuses.filter((s) => sel[t].includes(s.id)).map((s) => s.id),
  });

  const save = async () => {
    const empty = changed.find((t) => !sel[t].length);
    if (empty) return toastError(`${TYPE_LABELS[empty]} phải dùng ít nhất một trạng thái`);
    setBusy(true);
    try {
      const plans = [];
      for (const t of changed) {
        const r = await api.put<{ moves: { from: string; to: string; count: number }[] }>(`/projects/${project.key}/type-statuses`, body(t, true));
        if (r.moves.length) plans.push({ type: t, moves: r.moves });
      }
      if (plans.length) setConfirm(plans);
      else await apply();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true);
    try {
      for (const t of changed) await api.put(`/projects/${project.key}/type-statuses`, body(t, false));
      toast('Đã lưu trạng thái theo loại issue');
      setConfirm(null);
      await refreshAll();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <h3>2. Trạng thái theo loại issue</h3>
      <p className="muted small">
        Tick các trạng thái mà từng loại issue được dùng. VD: Bug chỉ dùng <i>Cần làm → Đang sửa → Chờ test → Hoàn thành</i>.
        Issue mới nhận trạng thái <b>Cần làm</b> đầu tiên của loại đó; trên bảng, cột không thuộc loại issue sẽ bị khóa khi kéo thả.
      </p>
      <div className="table-wrap">
        <table className="table matrix">
          <thead>
            <tr>
              <th>Trạng thái</th>
              {WF_TYPES.map((t) => (
                <th key={t} className="center"><span className="row gap-xs" style={{ justifyContent: 'center' }}><TypeIcon type={t} /> {TYPE_LABELS[t]}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {statuses.map((s) => (
              <tr key={s.id}>
                <th><StatusBadge name={s.name} category={s.category} /></th>
                {WF_TYPES.map((t) => (
                  <td key={t} className="center">
                    <input type="checkbox" checked={sel[t].includes(s.id)} onChange={() => toggle(t, s.id)} aria-label={`${TYPE_LABELS[t]} dùng ${s.name}`} />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="group-row">
              <td>Số trạng thái</td>
              {WF_TYPES.map((t) => <td key={t} className="center">{sel[t].length === statuses.length ? 'Tất cả' : sel[t].length}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="row gap-sm mt-sm">
        <button className="btn btn-primary" disabled={!changed.length || busy} onClick={save}>Lưu trạng thái theo loại</button>
        {changed.length > 0 && <button className="btn" onClick={() => setSel(initial())}>Hoàn tác</button>}
        {changed.length > 0 && <span className="muted small">Đang sửa: {changed.map((t) => TYPE_LABELS[t]).join(', ')}</span>}
      </div>

      {confirm && (
        <Modal title="Chuyển trạng thái cho issue hiện có" onClose={() => setConfirm(null)} footer={<>
          <div className="spacer" />
          <button className="btn" onClick={() => setConfirm(null)}>Hủy</button>
          <button className="btn btn-primary" disabled={busy} onClick={apply}>Đồng ý và lưu</button>
        </>}>
          <p>Một số issue đang ở trạng thái sắp bị bỏ khỏi loại của chúng. Tool sẽ chuyển sang trạng thái cùng nhóm như sau (có ghi lịch sử):</p>
          <table className="table compact">
            <thead><tr><th>Loại</th><th>Từ</th><th>Sang</th><th className="num">Số issue</th></tr></thead>
            <tbody>
              {confirm.flatMap((p) => p.moves.map((m, i) => (
                <tr key={`${p.type}-${i}`}><td>{TYPE_LABELS[p.type]}</td><td>{m.from}</td><td>{m.to}</td><td className="num">{m.count}</td></tr>
              )))}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}

/** Mục 3: luồng chuyển trạng thái — luồng chung và luồng riêng theo loại issue. */
function Transitions() {
  const project = useProjectCtx();
  const [strict, setStrict] = useState(!!project.workflow_strict);
  const [scope, setScope] = useState<'' | IssueType>('');
  const hasOwn = (t: IssueType) => project.transitions.some((x) => x.issue_type === t);
  const load = (sc: string) => new Set(project.transitions.filter((t) => t.issue_type === sc).map((t) => `${t.from_status_id}-${t.to_status_id}`));
  const [matrix, setMatrix] = useState(() => load(''));
  const [own, setOwn] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setStrict(!!project.workflow_strict); }, [project.workflow_strict]);
  useEffect(() => {
    const o = scope !== '' && hasOwn(scope);
    setOwn(o);
    setMatrix(load(scope === '' || o ? scope : ''));
    setDirty(false);
  }, [scope, project.transitions]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = scope === '' ? project.statuses : statusesFor(project, scope);
  const editable = scope === '' || own;
  const toggle = (from: number, to: number) => {
    const k = `${from}-${to}`;
    const n = new Set(matrix);
    n.has(k) ? n.delete(k) : n.add(k);
    setMatrix(n); setDirty(true);
  };
  const allowAll = () => {
    const n = new Set<string>();
    list.forEach((a) => list.forEach((b) => a.id !== b.id && n.add(`${a.id}-${b.id}`)));
    setMatrix(n); setDirty(true);
  };
  const saveStrict = async (v: boolean) => {
    setStrict(v);
    try { await api.put(`/projects/${project.key}/workflow`, { strict: v }); await refreshAll(); toast(v ? 'Đã bật kiểm soát luồng chuyển' : 'Đã tắt kiểm soát luồng chuyển'); } catch (e) { toastError(e); }
  };
  const save = async () => {
    try {
      await api.put(`/projects/${project.key}/workflow`, scope !== '' && !own ? { issue_type: scope, use_default: true } : {
        issue_type: scope,
        transitions: [...matrix].map((k) => { const [f, t] = k.split('-').map(Number); return { from_status_id: f, to_status_id: t }; }),
      });
      toast('Đã lưu luồng chuyển'); setDirty(false);
      await refreshAll();
    } catch (e) { toastError(e); }
  };

  return (
    <div className="card">
      <h3>3. Luồng chuyển trạng thái</h3>
      <label className="check">
        <input type="checkbox" checked={strict} onChange={(e) => saveStrict(e.target.checked)} />
        <span>Bật kiểm soát: chỉ cho phép các bước chuyển được đánh dấu</span>
      </label>
      {!strict && <p className="muted small">Đang tắt: issue được chuyển tự do giữa các trạng thái thuộc loại của nó. Vẫn có thể soạn luồng trước rồi bật sau.</p>}
      <div className="tabs tabs-sm mt-sm">
        <button className={scope === '' ? 'active' : ''} onClick={() => setScope('')}>Luồng chung</button>
        {WF_TYPES.map((t) => (
          <button key={t} className={scope === t ? 'active' : ''} onClick={() => setScope(t)}>
            <span className="row gap-xs"><TypeIcon type={t} size={14} /> {TYPE_LABELS[t]}{hasOwn(t) ? ' •' : ''}</span>
          </button>
        ))}
      </div>
      {scope !== '' && (
        <label className="check mb-sm">
          <input type="checkbox" checked={own} onChange={(e) => {
            setOwn(e.target.checked); setDirty(true);
            if (e.target.checked && !hasOwn(scope)) {
              // Bắt đầu từ luồng chung, chỉ giữ các trạng thái của loại này
              const ids = new Set(list.map((s) => s.id));
              setMatrix(new Set([...load('')].filter((k) => k.split('-').every((x) => ids.has(Number(x))))));
            }
          }} />
          <span>{TYPE_LABELS[scope]} dùng luồng chuyển riêng {own ? '' : <span className="muted">(đang dùng luồng chung)</span>}</span>
        </label>
      )}
      <p className="muted small">Hàng là trạng thái <b>hiện tại</b>, cột là trạng thái <b>được phép chuyển tới</b>.{scope === '' ? ' Luồng chung áp dụng cho các loại issue chưa có luồng riêng (dấu • trên tab là loại có luồng riêng).' : ''}</p>
      <div className={`table-wrap ${editable ? '' : 'disabled-block'}`}>
        <table className="table matrix">
          <thead><tr><th>Từ \ Tới</th>{list.map((s) => <th key={s.id}><StatusBadge name={s.name} category={s.category} /></th>)}</tr></thead>
          <tbody>
            {list.map((from) => (
              <tr key={from.id}>
                <th><StatusBadge name={from.name} category={from.category} /></th>
                {list.map((to) => (
                  <td key={to.id} className="center">
                    {from.id === to.id ? '—' : <input type="checkbox" disabled={!editable} checked={matrix.has(`${from.id}-${to.id}`)} onChange={() => toggle(from.id, to.id)} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row gap-sm mt-sm">
        {editable && <button className="btn btn-sm" onClick={allowAll}>Cho phép tất cả</button>}
        <button className="btn btn-primary" disabled={!dirty} onClick={save}>Lưu luồng chuyển</button>
      </div>
    </div>
  );
}
