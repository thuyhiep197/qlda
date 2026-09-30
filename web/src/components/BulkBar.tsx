import { useEffect, useRef, useState } from 'react';
import { api, refreshAll } from '../api';
import { can, useComponents, useMe, useProject, useSprints, useVersions } from '../hooks';
import type { Issue } from '../types';
import { PRIORITIES, PRIORITY_LABELS } from '../util';
import { Avatar, toast } from './ui';
import { Trash2, UserPlus } from 'lucide-react';

interface BulkResult { ok: number; failed: number; results: { key: string; ok: boolean; error?: string }[] }

/** Gọi API thao tác hàng loạt và báo kết quả (issue nào lỗi, vì sao). */
export async function runBulk(body: Record<string, unknown>, label: string) {
  const r = await api.post<BulkResult>('/issues/bulk', body);
  if (r.ok) toast(`${label}: ${r.ok} issue`);
  if (r.failed) {
    const first = r.results.filter((x) => !x.ok).slice(0, 3).map((x) => `${x.key}: ${x.error}`).join('\n');
    toast(`${r.failed} issue không cập nhật được\n${first}${r.failed > 3 ? '\n…' : ''}`, 'error');
  }
  await refreshAll();
  return r;
}

/**
 * Thanh thao tác hàng loạt (như Bulk change của Jira) cho các issue đang chọn:
 * chuyển sprint, giao việc, đổi trạng thái/ưu tiên/phiên bản, thêm nhãn, xóa.
 * Đổi sprint/người/trạng thái/phiên bản chỉ hiện khi các issue cùng một dự án.
 */
