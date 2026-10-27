import { describe, it, expect, vi, beforeEach } from 'vitest';
const http = vi.hoisted(() => ({ get: vi.fn(), request: vi.fn() }));
vi.mock('@/services/http', () => ({ http }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
describe('Transporte da sessão e CSRF', () => {
  it('atualiza CSRF e repete uma vez somente quando o servidor rejeitou antes da operação', async () => {
    http.get
      .mockResolvedValueOnce({ data: { csrfToken: 'a'.repeat(64) } })
      .mockResolvedValueOnce({ data: { csrfToken: 'b'.repeat(64) } });
    http.request
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 403, data: { message: 'CSRF inválido.' } },
      })
      .mockResolvedValueOnce({ data: { ok: true } });
    const { authApi } = await import('./auth-api');
    await expect(
      authApi('/admin/invitations', 'POST', { email: 'test@example.invalid' }),
    ).resolves.toEqual({ ok: true });
    expect(http.request).toHaveBeenCalledTimes(2);
    expect(http.request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ headers: { 'X-CSRF-Token': 'a'.repeat(64) } }),
    );
    expect(http.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ headers: { 'X-CSRF-Token': 'b'.repeat(64) } }),
    );
  });
  it('não repete operações negadas por autorização', async () => {
    http.get.mockResolvedValue({ data: { csrfToken: 'a'.repeat(64) } });
    http.request.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { message: 'Papel insuficiente.' } },
    });
    const { authApi } = await import('./auth-api');
    await expect(authApi('/admin/invitations', 'POST')).rejects.toBeDefined();
    expect(http.request).toHaveBeenCalledTimes(1);
  });
});
