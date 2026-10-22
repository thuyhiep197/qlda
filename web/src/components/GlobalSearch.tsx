import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Building2, FileText, Route, Search } from 'lucide-react';
import { api } from '../api';
import { hasPerm, hasProjectModule, useIssueModal, useMe } from '../hooks';
import type { IssueType, SubType, Category } from '../types';
import { colorOf } from '../util';
import { StatusBadge, TypeIcon } from './ui';

interface Results {
  customers: { id: number; name: string; status: string; province: string | null }[];
  projects: { id: number; key: string; name: string; customer: string | null }[];
  issues: { key: string; summary: string; type: IssueType; subtype: SubType | null; status_name: string; status_category: Category; project_key: string }[];
  steps: { id: number; title: string; code: string | null; customer_id: number; sales_project_id: number; customer_name: string }[];
  docs?: { id: number; filename: string; folder_id: number | null; folder_name: string | null }[];
}

/** Ô tìm kiếm trên cùng — phạm vi toàn hệ thống: khách hàng, dự án, issue, bước hành trình (chỉ những gì người dùng được xem) */
export default function GlobalSearch() {
  const navigate = useNavigate();
  const { open: openIssue } = useIssueModal();
  const { data: me } = useMe();
  // Mở chi tiết issue: Issue – Xem; tìm trong danh sách issue: Danh sách & tìm kiếm issue – Xem (thuộc phân hệ Dự án)
  const canOpenIssue = hasProjectModule(me) && hasPerm(me, 'issue.view');
  const canSearchIssues = hasProjectModule(me) && hasPerm(me, 'search.view');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [show, setShow] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setShow(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
  const { data, isFetching } = useQuery<Results>({ queryKey: ['search', term], queryFn: () => api.get(`/search?q=${encodeURIComponent(term)}`), enabled: term.length >= 2 });

  // Danh sách mục theo thứ tự hiển thị, để chọn bằng phím mũi tên
  const items: { key: string; go: () => void; node: React.ReactNode; group: string }[] = [];
  const done = (fn: () => void) => () => { fn(); setShow(false); setQ(''); };
  data?.customers.forEach((c) => items.push({ group: 'Khách hàng', key: `c${c.id}`, go: done(() => navigate(`/customers/${c.id}?g=all`)),
    node: <><Building2 size={15} className="muted" /><span className="grow ellipsis">{c.name}</span><span className="muted small">{c.province ?? ''} · {c.status}</span></> }));
  data?.steps.forEach((s) => items.push({ group: 'Hành trình khách hàng', key: `s${s.id}`, go: done(() => navigate(`/customers/${s.customer_id}/p/${s.sales_project_id}?g=all&step=${s.id}`)),
    node: <><Route size={15} className="muted" /><span className="grow ellipsis">{s.code ? `${s.code} ` : ''}{s.title}</span><span className="muted small ellipsis gs-meta">{s.customer_name}</span></> }));
  data?.projects.forEach((p) => items.push({ group: 'Dự án', key: `p${p.id}`, go: done(() => navigate(`/p/${p.key}?g=all`)),
    node: <><span className="proj-dot sm" style={{ background: colorOf(p.key) }}>{p.key.slice(0, 2)}</span><span className="grow ellipsis">{p.name}</span><span className="muted small ellipsis gs-meta">{p.customer ?? p.key}</span></> }));
  data?.issues.forEach((i) => items.push({ group: 'Issue', key: `i${i.key}`, go: done(() => (canOpenIssue ? openIssue(i.key) : navigate(`/issues?q=${encodeURIComponent(i.key)}`))),
    node: <><TypeIcon type={i.type} subtype={i.subtype} size={15} /><span className="muted small nowrap">{i.key}</span><span className="grow ellipsis">{i.summary}</span><StatusBadge name={i.status_name} category={i.status_category} /></> }));
  data?.docs?.forEach((d) => items.push({ group: 'Tài liệu nội bộ', key: `d${d.id}`, go: done(() => navigate(`/docs?${d.folder_id ? `folder=${d.folder_id}&` : ''}file=${d.id}`)),
    node: <><FileText size={15} className="muted" /><span className="grow ellipsis">{d.filename}</span><span className="muted small ellipsis gs-meta">{d.folder_name ?? 'Thư mục gốc'}</span></> }));
  if (term.length >= 2 && canSearchIssues) items.push({ group: '', key: 'all-issues', go: done(() => navigate(`/issues?q=${encodeURIComponent(term)}`)),
    node: <><Search size={15} className="muted" /><span className="grow">Tìm "{term}" trong tất cả issue…</span></> });

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setShow(true); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Escape') setShow(false);
    else if (e.key === 'Enter') {
      e.preventDefault();
      const v = q.trim();
      // Gõ đúng mã issue (VD QLTB-12) thì mở ngay issue đó
      if (canOpenIssue && /^[A-Za-z][A-Za-z0-9]+-\d+$/.test(v)) { openIssue(v.toUpperCase()); setQ(''); setShow(false); return; }
      items[active]?.go();
    }
  };

  let lastGroup = '';
  return (
    <div className="search gs" ref={box}>
      <Search size={16} className="search-icon" aria-hidden />
      <input value={q} onChange={(e) => { setQ(e.target.value); setShow(true); setActive(0); }} onFocus={() => setShow(true)} onKeyDown={onKey}
        placeholder="Tìm trong toàn hệ thống: khách hàng, dự án, issue, hành trình, tài liệu…" aria-label="Tìm kiếm toàn hệ thống" />
      {show && q.trim().length >= 2 && (
        <div className="gs-pop" role="listbox">
          {isFetching && !data && <div className="muted small pad">Đang tìm…</div>}
          {data && items.length <= (canSearchIssues ? 1 : 0) && <div className="muted small pad">Không tìm thấy kết quả cho "{term}"</div>}
          {items.map((it, i) => {
            const head = it.group && it.group !== lastGroup ? <div className="gs-group">{it.group}</div> : null;
            lastGroup = it.group || lastGroup;
            return (
              <div key={it.key}>
                {head}
                <button className={`gs-item ${i === active ? 'on' : ''}`} onMouseEnter={() => setActive(i)} onClick={it.go} role="option" aria-selected={i === active}>{it.node}</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
