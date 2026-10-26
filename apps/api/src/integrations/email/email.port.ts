export interface TransactionalEmailPort {
  send(input: {
    to: string;
    templateId: string;
    variables: Readonly<Record<string, string>>;
    idempotencyKey: string;
  }): Promise<{ messageId: string }>;
}
