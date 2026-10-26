export interface PrivateStoragePort {
  createDownloadUrl(input: { key: string; expiresInSeconds: number }): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
