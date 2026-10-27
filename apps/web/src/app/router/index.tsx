import { createBrowserRouter, Navigate } from 'react-router';
import { modules } from '@vympa/shared';
import { AppLayout } from '@/components/layout/AppLayout';
import { ModulePlaceholder } from '@/components/shared/ModulePlaceholder';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import {
  LoginPage,
  RecoveryPage,
  ConfirmPage,
  MfaPage,
  CompleteAccessPage,
} from '@/features/auth/AuthPages';
import { AdminDashboard } from '@/features/auth/AdminDashboard';
import { AdminUsersPage } from '@/features/admin-users/AdminUsersPage';
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/recover', element: <RecoveryPage /> },
  { path: '/auth/confirm', element: <ConfirmPage /> },
  { path: '/mfa', element: <MfaPage /> },
  { path: '/recover/update', element: <CompleteAccessPage /> },
  { path: '/invitation', element: <CompleteAccessPage invitation /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: '/dashboard', element: <AdminDashboard /> },
          {
            element: <ProtectedRoute owner />,
            children: [{ path: '/admin/users', element: <AdminUsersPage /> }],
          },
          ...modules
            .filter(([path]) => path !== 'dashboard')
            .map(([path, label]) => ({ path, element: <ModulePlaceholder label={label} /> })),
          { path: '*', element: <ModulePlaceholder label="Página não encontrada" /> },
        ],
      },
    ],
  },
]);
