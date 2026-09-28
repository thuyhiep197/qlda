import { useState } from 'react';
import { api, refreshAll } from '../api';
import { can, useProject, useSprints, useVersions } from '../hooks';
import type { Issue } from '../types';
import { PRIORITIES, PRIORITY_LABELS } from '../util';
import { toast } from './ui';

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

  return (
    <div className="bulk-bar" role="toolbar" aria-label="Thao tác hàng loạt">
      <b>Đã chọn {keys.length} issue</b>
      {project?.type === 'scrum' && (
        <select value="" disabled={busy} onChange={(e) => act({ sprint_id: e.target.value === 'backlog' ? null : Number(e.target.value) }, 'Đã chuyển sprint')}>
          <option value="" disabled>Chuyển vào sprint…</option>
          <option value="backlog">Backlog</option>
          {sprints?.map((s) => <option key={s.id} value={s.id}>{s.name}{s.state === 'active' ? ' (đang chạy)' : ''}</option>)}
        </select>
      )}
      {project && (
        <select value="" disabled={busy} onChange={(e) => act({ assignee_id: e.target.value === 'none' ? null : Number(e.target.value) }, 'Đã giao việc')}>
          <option value="" disabled>Giao cho…</option>
          <option value="none">— Bỏ giao —</option>
          {project.members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
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
      {(!project || can(perms, 'issue.delete')) && <button className="btn btn-sm btn-subtle danger" disabled={busy} onClick={del}>🗑 Xóa</button>}
      <div className="spacer" />
      {!single && <span className="muted small">Chọn issue cùng một dự án để chuyển sprint, giao việc, đổi trạng thái</span>}
      <button className="btn btn-sm" onClick={onClear}>Bỏ chọn</button>
    </div>
  );
}
