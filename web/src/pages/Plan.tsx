import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Download } from 'lucide-react';
import { api, qs, refreshAll } from '../api';
import { useIssueModal, can } from '../hooks';
import type { Issue } from '../types';
import { fmtDate, today as todayStr, TYPE_LABELS, canMove, statusesFor } from '../util';
import { Avatar, Empty, Spinner, StatusBadge, TypeIcon, MoreFilters, toast, toastError } from '../components/ui';
import { useProjectCtx } from './ProjectLayout';

/** Đánh giá tiến độ của một việc tại ngày hôm nay. */
type Health = 'late' | 'behind' | 'on_track' | 'not_started' | 'done' | 'done_late' | 'no_plan';
const HEALTH: Record<Health, { label: string; tone: string; order: number }> = {
  late: { label: 'Trễ hạn', tone: 'red', order: 0 },
  behind: { label: 'Chậm tiến độ', tone: 'yellow', order: 1 },
  on_track: { label: 'Đúng tiến độ', tone: 'blue', order: 2 },
  not_started: { label: 'Chưa đến hạn', tone: 'default', order: 3 },
  done_late: { label: 'Xong, trễ hạn', tone: 'purple', order: 4 },
  done: { label: 'Hoàn thành', tone: 'green', order: 5 },
  no_plan: { label: 'Chưa có lịch', tone: 'default', order: 6 },
};
const HEALTH_HELP = 'Trễ hạn: đã qua hạn hoàn thành mà chưa xong · Chậm tiến độ: % hoàn thành thấp hơn % thời gian đã trôi qua quá 15 điểm'
  + ' (hoặc đã đến ngày bắt đầu mà chưa làm) · Đúng tiến độ: theo kịp thời gian · Chưa đến hạn: chưa tới ngày bắt đầu';

interface Row {
  issue: Issue;
  level: 0 | 1 | 2;
  children: Row[];
  start: string | null;
  end: string | null;
  progress: number; // 0–100
  expected: number | null; // % lẽ ra phải xong theo thời gian
  health: Health;
  note: string;
  owner: string | null; // người phụ trách
  lateKids: number; // số việc con đang trễ
}

const DAY = 86400_000;
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
const days = (a: string, b: string) => Math.round((t(b) - t(a)) / DAY);

function evaluate(r: Row, today: string) {
  const i = r.issue;
  if (i.status_category === 'done') {
    // Ngày hoàn thành theo giờ máy người xem (Việt Nam), không cắt chuỗi UTC
    const doneDay = i.resolved_at ? new Date(new Date(i.resolved_at).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10) : null;
    r.health = r.end && doneDay && doneDay > r.end ? 'done_late' : 'done';
    r.note = r.health === 'done_late' ? `Xong ${fmtDate(doneDay)}, trễ ${days(r.end!, doneDay!)} ngày` : doneDay ? `Xong ${fmtDate(doneDay)}` : '';
    return;
  }
  if (!r.start && !r.end) { r.health = 'no_plan'; r.note = 'Chưa đặt ngày'; return; }
  const s = r.start || r.end!, e = r.end || r.start!;
  if (e < today) { r.health = 'late'; r.note = `Trễ ${days(e, today)} ngày · đạt ${r.progress}%`; return; }
  if (s > today) { r.health = 'not_started'; r.note = `Bắt đầu sau ${days(today, s)} ngày`; return; }
  r.expected = Math.round(Math.min(1, (days(s, today) + 1) / (days(s, e) + 1)) * 100);
  if (r.progress === 0 && days(s, today) >= 1) { r.health = 'behind'; r.note = `Đã đến ngày bắt đầu nhưng chưa làm · cần ${r.expected}%`; return; }
  r.health = r.progress + 15 < r.expected ? 'behind' : 'on_track';
  r.note = `Đạt ${r.progress}% · kế hoạch ${r.expected}% · còn ${days(today, e)} ngày`;
}

/** Dựng cây Epic → đầu việc → việc con, tính tiến độ và đánh giá từ dưới lên. */
/**
 * Người phụ trách: giai đoạn → đầu mối Epic; việc thuộc mô-đun → BA phụ trách mô-đun;
 * việc không có mô-đun do người không phải Dev thực hiện (VD việc CĐT góp ý/xác nhận) → chính người đó;
 * còn lại → người phụ trách của cấp trên (đầu mối giai đoạn / việc cha).
 */
