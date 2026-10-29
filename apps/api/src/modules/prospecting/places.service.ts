import {
  BadRequestException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { brazilStates, placesPageSize } from '@vympa/shared';
import type { ExternalPlace } from '@vympa/shared';
import { DatabaseService } from '../../database/database.service.js';
import type { SearchPlacesDto } from './prospecting.dto.js';

export const categories = {
  ADVOCACIA: 'office.lawyer',
  CONTABILIDADE: 'office.accountant',
  IMOBILIARIO: 'office.estate_agent',
} as const;
type Properties = {
  place_id?: string;
  name?: string;
  formatted?: string;
  lat?: number;
  lon?: number;
  country_code?: string;
  state?: string;
  state_code?: string;
  city?: string;
  contact?: { phone?: string; website?: string };
  website?: string;
  phone?: string;
  datasource?: {
    raw?: {
      phone?: string;
      website?: string;
      'contact:phone'?: string;
      'contact:website'?: string;
    };
  };
};
type Collection = { features: { properties: Properties }[] };
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
const regions: Record<string, string> = {
  Norte: '-74,-14,-44,6',
  Nordeste: '-49,-19,-32,0',
  'Centro-Oeste': '-62,-25,-45,-7',
  Sudeste: '-54,-27,-39,-13',
  Sul: '-58,-34,-47,-22',
};
@Injectable()
export class PlacesService {
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(private readonly db: DatabaseService) {}
  configured() {
    return process.env.GEOAPIFY_PLACES_ENABLED === 'true' && !!process.env.GEOAPIFY_API_KEY;
  }
  async usage(profileId: string) {
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const hour = new Date(now);
    hour.setUTCMinutes(0, 0, 0);
    const rows = await this.db.placesUsage.findMany({
      where: { profileId, hour: { gte: day } },
      select: { calls: true, details: true, hour: true },
    });
    return {
      configured: this.configured(),
      hour: rows.filter((r) => r.hour >= hour).reduce((s, r) => s + r.calls, 0),
      day: rows.reduce((s, r) => s + r.calls, 0),
      details: rows.reduce((s, r) => s + r.details, 0),
      hourLimit: 20,
      dayLimit: 100,
      globalDayLimit: 300,
      resetAt: new Date(hour.getTime() + 3600000).toISOString(),
    };
  }
  private async reserve(profileId: string, details: boolean) {
    if (!this.configured())
      throw new ServiceUnavailableException(
        'Integração Geoapify pendente. Configure e autorize o uso das chaves locais.',
      );
    const now = new Date();
    const hour = new Date(now);
    hour.setUTCMinutes(0, 0, 0);
    const day = new Date(hour);
    day.setUTCHours(0);
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(723110)`;
      const global = await tx.placesUsage.aggregate({
        where: { hour: { gte: day } },
        _sum: { calls: true },
      });
      const own = await tx.placesUsage.findMany({ where: { profileId, hour: { gte: day } } });
      if (
        (global._sum.calls ?? 0) >= 300 ||
        own.reduce((sum, row) => sum + row.calls, 0) >= 100 ||
        own.filter((row) => row.hour >= hour).reduce((sum, row) => sum + row.calls, 0) >= 20
      )
        throw new HttpException(
          'Limite local de chamadas Geoapify atingido. Aguarde a renovação do período.',
          429,
        );
      await tx.placesUsage.upsert({
        where: { profileId_hour: { profileId, hour } },
        create: { profileId, hour, calls: 1, details: details ? 1 : 0 },
        update: { calls: { increment: 1 }, details: { increment: details ? 1 : 0 } },
      });
    });
  }
  private async call(
    profileId: string,
    path: string,
    params: Record<string, string>,
    details = false,
  ): Promise<Collection> {
    await this.reserve(profileId, details);
    const url = new URL(path, 'https://api.geoapify.com');
    url.search = new URLSearchParams({
      ...params,
      apiKey: process.env.GEOAPIFY_API_KEY!,
    }).toString();
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
    } catch {
      throw new ServiceUnavailableException(
        'Geoapify indisponível. Nenhuma tentativa automática será realizada.',
      );
    }
    if (response.status === 429)
      throw new HttpException('Quota Geoapify excedida. Aguarde a renovação do limite.', 429);
    if (response.status === 401 || response.status === 403)
      throw new ServiceUnavailableException(
        'Geoapify recusou a chave ou suas permissões. Confira as restrições da chave de servidor.',
      );
    if (response.status === 404) throw new NotFoundException('Local não encontrado na Geoapify.');
    if (!response.ok)
      throw new ServiceUnavailableException(
        'Geoapify recusou a consulta. Confira o serviço e a franquia do projeto.',
      );
    try {
      const data = await response.json();
      if (
        !Array.isArray(data?.features) ||
        data.features.some(
          (f: { properties?: unknown }) => !f?.properties || typeof f.properties !== 'object',
        )
      )
        throw new Error();
      return data as Collection;
    } catch {
      throw new ServiceUnavailableException('Resposta Geoapify inválida.');
    }
  }
  private convert(p: Properties): ExternalPlace {
    if (!p.place_id || !/^[a-f0-9]{5,2039}$/i.test(p.place_id))
      throw new ServiceUnavailableException('Identificador Geoapify inválido.');
    const location =
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lon) &&
      Math.abs(p.lat!) <= 90 &&
      Math.abs(p.lon!) <= 180
        ? { latitude: p.lat!, longitude: p.lon! }
        : undefined;
    return {
      id: 'geoapify_' + p.place_id,
      provider: 'geoapify',
      displayName: p.name ? { text: p.name } : undefined,
      formattedAddress: p.formatted,
      location,
      mapUri: location
        ? 'https://www.openstreetmap.org/?mlat=' +
          location.latitude +
          '&mlon=' +
          location.longitude +
          '#map=17/' +
          location.latitude +
          '/' +
          location.longitude
        : undefined,
      nationalPhoneNumber:
        p.contact?.phone ??
        p.phone ??
        p.datasource?.raw?.phone ??
        p.datasource?.raw?.['contact:phone'],
      websiteUri:
        p.contact?.website ??
        p.website ??
        p.datasource?.raw?.website ??
        p.datasource?.raw?.['contact:website'],
      attributions: [
        { provider: 'Geoapify', providerUri: 'https://www.geoapify.com/' },
        {
          provider: '© OpenStreetMap contributors',
          providerUri: 'https://www.openstreetmap.org/copyright',
        },
      ],
    };
  }
  private async dedupe<T>(profileId: string, payload: string, fn: () => Promise<T>): Promise<T> {
    const key = profileId + createHash('sha256').update(payload).digest('hex');
    if (this.pending.has(key)) return this.pending.get(key) as Promise<T>;
    const operation = fn();
    this.pending.set(key, operation);
    try {
      return await operation;
    } finally {
      this.pending.delete(key);
    }
  }
  search(dto: SearchPlacesDto, profileId: string) {
    return this.dedupe(profileId, JSON.stringify(dto), async () => {
      if (!this.configured())
        throw new ServiceUnavailableException(
          'Integração Geoapify pendente. Configure a chave de servidor e a habilitação local.',
        );
      const state = brazilStates.find((s) => s[0] === dto.state);
      if (state && dto.region && state[2] !== dto.region)
        throw new BadRequestException('Estado não pertence à região selecionada.');
      if (dto.bounds) {
        const { west, south, east, north } = dto.bounds;
        if (
          ![west, south, east, north].every(Number.isFinite) ||
          west >= east ||
          south >= north ||
          east - west > 2 ||
          north - south > 2 ||
          west < -74 ||
          east > -32 ||
          south < -34 ||
          north > 6
        )
          throw new BadRequestException(
            'Aproxime o mapa de uma cidade brasileira para buscar nesta área (até 2° por eixo).',
          );
        if (dto.state || dto.city?.trim() || dto.region)
          throw new BadRequestException(
            'Busca por área usa os limites do mapa; não combine com cidade, estado ou região.',
          );
      }
      if (!dto.bounds && !state && !dto.city?.trim() && !dto.region)
        throw new BadRequestException(
          'Escolha uma região, estado ou cidade para delimitar a busca.',
        );
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify([
            placesPageSize,
            dto.segment,
            dto.region,
            dto.state,
            dto.city?.trim(),
            dto.query?.trim(),
            dto.bounds,
          ]),
        )
        .digest('hex')
        .slice(0, 16);
      let offset = 0;
      if (dto.pageToken) {
        const parts = dto.pageToken.split('_');
        offset = Number(parts[1]);
        if (
          parts[0] !== fingerprint ||
          parts.length !== 2 ||
          !Number.isSafeInteger(offset) ||
          offset < placesPageSize ||
          offset > Number.MAX_SAFE_INTEGER - placesPageSize ||
          offset % placesPageSize
        )
          throw new BadRequestException('Página inválida para estes filtros.');
      }
      let filter = dto.bounds
        ? 'rect:' + [dto.bounds.west, dto.bounds.south, dto.bounds.east, dto.bounds.north].join(',')
        : dto.region
          ? 'rect:' + regions[dto.region]
          : 'countrycode:br';
      if (state || dto.city?.trim()) {
        const geocode = await this.call(profileId, '/v1/geocode/search', {
          text: [dto.city?.trim(), state?.[1], 'Brasil'].filter(Boolean).join(', '),
          type: dto.city?.trim() ? 'city' : 'state',
          filter: dto.region ? 'countrycode:br|rect:' + regions[dto.region] : 'countrycode:br',
          limit: '1',
          lang: 'pt',
        });
        const area = geocode.features[0]?.properties;
        if (!area?.place_id || area.country_code?.toLowerCase() !== 'br')
          throw new NotFoundException(
            'Localidade brasileira não encontrada. Refine cidade e estado.',
          );
        const matchesState = (p: Properties) =>
          !state ||
          p.state_code?.replace('BR-', '') === state[0] ||
          normalize(p.state ?? '') === normalize(state[1]);
        if (
          !matchesState(area) ||
          (dto.city?.trim() && normalize(area.city ?? area.name ?? '') !== normalize(dto.city))
        )
          throw new NotFoundException(
            'Localidade não corresponde aos filtros. Refine cidade e estado.',
          );
        filter = 'place:' + area.place_id;
      }
      const result = await this.call(profileId, '/v2/places', {
        categories: categories[dto.segment],
        filter,
        limit: String(placesPageSize),
        offset: String(offset),
        lang: 'pt',
        ...(dto.query?.trim() ? { name: dto.query.trim() } : {}),
      });
      const places = result.features
        .filter((f) => {
          if (f.properties.country_code?.toLowerCase() !== 'br') return false;
          if (!dto.region) return true;
          return brazilStates.some(
            (s) =>
              s[2] === dto.region &&
              (f.properties.state_code?.replace('BR-', '') === s[0] ||
                normalize(f.properties.state ?? '') === normalize(s[1])),
          );
        })
        .map((f) => this.convert(f.properties));
      const references = await this.db.placeReference.findMany({
        where: { placeId: { in: places.map((p) => p.id) } },
        include: { lead: { select: { id: true, status: true, assigneeId: true } } },
      });
      return {
        places,
        nextPageToken:
          result.features.length === placesPageSize
            ? fingerprint + '_' + (offset + placesPageSize)
            : null,
        references,
        usage: await this.usage(profileId),
      };
    });
  }
  details(placeId: string, profileId: string) {
    if (!/^geoapify_[a-f0-9]{5,2039}$/i.test(placeId))
      throw new BadRequestException(
        'Referência antiga do Google preservada no CRM. Detalhes ativos aceitam somente locais Geoapify.',
      );
    return this.dedupe(profileId, 'details:' + placeId, async () => {
      const result = await this.call(
        profileId,
        '/v2/place-details',
        { id: placeId.slice(9), features: 'details', lang: 'pt' },
        true,
      );
      const p = result.features[0]?.properties;
      if (!p) throw new NotFoundException('Local não encontrado na Geoapify.');
      return { ...this.convert(p), id: placeId };
    });
  }
}
