import { useRef, useState } from 'react';
import { api, errMsg, refreshAll } from '../api';
import { can, useIssueModal, useSprints } from '../hooks';
import type { IssueType, Project } from '../types';
import { TYPE_LABELS } from '../util';
import { Modal, Spinner, toast, TypeIcon } from './ui';

// ---------------------------------------------------------------------------
// Cột trong file: khóa chuẩn gửi lên server ← các tên cột được chấp nhận (đã bỏ dấu, chữ thường).
// Hỗ trợ file mẫu của QLDA và file CSV xuất từ Jira.
// ---------------------------------------------------------------------------
type Key = 'ref' | 'type' | 'summary' | 'description' | 'parent' | 'priority' | 'assignee' | 'story_points'
  | 'sprint' | 'status' | 'labels' | 'start_date' | 'due_date';

const COLUMNS: { key: Key; header: string; width: number; note: string }[] = [
  { key: 'ref', header: 'Mã dòng', width: 10, note: 'Không bắt buộc. Mã tự đặt (VD: E1, S1) để các dòng khác trỏ tới làm issue cha.' },
  { key: 'type', header: 'Loại', width: 11, note: 'Epic, Story, Task, Bug hoặc Sub-task. Bỏ trống = Task.' },
  { key: 'summary', header: 'Tiêu đề', width: 45, note: 'Bắt buộc, tối đa 255 ký tự.' },
  { key: 'description', header: 'Mô tả', width: 45, note: 'Không bắt buộc. Hỗ trợ định dạng văn bản, xuống dòng trong ô bằng Alt+Enter.' },
  { key: 'parent', header: 'Issue cha', width: 16, note: 'Story/Task/Bug: Epic chứa nó. Sub-task (bắt buộc): Story/Task/Bug chứa nó. Ghi Mã dòng trong file, mã issue đã có (VD: QLTB-12) hoặc đúng tiêu đề.' },
  { key: 'priority', header: 'Độ ưu tiên', width: 13, note: 'Khẩn cấp, Cao, Trung bình, Thấp, Rất thấp. Bỏ trống = Trung bình.' },
  { key: 'assignee', header: 'Người thực hiện', width: 28, note: 'Tên đăng nhập, email hoặc họ tên của thành viên dự án.' },
  { key: 'story_points', header: 'Điểm ước lượng', width: 15, note: 'Điểm ước lượng (story point), là số. VD: 1, 2, 3, 5, 8.' },
  { key: 'sprint', header: 'Sprint', width: 18, note: 'Tên sprint chưa đóng. Bỏ trống = Backlog. Không áp dụng cho Epic và Sub-task.' },
  { key: 'status', header: 'Trạng thái', width: 14, note: 'Tên trạng thái của dự án. Bỏ trống = trạng thái đầu tiên.' },
  { key: 'labels', header: 'Nhãn', width: 18, note: 'Nhiều nhãn cách nhau bằng dấu phẩy.' },
  { key: 'start_date', header: 'Ngày bắt đầu', width: 14, note: 'Dạng ngày/tháng/năm, VD 01/10/2026. Thường dùng cho Epic (Lộ trình).' },
  { key: 'due_date', header: 'Hạn hoàn thành', width: 15, note: 'Dạng ngày/tháng/năm.' },
];

/** Cột nguồn: các khóa gửi lên server, cộng thêm cột chỉ dùng ở bước đọc file (STT kiểu WBS, người phối hợp). */
type SrcKey = Key | 'wbs' | 'collab';

const ALIASES: Record<SrcKey, string[]> = {
  ref: ['ma dong', 'ma tam', 'id', 'issue id', 'issue key'],
  type: ['loai', 'loai issue', 'issue type', 'type'],
  summary: ['tieu de', 'summary', 'dau viec', 'ten dau viec', 'cong viec', 'ten cong viec', 'ten chuc nang', 'chuc nang',
    'hang muc', 'noi dung cong viec', 'ten issue'],
  description: ['mo ta', 'description', 'chi tiet', 'ghi chu', 'ghi chu / tl lien quan', 'ghi chu/tl lien quan', 'ghi chu / tai lieu lien quan'],
  parent: ['issue cha', 'cha', 'thuoc epic', 'epic', 'parent', 'parent id', 'parent key', 'epic link', 'custom field (epic link)', 'parent summary'],
  priority: ['do uu tien', 'uu tien', 'priority'],
  assignee: ['nguoi thuc hien', 'nguoi phu trach', 'nguoi duoc giao', 'phu trach', 'assignee'],
  story_points: ['diem uoc luong', 'story point', 'story points', 'sp', 'diem', 'so ngay lv', 'so ngay lam viec', 'so ngay cong',
    'custom field (story points)', 'custom field (story point estimate)'],
  sprint: ['sprint'],
  status: ['trang thai', 'status'],
  labels: ['nhan', 'labels', 'label', 'tag'],
  start_date: ['ngay bat dau', 'bat dau', 'tu ngay', 'start date', 'custom field (start date)'],
  due_date: ['han hoan thanh', 'ket thuc', 'ngay ket thuc', 'den ngay', 'han', 'due date', 'deadline', 'ngay het han'],
  wbs: ['stt', 'tt', 'so tt', 'wbs', 'ma wbs'],
  collab: ['nguoi phoi hop', 'phoi hop'],
};