function buildTree(issues: Issue[], today: string, isDev: (name: string | null) => boolean): Row[] {
  const byParent = new Map<number, Issue[]>();
  for (const i of issues) if (i.parent_id) byParent.set(i.parent_id, [...(byParent.get(i.parent_id) || []), i]);
  const order = (a: Issue, b: Issue) => (a.start_date || a.due_date || '9').localeCompare(b.start_date || b.due_date || '9') || a.id - b.id;
  const leafProgress = (i: Issue) => (i.status_category === 'done' ? 100 : i.status_category === 'inprogress' ? 50 : 0);

  const make = (i: Issue, level: 0 | 1 | 2, parentOwner: string | null): Row => {
    const owner = level === 0 ? i.assignee_name
      : i.component_lead_name || (i.assignee_name && !isDev(i.assignee_name) ? i.assignee_name : parentOwner);
    const kids = level < 2 ? (byParent.get(i.id) || []).filter((c) => (level === 0 ? c.type !== 'subtask' : c.type === 'subtask')).sort(order) : [];
    const children = kids.map((c) => make(c, (level + 1) as 1 | 2, owner));
    // Tiến độ: việc lá theo trạng thái; việc cha = trung bình theo điểm ước lượng (không có điểm thì mỗi việc 1)
    let progress = leafProgress(i);
    if (children.length) {
      const w = (r: Row) => r.issue.story_points || 1;
      progress = Math.round(children.reduce((a, r) => a + r.progress * w(r), 0) / children.reduce((a, r) => a + w(r), 0));
      if (i.status_category === 'done') progress = 100;
    }
    const kidStarts = children.map((r) => r.start).filter(Boolean) as string[];
    const kidEnds = children.map((r) => r.end).filter(Boolean) as string[];
    const start = i.start_date || kidStarts.sort()[0] || i.due_date || null;
    const end = i.due_date || kidEnds.sort().at(-1) || i.start_date || null;
    const r: Row = { issue: i, level, children, start, end, progress, expected: null, health: 'no_plan', note: '', owner,
      lateKids: children.reduce((a, c) => a + (c.health === 'late' ? 1 : 0) + c.lateKids, 0) };
    evaluate(r, today);
    return r;
  };

  const epics = issues.filter((i) => i.type === 'epic').sort(order).map((e) => make(e, 0, null));
  const orphans = issues.filter((i) => i.type !== 'epic' && i.type !== 'subtask' && !i.parent_id).sort(order);
  if (orphans.length) {
    const fake = { id: -1, key: '', type: 'epic', summary: 'Chưa thuộc giai đoạn nào', status_category: 'todo', status_name: '', story_points: null,
      assignee_name: null, start_date: null, due_date: null, component_lead_name: null } as unknown as Issue;
    byParent.set(-1, orphans);
    epics.push(make(fake, 0, null));
  }
  return epics;
}

