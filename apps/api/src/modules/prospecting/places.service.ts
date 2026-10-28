import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { brazilStates } from '@vympa/shared';
import type { ExternalPlace } from '@vympa/shared';
import { DatabaseService } from '../../database/database.service.js';
import type { SearchPlacesDto } from './prospecting.dto.js';

export const SEARCH_MASK =
  'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.attributions,nextPageToken';
export const DETAILS_MASK =
  'id,displayName,formattedAddress,location,googleMapsUri,nationalPhoneNumber,websiteUri,rating,userRatingCount,attributions';
const terms = {
  ADVOCACIA: ['escritórios de advocacia', 'lawyer'],
  CONTABILIDADE: ['escritórios de contabilidade', 'accounting'],
  IMOBILIARIO: ['imobiliárias', 'real_estate_agency'],
} as const;
@Injectable()
export class PlacesService {
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(private readonly db: DatabaseService) {}
  configured() {
    return process.env.GOOGLE_PLACES_ENABLED === 'true' && !!process.env.GOOGLE_PLACES_API_KEY;
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
        'Integração Google pendente. Configure e autorize o uso das chaves locais.',
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
          'Limite local de chamadas Google atingido. Aguarde a renovação do período.',
          429,
        );
      await tx.placesUsage.upsert({
        where: { profileId_hour: { profileId, hour } },
        create: { profileId, hour, calls: 1, details: details ? 1 : 0 },
        update: { calls: { increment: 1 }, details: { increment: details ? 1 : 0 } },
      });
    });
  }
  private async call(profileId: string, path: string, mask: string, body?: object) {
    await this.reserve(profileId, !body);
    let response: Response;
    try {
      response = await fetch('https://places.googleapis.com/v1/' + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
          'X-Goog-FieldMask': mask,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
    } catch {
      throw new ServiceUnavailableException(
        'Google Places indisponível. Nenhuma tentativa automática será realizada.',
      );
    }
    if (response.status === 429)
      throw new HttpException('Quota Google excedida. Confira os limites no Google Cloud.', 429);
    if (response.status === 404)
      throw new NotFoundException('Estabelecimento não encontrado no Google.');
    if (!response.ok)
      throw new ServiceUnavailableException(
        'Google Places recusou a consulta. Confira chave, APIs habilitadas e faturamento.',
      );
    try {
      return await response.json();
    } catch {
      throw new ServiceUnavailableException('Resposta Google inválida.');
    }
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
    const state = brazilStates.find((s) => s[0] === dto.state);
    const body = {
      textQuery: [terms[dto.segment][0], dto.query, dto.city, state?.[1], dto.region, 'Brasil']
        .filter(Boolean)
        .join(' '),
      includedType: terms[dto.segment][1],
      languageCode: 'pt-BR',
      regionCode: 'BR',
      pageSize: 20,
      minRating: dto.minRating || undefined,
      pageToken: dto.pageToken || undefined,
    };
    return this.dedupe(profileId, JSON.stringify(body), async () => {
      const result = (await this.call(profileId, 'places:searchText', SEARCH_MASK, body)) as {
        places?: ExternalPlace[];
        nextPageToken?: string;
      };
      const places = result.places ?? [];
      const references = await this.db.placeReference.findMany({
        where: { placeId: { in: places.map((p) => p.id) } },
        include: { lead: { select: { id: true, status: true, assigneeId: true } } },
      });
      return {
        places,
        nextPageToken: result.nextPageToken ?? null,
        references,
        usage: await this.usage(profileId),
      };
    });
  }
  details(placeId: string, profileId: string) {
    return this.dedupe(
      profileId,
      'details:' + placeId,
      () =>
        this.call(
          profileId,
          'places/' + encodeURIComponent(placeId) + '?languageCode=pt-BR&regionCode=BR',
          DETAILS_MASK,
        ) as Promise<ExternalPlace>,
    );
  }
}