const fold = (v: unknown) => String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/\s+/g, ' ');

type Row = Partial<Record<Key, string>> & { row: number };
type SrcRow = Partial<Record<SrcKey, string>> & { row: number };

const isHeaderRow = (r: string[]) => r.some((c) => ALIASES.summary.includes(fold(c)));

/**
 * Kế hoạch dạng WBS đánh số theo cột STT: I, II… = Epic (mô-đun); 1, 2… = Story thuộc Epic đang xét;
 * 1.1, 5.3… = Sub-task của Story cùng số đầu trong Epic đó. Chỉ áp dụng khi file không có cột Loại / Issue cha.
 */
function applyWbs(rows: SrcRow[]) {
  const roman = /^[IVXLCDM]+$/i;
  let epic = '';
  for (const r of rows) {
    const code = (r.wbs ?? '').replace(/\.$/, '').trim();
    if (!code) continue;
    if (roman.test(code)) {
      epic = code.toUpperCase();
      r.type = 'Epic';
      r.ref = epic;
      delete r.story_points; // Epic không tính point, tiến độ lấy từ các Story con
    } else if (/^\d+$/.test(code)) {
      r.type = 'Story';
      r.ref = `${epic}.${code}`;
      if (epic) r.parent = epic;
    } else if (/^\d+(\.\d+)+$/.test(code)) {
      r.type = 'Sub-task';
      r.ref = `${epic}.${code}`;
      r.parent = `${epic}.${code.split('.')[0]}`;
    }
  }
}

/** Quy bảng (dòng tiêu đề + dữ liệu) về các dòng theo khóa chuẩn. */
function mapTable(table: string[][]): Row[] {
  const headerIdx = table.slice(0, 15).findIndex(isHeaderRow);
  if (headerIdx < 0) {
    throw new Error('Không tìm thấy dòng tiêu đề cột. File cần có cột "Tiêu đề" hoặc "Đầu việc" (hoặc "Summary" nếu xuất từ Jira).');
  }
  const header = table[headerIdx].map(fold);
  // Mỗi khóa → các cột khớp, theo thứ tự ưu tiên của ALIASES; một cột chỉ dùng cho một khóa
  const used = new Set<number>();
  const cols = {} as Record<SrcKey, number[]>;
  for (const key of Object.keys(ALIASES) as SrcKey[]) {
    cols[key] = ALIASES[key].flatMap((a) => header.map((h, i) => (h === a && !used.has(i) ? i : -1)).filter((i) => i >= 0));
    cols[key].forEach((i) => used.add(i));
  }
  const rows: SrcRow[] = [];
  table.slice(headerIdx + 1).forEach((r, n) => {
    const row: SrcRow = { row: headerIdx + n + 2 };
    for (const key of Object.keys(cols) as SrcKey[]) {
      const values = cols[key].map((i) => (r[i] ?? '').trim()).filter(Boolean);
      if (!values.length) continue;
      // Jira xuất nhiều cột Labels/Sprint trùng tên: gộp nhãn, lấy sprint gần nhất
      row[key] = key === 'labels' ? values.join(',') : key === 'sprint' ? values[values.length - 1] : values[0];
    }
    if (row.summary || row.type || row.parent) rows.push(row);
  });
  if (cols.wbs.length && !cols.type.length && !cols.parent.length) applyWbs(rows);
  return rows.map(({ wbs: _wbs, collab, ...r }) => {
    if (collab) r.description = [r.description, `Người phối hợp: ${collab}`].filter(Boolean).join('\n\n');
    return r;
  });
}

function cellText(v: any): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellText(v.result);
    if ('richText' in v) return v.richText.map((t: { text: string }) => t.text).join('');
    if ('text' in v) return String(v.text);
    if ('error' in v) return '';
  }
  return String(v);
}

