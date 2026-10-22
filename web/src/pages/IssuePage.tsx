import { useParams } from 'react-router-dom';
import { hasPerm, useMe } from '../hooks';
import { IssueDetailView } from '../components/IssueDetail';

export default function IssuePage() {
  const { issueKey } = useParams();
  const { data: me } = useMe();
  return (
    <div className="page">
      <div className="card issue-page">
        {/* Mở chi tiết issue cần Issue – Xem (máy chủ cũng chặn theo quyền trong dự án) */}
        {hasPerm(me, 'issue.view') ? <IssueDetailView issueKey={issueKey!.toUpperCase()} />
          : <div className="pad"><p>Bạn không có quyền xem issue</p></div>}
      </div>
    </div>
  );
}
