export function resolveApiUrl(value: string | undefined, production: boolean): string {
  const candidate = value ?? (production ? '/api/v1' : 'http://127.0.0.1:3000/api/v1');
  if (candidate === '/api/v1') return candidate;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('VITE_API_URL inválida');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/api/v1' ||
    (production &&
      (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  )
    throw new Error('VITE_API_URL inválida');
  return candidate;
}
