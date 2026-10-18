import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import mapConfig from '../map-config.json';

const MAX_PUBLIC_LOCATION_AGE_MS = 90_000;
const center = Array.isArray(mapConfig.center) ? mapConfig.center : [-28.7078, 20.9705];
const validPoint = point => point && Number.isFinite(point.lat) && Number.isFinite(point.lng)
  && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
const latLng = point => [point.lat, point.lng];

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value?.seconds === 'number') return value.seconds * 1_000;
  return 0;
}

const contourBackground = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800" viewBox="0 0 1000 800"><rect width="1000" height="800" fill="#ecefe6"/><g fill="none" stroke="#ced7c8" stroke-width="1.2" opacity=".8"><path d="M-80 160Q180-30 410 150T1080 50M-80 190Q180 0 410 180T1080 80M-80 220Q180 30 410 210T1080 110M-80 250Q180 60 410 240T1080 140M-80 280Q180 90 410 270T1080 170M-80 310Q180 120 410 300T1080 200M-80 340Q180 150 410 330T1080 230M-80 370Q180 180 410 360T1080 260M-80 400Q180 210 410 390T1080 290M-80 430Q180 240 410 420T1080 320M-80 460Q180 270 410 450T1080 350M-80 490Q180 300 410 480T1080 380M-80 520Q180 330 410 510T1080 410M-80 550Q180 360 410 540T1080 440M-80 580Q180 390 410 570T1080 470M-80 610Q180 420 410 600T1080 500M-80 640Q180 450 410 630T1080 530M-80 670Q180 480 410 660T1080 560M-80 700Q180 510 410 690T1080 590M-80 730Q180 540 410 720T1080 620M-80 760Q180 570 410 750T1080 650M-80 790Q180 600 410 780T1080 680"/></g></svg>`)}`;

function markerIcon(kind, stale = false) {
  const color = stale ? '#69766d' : '#163b2e';
  let svg;
  if (kind === 'driver') {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="46" height="46" viewBox="0 0 46 46"><circle cx="23" cy="23" r="21" fill="${color}" stroke="#fff" stroke-width="3"/><path d="m15 21 2-6h12l2 6M14 22h18v9H14z" fill="#f8f7f3" stroke="#f8f7f3" stroke-width="2" stroke-linejoin="round"/><path d="M18 16h10l1.5 5h-13z" fill="${color}"/><path d="M16 31v3m14-3v3" stroke="#f8f7f3" stroke-width="3" stroke-linecap="round"/><circle cx="18" cy="26" r="1.4" fill="${color}"/><circle cx="28" cy="26" r="1.4" fill="${color}"/></svg>`;
  } else if (kind === 'position') {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="16" fill="${stale ? '#69766d' : '#3f8772'}" fill-opacity=".18"/><circle cx="17" cy="17" r="8" fill="${stale ? '#69766d' : '#3f8772'}" stroke="#fff" stroke-width="3"/></svg>`;
  } else {
    const dropoff = kind === 'dropoff';
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46"><path d="M19 44S3 27 3 18a16 16 0 0 1 32 0c0 9-16 26-16 26Z" fill="${dropoff ? '#d5f364' : '#163b2e'}" stroke="#fff" stroke-width="2.5"/>${dropoff ? '<rect x="13" y="12" width="12" height="12" rx="2" fill="#163b2e"/>' : '<circle cx="19" cy="18" r="6" fill="#f8f7f3"/>'}</svg>`;
  }
  const size = kind === 'driver' ? [46, 46] : kind === 'position' ? [34, 34] : [38, 46];
  return L.divIcon({
    className: `kr-map-marker kr-map-marker--${kind}`,
    html: svg,
    iconSize: size,
    iconAnchor: kind === 'pickup' || kind === 'dropoff' ? [19, 44] : [size[0] / 2, size[1] / 2],
    tooltipAnchor: [0, kind === 'driver' ? -24 : -36],
  });
}

function tooltip(text) {
  const element = document.createElement('span');
  element.textContent = text;
  return element;
}

