import { Router } from 'express';
import { all } from '../db.ts';
import { accessibleProjectIds, userPermissions } from '../permissions.ts';
import { visibleCustomersSql, visibleSalesProjectsSql } from '../customer-access.ts';
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
  const out = { customers: [] as unknown[], projects: [] as unknown[], issues: [] as unknown[], steps: [] as unknown[], docs: [] as unknown[] };
  if (q.length < 2) return res.json(out);
  const fq = fold(q);
  const perms = userPermissions(req.user);

  if (perms.has('customer.view')) {
    const vis = visibleCustomersSql(req.user);
    const rows = all<{ id: number; name: string; status: string; province: string | null; contacts: string | null }>(`
      SELECT c.id, c.name, c.status, gp.name AS province,
        (SELECT GROUP_CONCAT(cc.full_name || ' ' || COALESCE(cc.phone, '') || ' ' || COALESCE(cc.email, ''), ' ') FROM customer_contacts cc WHERE cc.customer_id = c.id) AS contacts
      FROM customers c LEFT JOIN geo_provinces gp ON gp.code = c.province_code WHERE c.is_archived = 0 AND ${vis.sql} ORDER BY c.name`, ...vis.params);
    out.customers = rows.filter((c) => fold(`${c.name} ${c.contacts ?? ''}`).includes(fq)).slice(0, LIMIT)
      .map(({ contacts: _c, ...c }) => c);
  }
  // Bước hành trình (thuộc dự án của khách hàng): cần Hành trình – Xem và Dự án của khách hàng – Xem
  if (perms.has('customer.view') && perms.has('journey.view') && perms.has('sales_project.view')) {
    const spVis = visibleSalesProjectsSql(req.user);
    const steps = all<{ id: number; title: string; code: string | null; status: string; customer_id: number; sales_project_id: number | null; customer_name: string }>(`
      SELECT j.id, j.title, j.code, j.status, j.customer_id, j.sales_project_id, c.name AS customer_name FROM journey_steps j JOIN sales_projects sp ON sp.id = j.sales_project_id
        JOIN customers c ON c.id = j.customer_id
      WHERE j.depth > 0 AND c.is_archived = 0 AND sp.is_archived = 0 AND ${spVis.sql} ORDER BY c.name, j.position`, ...spVis.params);
    out.steps = steps.filter((s) => fold(s.title).includes(fq)).slice(0, LIMIT);
  }

  const ids = accessibleProjectIds(req.user);
  out.projects = all<{ id: number; key: string; name: string; customer: string | null }>('SELECT id, key, name, customer FROM projects WHERE is_archived = 0 ORDER BY name')
    .filter((p) => (ids === 'all' || ids.includes(p.id)) && fold(`${p.key} ${p.name} ${p.customer ?? ''}`).includes(fq)).slice(0, LIMIT);

  // Issue: cần Danh sách & tìm kiếm issue – Xem (trong các dự án được vào)
  if (perms.has('search.view')) {
    out.issues = listIssues(req.user, { q, sort: 'updated', limit: String(LIMIT) })
      .map((i: any) => ({ key: i.key, summary: i.summary, type: i.type, subtype: i.subtype, status_name: i.status_name, status_category: i.status_category, project_key: i.project_key }));
  }
  // Tài liệu nội bộ: mọi người đều tra cứu được
  out.docs = all<{ id: number; filename: string; folder_id: number | null; folder_name: string | null }>(
    'SELECT d.id, d.filename, d.folder_id, f.name AS folder_name FROM doc_files d LEFT JOIN doc_folders f ON f.id = d.folder_id ORDER BY d.filename')
    .filter((d) => fold(d.filename).includes(fq)).slice(0, LIMIT);
  res.json(out);
});

export default r;
