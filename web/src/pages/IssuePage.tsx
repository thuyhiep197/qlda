import { useParams } from 'react-router-dom';
import { IssueDetailView } from '../components/IssueDetail';

export default function IssuePage() {
  const { issueKey } = useParams();
  return (
    <div className="page">
      <div className="card issue-page">
        <IssueDetailView issueKey={issueKey!.toUpperCase()} />
      </div>
    </div>
  );
}
