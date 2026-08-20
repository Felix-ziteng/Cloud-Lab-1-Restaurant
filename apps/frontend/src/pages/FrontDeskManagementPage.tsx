import { useOutletContext } from 'react-router-dom';
import ManagementPanel from '../components/ManagementPanel';
import RequireManager from './RequireManager';
import type { FrontDeskContext } from './FrontDeskLayout';

export default function FrontDeskManagementPage() {
  const { role, config, setConfig } = useOutletContext<FrontDeskContext>();
  return (
    <RequireManager role={role}>
      {config ? (
        <ManagementPanel config={config} onConfigChange={setConfig} />
      ) : (
        <p className="text-sm text-muted-foreground">加载中…</p>
      )}
    </RequireManager>
  );
}
