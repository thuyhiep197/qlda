import { Lock } from 'lucide-react';
import { useMe } from '../hooks';
import { Markdown } from '../components/ui';
import { permOk, splitBlocks, type HelpArticle } from './help-core';
import { usePermLabel } from './articles';

/**
 * Nội dung một bài hướng dẫn. Đoạn ":::perm …" là thao tác cần quyền: người xem có quyền → hiện bình thường kèm tên quyền;
 * không có → hiện mờ kèm thông báo cần quyền gì (không ẩn, để biết mà xin cấp).
 * onLink(href): bấm liên kết nội bộ (/help/…, /projects…) — trang hoặc ngăn hướng dẫn tự xử lý điều hướng.
 */
export function HelpArticleView({ article, onLink }: { article: HelpArticle; onLink: (href: string) => void }) {
  const { data: me } = useMe();
  const label = usePermLabel();
  return (
    <div className="help-article" onClickCapture={(e) => {
      const a = (e.target as HTMLElement).closest('a');
      const href = a?.getAttribute('href');
      if (href && href.startsWith('/')) { e.preventDefault(); e.stopPropagation(); onLink(href); }
    }}>
      {splitBlocks(article.body).map((b, i) => {
        if (!b.need) return <Markdown key={i} text={b.text} />;
        const ok = permOk(me, b.need);
        return (
          <div key={i} className={`help-perm ${ok ? '' : 'locked'}`}>
            <div className="help-perm-tag">
              <Lock size={12} /> {ok ? 'Quyền cần có' : 'Bạn chưa có quyền'}: <b>{label(b.need)}</b>
              {!ok && <span> — liên hệ quản trị hệ thống nếu bạn cần dùng thao tác này.</span>}
            </div>
            <div className="help-perm-body" aria-disabled={!ok}><Markdown text={b.text} /></div>
          </div>
        );
      })}
    </div>
  );
}
