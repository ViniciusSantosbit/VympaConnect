import { createBrowserRouter } from 'react-router';
import { modules } from '@vympa/shared';
import { AppLayout } from '@/components/layout/AppLayout';
import { FoundationPage } from '@/features/dashboard/FoundationPage';
import { ModulePlaceholder } from '@/components/shared/ModulePlaceholder';
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <FoundationPage /> },
      ...modules.map(([path, label]) => ({
        path,
        element: path === 'dashboard' ? <FoundationPage /> : <ModulePlaceholder label={label} />,
      })),
      { path: '*', element: <ModulePlaceholder label="Página não encontrada" /> },
    ],
  },
]);
