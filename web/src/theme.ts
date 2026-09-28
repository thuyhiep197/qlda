/** Giao diện sáng/tối theo cài đặt của từng tài khoản; "system" theo cài đặt của máy. */
export type ThemePref = 'light' | 'dark' | 'system';

const media = () => window.matchMedia('(prefers-color-scheme: dark)');
let current: ThemePref = 'system';

function paint() {
  const dark = current === 'dark' || (current === 'system' && media().matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

export function applyTheme(pref: ThemePref | undefined) {
  current = pref === 'light' || pref === 'dark' ? pref : 'system';
  try { localStorage.setItem('qlda-theme', current); } catch { /* trình duyệt chặn lưu trữ */ }
  paint();
}

// Máy đổi chế độ sáng/tối khi đang để "Theo hệ thống"
media().addEventListener?.('change', () => { if (current === 'system') paint(); });
