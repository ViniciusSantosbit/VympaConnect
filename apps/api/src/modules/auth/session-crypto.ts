import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('hex');
export function encryptTokens(value: unknown, key: string, sessionId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
  cipher.setAAD(Buffer.from(sessionId));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function decryptTokens(
  value: string,
  key: string,
  sessionId: string,
): { access_token: string; refresh_token: string } {
  const data = Buffer.from(value, 'base64');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'base64'),
    data.subarray(0, 12),
  );
  decipher.setAAD(Buffer.from(sessionId));
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'),
  );
}
