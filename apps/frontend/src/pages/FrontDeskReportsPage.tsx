import { useOutletContext } from 'react-router-dom';
import ReportsPanel from '../components/ReportsPanel';
import RequireManager from './RequireManager';
import type { FrontDeskContext } from './FrontDeskLayout';

export default function FrontDeskReportsPage() {
  const { role } = useOutletContext<FrontDeskContext>();
  return (
    <RequireManager role={role}>
      <ReportsPanel />
    </RequireManager>
  );
}
