import { useEffect, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import type { ExternalPlace, LeadStatus, MapBounds } from '@vympa/shared';
import 'leaflet/dist/leaflet.css';
const colors: Record<LeadStatus, string> = {
  NOT_CONTACTED: '#64748b',
  CONTACTED: '#38bdf8',
  NEGOTIATING: '#fbbf24',
  WON: '#34d399',
  LOST: '#f87171',
};
function Focus({ places, selected }: { places: ExternalPlace[]; selected: string | null }) {
  const map = useMap();
  const coordinates = JSON.stringify(
    places.flatMap((p) => (p.location ? [[p.location.latitude, p.location.longitude]] : [])),
  );
  useEffect(() => {
    const points = JSON.parse(coordinates) as [number, number][];
    if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
  }, [map, coordinates]);
  useEffect(() => {
    const p = places.find((p) => p.id === selected)?.location;
    if (p) map.setView([p.latitude, p.longitude], 15);
  }, [map, places, selected]);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}
function Viewport({ onChange }: { onChange?: (bounds: MapBounds) => void }) {
  const report = () => {
    const b = map.getBounds();
    onChange?.({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
  };
  const map = useMapEvents({ moveend: report, zoomend: report });
  useEffect(() => {
    const b = map.getBounds();
    onChange?.({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
  }, [map, onChange]);
  return null;
}
export default function ProspectingMap({
  places,
  selected,
  onSelect,
  statuses,
  onBoundsChange,
}: {
  places: ExternalPlace[];
  selected: string | null;
  onSelect: (id: string) => void;
  statuses: Record<string, LeadStatus>;
  onBoundsChange?: (bounds: MapBounds) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const groups = new Map<string, ExternalPlace[]>();
  for (const p of places.filter((p) => p.location)) {
    const key = p.location!.latitude.toFixed(4) + ',' + p.location!.longitude.toFixed(4);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return (
    <div className="geoapify-map">
      {failed ? (
        <div className="map-feedback" role="alert">
          Não foi possível carregar os tiles Geoapify. Confira a chave de navegador, os domínios
          permitidos e a franquia. O CRM continua disponível.
        </div>
      ) : (
        loading && (
          <div className="map-feedback" role="status">
            Carregando mapa Geoapify…
          </div>
        )
      )}
      <MapContainer
        bounds={[
          [-34, -74],
          [6, -34],
        ]}
        scrollWheelZoom={false}
        className="leaflet-prospect-map"
      >
        <TileLayer
          url={
            'https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png?apiKey=' +
            encodeURIComponent(import.meta.env.VITE_GEOAPIFY_MAPS_KEY ?? '')
          }
          attribution='Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> | &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'
          maxZoom={19}
          keepBuffer={1}
          updateWhenIdle
          eventHandlers={{
            load: () => setLoading(false),
            tileerror: () => {
              setLoading(false);
              setFailed(true);
            },
          }}
        />
        <Focus places={places} selected={selected} />
        <Viewport onChange={onBoundsChange} />
        {[...groups.entries()].map(([key, group]) => {
          const p = group.find((p) => p.id === selected) ?? group[0]!;
          const next = group[(group.findIndex((p) => p.id === selected) + 1) % group.length]!;
          return (
            <CircleMarker
              key={key}
              center={[p.location!.latitude, p.location!.longitude]}
              radius={selected === p.id ? 13 : group.length > 1 ? 11 : 8}
              pathOptions={{
                color: selected === p.id ? '#fff' : colors[statuses[p.id] ?? 'NOT_CONTACTED'],
                fillColor: colors[statuses[p.id] ?? 'NOT_CONTACTED'],
                fillOpacity: 0.95,
                weight: 3,
              }}
              eventHandlers={{ click: () => onSelect(next.id) }}
            >
              <Tooltip permanent={group.length > 1}>
                {group.length > 1
                  ? group.length + ' registros próximos — clique para alternar'
                  : p.displayName?.text?.trim() || 'Local sem identificação — validar'}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
