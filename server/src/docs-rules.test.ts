import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDocName, extOf, isAllowedDoc } from './docs-rules';

test('only Excel, PDF, Word, HTML and EXE files are accepted', () => {
  for (const f of ['Bao cao.XLSX', 'a.xls', 'hd.pdf', 'Hợp đồng.docx', 'cu.doc', 'trang.html', 'b.htm', 'setup.exe']) assert.equal(isAllowedDoc(f), true, f);
  for (const f of ['anh.png', 'nen.zip', 'script.js', 'khong-duoi', 'x.exe.txt']) assert.equal(isAllowedDoc(f), false, f);
  assert.equal(extOf(' Ke hoach.Docx '), 'docx');
});

test('folder and document names are trimmed and forbid path characters', () => {
  assert.equal(cleanDocName('  Quy   trình  ', 'thư mục'), 'Quy trình');
  assert.throws(() => cleanDocName('  ', 'thư mục'), /không được để trống/);
  assert.throws(() => cleanDocName('a/b', 'thư mục'), /ký tự/);
});
