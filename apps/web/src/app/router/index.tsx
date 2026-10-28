import { createBrowserRouter, Navigate } from 'react-router';
import { lazy, Suspense } from 'react';
import { modules } from '@vympa/shared';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { ModulePlaceholder } from '@/components/shared/ModulePlaceholder';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import {
  LoginPage,
  RecoveryPage,
  ConfirmPage,
  MfaPage,
  CompleteAccessPage,
} from '@/features/auth/AuthPages';
import { LoadingState } from '@/components/shared/DashboardComponents';
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
);
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
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          {
            path: '/dashboard',
            element: (
              <Suspense fallback={<LoadingState />}>
                <DashboardPage />
              </Suspense>
            ),
          },
          {
            element: <ProtectedRoute owner />,
            children: [
              { path: '/admin', element: <AdminUsersPage /> },
              { path: '/admin/users', element: <AdminUsersPage /> },
            ],
          },
          ...modules
            .filter(([path]) => path !== 'dashboard' && path !== 'admin')
            .map(([path, label]) => ({ path, element: <ModulePlaceholder label={label} /> })),
          { path: '*', element: <ModulePlaceholder label="Página não encontrada" /> },
        ],
      },
    ],
  },
]);
