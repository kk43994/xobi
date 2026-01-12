import { Navigate, useParams } from 'react-router-dom';

export function LegacyProjectRedirect(_props: { target: 'outline' | 'detail' | 'preview' }) {
  const { projectId } = useParams();
  if (!projectId) return <Navigate to="/projects" replace />;
  return <Navigate to={`/projects/${projectId}/workbench`} replace />;
}
