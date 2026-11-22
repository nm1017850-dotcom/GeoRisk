import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { regions, type Region } from './regions';

export type MapAssessment = {
  id: number | string;
  region: string;
  latitude: number;
  longitude: number;
  result: { risk: string; score?: number; model_version?: string };
  created_at: string;
};
type MapPageProps = {
  assessments: MapAssessment[];
  onAnalyze: (region: string, lat?: number, lon?: number) => void;
};
const riskLabel: Record<string, string> = { low: 'Төмен', moderate: 'Орташа', high: 'Жоғары' };
const riskColor: Record<string, string> = { low: '#22a676', moderate: '#e8a52f', high: '#df5b5b' };

function MoveTo({ region }: { region: Region | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!region) return;
    const center: [number, number] = [region.lat, region.lon];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      map.setView(center, 8, { animate: false });
    } else {
      map.flyTo(center, 8, { duration: 0.8 });
    }
  }, [map, region]);
  return null;
}
function SelectPoint({ onSelect }: { onSelect: (lat: number, lon: number) => void }) {
  useMapEvents({ click: e => onSelect(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function MapPage({ assessments = [], onAnalyze }: MapPageProps) {
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [satellite, setSatellite] = useState(false);
  const [showRisk, setShowRisk] = useState(true);
  const [showCenters, setShowCenters] = useState(true);
  const region = regions.find(r => r.name === selected);
  const filtered = regions.filter(r => `${r.name} ${r.city}`.toLocaleLowerCase('kk').includes(query.toLocaleLowerCase('kk')));
  const regionalAssessments = useMemo(() => assessments.filter(a => a.region === selected), [assessments, selected]);
  const choose = (name: string) => {
    setSelected(name);
    const next = regions.find(r => r.name === name);
    setPoint(next ? { lat: next.lat, lon: next.lon } : null);
  };
  return <div className="map-page">
    <div className="page-heading">
      <div><h1>Географиялық карта</h1>
      <p>Аймақты немесе картадағы нүктені таңдап, қолжетімді талдауларды қараңыз.</p></div>
    </div>
    <div className="map-controls">
      <input aria-label="Аймақты іздеу" placeholder="Аймақты іздеу" value={query} onChange={e => setQuery(e.target.value)} />
      <select aria-label="Аймақты таңдаңыз" value={selected} onChange={e => choose(e.target.value)}>
        <option value="">Аймақты таңдаңыз</option>
        {region && !filtered.includes(region) && <option value={region.name}>{region.name}</option>}
        {filtered.map(r => <option key={r.name} value={r.name}>{r.name} — {r.city}</option>)}
      </select>
      <button type="button" className="button secondary" onClick={() => setSatellite(!satellite)}>{satellite ? 'Карта көрінісі' : 'Спутник көрінісі'}</button>
      <label className="map-toggle"><input type="checkbox" checked={showRisk} onChange={e => setShowRisk(e.target.checked)} /> Қауіп қабаты</label>
      <label className="map-toggle"><input type="checkbox" checked={showCenters} onChange={e => setShowCenters(e.target.checked)} /> Аймақ орталықтары</label>
    </div>
    <div className="card map-frame">
      <MapContainer center={[48.3, 67.3]} zoom={5} minZoom={4} maxZoom={18} scrollWheelZoom>
        {satellite ? <TileLayer attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" /> : <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />}
        <MoveTo region={region} />
        <SelectPoint onSelect={(lat, lon) => setPoint({ lat, lon })} />
        {showCenters && regions.map(r => <CircleMarker key={r.name} center={[r.lat, r.lon]} radius={selected === r.name ? 8 : 5} pathOptions={{ color: '#fff', weight: 2, fillColor: '#8795a5', fillOpacity: 0.95 }} eventHandlers={{ click: () => choose(r.name) }}><Tooltip>{r.name} · {r.city}</Tooltip><Popup>{r.name}<br />Әкімшілік орталығы: {r.city}</Popup></CircleMarker>)}
        {showRisk && assessments.filter(a => Number.isFinite(a.latitude) && Number.isFinite(a.longitude)).map(a => <CircleMarker key={a.id} center={[a.latitude, a.longitude]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: riskColor[a.result?.risk] || '#8795a5', fillOpacity: 0.9 }}><Popup><strong>{a.region}</strong><br />Қауіп: {riskLabel[a.result?.risk] || 'Белгісіз'}<br />{new Date(a.created_at).toLocaleString('kk-KZ')}</Popup></CircleMarker>)}
        {point && <CircleMarker center={[point.lat, point.lon]} radius={11} pathOptions={{ color: '#a53d27', weight: 3, fillOpacity: 0.12 }}><Tooltip permanent direction="top">Таңдалған нүкте</Tooltip></CircleMarker>}
      </MapContainer>
    </div>
    <div className="map-legend" aria-label="Карта белгілері">
      {[['#22a676', 'Төмен'], ['#e8a52f', 'Орташа'], ['#df5b5b', 'Жоғары'], ['#8795a5', 'Аймақ орталығы']].map(([color, label]) => <span key={label}><i aria-hidden="true" style={{ background: color }} />{label}</span>)}
    </div>
    <div className="card map-selection">
      <div><strong>{region ? region.name : 'Аймақ таңдалмаған'}</strong><p>{region ? `Әкімшілік орталығы: ${region.city} · Сақталған талдаулар: ${regionalAssessments.length}` : 'Картадағы нүктені басып, аймақты таңдаңыз.'}</p><small>{point ? `Координаталар: ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}` : 'Нүкте таңдалмаған'}. Жер бедері мен жауын-шашын деректері қосылған дереккөздерде қолжетімді болғанда көрсетіледі.</small></div>
      <button type="button" className="button primary" disabled={!region || !point} onClick={() => region && point && onAnalyze(region.name, point.lat, point.lon)}>Таңдалған нүктені талдау →</button>
    </div>
    <p className="map-footnote">Түсті белгілер сақталған талдау нүктелерін көрсетеді; олар бүкіл аймақтың қауіптілігін сипаттамайды. Аймақ шекаралары тексерілген геодерек болмағандықтан көрсетілмейді.</p>
  </div>;
}
