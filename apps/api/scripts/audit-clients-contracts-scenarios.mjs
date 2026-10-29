import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function runClientsContractsAudit({
  db,
  call,
  actor,
  page,
  origin,
  passed,
  renewCsrf,
}) {
  const day = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const end = new Date(day + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() + 20);
  const client = await call('POST', '/clients', {
    companyName: 'QA Clientes Script07',
    segment: 'ADVOCACIA',
    responsibleId: actor.id,
  });
  const lead = await call('POST', '/prospecting/leads', {
    companyName: client.companyName,
    segment: 'ADVOCACIA',
    assigneeId: actor.id,
  });
  const links = await Promise.all(
    [1, 2].map(() => call('POST', '/clients/from-lead/' + lead.id, { clientId: client.id })),
  );
  assert.ok(links.every((c) => c.id === client.id));
  assert.equal((await db.lead.findUnique({ where: { id: lead.id } })).clientId, client.id);
  await call('POST', '/clients/' + client.id + '/contacts', {
    name: 'Contato profissional QA',
    email: 'contact@example.invalid',
    primary: true,
  });
  await call('POST', '/clients/' + client.id + '/activity', {
    body: 'Interação comercial isolada para validação.',
  });
  await page.goto(origin + '/clients/' + client.id);
  await page.getByRole('heading', { name: client.companyName, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Contatos', exact: true }).click();
  await page.getByText('Contato profissional QA', { exact: false }).waitFor();
  await renewCsrf();
  passed(
    'Script07: cadastro e contatos reais no React; lead preservado e conversões HTTP concorrentes idempotentes',
  );
  const offering = (await call('GET', '/finance/catalog')).find((o) => o.code === 'CUSTOM_AI');
  await call(
    'PUT',
    '/finance/catalog/CUSTOM_AI',
    {
      version: offering.version,
      name: offering.name,
      description: offering.description,
      active: true,
      monthlyCents: 10001,
    },
    200,
  );
  let proposal = await call('POST', '/finance/simulations', {
    companyName: client.companyName,
    segment: 'ADVOCACIA',
    leadId: lead.id,
    responsibleId: actor.id,
    currentCostCents: 12000,
    manualMonthlyCents: 10001,
    exceptionReason: 'Condição comercial de QA',
    setupCents: 5500,
    offeringCodes: ['CUSTOM_AI'],
    simulationDate: day,
  });
  for (const status of ['PREPARED', 'SENT', 'ACCEPTED'])
    proposal = await call('POST', '/finance/simulations/' + proposal.id + '/status', {
      version: proposal.version,
      status,
    });
  let contract = await call('POST', '/contracts', {
    requestKey: randomUUID(),
    number: 'QA-07-' + randomUUID().slice(0, 8),
    clientId: client.id,
    title: 'Contrato de validação isolada',
    responsibleId: actor.id,
    startsOn: day,
    endsOn: end.toISOString().slice(0, 10),
    billingPeriod: 'MONTHLY',
    proposalId: proposal.id,
    serviceCodes: [],
  });
  assert.equal(contract.status, 'DRAFT');
  assert.equal(contract.monthlyCents, 10001);
  assert.equal(contract.proposalSnapshot.version, proposal.version);
  for (const status of ['PENDING_SIGNATURE', 'SIGNED', 'ACTIVE'])
    contract = await call('PATCH', '/contracts/' + contract.id + '/status', {
      version: contract.version,
      status,
      reason: 'Etapa de validação administrativa isolada',
      ...(status === 'SIGNED'
        ? {
            signatureEvidence:
              'Confirmação administrativa de teste isolado, sem assinatura eletrônica.',
          }
        : {}),
    });
  const metadata = await call('POST', '/contracts/' + contract.id + '/documents', {
    name: 'Referencia contratual de QA.pdf',
    kind: 'PDF',
  });
  assert.equal(metadata.storageStatus, 'PENDING_PRIVATE_STORAGE');
  await call('POST', '/contracts/' + contract.id + '/documents/upload', undefined, 503);
  const category = (await call('GET', '/finance/management/categories')).find((c) => c.active);
  const before = await call('GET', '/finance/management/summary');
  const entry = {
    requestKey: randomUUID(),
    description: 'Cobrança Script07 QA',
    type: 'INCOME',
    status: 'PENDING',
    amountCents: 10001,
    competenceOn: day,
    dueOn: day,
    categoryId: category.id,
    clientId: client.id,
    contractId: contract.id,
    billingReference: contract.number + '/' + day.slice(0, 7),
  };
  const responses = await Promise.all(
    [1, 2].map(() => call('POST', '/finance/management/transactions', entry)),
  );
  assert.equal(responses[0].id, responses[1].id);
  assert.equal(
    (await call('GET', '/finance/management/summary')).receivedCents,
    before.receivedCents,
  );
  assert.equal((await db.client.findUnique({ where: { id: client.id } })).status, 'PROSPECT');
  passed(
    'Script07: proposta aceita gera somente rascunho; formalização auditada, documento privado bloqueado e cobrança pendente sem alterar caixa',
  );
  await db.adminProfile.update({ where: { id: actor.id }, data: { role: 'ADMIN' } });
  const limited = await call('GET', '/contracts/' + contract.id);
  assert.ok(!('monthlyCents' in limited) && !('proposalSnapshot' in limited));
  await call('GET', '/clients/' + client.id + '/financial', undefined, 403);
  await call(
    'PATCH',
    '/contracts/' + contract.id + '/status',
    { version: contract.version, status: 'TERMINATED', reason: 'Operação não autorizada' },
    403,
  );
  await page.goto(origin + '/contracts/' + contract.id);
  await page
    .getByRole('heading', { name: contract.number + ' · ' + contract.title, exact: true })
    .waitFor();
  assert.equal(await page.getByText('Mensalidade atual', { exact: true }).count(), 0);
  assert.equal(
    await page.getByRole('button', { name: 'Registrar reajuste', exact: true }).count(),
    0,
  );
  await db.adminProfile.update({ where: { id: actor.id }, data: { role: 'OWNER' } });
  await page.reload();
  await page.getByText('Mensalidade atual', { exact: true }).waitFor();
  await renewCsrf();
  assert.ok(await page.getByRole('button', { name: 'Upload indisponível' }).isDisabled());
  passed(
    'Script07: OWNER/ADMIN, sessão e MFA reais; React e API omitem valores privados e bloqueiam operações sem autorização',
  );
}
