export const leadStatuses = ['NOT_CONTACTED', 'CONTACTED', 'NEGOTIATING', 'WON', 'LOST'] as const;
export type LeadStatus = (typeof leadStatuses)[number];
export const leadSegments = ['ADVOCACIA', 'CONTABILIDADE', 'IMOBILIARIO'] as const;
export type LeadSegment = (typeof leadSegments)[number];
export const statusLabels: Record<LeadStatus, string> = {
  NOT_CONTACTED: 'Não contatado',
  CONTACTED: 'Em contato',
  NEGOTIATING: 'Em negociação',
  WON: 'Contrato fechado',
  LOST: 'Perdido',
};
export const segmentLabels: Record<LeadSegment, string> = {
  ADVOCACIA: 'Advocacia',
  CONTABILIDADE: 'Contabilidade',
  IMOBILIARIO: 'Imobiliário',
};
// UFs e regiões conforme a divisão político-administrativa do IBGE.
export const brazilStates = [
  ['AC', 'Acre', 'Norte'],
  ['AL', 'Alagoas', 'Nordeste'],
  ['AP', 'Amapá', 'Norte'],
  ['AM', 'Amazonas', 'Norte'],
  ['BA', 'Bahia', 'Nordeste'],
  ['CE', 'Ceará', 'Nordeste'],
  ['DF', 'Distrito Federal', 'Centro-Oeste'],
  ['ES', 'Espírito Santo', 'Sudeste'],
  ['GO', 'Goiás', 'Centro-Oeste'],
  ['MA', 'Maranhão', 'Nordeste'],
  ['MT', 'Mato Grosso', 'Centro-Oeste'],
  ['MS', 'Mato Grosso do Sul', 'Centro-Oeste'],
  ['MG', 'Minas Gerais', 'Sudeste'],
  ['PA', 'Pará', 'Norte'],
  ['PB', 'Paraíba', 'Nordeste'],
  ['PR', 'Paraná', 'Sul'],
  ['PE', 'Pernambuco', 'Nordeste'],
  ['PI', 'Piauí', 'Nordeste'],
  ['RJ', 'Rio de Janeiro', 'Sudeste'],
  ['RN', 'Rio Grande do Norte', 'Nordeste'],
  ['RS', 'Rio Grande do Sul', 'Sul'],
  ['RO', 'Rondônia', 'Norte'],
  ['RR', 'Roraima', 'Norte'],
  ['SC', 'Santa Catarina', 'Sul'],
  ['SP', 'São Paulo', 'Sudeste'],
  ['SE', 'Sergipe', 'Nordeste'],
  ['TO', 'Tocantins', 'Norte'],
] as const;
export interface ExternalPlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  provider?: 'geoapify';
  mapUri?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  attributions?: { provider: string; providerUri?: string }[];
}
export interface LeadRecord {
  id: string;
  companyName: string | null;
  segment: LeadSegment;
  region: string | null;
  state: string | null;
  city: string | null;
  email: string | null;
  contactName: string | null;
  contactChannel: string | null;
  status: LeadStatus;
  lossReason: string | null;
  lastContactAt: string | null;
  nextAction: string | null;
  assigneeId: string | null;
  assignee: { id: string; email: string } | null;
  externalReference: { placeId: string } | null;
  createdAt: string;
  updatedAt: string;
  events?: {
    id: string;
    kind: string;
    body: string | null;
    channel: string | null;
    previousStatus: LeadStatus | null;
    newStatus: LeadStatus | null;
    createdAt: string;
    actor: { email: string };
  }[];
  followUps?: { id: string; action: string; dueAt: string; completedAt: string | null }[];
}
