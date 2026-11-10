import { Router } from 'express';
import { all, localDate } from '../db.ts';
import { requireUserPerm, userPermissions } from '../permissions.ts';
import { requireCustomerSubsystem, visibleCustomersSql } from '../customer-access.ts';
import { syncJourneys } from '../journey-sync.ts';
import { salesProjectsOf } from './sales-projects.ts';

/**
 * Báo cáo khách hàng theo sản phẩm: mỗi sản phẩm có những khách hàng nào (qua các dự án của khách hàng đã chọn sản phẩm đó)
 * và hiện trạng tương tác của từng khách hàng — tình trạng khách hàng, trao đổi gần nhất, giai đoạn hành trình, lịch gọi, việc đang mở.
 * Cần Dự án của khách hàng – Xem (sản phẩm là thông tin của dự án); chỉ tính khách hàng, dự án trong phạm vi được xem, chưa lưu trữ.
 * Mỗi phần theo ô quyền của nó: tình trạng khách hàng, khách hàng chưa có dự án → Thông tin khách hàng – Xem;
 * trao đổi, lịch gọi → Trao đổi – Xem; tiến độ hành trình → Hành trình – Xem; việc đang mở → Công việc – Xem.
 */
const r = Router();

interface Talk { date: string; at: string; content: string; user_name: string | null }
interface TalkSum { count: number; last: Talk | null }
const later = (a: Talk | null, b: Talk | null) => (!a ? b : !b ? a : a.date > b.date || (a.date === b.date && a.at >= b.at) ? a : b);
const addTalk = (map: Map<number, TalkSum>, key: number, t: Talk) => {
  const cur = map.get(key) ?? { count: 0, last: null };
  map.set(key, { count: cur.count + 1, last: later(t, cur.last) });
};
const names = (list: (string | null | undefined)[]) => [...new Set(list.flatMap((s) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean)))].join(', ') || null;

