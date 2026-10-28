import { useEffect, useState } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import type { ExternalPlace, LeadStatus } from '@vympa/shared';
function Focus({ places, selected }: { places: ExternalPlace[]; selected: string | null }) {
  const map = useMap();
  const coordinates = JSON.stringify(places.flatMap((p) => (p.location ? [p.location] : [])));
  useEffect(() => {
    const point = places.find((p) => p.id === selected)?.location;
    if (map && point) {
      map.panTo({ lat: point.latitude, lng: point.longitude });
      map.setZoom(15);
    }
  }, [map, places, selected]);
  useEffect(() => {
    if (!map) return;
    const locations = JSON.parse(coordinates) as { latitude: number; longitude: number }[];
    if (locations.length)
      map.fitBounds(
        {
          north: Math.max(...locations.map((p) => p.latitude)),
          south: Math.min(...locations.map((p) => p.latitude)),
          east: Math.max(...locations.map((p) => p.longitude)),
          west: Math.min(...locations.map((p) => p.longitude)),
        },
        55,
      );
  }, [map, coordinates]);
  return null;
}
export default function ProspectingMap({
  places,
  selected,
  onSelect,
  statuses,
}: {
  places: ExternalPlace[];
  selected: string | null;
  onSelect: (id: string) => void;
  statuses: Record<string, LeadStatus>;
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className="map-placeholder" role="alert">
        <h2>Mapa indisponível</h2>
        <p>Confira a chave de navegador, as restrições por domínio e a Maps JavaScript API.</p>
      </div>
    );
  return (
    <APIProvider
      apiKey={import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY}
      language="pt-BR"
      region="BR"
      onError={() => setFailed(true)}
    >
      <Map
        mapId={import.meta.env.VITE_GOOGLE_MAPS_MAP_ID}
        defaultBounds={{ north: 6, south: -34, east: -34, west: -74 }}
        gestureHandling="cooperative"
        style={{ width: '100%', height: '100%' }}
      >
        <Focus places={places} selected={selected} />
        {places
          .filter((p) => p.location)
          .map((p) => (
            <AdvancedMarker
              key={p.id}
              position={{ lat: p.location!.latitude, lng: p.location!.longitude }}
              onClick={() => onSelect(p.id)}
              title={p.displayName?.text ?? 'Estabelecimento'}
            >
              <span
                className={`place-marker status-${statuses[p.id] ?? 'NOT_CONTACTED'} ${selected === p.id ? 'selected' : ''}`}
              >
                ●
              </span>
            </AdvancedMarker>
          ))}
      </Map>
    </APIProvider>
  );
}
