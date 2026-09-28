// Áp giao diện sáng/tối trước khi trang hiển thị để không bị nháy (lựa chọn gần nhất lưu ở trình duyệt)
(function () {
  try {
    var t = localStorage.getItem('qlda-theme') || 'system';
    var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) { /* bỏ qua */ }
})();