r.get('/report/by-product', (req, res) => {
  requireCustomerSubsystem(req.user);
  requireUserPerm(req.user, 'sales_project.view');
  syncJourneys();
  const perms = userPermissions(req.user);
  const can = { info: perms.has('customer.view'), talk: perms.has('ctalk.view'), journey: perms.has('journey.view'), task: perms.has('ctask.view') };
  const today = localDate();
  const vis = visibleCustomersSql(req.user);
  const customers = new Map(all<{ id: number; name: string; code: string | null; status: string; province_name: string | null; visible: number }>(
    `SELECT c.id, c.name, c.code, c.status, gp.name AS province_name, (${vis.sql}) AS visible
     FROM customers c LEFT JOIN geo_provinces gp ON gp.code = c.province_code WHERE c.is_archived = 0`, ...vis.params).map((c) => [c.id, c]));
  const projects = (salesProjectsOf('all', { user: req.user }, today) as any[]).filter((p) => customers.has(p.customer_id));

  // Trao đổi: của dự án (kể cả trao đổi ở các bước hành trình) và trao đổi chung của khách hàng
  const talkOfProject = new Map<number, TalkSum>(), talkOfCustomer = new Map<number, TalkSum>();
  const nextCall = new Map<number, string>();
  if (can.talk) {
    for (const a of all<{ customer_id: number; sales_project_id: number | null; activity_date: string; created_at: string; content: string; user_name: string | null }>(
      `SELECT a.customer_id, a.sales_project_id, a.activity_date, a.created_at, a.content, u.full_name AS user_name
       FROM customer_activities a LEFT JOIN users u ON u.id = a.user_id`)) {
      const t = { date: a.activity_date, at: a.created_at, content: a.content, user_name: a.user_name };
      if (a.sales_project_id) addTalk(talkOfProject, a.sales_project_id, t);
      else if (can.info) addTalk(talkOfCustomer, a.customer_id, t);
    }
    for (const k of all<{ sales_project_id: number; d: string }>("SELECT sales_project_id, MIN(call_date) d FROM customer_calls WHERE status = 'planned' GROUP BY sales_project_id")) {
      nextCall.set(k.sales_project_id, k.d);
    }
  }

  type Group = { key: string; product_id: number | null; name: string; type_name: string | null; rows: Map<number, any[]> };
  const groups = new Map<string, Group>();
  const catalog = all<{ id: number; name: string; type_name: string; project_archived: number | null }>(
    `SELECT p.id, p.name, t.name AS type_name, pr.is_archived AS project_archived FROM products p JOIN product_types t ON t.id = p.type_id
     LEFT JOIN projects pr ON pr.id = p.project_id ORDER BY t.position, t.id, p.name`);
  for (const p of catalog) groups.set(`p${p.id}`, { key: `p${p.id}`, product_id: p.id, name: p.name, type_name: p.type_name, rows: new Map() });
  groups.set('none', { key: 'none', product_id: null, name: 'Dự án chưa chọn sản phẩm', type_name: null, rows: new Map() });
  groups.set('noproject', { key: 'noproject', product_id: null, name: 'Khách hàng chưa có dự án', type_name: null, rows: new Map() });

  const withProject = new Set<number>();
  for (const p of projects) {
    withProject.add(p.customer_id);
    for (const key of p.product_ids.length ? p.product_ids.map((id: number) => `p${id}`) : ['none']) {
      const g = groups.get(key);
      if (!g) continue;
      if (!g.rows.has(p.customer_id)) g.rows.set(p.customer_id, []);
      g.rows.get(p.customer_id)!.push(p);
    }
  }
  // Khách hàng chưa có dự án nào: thông tin khách hàng → cần Thông tin khách hàng – Xem và khách hàng trong phạm vi
  if (can.info) for (const c of customers.values()) if (c.visible && !withProject.has(c.id)) groups.get('noproject')!.rows.set(c.id, []);

  // Sản phẩm nhiều khách hàng xếp trước (cùng số thì theo thứ tự danh mục); hai nhóm "chưa chọn sản phẩm", "chưa có dự án" luôn ở cuối
  const order = (g: Group) => (g.product_id ? -g.rows.size : 1);
  const out = [...groups.values()].filter((g) => g.rows.size).sort((a, b) => order(a) - order(b)).map((g) => ({
    key: g.key, product_id: g.product_id, name: g.name, type_name: g.type_name,
    customers: [...g.rows].map(([cid, list]) => {
      const c = customers.get(cid)!;
      const general = talkOfCustomer.get(cid);
      const talks = [...list.map((p) => talkOfProject.get(p.id)), general].filter((t): t is TalkSum => !!t);
      const last = talks.reduce<Talk | null>((m, t) => later(m, t.last), null);
      const calls = list.map((p) => nextCall.get(p.id)).filter((d): d is string => !!d).sort();
      return {
        id: c.id, name: c.name, code: c.code, province_name: c.province_name, status: can.info ? c.status : null,
        kd_names: names(list.map((p) => p.kd_names)), am_names: names(list.map((p) => p.am_names)),
        projects: list.map((p) => ({ id: p.id, code: p.code, name: p.name, status: p.status,
          ...(can.journey ? { journey_pct: p.journey_pct ?? null, journey_overdue: p.journey_overdue ?? 0 } : {}) })),
        ...(can.talk ? {
          activity_count: talks.reduce((n, t) => n + t.count, 0),
          last_activity: last && { date: last.date, content: last.content, user_name: last.user_name },
          next_call_date: calls[0] ?? null,
          // Số lịch gọi đã đến ngày mà chưa xác nhận
          calls_due: list.reduce((n, p) => n + (p.call_alert?.count ?? 0), 0),
        } : {}),
        ...(can.task ? { open_tasks: list.reduce((n, p) => n + (p.open_tasks ?? 0), 0) } : {}),
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
  }));
  const statuses = !can.info ? [] : all<{ name: string }>('SELECT name FROM customer_statuses ORDER BY position, id').map((s) => s.name);
  // Tổng số khách hàng không trùng (một khách hàng dùng nhiều sản phẩm nằm ở nhiều nhóm)
  const total = new Set(out.flatMap((g) => g.customers.map((c) => c.id))).size;
  // Danh mục sản phẩm để chọn lọc (kể cả sản phẩm chưa có khách hàng); sản phẩm của dự án đã lưu trữ chỉ còn khi đang có khách hàng
  const products = catalog.filter((p) => !p.project_archived || groups.get(`p${p.id}`)!.rows.size)
    .map((p) => ({ id: p.id, name: p.name, type_name: p.type_name }));
  res.json({ today, can, statuses, total, products, groups: out });
});

export default r;
