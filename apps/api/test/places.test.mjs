import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PlacesService, categories } from '../dist/modules/prospecting/places.service.js';
let previous, db, service, fetchMock;
const feature = {
  properties: {
    place_id: '51abcdef1234',
    name: 'Escritório de teste',
    formatted: 'Brasília, DF',
    lat: -15.79,
    lon: -47.88,
    country_code: 'br',
    state: 'Distrito Federal',
    state_code: 'DF',
  },
};
beforeEach(() => {
  previous = { ...process.env };
  process.env.GEOAPIFY_PLACES_ENABLED = 'true';
  process.env.GEOAPIFY_API_KEY = 'test-server-key';
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
    .mockImplementation(async () => Response.json({ features: [feature] }));
});
afterEach(() => {
  process.env = previous;
  jest.restoreAllMocks();
});
describe('Geoapify official transport', () => {
  it('não consulta sem configuração nem consulta Google como fallback', async () => {
    delete process.env.GEOAPIFY_API_KEY;
    await expect(service.search({ segment: 'ADVOCACIA', state: 'DF' }, 'profile')).rejects.toThrow(
      'pendente',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(Object.entries(categories))(
    'usa categoria %s, Brasil e até 20 resultados',
    async (segment, category) => {
      const result = await service.search({ segment, state: 'DF', query: 'Nome' }, 'profile');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const geo = new URL(fetchMock.mock.calls[0][0]);
      expect(geo.origin).toBe('https://api.geoapify.com');
      expect(geo.pathname).toBe('/v1/geocode/search');
      const url = new URL(fetchMock.mock.calls[1][0]);
      expect(url.pathname).toBe('/v2/places');
      expect(url.searchParams.get('categories')).toBe(category);
      expect(url.searchParams.get('filter')).toBe('place:51abcdef1234');
      expect(url.searchParams.get('limit')).toBe('20');
      expect(url.searchParams.get('name')).toBe('Nome');
      expect(JSON.stringify(result)).not.toContain('test-server-key');
      expect(result.places[0].id).toBe('geoapify_51abcdef1234');
      expect(db.tx.placesUsage.upsert).toHaveBeenCalledTimes(2);
    },
  );
  it('não busca todo o Brasil sem localização e recusa estado incompatível', async () => {
    await expect(service.search({ segment: 'ADVOCACIA' }, 'p')).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      service.search({ segment: 'ADVOCACIA', region: 'Sul', state: 'DF' }, 'p'),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('não busca locais se a cidade resolvida não corresponde aos filtros', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        features: [{ properties: { ...feature.properties, city: 'Outra cidade' } }],
      }),
    );
    await expect(
      service.search({ segment: 'ADVOCACIA', city: 'Brasília', state: 'DF' }, 'p'),
    ).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejeita paginação inválida antes de consumir créditos', async () => {
    await expect(
      service.search({ segment: 'ADVOCACIA', state: 'DF', pageToken: 'fake_1000000' }, 'p'),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('preserva Google legado sem enviar seu identificador à Geoapify', () => {
    expect(() => service.details('ChIJlegacy', 'p')).toThrow('preservada');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('detalhes são explícitos e limitados à feature details', async () => {
    const result = await service.details('geoapify_51abcdef1234', 'p');
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/v2/place-details');
    expect(url.searchParams.get('id')).toBe('51abcdef1234');
    expect(url.searchParams.get('features')).toBe('details');
    expect(result.id).toBe('geoapify_51abcdef1234');
    expect(result.attributions).toHaveLength(2);
  });
  it('deduplica consultas simultâneas sem guardar os resultados', async () => {
    await Promise.all([
      service.search({ segment: 'ADVOCACIA', state: 'DF' }, 'p'),
      service.search({ segment: 'ADVOCACIA', state: 'DF' }, 'p'),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(['global', 'hora', 'dia'])('limite %s bloqueia antes do transporte', async (limit) => {
    if (limit === 'global') db.tx.placesUsage.aggregate.mockResolvedValue({ _sum: { calls: 300 } });
    else
      db.tx.placesUsage.findMany.mockResolvedValue([
        { hour: limit === 'hora' ? new Date() : new Date(0), calls: limit === 'hora' ? 20 : 100 },
      ]);
    await expect(service.details('geoapify_51abcdef1234', 'p')).rejects.toMatchObject({
      status: 429,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])(
    'trata status %s sem expor segredos e sem retry',
    async (status) => {
      fetchMock.mockResolvedValueOnce(Response.json({ message: 'test-server-key' }, { status }));
      await expect(service.details('geoapify_51abcdef1234', 'p')).rejects.not.toThrow(
        'test-server-key',
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it('não expõe erros de rede', async () => {
    fetchMock.mockRejectedValueOnce(new Error('test-server-key'));
    await expect(service.details('geoapify_51abcdef1234', 'p')).rejects.toThrow('indisponível');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('recusa resposta malformada', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ features: null }));
    await expect(service.details('geoapify_51abcdef1234', 'p')).rejects.toThrow('inválida');
  });
});