const MapView = forwardRef(function MapView({
  pickup,
  dropoff,
  driverLocation,
  drivers = [],
  onPick,
  selectionMode = null,
  position,
  routeVisible = true,
}, ref) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const routeRef = useRef(null);
  const callbacksRef = useRef({ onPick, selectionMode });
  callbacksRef.current = { onPick, selectionMode };
  const endpointsRef = useRef({ pickup, dropoff });
  endpointsRef.current = { pickup, dropoff };
  const initiallyFittedRef = useRef(false);
  const [routeStatus, setRouteStatus] = useState(null);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const [clock, setClock] = useState(Date.now());

  function fitRoute() {
    const map = mapRef.current;
    if (!map) return;
    const points = [endpointsRef.current.pickup, endpointsRef.current.dropoff].filter(validPoint);
    const bounds = routeRef.current?.getBounds?.();
    if (bounds?.isValid()) map.fitBounds(bounds, { padding: [65, 65], maxZoom: 16 });
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points.map(latLng)), { padding: [65, 65], maxZoom: 16 });
    else if (points.length === 1) map.setView(latLng(points[0]), 16);
  }

  useImperativeHandle(ref, () => ({
    recenter(point) {
      if (validPoint(point)) mapRef.current?.setView(latLng(point), 16, { animate: true });
      else mapRef.current?.setView(center, 15, { animate: true });
    },
    fitRoute,
  }));

  useEffect(() => {
    const map = L.map(containerRef.current, {
      center,
      zoom: 15,
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: true,
    });
    mapRef.current = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>');
    let loadedTiles = 0;
    let failedTiles = 0;
    const tiles = L.tileLayer(mapConfig.tileUrl, {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: mapConfig.attribution,
      crossOrigin: true,
    }).addTo(map);
    tiles.on('tileload', () => {
      loadedTiles += 1;
      setTilesUnavailable(false);
    });
    tiles.on('tileerror', () => {
      failedTiles += 1;
      if (failedTiles >= 3 && loadedTiles === 0) setTilesUnavailable(true);
    });
    markersRef.current = L.layerGroup().addTo(map);
    map.on('click', event => {
      const { onPick: pick, selectionMode: mode } = callbacksRef.current;
      if (!mode || !pick) return;
      pick({
        lat: Number(event.latlng.lat.toFixed(6)),
        lng: Number(event.latlng.lng.toFixed(6)),
        label: mode === 'dropoff' ? 'Selected map destination' : 'Selected map pickup',
      });
    });
    let resizeFrame;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    }) : null;
    observer?.observe(containerRef.current);
    const timer = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(resizeFrame);
      observer?.disconnect();
      markersRef.current = null;
      routeRef.current = null;
      mapRef.current = null;
      initiallyFittedRef.current = false;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = markersRef.current;
    if (!map || !group) return;
    group.clearLayers();
    const addMarker = (point, kind, label, stale = false) => {
      if (!validPoint(point)) return;
      L.marker(latLng(point), {
        icon: markerIcon(kind, stale),
        title: label,
        alt: label,
        keyboard: true,
        zIndexOffset: kind === 'driver' ? 500 : kind === 'position' ? 0 : 200,
      }).bindTooltip(tooltip(label), { className: 'kr-driver-tooltip', direction: 'top' }).addTo(group);
    };
    if (validPoint(position)) {
      const stale = position.stale || clock - timestampMillis(position.timestamp) > 45_000;
      addMarker(position, 'position', stale ? 'Your last known GPS location' : 'Your GPS location', stale);
      if (Number.isFinite(position.accuracy) && position.accuracy > 0 && position.accuracy < 10_000) {
        L.circle(latLng(position), {
          radius: position.accuracy,
          color: '#3f8772',
          weight: 1,
          opacity: .25,
          fillOpacity: .06,
          interactive: false,
        }).addTo(group);
      }
    }
    addMarker(pickup, 'pickup', `Pickup: ${pickup?.label || 'Selected pickup'}`);
    addMarker(dropoff, 'dropoff', `Destination: ${dropoff?.label || 'Selected destination'}`);
    for (const driver of drivers) {
      const lastSeen = timestampMillis(driver.lastSeen);
      if (driver.verified !== true || driver.online !== true || driver.busy === true || !lastSeen || clock - lastSeen > MAX_PUBLIC_LOCATION_AGE_MS) continue;
      addMarker(driver.location, 'driver', `${driver.name || 'Driver'} · manually verified · approximate location`);
    }
    if (validPoint(driverLocation)) {
      const seen = timestampMillis(driverLocation.timestamp || driverLocation.updatedAt || driverLocation.lastSeen);
      const stale = driverLocation.stale || !seen || clock - seen > 45_000;
      addMarker(driverLocation, 'driver', stale ? 'Assigned driver · last known location' : 'Assigned driver · recent GPS location', stale);
    }
  }, [pickup, dropoff, position, driverLocation, drivers, clock]);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.cursor = selectionMode ? 'crosshair' : '';
  }, [selectionMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    if (routeRef.current) {
      map.removeLayer(routeRef.current);
      routeRef.current = null;
    }
    if (!routeVisible || !validPoint(pickup) || !validPoint(dropoff)) {
      setRouteStatus(null);
      initiallyFittedRef.current = false;
      return undefined;
    }
    const start = { lat: pickup.lat, lng: pickup.lng };
    const end = { lat: dropoff.lat, lng: dropoff.lng };
    const controller = new AbortController();
    let cancelled = false;
    setRouteStatus({ kind: 'loading', text: 'Finding a road route…' });

    if (!initiallyFittedRef.current) {
      initiallyFittedRef.current = true;
      map.fitBounds(L.latLngBounds([latLng(start), latLng(end)]), { padding: [65, 65], maxZoom: 16 });
    }

    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    const debounce = window.setTimeout(async () => {
      try {
        const coordinates = `${start.lng},${start.lat};${end.lng},${end.lat}`;
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&alternatives=false`, { signal: controller.signal });
        if (!response.ok) throw new Error('Road routing unavailable');
        const data = await response.json();
        const route = data.routes?.[0];
        if (data.code !== 'Ok' || !Array.isArray(route?.geometry?.coordinates) || route.geometry.coordinates.length < 2
          || !route.geometry.coordinates.every(coordinate => validPoint({ lat: coordinate[1], lng: coordinate[0] }))
          || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) throw new Error('No road route found');
        if (cancelled || mapRef.current !== map) return;
        const points = route.geometry.coordinates.map(coordinate => [coordinate[1], coordinate[0]]);
        routeRef.current = L.polyline(points, { color: '#163b2e', weight: 5, opacity: .85, lineCap: 'round', lineJoin: 'round' }).addTo(map);
        setRouteStatus({ kind: 'road', text: `${(route.distance / 1_000).toFixed(1)} km · about ${Math.max(1, Math.ceil(route.duration / 60))} min`, attribution: true });
      } catch {
        if (cancelled || mapRef.current !== map) return;
        routeRef.current = L.polyline([latLng(start), latLng(end)], { color: '#69766d', weight: 3, dashArray: '7 8', opacity: .8 }).addTo(map);
        setRouteStatus({ kind: 'fallback', text: 'Straight-line preview · road routing unavailable' });
      } finally {
        window.clearTimeout(timeout);
      }
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(debounce);
      window.clearTimeout(timeout);
      controller.abort();
      if (routeRef.current && mapRef.current === map) {
        map.removeLayer(routeRef.current);
        routeRef.current = null;
      }
    };
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, routeVisible]);

  const overlayStyle = {
    position: 'absolute', zIndex: 450, borderRadius: 12, background: 'rgba(248,247,243,.96)',
    color: '#163b2e', boxShadow: '0 3px 20px #17251f14', padding: '9px 13px', fontSize: 12,
    lineHeight: 1.5, maxWidth: 'calc(100% - 100px)', pointerEvents: 'none',
  };

  return <div className="map-view" style={{ position: 'relative', width: '100%', height: '100%', minHeight: 380, isolation: 'isolate', overflow: 'hidden', borderRadius: 'inherit' }}>
    <div ref={containerRef} className="map-canvas" aria-label={`Interactive Keimoes map${selectionMode ? `: choose your ${selectionMode}` : ''}`} style={{ position: 'absolute', inset: 0, backgroundColor: '#ecefe6', backgroundImage: `url("${contourBackground}")`, backgroundSize: 'cover' }} />
    {selectionMode && <div className="map-selection-hint" role="status" style={{ ...overlayStyle, top: 16, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', fontWeight: 650 }}>
      Tap the map to set your {selectionMode === 'dropoff' ? 'destination' : 'pickup'}
    </div>}
    {(routeStatus || tilesUnavailable) && <div className="map-status-group" style={{ position: 'absolute', bottom: 27, left: 14, right: 64, zIndex: 450, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 7, pointerEvents: 'none' }}>
      {tilesUnavailable && <div className="map-tile-status" role="status" style={{ ...overlayStyle, position: 'relative', maxWidth: '100%' }}>
        Map tiles unavailable. The background is decorative; location pins still show recorded coordinates.
      </div>}
      {routeStatus && <div className={`map-route-status map-route-status--${routeStatus.kind}`} role="status" style={{ ...overlayStyle, position: 'relative', maxWidth: '100%' }}>
        <span>{routeStatus.text}</span>
        {routeStatus.attribution && <> <span aria-hidden="true"> · </span><a href="https://project-osrm.org/" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline', pointerEvents: 'auto' }}>OSRM preview</a></>}
      </div>}
    </div>}
  </div>;
});

export default MapView;