async function loadExcel() {
  const mod: any = await import('exceljs');
  return mod.default ?? mod;
}

interface Sheet { name: string; table: string[][] }

/** Đọc mọi sheet đang hiện trong file; chỉ giữ các sheet có dòng tiêu đề cột nhận ra được. */
async function readXlsx(file: File): Promise<Sheet[]> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const sheets: Sheet[] = [];
  for (const ws of wb.worksheets) {
    if (ws.state && ws.state !== 'visible') continue;
    const table: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row: any, n: number) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell: any, c: number) => { cells[c - 1] = cellText(cell.value); });
      table[n - 1] = cells;
    });
    const t = Array.from(table, (r) => r ?? []);
    if (t.slice(0, 15).some(isHeaderRow)) sheets.push({ name: ws.name, table: t });
  }
  if (!sheets.length) throw new Error('Không sheet nào có dòng tiêu đề cột nhận ra được (cần cột "Tiêu đề" hoặc "Đầu việc").');
  // Ưu tiên sheet "Issue" của file mẫu
  sheets.sort((a, b) => Number(b.name === 'Issue') - Number(a.name === 'Issue'));
  return sheets;
}

/** Đọc CSV (dấu phẩy, chấm phẩy hoặc tab), hỗ trợ ô có ngoặc kép và xuống dòng trong ô. */
function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const firstLine = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : text.length);
  const delim = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function readFile(file: File): Promise<Sheet[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) return readXlsx(file);
  if (name.endsWith('.csv') || name.endsWith('.txt')) return [{ name: file.name, table: parseCsv(await file.text()) }];
  if (name.endsWith('.xls')) throw new Error('File .xls (Excel 97-2003) chưa được hỗ trợ. Mở bằng Excel rồi lưu lại dạng .xlsx.');
  throw new Error('Chỉ nhận file .xlsx hoặc .csv');
}

