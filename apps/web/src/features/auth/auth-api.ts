import axios from 'axios';
import { http } from '@/services/http';
let csrf: string | undefined;
let csrfRequest: Promise<void> | undefined;
export async function initializeCsrf() {
  csrfRequest ??= http
    .get<{ csrfToken: string }>('/auth/csrf')
    .then(({ data }) => {
      csrf = data.csrfToken;
    })
    .finally(() => {
      csrfRequest = undefined;
    });
  await csrfRequest;
}
export function clearCsrf() {
  csrf = undefined;
}
export async function authApi<T = Record<string, unknown>>(
  path: string,
  method = 'GET',
  data?: unknown,
  retryCsrf = true,
): Promise<T> {
  if (method !== 'GET' && !csrf) await initializeCsrf();
  try {
    const response = await http.request<T & { csrfToken?: string }>({
      url: path,
      method,
      data,
      headers: method === 'GET' ? {} : { 'X-CSRF-Token': csrf },
    });
    if (response.data?.csrfToken) csrf = response.data.csrfToken;
    return response.data;
  } catch (error) {
    if (
      retryCsrf &&
      axios.isAxiosError(error) &&
      error.response?.status === 403 &&
      typeof error.response.data?.message === 'string' &&
      error.response.data.message.startsWith('CSRF inválido')
    ) {
      await initializeCsrf();
      return authApi<T>(path, method, data, false);
    }
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      (path.startsWith('/admin/') || path === '/auth/me')
    )
      window.dispatchEvent(new Event('auth:expired'));
    throw error;
  }
}
export function authMessage(error: unknown) {
  if (!axios.isAxiosError(error)) return 'Não foi possível concluir. Tente novamente.';
  if (!error.response) return 'Sem conexão com o servidor. Confira a rede e tente novamente.';
  if (error.response.status === 401)
    return 'Credenciais, sessão ou código inválidos. Tente novamente.';
  if (error.response.status === 403)
    return 'Acesso não autorizado. Confira MFA e recarregue a página.';
  if (error.response.status === 409)
    return 'A operação conflita com o estado atual. Atualize a página.';
  if (error.response.status === 429) return 'Muitas tentativas. Aguarde antes de tentar novamente.';
  if (error.response.status >= 500)
    return 'Serviço indisponível ou ainda não configurado. Tente novamente mais tarde.';
  return 'Confira os campos e tente novamente.';
}
