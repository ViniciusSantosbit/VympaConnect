import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import type { ExternalPlace, LeadStatus } from '@vympa/shared';
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
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
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
        {places
          .filter((p) => p.location)
          .map((p) => (
            <CircleMarker
              key={p.id}
              center={[p.location!.latitude, p.location!.longitude]}
              radius={selected === p.id ? 12 : 8}
              pathOptions={{
                color: selected === p.id ? '#fff' : colors[statuses[p.id] ?? 'NOT_CONTACTED'],
                fillColor: colors[statuses[p.id] ?? 'NOT_CONTACTED'],
                fillOpacity: 0.9,
                weight: 3,
              }}
              eventHandlers={{ click: () => onSelect(p.id) }}
            >
              <Tooltip>{p.displayName?.text ?? 'Estabelecimento'}</Tooltip>
            </CircleMarker>
          ))}
      </MapContainer>
    </div>
  );
}
