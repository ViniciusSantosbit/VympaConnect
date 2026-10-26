export interface PlaceSearchInput {
  query: string;
  region: string;
  limit: number;
}
export interface PlaceSummary {
  externalId: string;
  displayName: string;
  formattedAddress: string;
}
export interface PlacesPort {
  search(input: PlaceSearchInput): Promise<readonly PlaceSummary[]>;
}
