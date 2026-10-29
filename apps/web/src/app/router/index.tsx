import { FinanceHome } from '@/features/finance/FinanceHome';
import { GoalsPage, GoalList, GoalDetails } from '@/features/goals/GoalsPage';
import { GoalAnalyticsPage, GoalTeamPage } from '@/features/goals/GoalAnalyticsPage';
import { ClientsPage, ClientDetails } from '@/features/clients/ClientsPage';
import { ContractsPage, ContractDetails } from '@/features/clients/ContractsPage';
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
const ProspectingPage = lazy(() =>
  import('@/features/prospecting/ProspectingPage').then((module) => ({
    default: module.ProspectingPage,
  })),
);
const SimulatorPage = lazy(() =>
  import('@/features/finance/SimulatorPage').then((m) => ({ default: m.SimulatorPage })),
);
const ManagementPage = lazy(() =>
  import('@/features/finance/ManagementPage').then((m) => ({ default: m.ManagementPage })),
);
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
              { path: '/goals/financial', element: <GoalList category="FINANCIAL" /> },
              { path: '/goals/analytics', element: <GoalAnalyticsPage /> },
              {
                path: '/finance/management',
                element: (
                  <Suspense fallback={<LoadingState />}>
                    <ManagementPage />
                  </Suspense>
                ),
              },
              { path: '/admin', element: <AdminUsersPage /> },
              { path: '/admin/users', element: <AdminUsersPage /> },
            ],
          },
          {
            path: '/prospecting',
            element: (
              <Suspense fallback={<LoadingState />}>
                <ProspectingPage />
              </Suspense>
            ),
          },
          {
            path: '/crm',
            element: (
              <Suspense fallback={<LoadingState />}>
                <ProspectingPage crm />
              </Suspense>
            ),
          },
          { path: '/finance', element: <FinanceHome /> },
          { path: '/goals', element: <GoalsPage /> },
          { path: '/goals/commercial', element: <GoalList category="COMMERCIAL" /> },
          { path: '/goals/team', element: <GoalTeamPage /> },
          { path: '/goals/team/objectives', element: <GoalList category="TEAM" /> },
          { path: '/goals/detail/:id', element: <GoalDetails /> },
          { path: '/clients', element: <ClientsPage /> },
          { path: '/clients/:id', element: <ClientDetails /> },
          { path: '/contracts', element: <ContractsPage /> },
          { path: '/contracts/:id', element: <ContractDetails /> },
          {
            path: '/finance/simulator',
            element: (
              <Suspense fallback={<LoadingState />}>
                <SimulatorPage />
              </Suspense>
            ),
          },
          ...modules
            .filter(
              ([path]) =>
                ![
                  'dashboard',
                  'admin',
                  'prospecting',
                  'crm',
                  'finance',
                  'clients',
                  'contracts',
                  'goals',
                ].includes(path),
            )
            .map(([path, label]) => ({ path, element: <ModulePlaceholder label={label} /> })),
          { path: '*', element: <ModulePlaceholder label="Página não encontrada" /> },
        ],
      },
    ],
  },
]);
