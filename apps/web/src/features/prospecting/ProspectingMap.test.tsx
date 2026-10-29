import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import ProspectingMap from './ProspectingMap';
const map = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  setView: vi.fn(),
  getBounds: () => ({
    getWest: () => -47.95,
    getEast: () => -47.85,
    getSouth: () => -15.85,
    getNorth: () => -15.75,
  }),
  getContainer: () => document.createElement('div'),
}));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => children,
  TileLayer: ({
    eventHandlers,
  }: {
    eventHandlers: { load: () => void; tileerror: () => void };
  }) => (
    <>
      <button onClick={eventHandlers.load}>Tiles carregados</button>
      <button onClick={eventHandlers.tileerror}>Erro tiles</button>
    </>
  ),
  CircleMarker: ({
    children,
    eventHandlers,
  }: {
    children: ReactNode;
    eventHandlers: { click: () => void };
  }) => <button onClick={eventHandlers.click}>{children}</button>,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  useMap: () => map,
  useMapEvents: () => map,
}));
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('Mapa Geoapify sem transporte externo', () => {
  it('mostra carregamento e remove estado após tiles carregados', () => {
    render(<ProspectingMap places={[]} selected={null} onSelect={vi.fn()} statuses={{}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando mapa Geoapify');
    fireEvent.click(screen.getByText('Tiles carregados'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('explica falha de tiles sem interromper o CRM', () => {
    render(<ProspectingMap places={[]} selected={null} onSelect={vi.fn()} statuses={{}} />);
    fireEvent.click(screen.getByText('Erro tiles'));
    expect(screen.getByRole('alert')).toHaveTextContent('O CRM continua disponível');
  });
  it('seleciona estabelecimento pelo marcador', () => {
    const select = vi.fn();
    render(
      <ProspectingMap
        places={[
          {
            id: 'geoapify_51abc',
            displayName: { text: 'Escritório' },
            location: { latitude: -15.79, longitude: -47.88 },
          },
        ]}
        selected={null}
        onSelect={select}
        statuses={{}}
      />,
    );
    fireEvent.click(screen.getByText('Escritório'));
    expect(select).toHaveBeenCalledWith('geoapify_51abc');
  });
});

it('publica os limites visíveis sem executar pesquisa', () => {
  const onBoundsChange = vi.fn();
  render(
    <ProspectingMap
      places={[]}
      selected={null}
      onSelect={vi.fn()}
      statuses={{}}
      onBoundsChange={onBoundsChange}
    />,
  );
  expect(onBoundsChange).toHaveBeenCalledWith({
    west: -47.95,
    east: -47.85,
    south: -15.85,
    north: -15.75,
  });
});
it('agrupa locais coincidentes e permite alternar seleção', () => {
  const select = vi.fn();
  const places = [
    { id: 'geoapify_51abc', location: { latitude: -15.8, longitude: -47.9 } },
    { id: 'geoapify_51def', location: { latitude: -15.8, longitude: -47.9 } },
  ];
  const view = render(
    <ProspectingMap places={places} selected={null} onSelect={select} statuses={{}} />,
  );
  fireEvent.click(screen.getByText('2 registros próximos — clique para alternar'));
  expect(select).toHaveBeenLastCalledWith('geoapify_51abc');
  view.rerender(
    <ProspectingMap places={places} selected="geoapify_51abc" onSelect={select} statuses={{}} />,
  );
  fireEvent.click(screen.getByText('2 registros próximos — clique para alternar'));
  expect(select).toHaveBeenLastCalledWith('geoapify_51def');
});