// ---------------------------------------------------------------------------
// File mẫu
// ---------------------------------------------------------------------------
async function downloadTemplate(project: Project, sprintNames: string[]) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'QLDA';
  const ws = wb.addWorksheet('Issue', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C66E4' } };
  head.alignment = { vertical: 'middle' };
  head.height = 22;
  COLUMNS.forEach((c, i) => { head.getCell(i + 1).note = c.note; });

  const member = project.members[0];
  const who = member ? `${member.full_name} (${member.username})` : '';
  const sprint = project.type === 'scrum' ? sprintNames[0] ?? '' : '';
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const year = new Date().getFullYear();
  ws.addRows([
    { ref: 'E1', type: 'Epic', summary: 'Quản lý danh mục thiết bị', description: 'Nhóm chức năng quản lý danh mục', priority: 'Cao', start_date: d(`${year}-10-01`), due_date: d(`${year}-11-30`) },
    { ref: 'S1', type: 'Story', summary: 'Thêm mới thiết bị vào danh mục', description: 'Là cán bộ quản lý, tôi muốn thêm mới thiết bị để theo dõi tài sản.\n\nTiêu chí chấp nhận:\n- Nhập đủ mã, tên, số lượng\n- Không trùng mã', parent: 'E1', priority: 'Trung bình', assignee: who, story_points: 5, sprint, labels: 'danh-muc' },
    { type: 'Sub-task', summary: 'Thiết kế màn hình thêm mới', parent: 'S1', assignee: who },
    { type: 'Task', summary: 'Viết tài liệu đặc tả danh mục', parent: 'E1', priority: 'Thấp', story_points: 2 },
    { type: 'Bug', summary: 'Cho phép nhập số lượng âm', parent: 'E1', priority: 'Khẩn cấp', due_date: d(`${year}-10-15`) },
  ]);
  for (const k of ['start_date', 'due_date']) ws.getColumn(k).numFmt = 'dd/mm/yyyy';
  ws.getColumn('description').alignment = { wrapText: true, vertical: 'top' };

  // Danh mục cho ô chọn thả xuống
  const lists = wb.addWorksheet('DanhMuc', { state: 'hidden' });
  const listCols: [Key, string[]][] = [
    ['type', Object.values(TYPE_LABELS)],
    ['priority', ['Khẩn cấp', 'Cao', 'Trung bình', 'Thấp', 'Rất thấp']],
    ['assignee', project.members.map((m) => `${m.full_name} (${m.username})`)],
    ['sprint', project.type === 'scrum' ? sprintNames : []],
    ['status', project.statuses.map((s) => s.name)],
  ];
  listCols.forEach(([key, values], ci) => {
    if (!values.length) return;
    const letter = String.fromCharCode(65 + ci);
    values.forEach((v, ri) => { lists.getCell(`${letter}${ri + 1}`).value = v; });
    const col = COLUMNS.findIndex((c) => c.key === key) + 1;
    for (let r = 2; r <= 500; r++) {
      ws.getCell(r, col).dataValidation = {
        type: 'list', allowBlank: true, showErrorMessage: key !== 'assignee',
        formulae: [`DanhMuc!$${letter}$1:$${letter}$${values.length}`],
      };
    }
  });

  const guide = wb.addWorksheet('Hướng dẫn');
  guide.columns = [{ header: 'Cột', key: 'h', width: 20 }, { header: 'Cách nhập', key: 'n', width: 110 }];
  guide.getRow(1).font = { bold: true };
  COLUMNS.forEach((c) => guide.addRow({ h: c.header, n: c.note }));
  guide.addRow({});
  for (const line of [
    'Nhập dữ liệu ở sheet "Issue", mỗi dòng một issue. Có thể xóa các dòng ví dụ.',
    'Thứ tự dòng không quan trọng: issue cha luôn được tạo trước issue con.',
    'Khi nhập, tool hiển thị bảng xem trước; chỉ nhập khi anh/chị bấm xác nhận. Có lỗi thì không nhập dòng nào.',
    'Cũng có thể nhập trực tiếp file Excel (CSV) xuất từ Jira (Filters → Export → CSV).',
  ]) guide.addRow({ h: '•', n: line });

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `mau-nhap-issue-${project.key}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------------------------------------------------------------------------
// Giao diện
// ---------------------------------------------------------------------------
interface Result {
  row: number; type: IssueType | null; summary: string; parent: string | null; assignee: string | null;
  sprint: string | null; key?: string; errors: string[]; warnings: string[];
}
interface ImportResponse { committed: boolean; created: number; valid: number; errors: number; warnings: number; results: Result[] }

export function ImportButton({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  if (!can(project.permissions, 'issue.import')) return null;
  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)} title="Nhập issue hàng loạt từ file Excel hoặc Excel (CSV) xuất từ Jira">⬆ Nhập từ Excel</button>
      {open && <ImportIssuesModal project={project} onClose={() => setOpen(false)} />}
    </>
  );
}

function ImportIssuesModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { open } = useIssueModal();
  const { data: sprints } = useSprints(project.key, 'future,active');
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [res, setRes] = useState<ImportResponse | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [skipErrors, setSkipErrors] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetName, setSheetName] = useState('');

  /** Quy sheet đã chọn về các dòng rồi gửi server kiểm tra (xem trước). */
  const preview = async (sheet: Sheet) => {
    setError(''); setRes(null); setSkipErrors(false); setBusy('Đang kiểm tra dữ liệu…');
    try {
      const parsed = mapTable(sheet.table);
      if (!parsed.length) throw new Error(`Sheet "${sheet.name}" không có dòng dữ liệu nào`);
      setRows(parsed);
      setRes(await api.post<ImportResponse>(`/projects/${project.key}/import`, { rows: parsed, commit: false }));
    } catch (e) {
      setRows([]); setError(errMsg(e));
    } finally {
      setBusy('');
    }
  };

  const pick = async (file?: File) => {
    if (!file) return;
    setError(''); setRes(null); setSheets([]); setFileName(file.name); setBusy('Đang đọc file…');
    try {
      const found = await readFile(file);
      setSheets(found);
      setSheetName(found[0].name);
      await preview(found[0]);
    } catch (e) {
      setRows([]); setError(errMsg(e)); setBusy('');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doImport = async () => {
    if (!res) return;
    const bad = new Set(res.results.filter((r) => r.errors.length).map((r) => r.row));
    const send = skipErrors ? rows.filter((r) => !bad.has(r.row)) : rows;
    setBusy('Đang nhập…');
    try {
      const out = await api.post<ImportResponse>(`/projects/${project.key}/import`, { rows: send, commit: true });
      setRes(out);
      if (out.committed) {
        toast(`Đã nhập ${out.created} issue vào ${project.key}`);
        await refreshAll();
      }
    } catch (e) { setError(errMsg(e)); } finally { setBusy(''); }
  };

  const template = async () => {
    setBusy('Đang tạo file mẫu…');
    try { await downloadTemplate(project, (sprints ?? []).map((s) => s.name)); } catch (e) { setError(errMsg(e)); } finally { setBusy(''); }
  };

  const done = res?.committed;
  const canImport = res && !done && res.valid > 0 && (res.errors === 0 || skipErrors);
  const importCount = res ? (skipErrors ? res.valid : res.results.length) : 0;

  return (
    <Modal title={`Nhập issue từ Excel · ${project.name}`} width={1100} onClose={onClose} footer={<>
      {res && !done && res.errors > 0 && res.valid > 0 && (
        <label className="check"><input type="checkbox" checked={skipErrors} onChange={(e) => setSkipErrors(e.target.checked)} /> Bỏ qua {res.errors} dòng lỗi, chỉ nhập {res.valid} dòng hợp lệ</label>
      )}
      <div className="spacer" />
      {done ? <button className="btn btn-primary" onClick={onClose}>Xong</button> : <>
        <button className="btn" onClick={onClose}>Hủy</button>
        <button className="btn btn-primary" disabled={!canImport || !!busy} onClick={doImport}>
          {res ? `Nhập ${importCount} issue` : 'Nhập'}
        </button>
      </>}
    </>}>
      <div className="stack">
        {!done && (
          <div className="import-steps">
            <div className="import-step">
              <b>1. Chuẩn bị file</b>
              <span className="muted small">Dùng file mẫu (có sẵn ô chọn Loại, Độ ưu tiên, Người thực hiện, Sprint, Trạng thái) hoặc file CSV xuất từ Jira.</span>
              <div><button className="btn btn-sm" onClick={template} disabled={!!busy}>⬇ Tải file mẫu Excel</button></div>
            </div>
            <div className={`import-drop ${dragOver ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current?.click()}>
              <b>2. Chọn hoặc kéo thả file vào đây</b>
              <span className="muted small">{fileName || '.xlsx hoặc .csv, tối đa 1000 dòng'}</span>
              <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={(e) => pick(e.target.files?.[0])} />
            </div>
          </div>
        )}

        {sheets.length > 1 && !done && (
          <label className="row gap-sm">
            <b>Sheet cần nhập:</b>
            <select value={sheetName} disabled={!!busy} onChange={(e) => {
              setSheetName(e.target.value);
              const s = sheets.find((x) => x.name === e.target.value);
              if (s) preview(s);
            }}>
              {sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
            <span className="muted small">File có {sheets.length} sheet dữ liệu</span>
          </label>
        )}
        {busy && <div className="row gap-sm"><Spinner /> <span className="muted">{busy}</span></div>}
        {error && <div className="form-error">{error}</div>}

        {res && (
          <>
            <div className="import-summary">
              {done ? <span className="ok">✔ Đã nhập thành công {res.created} issue.</span> : <>
                <span>{res.results.length} dòng</span>
                <span className="ok">✔ {res.valid} hợp lệ</span>
                {res.errors > 0 && <span className="bad">✖ {res.errors} lỗi</span>}
                {res.warnings > 0 && <span className="warn">⚠ {res.warnings} cảnh báo</span>}
                {res.errors > 0 && <span className="muted small">Sửa các dòng lỗi trong file rồi chọn lại file, hoặc tick "Bỏ qua dòng lỗi".</span>}
              </>}
            </div>
            <div className="table-wrap import-table">
              <table className="table compact">
                <thead><tr><th>Dòng</th><th>Loại</th><th>Tiêu đề</th><th>Issue cha</th><th>Người thực hiện</th><th>Sprint</th><th>{done ? 'Mã issue' : 'Kết quả kiểm tra'}</th></tr></thead>
                <tbody>
                  {res.results.map((r) => (
                    <tr key={r.row} className={r.errors.length ? 'row-error' : ''}>
                      <td className="num">{r.row}</td>
                      <td className="nowrap">{r.type ? <span className="row gap-xs"><TypeIcon type={r.type} size={14} />{TYPE_LABELS[r.type]}</span> : '—'}</td>
                      <td>{r.summary || <i className="muted">(trống)</i>}</td>
                      <td className="small">{r.parent}</td>
                      <td className="small">{r.assignee}</td>
                      <td className="small">{r.sprint}</td>
                      <td className="small">
                        {r.key && <a onClick={() => { onClose(); open(r.key!); }}>{r.key}</a>}
                        {r.errors.map((m, i) => <div key={i} className="bad">✖ {m}</div>)}
                        {r.warnings.map((m, i) => <div key={i} className="warn">⚠ {m}</div>)}
                        {!r.key && !r.errors.length && !r.warnings.length && <span className="ok">✔ Hợp lệ</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
