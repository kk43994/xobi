import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Home } from './pages/Home';
import { History } from './pages/History';
import { OutlineEditor } from './pages/OutlineEditor';
import { DetailEditor } from './pages/DetailEditor';
import { ImagePreview } from './pages/ImagePreview';
import { ProjectWorkbenchPage } from './pages/ProjectWorkbenchPage';
import { ProjectArchivePage } from './pages/ProjectArchivePage';
import { PortalSettingsPage } from './pages/PortalSettingsPage';
import { Settings } from './pages/Settings';
import { Dashboard } from './pages/Dashboard';
import { LegacyProjectRedirect } from './pages/LegacyProjectRedirect';
import { PortalLayout } from './layout/PortalLayout';
import { AssetsPage } from './pages/AssetsPage';
import { JobsPage } from './pages/JobsPage';
import { ExcelDatasetsPage } from './pages/ExcelDatasetsPage';
import { ExcelDatasetPage } from './pages/ExcelDatasetPage';
import { FactorySinglePage } from './pages/FactorySinglePage';
import { FactoryDetailPage } from './pages/FactoryDetailPage';
import { MainFactoryLandingPage } from './pages/MainFactoryLandingPage';
import { MainFactoryCanvasPage } from './pages/MainFactoryCanvasPage';
import { AgentPage } from './pages/AgentPage';
import { EditorPage } from './pages/EditorPage';
import { BatchFactoryPage } from './pages/BatchFactoryPage';
import { VideoFactoryPage } from './pages/VideoFactoryPage';
import { LogsPage } from './pages/LogsPage';
import { LoginPage } from './pages/LoginPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { useProjectStore } from './store/useProjectStore';
import { useAuthStore } from './store/useAuthStore';
import { useToast } from './components/shared';

// 路由守卫：需要登录
function RequireAuth() {
  const { token, user, fetchMe } = useAuthStore();

  // 尝试恢复登录状态
  useEffect(() => {
    if (token && !user) {
      fetchMe();
    }
  }, [token, user, fetchMe]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function App() {
  const { currentProject, syncProject, error, setError } = useProjectStore();
  const { show, ToastContainer } = useToast();

  // 恢复项目状态
  useEffect(() => {
    const savedProjectId = localStorage.getItem('currentProjectId');
    if (savedProjectId && !currentProject) {
      syncProject();
    }
  }, [currentProject, syncProject]);

  // 显示全局错误
  useEffect(() => {
    if (error) {
      show({ message: error, type: 'error' });
      setError(null);
    }
  }, [error, setError, show]);

  return (
    <BrowserRouter>
      <Routes>
        {/* 登录页（无需登录） */}
        <Route path="/login" element={<LoginPage />} />

        {/* 需要登录的路由 */}
        <Route element={<RequireAuth />}>
          <Route path="/" element={<PortalLayout />}>
            <Route index element={<Dashboard />} />

            <Route path="projects">
              <Route index element={<History />} />
              {/* 兼容旧入口：详情图工厂已迁移到 /factory/detail */}
              <Route path="new" element={<Navigate to="/factory/detail" replace />} />
              <Route path=":projectId" element={<ProjectArchivePage />} />
              <Route path=":projectId/workbench" element={<ProjectWorkbenchPage />} />
              <Route path=":projectId/outline" element={<OutlineEditor />} />
              <Route path=":projectId/detail" element={<DetailEditor />} />
              <Route path=":projectId/preview" element={<ImagePreview />} />
            </Route>

            <Route path="excel">
              <Route index element={<ExcelDatasetsPage />} />
              <Route path="legacy" element={<Navigate to="/excel" replace />} />
              <Route path=":datasetId" element={<ExcelDatasetPage />} />
            </Route>

            <Route path="factory/single" element={<MainFactoryLandingPage />} />
            <Route path="factory/canvas" element={<MainFactoryCanvasPage />} />
            <Route path="factory/single-tool" element={<FactorySinglePage />} />
            <Route path="factory/single-lite" element={<Navigate to="/factory/single-tool" replace />} />
            <Route path="factory/single-legacy" element={<Navigate to="/factory/single-tool" replace />} />
            {/* 详情图工厂（沉浸式，独立页面，不再使用 iframe） */}
            <Route path="factory/detail" element={<Home />} />
            {/* Excel/批量桥接：从某一行/某张图进入详情页工作流 */}
            <Route path="factory/detail-bridge" element={<FactoryDetailPage />} />
            <Route
              path="factory/batch"
              element={<BatchFactoryPage />}
            />

            <Route path="canvas" element={<Navigate to="/factory/canvas" replace />} />

            <Route path="video" element={<VideoFactoryPage />} />

            <Route path="editor" element={<EditorPage />} />

            <Route path="assets" element={<AssetsPage />} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="agent" element={<AgentPage />} />

            <Route path="settings" element={<PortalSettingsPage />} />
            <Route path="logs" element={<LogsPage />} />

            {/* 管理员页面 */}
            <Route path="admin/users" element={<AdminUsersPage />} />
          </Route>
        </Route>

        {/* 兼容旧路由（避免你们现有书签/跳转失效） */}
        <Route path="/history" element={<Navigate to="/projects" replace />} />
        <Route path="/project/:projectId/outline" element={<LegacyProjectRedirect target="outline" />} />
        <Route path="/project/:projectId/detail" element={<LegacyProjectRedirect target="detail" />} />
        <Route path="/project/:projectId/preview" element={<LegacyProjectRedirect target="preview" />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}

export default App;
