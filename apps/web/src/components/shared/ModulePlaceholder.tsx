import { Construction } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
export function ModulePlaceholder({ label }: { label: string }) {
  return (
    <div className="placeholder">
      <Card>
        <CardHeader>
          <Construction size={28} />
          <CardTitle>{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Módulo planejado. Funcionalidade ainda não implementada.</p>
          <p>Esta etapa entrega apenas a fundação técnica do VYMPA Connect.</p>
        </CardContent>
      </Card>
    </div>
  );
}
