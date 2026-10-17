import fs from 'node:fs';
import path from 'node:path';
import { get, run, tx } from './db.ts';

/** Bộ dữ liệu nạp sẵn: [mã tỉnh, tên tỉnh, [[mã phường/xã, tên phường/xã]]] — nguồn xem data/README.md */
type Units = { source: string; provinces: [string, string, [string, string][]][] };

export function loadUnits(file = path.join(import.meta.dirname, 'data/vn-admin-units.json')): Units {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Nạp sẵn Danh mục địa chính (34 tỉnh/thành phố, 3.321 phường/xã) khi CSDL chưa có tỉnh nào; sau đó quản trị viên tự sửa */
export function seedGeo() {
  if (get('SELECT 1 FROM geo_provinces LIMIT 1')) return;
  const units = loadUnits();
  tx(() => {
    for (const [code, name, wards] of units.provinces) {
      run('INSERT INTO geo_provinces(code, name) VALUES (?, ?)', code, name);
      for (const [wcode, wname] of wards) run('INSERT INTO geo_wards(code, province_code, name) VALUES (?, ?, ?)', wcode, code, wname);
    }
  });
  console.log(`[geo] Đã nạp Danh mục địa chính: ${units.provinces.length} tỉnh/thành phố`);
}

/** Tên tỉnh/xã bỏ phần loại đơn vị ("Thành phố", "Tỉnh", "Phường", "Xã", "Đặc khu") — dùng để sắp xếp, tìm kiếm */
export const shortName = (name: string) => name.replace(/^(Thành phố|Tỉnh|Phường|Xã|Đặc khu|Thị trấn)\s+/i, '');