/** Ngày gọn: dd/mm (thêm /yy nếu khác năm nay). */
const fmtShort = (d: string | null) => {
  if (!d) return '?';
  const y = d.slice(0, 4);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}${y !== String(new Date().getFullYear()) ? `/${y.slice(2)}` : ''}`;
};

/** Đổi trạng thái ngay trên bảng kế hoạch; chỉ liệt kê trạng thái hợp lệ theo quy trình của loại issue. */
function InlineStatus({ issue }: { issue: Issue }) {
  const project = useProjectCtx();
  const [busy, setBusy] = useState(false);
  const options = statusesFor(project, issue.type).filter((st) => canMove(project, issue.type, issue.status_id, st.id));
  const change = async (id: number) => {
    if (id === issue.status_id) return;
    setBusy(true);
    try {
      await api.patch(`/issues/${issue.key}`, { status_id: id });
      toast(`${issue.key}: ${project.statuses.find((x) => x.id === id)?.name}`);
      await refreshAll();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <select className={`status-select status-${issue.status_category} plan-status`} value={issue.status_id} disabled={busy}
      onChange={(e) => change(Number(e.target.value))} aria-label={`Trạng thái ${issue.key}`}>
      {options.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
    </select>
  );
}

const flatten = (rows: Row[]): Row[] => rows.flatMap((r) => [r, ...flatten(r.children)]);

export default function Plan() {
  const project = useProjectCtx();
  const { open } = useIssueModal();
  const today = todayStr();
  const { data: issues, isLoading } = useQuery<Issue[]>({
    queryKey: ['issues', 'plan', project.key],
    queryFn: () => api.get(`/issues${qs({ project: project.key, limit: 5000 })}`),
  });
  const devNames = useMemo(() => new Set(project.members.filter((m) => /dev/i.test(m.role_name || '')).map((m) => m.full_name)), [project.members]);
  const tree = useMemo(() => (issues ? buildTree(issues, today, (n) => !!n && devNames.has(n)) : []), [issues, today, devNames]);
  const all = useMemo(() => flatten(tree), [tree]);

  const [expanded, setExpanded] = useState<Set<number> | null>(null); // null = mặc định mở cấp giai đoạn
  const [health, setHealth] = useState<Health | ''>('');
  const [q, setQ] = useState('');
  const [assignee, setAssignee] = useState('');
  const [owner, setOwner] = useState('');
  const [epic, setEpic] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');

  if (isLoading || !issues) return <Spinner />;
  if (!tree.length) return <div className="page-pad"><Empty title="Dự án chưa có kế hoạch"><p className="muted">Tạo Epic (giai đoạn) và các đầu việc, hoặc nhập kế hoạch từ Excel ở Backlog.</p></Empty></div>;

  const isOpen = (r: Row) => (expanded ? expanded.has(r.issue.id) : r.level === 0);
  const toggle = (r: Row) => {
    const base = expanded ?? new Set(tree.map((e) => e.issue.id));
    const n = new Set(base); n.has(r.issue.id) ? n.delete(r.issue.id) : n.add(r.issue.id); setExpanded(n);
  };
  const expandAll = () => setExpanded(new Set(all.filter((r) => r.children.length).map((r) => r.issue.id)));
  const collapseAll = () => setExpanded(new Set());

  // Lọc: giữ việc khớp và toàn bộ nhánh cha của nó; khi đang lọc thì mở sẵn các nhánh
  // Giai đoạn chỉ giới hạn phạm vi (không tính là đang lọc chi tiết); Loại áp cho đầu việc (việc con đi theo đầu việc)
  const rowFilter = !!(health || q || assignee || owner || status);
  const filtering = rowFilter || !!type;
  const clearFilters = () => { setHealth(''); setQ(''); setAssignee(''); setOwner(''); setEpic(''); setType(''); setStatus(''); };
  const match = (r: Row) => (!health || r.health === health)
    && (!assignee || (assignee === '-' ? !r.issue.assignee_name && r.level > 0 : r.issue.assignee_name === assignee))
    && (!owner || r.owner === owner)
    && (!status || r.issue.status_name === status)
    && (!q || `${r.issue.key} ${r.issue.summary}`.toLowerCase().includes(q.toLowerCase()));
  const visibleTree = (rows: Row[]): Row[] => rows.flatMap((r) => {
    if (type && r.level === 1 && r.issue.type !== type) return [];
    const kids = visibleTree(r.children);
    if (kids.length) return [{ ...r, children: kids }];
    // Giai đoạn chỉ còn hiện khi có việc bên trong khớp (trừ khi chỉ lọc theo người phụ trách/đánh giá… của chính giai đoạn)
    if (r.level === 0 && type) return [];
    return rowFilter && match(r) ? [{ ...r, children: [] }] : !rowFilter && r.level > 0 ? [{ ...r, children: [] }] : [];
  });
  const scope = epic ? tree.filter((e) => String(e.issue.id) === epic) : tree;
  const shown = filtering ? visibleTree(scope) : scope;
  const lines: Row[] = [];
  const walk = (rows: Row[]) => rows.forEach((r) => { lines.push(r); if (filtering || isOpen(r)) walk(r.children); });
  walk(shown);

  // Trục thời gian của cả dự án cho cột Tiến trình
  const dated = all.flatMap((r) => [r.start, r.end]).filter(Boolean) as string[];
  const span0 = dated.sort()[0] || today, span1 = dated.at(-1) || today;
  const spanDays = Math.max(1, days(span0, span1) + 1);
  const pos = (d: string) => Math.min(100, Math.max(0, (days(span0, d) / spanDays) * 100));

  const counts = (lvl: number) => all.filter((r) => r.level === lvl && r.issue.id > 0).length;
  const hCount = (h: Health) => all.filter((r) => r.level > 0 && r.health === h).length;
  const uniq = (v: (string | null | undefined)[]) => [...new Set(v.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'vi'));
  const assignees = uniq(all.filter((r) => r.level > 0).map((r) => r.issue.assignee_name));
  const owners = uniq(all.map((r) => r.owner));
  const statuses = project.statuses.map((x) => x.name).filter((n) => all.some((r) => r.issue.status_name === n));
  const types = (['story', 'task', 'bug'] as const).filter((t) => all.some((r) => r.level === 1 && r.issue.type === t));

  const exportExcel = async () => {
    const mod: any = await import('exceljs');
    const ExcelJS = mod.default ?? mod;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Kế hoạch chi tiết', { properties: { outlineLevelRow: 2 }, views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'Mã', key: 'key', width: 11 }, { header: 'Cấp', key: 'lvl', width: 10 }, { header: 'Công việc', key: 'name', width: 60 },
      { header: 'Từ ngày', key: 'from', width: 12 }, { header: 'Đến ngày', key: 'to', width: 12 },
      { header: 'Người thực hiện', key: 'who', width: 22 }, { header: 'Người phụ trách', key: 'owner', width: 22 },
      { header: 'Trạng thái', key: 'status', width: 14 }, { header: 'Tiến độ %', key: 'pct', width: 10 },
      { header: 'Đánh giá', key: 'health', width: 15 }, { header: 'Ghi chú', key: 'note', width: 40 },
    ];
    ws.getRow(1).font = { bold: true };
    const FILL: Partial<Record<Health, string>> = { late: 'FFFFD5D2', behind: 'FFF8E6A0', on_track: 'FFCCE0FF', done: 'FFBAF3DB', done_late: 'FFDFD8FD' };
    for (const r of flatten(shown)) {
      const row = ws.addRow({
        key: r.issue.key, lvl: r.level === 0 ? 'Giai đoạn' : r.level === 1 ? TYPE_LABELS[r.issue.type] : 'Việc con',
        name: `${'    '.repeat(r.level)}${r.issue.summary}`, from: fmtDate(r.start), to: fmtDate(r.end),
        who: r.issue.assignee_name || '', owner: r.owner || '', status: r.issue.status_name, pct: r.progress,
        health: HEALTH[r.health].label, note: r.note,
      });
      row.outlineLevel = r.level;
      if (r.level === 0) row.font = { bold: true };
      const fill = FILL[r.health];
      if (fill) row.getCell('health').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    }
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = `Ke-hoach-chi-tiet-${project.key}-${today}.xlsx`;
    a.click();
  };

  return (
    <div className="page-pad plan-page">
      {/* Tóm tắt: bấm để lọc */}
      <div className="plan-summary">
        <div className="plan-count"><b>{counts(0)}</b> giai đoạn</div>
        <div className="plan-count"><b>{counts(1)}</b> đầu việc</div>
        <div className="plan-count"><b>{counts(2)}</b> việc con</div>
        <div className="spacer" />
        {(['late', 'behind', 'on_track', 'not_started', 'done_late', 'done'] as Health[]).map((h) => (
          <button key={h} className={`health-chip tone-${HEALTH[h].tone} ${health === h ? 'on' : ''}`} onClick={() => setHealth(health === h ? '' : h)}
            data-tip={health === h ? 'Bỏ lọc' : `Chỉ xem việc ${HEALTH[h].label.toLowerCase()}`}>
            <b>{hCount(h)}</b> {HEALTH[h].label}
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <input className="filter-search" placeholder="Tìm công việc…" value={q} onChange={(e) => setQ(e.target.value)} />
        <MoreFilters count={[assignee, owner, epic, type, status, health].filter(Boolean).length}>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={assignee ? 'filter-on' : ''}>
            <option value="">Người thực hiện</option>
            <option value="-">— Chưa giao —</option>
            {assignees.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className={owner ? 'filter-on' : ''}>
            <option value="">Người phụ trách</option>
            {owners.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={epic} onChange={(e) => setEpic(e.target.value)} className={epic ? 'filter-on' : ''}>
            <option value="">Giai đoạn (Epic)</option>
            {tree.map((e) => <option key={e.issue.id} value={e.issue.id}>{e.issue.summary}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} className={type ? 'filter-on' : ''}>
            <option value="">Loại (Story/Task…)</option>
            {types.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={status ? 'filter-on' : ''}>
            <option value="">Trạng thái</option>
            {statuses.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={health} onChange={(e) => setHealth(e.target.value as Health | '')} className={health ? 'filter-on' : ''}>
            <option value="">Đánh giá</option>
            {(Object.keys(HEALTH) as Health[]).map((h) => <option key={h} value={h}>{HEALTH[h].label}</option>)}
          </select>
        </MoreFilters>
        {(filtering || epic) && <button className="btn btn-subtle btn-sm" onClick={clearFilters}>Xóa lọc</button>}
        {(filtering || epic) && <span className="muted small">{flatten(shown).filter((r) => r.level > 0).length} việc khớp</span>}
        <div className="spacer" />
        {!filtering && <>
          <button className="btn btn-sm" onClick={expandAll}><ChevronsUpDown size={14} /> Mở hết</button>
          <button className="btn btn-sm" onClick={collapseAll}><ChevronsDownUp size={14} /> Chỉ giai đoạn</button>
        </>}
        {can(project.permissions, 'plan.export') && <button className="btn btn-sm" onClick={exportExcel}><Download size={14} /> Xuất Excel</button>}
      </div>

      <div className="plan-table-wrap">
        <table className="plan-table">
          <thead>
            <tr>
              <th className="col-name">Công việc</th>
              <th data-tip={HEALTH_HELP}>Đánh giá</th>
              <th>Tiến độ</th>
              <th>Thời gian</th>
              <th>Người thực hiện</th><th data-tip="Giai đoạn: đầu mối Epic · Việc thuộc mô-đun: BA phụ trách mô-đun · Việc không thuộc mô-đun do BA/BA Lead thực hiện (VD việc CĐT): chính người đó · Còn lại: đầu mối giai đoạn">Người phụ trách</th>
              <th>Trạng thái</th>
              <th className="col-timeline">Tiến trình <span className="muted small">({fmtDate(span0)} – {fmtDate(span1)})</span></th>
            </tr>
          </thead>
          <tbody>
            {!lines.length && <tr><td colSpan={8} className="muted">Không có công việc nào khớp bộ lọc.</td></tr>}
            {lines.map((r) => {
              const i = r.issue;
              const late = r.health === 'late';
              return (
                <tr key={`${r.level}-${i.id}`} className={`plan-row lvl-${r.level}`}>
                  <td className="col-name">
                    <div className="plan-name" style={{ paddingLeft: r.level * 22 }}>
                      {r.children.length && !filtering
                        ? <button className="icon-btn" onClick={() => toggle(r)} aria-label="Mở/đóng">{isOpen(r) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                        : <span className="plan-spacer" />}
                      {i.id > 0 && <TypeIcon type={i.type} size={15} />}
                      <a className="ellipsis" onClick={() => i.id > 0 && open(i.key)} data-tip={i.summary}>
                        {i.key && <span className="issue-key">{i.key}</span>} {i.summary}
                      </a>
                      {r.children.length > 0 && <span className="muted small nowrap">({r.children.length})</span>}
                      {r.lateKids > 0 && <span className="lozenge lozenge-red" data-tip="Số việc bên trong đang trễ hạn">{r.lateKids} trễ</span>}
                    </div>
                  </td>
                  <td><span className={`lozenge lozenge-${HEALTH[r.health].tone}`} data-tip={r.note || undefined}>{HEALTH[r.health].label}</span></td>
                  <td className="col-progress">
                    <div className="plan-pct">
                      <div className="plan-bar" data-tip={r.expected != null ? `Đạt ${r.progress}% · kế hoạch ${r.expected}%` : `Đạt ${r.progress}%`}>
                        <div className="plan-done" style={{ width: `${r.progress}%` }} />
                        {r.expected != null && <div className="plan-mark" style={{ left: `${r.expected}%` }} />}
                      </div>
                      <span className="small nowrap">{r.progress}%</span>
                    </div>
                  </td>
                  <td className={`nowrap small ${late ? 'overdue' : ''}`}>{r.start || r.end ? <>{fmtShort(r.start)} – {fmtShort(r.end)}</> : <span className="muted">—</span>}</td>
                  <td>{r.level > 0 && i.assignee_name ? <div className="row gap-xs"><Avatar name={i.assignee_name} size={20} /><span className="small ellipsis">{i.assignee_name}</span></div> : <span className="muted small">—</span>}</td>
                  <td>{r.owner ? <div className="row gap-xs"><Avatar name={r.owner} size={20} /><span className="small ellipsis">{r.owner}</span></div> : <span className="muted small">—</span>}</td>
                  <td>{!i.status_name ? null
                    : i.type !== 'epic' && i.id > 0 && can(project.permissions, 'issue.transition') ? <InlineStatus issue={i} />
                      : <span data-tip={i.type === 'epic' ? 'Trạng thái Epic tự động theo các việc bên trong' : undefined}><StatusBadge name={i.status_name} category={i.status_category} /></span>}</td>
                  <td className="col-timeline">
                    <div className="mini-timeline">
                      <div className="mini-today" style={{ left: `${pos(today)}%` }} />
                      {r.start && r.end && (
                        <div className={`mini-bar tone-${HEALTH[r.health].tone}`}
                          style={{ left: `${pos(r.start)}%`, width: `max(4px, ${pos(r.end) - pos(r.start) + 100 / spanDays}%)` }}
                          data-tip={`${fmtDate(r.start)} – ${fmtDate(r.end)}`}>
                          <div style={{ width: `${r.progress}%` }} />
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">Cách đánh giá: {HEALTH_HELP}. Tiến độ việc lẻ: Cần làm 0%, Đang thực hiện 50%, Hoàn thành 100%; việc cha tính trung bình theo điểm ước lượng của việc con.</p>
    </div>
  );
}