export function BulkBar({ issues, onClear }: { issues: Issue[]; onClear: () => void }) {
  const keys = issues.map((i) => i.key);
  const projectKeys = [...new Set(issues.map((i) => i.project_key))];
  const single = projectKeys.length === 1 ? projectKeys[0] : undefined;
  const { data: project } = useProject(single);
  const { data: sprints } = useSprints(project?.type === 'scrum' ? single : undefined, 'future,active');
  const { data: versions } = useVersions(single);
  const { data: components } = useComponents(single);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');

  const act = async (changes: Record<string, unknown>, text: string) => {
    setBusy(true);
    try { await runBulk({ keys, changes }, text); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!confirm(`Xóa vĩnh viễn ${keys.length} issue đã chọn? Sub-task của chúng cũng bị xóa. Không thể hoàn tác.`)) return;
    setBusy(true);
    try { const r = await runBulk({ keys, delete: true }, 'Đã xóa'); if (r.ok) onClear(); } finally { setBusy(false); }
  };
  const perms = project?.permissions;
  // Như Jira: chọn issue rồi đưa vào sprint có sẵn, Backlog, hoặc tạo sprint mới chứa luôn các issue này
  const toSprint = async (v: string) => {
    if (v !== 'new') return act({ sprint_id: v === 'backlog' ? null : Number(v) }, 'Đã chuyển sprint');
    setBusy(true);
    try {
      const s = await api.post<{ id: number; name: string }>(`/projects/${single}/sprints`, {});
      await runBulk({ keys, changes: { sprint_id: s.id } }, `Đã tạo ${s.name}, chuyển vào`);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="bulk-bar" role="toolbar" aria-label="Thao tác hàng loạt">
      <b>Đã chọn {keys.length} issue</b>
      {project && <AssignPicker members={project.members} disabled={busy}
        onPick={(id, name) => act({ assignee_id: id }, id ? `Đã giao cho ${name}` : 'Đã bỏ giao')} />}
      {project?.type === 'scrum' && (
        <select value="" disabled={busy} onChange={(e) => toSprint(e.target.value)}>
          <option value="" disabled>Chuyển vào sprint…</option>
          <option value="backlog">Backlog</option>
          {sprints?.map((s) => <option key={s.id} value={s.id}>{s.name}{s.state === 'active' ? ' (đang chạy)' : ''}</option>)}
          {can(perms, 'sprint.manage') && <option value="new">+ Sprint mới</option>}
        </select>
      )}
      {project && (
        <select value="" disabled={busy} onChange={(e) => act({ status_id: Number(e.target.value) }, 'Đã đổi trạng thái')}>
          <option value="" disabled>Đổi trạng thái…</option>
          {project.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <select value="" disabled={busy} onChange={(e) => act({ priority: e.target.value }, 'Đã đổi độ ưu tiên')}>
        <option value="" disabled>Độ ưu tiên…</option>
        {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
      </select>
      {project && !!components?.length && (
        <select value="" disabled={busy} onChange={(e) => act({ component_id: e.target.value === 'none' ? null : Number(e.target.value) }, 'Đã chuyển mô-đun')}>
          <option value="" disabled>Mô-đun…</option>
          <option value="none">— Bỏ mô-đun —</option>
          {components.map((c) => <option key={c.id} value={c.id}>{c.name}{c.lead_name ? ` (BA: ${c.lead_name})` : ''}</option>)}
        </select>
      )}
      {project && versions && versions.some((v) => v.status === 'unreleased') && (
        <select value="" disabled={busy} onChange={(e) => act({ version_id: e.target.value === 'none' ? null : Number(e.target.value) }, 'Đã gán phiên bản')}>
          <option value="" disabled>Phiên bản…</option>
          <option value="none">— Bỏ phiên bản —</option>
          {versions.filter((v) => v.status === 'unreleased').map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      )}
      <form className="row gap-xs" onSubmit={(e) => { e.preventDefault(); if (label.trim()) { act({ labels_add: [label.trim()] }, `Đã thêm nhãn "${label.trim()}"`); setLabel(''); } }}>
        <input className="bulk-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="+ Thêm nhãn" disabled={busy} />
      </form>
      {(!project || can(perms, 'issue.delete')) && <button className="btn btn-sm btn-subtle danger" disabled={busy} onClick={del}><Trash2 size={14} /> Xóa</button>}
      <div className="spacer" />
      {!single && <span className="muted small">Chọn issue cùng một dự án để chuyển sprint, giao việc, đổi trạng thái</span>}
      <button className="btn btn-sm" onClick={onClear}>Bỏ chọn</button>
    </div>
  );
}

/** Nút "Giao cho": tìm người theo tên, nhóm theo vai trò, có "Giao cho tôi" và "Bỏ giao". */
function AssignPicker({ members, disabled, onPick }: {
  members: { id: number; full_name: string; username: string; role_name: string | null; is_active?: number }[];
  disabled?: boolean; onPick: (id: number | null, name?: string) => void;
}) {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const list = members.filter((m) => m.is_active !== 0)
    .filter((m) => !q || `${m.full_name} ${m.username} ${m.role_name || ''}`.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(list.map((m) => m.role_name || 'Khác'))];
  const pick = (id: number | null, name?: string) => { setOpen(false); setQ(''); onPick(id, name); };
  const isMember = !!me && members.some((m) => m.id === me.id);

  return (
    <div className="assign-picker" ref={box}>
      <button type="button" className="btn btn-sm btn-primary" disabled={disabled} onClick={() => setOpen(!open)}>
        <UserPlus size={14} /> Giao cho…
      </button>
      {open && (
        <div className="assign-menu">
          <input autoFocus placeholder="Tìm theo tên, vai trò…" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && list.length === 1) pick(list[0].id, list[0].full_name); }} />
          <div className="assign-list">
            {!q && isMember && <button type="button" onClick={() => pick(me!.id, me!.full_name)}><Avatar name={me!.full_name} size={22} /> <b>Giao cho tôi</b></button>}
            {!q && <button type="button" onClick={() => pick(null)}><Avatar size={22} /> Bỏ giao (chưa giao ai)</button>}
            {groups.map((g) => (
              <div key={g}>
                <div className="assign-group">{g}</div>
                {list.filter((m) => (m.role_name || 'Khác') === g).map((m) => (
                  <button type="button" key={m.id} onClick={() => pick(m.id, m.full_name)}>
                    <Avatar name={m.full_name} size={22} /> {m.full_name} <span className="muted small">@{m.username}</span>
                  </button>
                ))}
              </div>
            ))}
            {!list.length && <div className="muted small pad">Không tìm thấy thành viên</div>}
          </div>
        </div>
      )}
    </div>
  );
}
