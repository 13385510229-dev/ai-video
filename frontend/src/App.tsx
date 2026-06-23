import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';
import { useAuthStore } from './store/auth';

// 页面
import Home from './pages/Home';
import Login from './pages/Login';
import History from './pages/History';
import ImageGenerate from './pages/ImageGenerate';
import ImageHistory from './pages/ImageHistory';
import Recharge from './pages/Recharge';
import Profile from './pages/Profile';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminOrders from './pages/admin/AdminOrders';
import AdminUsers from './pages/admin/AdminUsers';
import TermsOfService from './pages/TermsOfService';
import PrivacyPolicy from './pages/PrivacyPolicy';

// 路由守卫
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isLoggedIn } = useAuthStore();
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const adminToken = localStorage.getItem('adminToken');
  if (!adminToken) {
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
};

function App() {
  const { initAuth } = useAuthStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  return (
    <Routes>
      {/* 前台路由 */}
      <Route path="/" element={<Layout />}>
        <Route index element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="login" element={<Login />} />
        <Route path="history" element={<ProtectedRoute><History /></ProtectedRoute>} />
        <Route path="image-generate" element={<ProtectedRoute><ImageGenerate /></ProtectedRoute>} />
        <Route path="image-history" element={<ProtectedRoute><ImageHistory /></ProtectedRoute>} />
        <Route path="recharge" element={<ProtectedRoute><Recharge /></ProtectedRoute>} />
        <Route path="profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="terms" element={<TermsOfService />} />
        <Route path="privacy" element={<PrivacyPolicy />} />
      </Route>

      {/* 管理后台路由 */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route path="login" element={<AdminLogin />} />
        <Route index element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="orders" element={<AdminRoute><AdminOrders /></AdminRoute>} />
        <Route path="users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
