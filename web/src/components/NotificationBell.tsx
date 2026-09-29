import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, queryClient } from '../api';
import { useIssueModal, useUsersBasic } from '../hooks';
import type { IssueType } from '../types';
import { timeAgo } from '../util';
import { Avatar, TypeIcon } from './ui';
import { Bell } from 'lucide-react';

interface Notification {
  id: number;
  type: 'mention' | 'assigned' | 'comment' | 'status';
  text: string | null;
  created_at: string;
  read_at: string | null;
  actor_name: string | null;
  issue_key: string;
  issue_summary: string;
  issue_type: IssueType;
}

const VERB: Record<Notification['type'], string> = {
  mention: 'đã nhắc đến bạn trong',
  assigned: 'đã giao cho bạn',
  comment: 'đã bình luận trong',
  status: 'đã chuyển trạng thái',
};

/** Chuông thông báo trên thanh trên cùng, tự làm mới mỗi 30 giây. */
export default function NotificationBell() {
  const { open } = useIssueModal();
  const { data: users } = useUsersBasic();
  const [show, setShow] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { data } = useQuery<{ unread: number; items: Notification[] }>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications'),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!show) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setShow(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShow(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [show]);

  const names = new Map((users ?? []).map((u) => [u.username.toLowerCase(), u.full_name]));
  const pretty = (s: string) => s.replace(/(^|[\s(])@([a-z0-9][a-z0-9._-]*[a-z0-9_-]|[a-z0-9])/gi,
    (m, pre: string, u: string) => (names.has(u.toLowerCase()) ? `${pre}@${names.get(u.toLowerCase())}` : m));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const openItem = async (n: Notification) => {
    setShow(false);
    open(n.issue_key);
    if (!n.read_at) { await api.post(`/notifications/${n.id}/read`); refresh(); }
  };
  const readAll = async () => { await api.post('/notifications/read-all'); refresh(); };

  const unread = data?.unread ?? 0;
  const items = (data?.items ?? []).filter((n) => !onlyUnread || !n.read_at);

  return (
    <div className="bell" ref={box}>
      <button className="bell-btn" onClick={() => setShow(!show)} title="Thông báo" aria-label={`Thông báo, ${unread} chưa đọc`}>
        <Bell size={20} />
        {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {show && (
        <div className="bell-panel">
          <div className="bell-head">
            <b>Thông báo</b>
            <label className="check small"><input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> Chỉ chưa đọc</label>
            <div className="spacer" />
            {unread > 0 && <a className="small" onClick={readAll}>Đánh dấu tất cả đã đọc</a>}
          </div>
          <div className="bell-list">
            {items.length === 0 && <div className="empty small">{onlyUnread ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'}</div>}
            {items.map((n) => (
              <div key={n.id} className={`bell-item ${n.read_at ? '' : 'unread'}`} onClick={() => openItem(n)}>
                <Avatar name={n.actor_name} size={30} />
                <div className="grow">
                  <div><b>{n.actor_name || 'Hệ thống'}</b> {VERB[n.type]}</div>
                  <div className="row gap-xs small bell-issue">
                    <TypeIcon type={n.issue_type} size={14} /> <span className="issue-key">{n.issue_key}</span>
                    <span className="ellipsis">{n.issue_summary}</span>
                  </div>
                  {n.text && n.type !== 'assigned' && <div className="bell-text small">{pretty(n.text)}</div>}
                  <div className="muted small">{timeAgo(n.created_at)}</div>
                </div>
                {!n.read_at && <span className="bell-dot" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
