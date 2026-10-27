// Apenas mensagens fixas: nunca encaminhar error.message, detail, stack ou causas do driver.
export function databaseDiagnostic(error) {
  const messages = {
    VYMPA_CA_FILE:
      'Certificado CA não encontrado ou sem permissão de leitura; confira SUPABASE_SSL_CA_FILE.',
    VYMPA_CA_PEM: 'Certificado CA inválido; forneça certificado PEM do Supabase.',
    ERR_INVALID_URL_SCHEME: 'Configuração: esquema inválido no caminho do certificado.',
    ERR_INVALID_URL: 'Configuração: URI PostgreSQL inválida.',
    '28P01':
      'Autenticação recusada (28P01): confira a senha atual do banco e seu percent-encoding no arquivo local.',
    28000: 'Autorização recusada (28000): confira usuário, projeto e acesso ao banco.',
    '3D000': 'Banco PostgreSQL não encontrado (3D000).',
    53300: 'Limite de conexões do servidor atingido (53300).',
    '57P03': 'Servidor PostgreSQL temporariamente indisponível (57P03).',
    ENOTFOUND: 'DNS: hostname não resolvido (ENOTFOUND).',
    EAI_AGAIN: 'DNS: falha temporária na resolução (EAI_AGAIN).',
    ECONNREFUSED: 'TCP: conexão recusada na porta PostgreSQL (ECONNREFUSED).',
    EHOSTUNREACH: 'TCP: host inacessível (EHOSTUNREACH).',
    ENETUNREACH: 'TCP: rede inacessível (ENETUNREACH).',
    EACCES: 'Rede bloqueada por permissão, firewall ou sandbox (EACCES).',
    EPERM: 'Operação bloqueada por permissão ou sandbox (EPERM).',
    ETIMEDOUT: 'Timeout de conexão (ETIMEDOUT).',
    ECONNRESET: 'Conexão interrompida pelo servidor ou rede (ECONNRESET).',
    CERT_HAS_EXPIRED: 'TLS: certificado expirado (CERT_HAS_EXPIRED).',
    CERT_NOT_YET_VALID: 'TLS: certificado ainda não válido; confira o relógio local.',
    SELF_SIGNED_CERT_IN_CHAIN: 'TLS: CA da cadeia não confiável (SELF_SIGNED_CERT_IN_CHAIN).',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'TLS: certificado autoassinado não confiável.',
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'TLS: CA emissora ausente no bundle configurado.',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS: não foi possível validar a cadeia de certificados.',
    ERR_TLS_CERT_ALTNAME_INVALID: 'TLS: hostname não corresponde ao certificado.',
  };
  const errors = [error, error?.cause, ...(Array.isArray(error?.errors) ? error.errors : [])];
  for (const item of errors) if (Object.hasOwn(messages, item?.code)) return messages[item.code];
  const message = String(error?.message ?? '');
  if (/timeout|timed out/i.test(message))
    return 'Timeout de conexão ou consulta; confira rede e disponibilidade do pooler.';
  if (/SASL|SCRAM|password must be a string/i.test(message))
    return 'Autenticação: configuração da senha ou negociação SCRAM inválida.';
  if (/Tenant or user not found/i.test(message))
    return 'Session pooler: projeto ou usuário não encontrado.';
  if (/does not support SSL/i.test(message))
    return 'TLS: endpoint não aceitou negociação SSL PostgreSQL.';
  if (/connection terminated/i.test(message))
    return 'Conexão encerrada antes de concluir a operação.';
  return 'Falha não classificada; confira configuração do driver e disponibilidade do endpoint. Nenhum detalhe sensível foi registrado.';
}
