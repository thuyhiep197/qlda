import { Router } from 'express';
import { all } from '../db.ts';
import { accessibleProjectIds, userPermissions } from '../permissions.ts';
import { visibleCustomersSql } from '../customer-access.ts';
import { listIssues } from '../issues.ts';
import { fold } from '../customer.ts';

/**
 * Tìm kiếm toàn hệ thống (ô tìm kiếm trên cùng): khách hàng, dự án, issue, bước hành trình — chỉ trong phạm vi người dùng được xem.
 * Khách hàng, dự án, bước hành trình so khớp không dấu (gõ "so tai chinh" ra "Sở Tài chính").
 */
const r = Router();
const LIMIT = 8;

r.get('/', (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 100);
  const out = { customers: [] as unknown[], projects: [] as unknown[], issues: [] as unknown[], steps: [] as unknown[] };
  if (q.length < 2) return res.json(out);
  const fq = fold(q);
  const perms = userPermissions(req.user);

  if (perms.has('customer.view')) {
    const vis = visibleCustomersSql(req.user);
    const rows = all<{ id: number; name: string; status: string; province: string | null; contacts: string | null }>(`
      SELECT c.id, c.name, c.status, gp.name AS province,
        (SELECT GROUP_CONCAT(cc.full_name || ' ' || COALESCE(cc.phone, '') || ' ' || COALESCE(cc.email, ''), ' ') FROM customer_contacts cc WHERE cc.customer_id = c.id) AS contacts
      FROM customers c LEFT JOIN geo_provinces gp ON gp.code = c.province_code WHERE ${vis.sql} ORDER BY c.name`, ...vis.params);
    out.customers = rows.filter((c) => fold(`${c.name} ${c.contacts ?? ''}`).includes(fq)).slice(0, LIMIT)
      .map(({ contacts: _c, ...c }) => c);
    const steps = all<{ id: number; title: string; code: string | null; status: string; customer_id: number; customer_name: string }>(`
      SELECT j.id, j.title, j.code, j.status, j.customer_id, c.name AS customer_name FROM journey_steps j JOIN customers c ON c.id = j.customer_id
      WHERE j.depth > 0 AND ${vis.sql} ORDER BY c.name, j.position`, ...vis.params);
    out.steps = steps.filter((s) => fold(s.title).includes(fq)).slice(0, LIMIT);
  }

  const ids = accessibleProjectIds(req.user);
  out.projects = all<{ id: number; key: string; name: string; customer: string | null }>('SELECT id, key, name, customer FROM projects WHERE is_archived = 0 ORDER BY name')
    .filter((p) => (ids === 'all' || ids.includes(p.id)) && fold(`${p.key} ${p.name} ${p.customer ?? ''}`).includes(fq)).slice(0, LIMIT);

  if (perms.has('issue.view') || perms.has('search.view')) {
    out.issues = listIssues(req.user, { q, sort: 'updated', limit: String(LIMIT) })
      .map((i: any) => ({ key: i.key, summary: i.summary, type: i.type, subtype: i.subtype, status_name: i.status_name, status_category: i.status_category, project_key: i.project_key }));
  }
  res.json(out);
});

export default r;
