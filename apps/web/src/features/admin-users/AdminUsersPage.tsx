import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UsersRound, MailPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi, authMessage } from '@/features/auth/auth-api';
import { useAuth } from '@/features/auth/AuthProvider';
type Admin = { id: string; email: string; role: 'OWNER' | 'ADMIN'; active: boolean };
type Invitation = {
  id: string;
  email: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};
type Recovery = { id: string; identityId: string; approvedAt: string | null };
export function AdminUsersPage() {
  const { session } = useAuth();
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => authApi<Admin[]>('/admin/users'),
    retry: false,
  });
  const invitations = useQuery({
    queryKey: ['admin-invitations'],
    queryFn: () => authApi<Invitation[]>('/admin/invitations'),
    retry: false,
  });
  const recoveries = useQuery({
    queryKey: ['admin-recoveries'],
    queryFn: () => authApi<Recovery[]>('/admin/mfa-recovery'),
    retry: false,
  });
  async function action(path: string, method: string, data?: unknown) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await authApi(path, method, data);
      setNotice('Operação concluída e registrada na auditoria.');
      setEmail('');
      await client.invalidateQueries({ queryKey: ['admin-users'] });
      await client.invalidateQueries({ queryKey: ['admin-invitations'] });
      await client.invalidateQueries({ queryKey: ['admin-recoveries'] });
    } catch (failure) {
      setError(authMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  function invite(event: FormEvent) {
    event.preventDefault();
    if (
      window.confirm(
        'Enviar convite ADMIN para ' + email + '? O convite expira em 48 horas e exige MFA.',
      )
    )
      void action('/admin/invitations', 'POST', { email });
  }
  return (
    <section className="foundation-page">
      <div className="eyebrow">
        <UsersRound size={16} /> CONTROLE DE ACESSO
      </div>
      <div className="page-heading">
        <div>
          <h1>Administradores</h1>
          <p>Convites individuais, papéis explícitos e operações auditadas.</p>
        </div>
        <span className="pill">SOMENTE OWNER</span>
      </div>
      <form onSubmit={invite} className="admin-invite">
        <label className="grow">
          E-mail do novo administrador
          <Input
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@empresa.com"
          />
        </label>
        <Button type="submit" disabled={busy}>
          <MailPlus size={16} /> Convidar ADMIN
        </Button>
      </form>
      {notice && (
        <p role="status" className="auth-success">
          {notice}
        </p>
      )}
      {(error || users.error || invitations.error || recoveries.error) && (
        <p role="alert">
          {error || authMessage(users.error || invitations.error || recoveries.error)}
        </p>
      )}
      {users.isPending && <p role="status">Carregando administradores…</p>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <caption>Contas administrativas</caption>
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Estado</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.data?.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>{user.active ? 'Ativo' : 'Desativado'}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || user.email === session?.email}
                      onClick={() => {
                        if (
                          window.confirm(
                            'Alterar o acesso de ' +
                              user.email +
                              '? As sessões existentes serão encerradas.',
                          )
                        )
                          void action('/admin/users/' + user.id + '/status', 'PATCH', {
                            active: !user.active,
                          });
                      }}
                    >
                      {user.active ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || user.email === session?.email}
                      onClick={() => {
                        if (
                          window.confirm(
                            'Alterar papel de ' +
                              user.email +
                              ' para ' +
                              (user.role === 'OWNER' ? 'ADMIN' : 'OWNER') +
                              '?',
                          )
                        )
                          void action('/admin/users/' + user.id + '/role', 'PATCH', {
                            role: user.role === 'OWNER' ? 'ADMIN' : 'OWNER',
                          });
                      }}
                    >
                      Alterar papel
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mt-8 mb-4">Convites</h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Expiração</th>
              <th>Estado</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {invitations.data?.map((invite) => {
              const open =
                !invite.acceptedAt && !invite.revokedAt && new Date(invite.expiresAt) > new Date();
              return (
                <tr key={invite.id}>
                  <td>{invite.email}</td>
                  <td>{new Date(invite.expiresAt).toLocaleString('pt-BR')}</td>
                  <td>
                    {invite.acceptedAt
                      ? 'Aceito'
                      : invite.revokedAt
                        ? 'Revogado'
                        : open
                          ? 'Pendente'
                          : 'Expirado'}
                  </td>
                  <td>
                    {open && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm('Revogar este convite?'))
                            void action('/admin/invitations/' + invite.id + '/revoke', 'PATCH');
                        }}
                      >
                        Revogar
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {invitations.data?.length === 0 && <p className="p-4">Nenhum convite emitido.</p>}
      </div>
      <h2 className="mt-8 mb-4">Recuperação de autenticador</h2>
      <p className="text-muted-foreground mb-4">
        Confirme a identidade por um canal independente antes de aprovar. A aprovação não remove
        fatores; um operador precisa executar a recuperação no servidor.
      </p>
      {recoveries.data?.map((request) => (
        <div className="next-step" key={request.id}>
          <div>
            <p>Protocolo: {request.id}</p>
            <p>Identidade: {request.identityId}</p>
          </div>
          <Button
            variant="outline"
            disabled={busy || !!request.approvedAt}
            onClick={() => {
              if (
                window.confirm(
                  'A identidade foi verificada fora da plataforma e o atendimento registrado?',
                )
              )
                void action('/admin/mfa-recovery/' + request.id + '/approve', 'PATCH');
            }}
          >
            {request.approvedAt ? 'Aprovado · aguarda operador' : 'Aprovar solicitação'}
          </Button>
        </div>
      ))}
    </section>
  );
}
