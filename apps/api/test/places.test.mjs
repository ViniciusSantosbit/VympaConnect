import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  PlacesService,
  SEARCH_MASK,
  DETAILS_MASK,
} from '../dist/modules/prospecting/places.service.js';
let previous, db, service, fetchMock;
beforeEach(() => {
  previous = { ...process.env };
  process.env.GOOGLE_PLACES_ENABLED = 'true';
  process.env.GOOGLE_PLACES_API_KEY = 'test-only-key';
  const tx = {
    $executeRaw: jest.fn(async () => 0),
    placesUsage: {
      aggregate: jest.fn(async () => ({ _sum: { calls: 0 } })),
      findMany: jest.fn(async () => []),
      upsert: jest.fn(async () => ({})),
    },
  };
  db = {
    $transaction: async (fn) => fn(tx),
    placesUsage: { findMany: async () => [] },
    placeReference: { findMany: async () => [] },
    tx,
  };
  service = new PlacesService(db);
  fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => Response.json({ places: [], nextPageToken: 'next-test' }));
});
afterEach(() => {
  process.env = previous;
  jest.restoreAllMocks();
});
describe('Google Places official transport', () => {
  it('nao consulta Google sem chave ou habilitacao', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    await expect(service.search({ segment: 'ADVOCACIA' }, 'profile')).rejects.toThrow('pendente');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('usa Text Search New, mascara basica e paginacao sem telefone ou rating', async () => {
    const r = await service.search(
      { segment: 'ADVOCACIA', state: 'DF', city: 'Brasília', minRating: 4, pageToken: 'test-page' },
      'profile',
    );
    expect(r.nextPageToken).toBe('next-test');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(options.headers['X-Goog-FieldMask']).toBe(SEARCH_MASK);
    expect(SEARCH_MASK).not.toMatch(/rating|Phone|website|\*/);
    expect(JSON.parse(options.body)).toMatchObject({
      includedType: 'lawyer',
      pageSize: 20,
      pageToken: 'test-page',
      minRating: 4,
    });
    expect(JSON.parse(options.body).textQuery).toContain('Distrito Federal');
  });
  it('consulta detalhes somente no metodo explicito e sem wildcard', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: 'place_test' }));
    await service.details('place_test', 'profile');
    expect(fetchMock.mock.calls[0][1].headers['X-Goog-FieldMask']).toBe(DETAILS_MASK);
    expect(DETAILS_MASK).not.toContain('*');
  });
  it('deduplica chamadas simultaneas sem guardar resultados em cache', async () => {
    await Promise.all([
      service.search({ segment: 'CONTABILIDADE' }, 'profile'),
      service.search({ segment: 'CONTABILIDADE' }, 'profile'),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await service.search({ segment: 'CONTABILIDADE' }, 'profile');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('bloqueia cota local antes de chamar Google', async () => {
    db.tx.placesUsage.aggregate.mockResolvedValue({ _sum: { calls: 300 } });
    await expect(service.search({ segment: 'IMOBILIARIO' }, 'profile')).rejects.toMatchObject({
      status: 429,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('bloqueia limite horario por usuario', async () => {
    db.tx.placesUsage.findMany.mockResolvedValue([{ hour: new Date(), calls: 20, details: 0 }]);
    await expect(service.details('place_test', 'profile')).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([429, 403, 500])(
    'trata erro upstream %s sem vazar chave ou resposta bruta',
    async (status) => {
      fetchMock.mockResolvedValue(
        Response.json({ error: 'test-only-key-sensitive-detail' }, { status }),
      );
      await expect(service.search({ segment: 'ADVOCACIA' }, 'profile')).rejects.not.toThrow(
        'test-only-key',
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it('trata falha de rede sem repetir requisicao', async () => {
    fetchMock.mockRejectedValue(new Error('sensitive transport'));
    await expect(service.details('place_test', 'profile')).rejects.toThrow('indisponível');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
