(() => {
  const network = globalThis.ANDEN_MAP_NETWORK, model = globalThis.AndenMapModel;
  const panel = document.querySelector('#mapa-panel'), toggle = document.querySelector('#mapa-toggle');
  const scope = document.querySelector('#mapa-alcance'), status = document.querySelector('#mapa-estado');
  const description = document.querySelector('#mapa-descripcion');
  const clock = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stations = new Map(network.stations.map(item => [Number(item.id), item]));
  const cache = new Map(), requests = new Map(), markers = new Map();
  let selection = { lineId: 'roca', stationId: 386 };
  let map = null, routes = null, stationLayer = null, open = false, paused = false;
  let generation = 0, timer = null, scanning = false, errors = 0, activeServices = [];
  let userMoved = false, adjusting = false, pendingFocus = null;

  function visibleLines() { return scope.value === 'all' ? network.lines.map(x => x.id) : [selection.lineId]; }
  function say(text, kind = 'neutral') {
    if (status.textContent !== text) status.textContent = text;
    status.dataset.kind = kind;
  }
  function textNode(tag, text) { const node = document.createElement(tag); node.textContent = text; return node; }

  function icon(train) {
    const element = textNode('span', train.number || 'T');
    element.style.setProperty('--train-color', train.color);
    return L.divIcon({ html: element, className: `train-dot ${train.kind}`, iconSize: [38, 26], iconAnchor: [19, 13] });
  }
  function popup(train) {
    const content = document.createElement('div');
    content.append(textNode('h3', `Tren ${train.number || 'sin número'} · ${network.lines.find(l => l.id === train.line).name}`));
    content.append(textNode('p', `Hacia ${train.destination || 'destino sin informar'}`));
    if (train.branch) content.append(textNode('p', train.branch));
    content.append(textNode('p', train.kind === 'reported' ? 'Posición informada por la fuente.' : 'Posición aproximada entre estaciones, calculada con los arribos estimados.'));
    if (train.nextStation && train.nextAt) content.append(textNode('p', `Próxima parada estimada: ${train.nextStation}, ${clock.format(train.nextAt)}.`));
    content.append(textNode('p', `Dato consultado: ${clock.format(train.feedAt)}.`));
    return content;
  }
  function camera(action) { adjusting = true; action(); adjusting = false; }
  function fitTrains() {
    const points = activeServices.map(t => t.coord);
    if (!points.length) points.push(...network.stations.filter(s => s.lines.some(l => visibleLines().includes(l))).map(s => s.coord));
    if (points.length) camera(() => map.fitBounds(L.latLngBounds(points), { padding: [30, 35], maxZoom: 13, animate: false }));
  }
  function drawReference() {
    routes.clearLayers(); stationLayer.clearLayers();
    const lines = visibleLines();
    for (const branch of network.branches.filter(b => lines.includes(b.line))) {
      const color = network.lines.find(l => l.id === branch.line).color;
      L.polyline(branch.points, { color, weight: 2, opacity: .5, dashArray: '5 6', interactive: false }).addTo(routes);
    }
    for (const station of network.stations.filter(s => s.lines.some(l => lines.includes(l)))) {
      const selected = station.id === Number(selection.stationId);
      const dot = L.circleMarker(station.coord, { radius: selected ? 7 : 2.5, color: selected ? '#f0ffae' : '#b9cbc3', weight: selected ? 2 : 1,
        fillColor: selected ? '#c7e17a' : '#162b2c', fillOpacity: 1 });
      dot.bindTooltip(textNode('span', station.name), { permanent: selected, direction: 'top', opacity: .95 }).addTo(stationLayer);
    }
    description.textContent = scope.value === 'all'
      ? 'Ubicaciones disponibles en las seis líneas. La estación y el destino filtran la lista de horarios.'
      : `Ubicaciones disponibles de la línea ${network.lines.find(l => l.id === selection.lineId).name}. La estación y el destino filtran la lista de horarios.`;
  }

  function initialize() {
    if (map) return;
    map = L.map('mapa-trenes', { scrollWheelZoom: false, zoomControl: false, minZoom: 8, maxZoom: 17, zoomAnimation: !reducedMotion,
      fadeAnimation: !reducedMotion, maxBounds: [[-36, -61], [-33, -57]], maxBoundsViscosity: .8 });
    L.control.zoom({ zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a>');
    if (/^https?:$/.test(location.protocol)) {
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, updateWhenIdle: true, keepBuffer: 1,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' }).addTo(map);
      let failedTiles = 0;
      tiles.on('tileerror', () => { failedTiles++; document.querySelector('#mapa-base-aviso').hidden = failedTiles < 3; });
      tiles.on('tileload', () => { failedTiles = 0; document.querySelector('#mapa-base-aviso').hidden = true; });
    } else {
      const note = document.querySelector('#mapa-base-aviso'); note.hidden = false;
      note.textContent = 'Vista local sin mapa base. Al publicarla en el hosting se cargarán las calles de OpenStreetMap.';
    }
    routes = L.layerGroup().addTo(map); stationLayer = L.layerGroup().addTo(map);
    map.on('dragstart zoomstart', () => { if (!adjusting) userMoved = true; });
    drawReference(); fitTrains();
    const element = map.getContainer(); element.setAttribute('aria-label', 'Mapa de trenes. Usá las flechas para moverlo y las teclas más y menos para cambiar el zoom.');
    element.setAttribute('role', 'region');
  }

  function render() {
    if (!open || !map) return;
    const now = Date.now(), lines = visibleLines();
    activeServices = model.merge([...cache.values()].map(item => item.snapshot), now, lines);
    const ids = new Set(activeServices.map(t => t.id));
    for (const [id, marker] of markers) if (!ids.has(id)) { marker.remove(); markers.delete(id); }
    for (const train of activeServices) {
      let marker = markers.get(train.id);
      const title = `Tren ${train.number || 'sin número'} hacia ${train.destination}. Posición ${train.kind === 'reported' ? 'informada' : 'estimada'}.`;
      if (!marker) {
        marker = L.marker(train.coord, { icon: icon(train), keyboard: true, title, riseOnHover: true, alt: title }).addTo(map);
        marker.bindPopup(popup(train), { maxWidth: 260 }); markers.set(train.id, marker);
      } else {
        marker.setLatLng(train.coord); marker.getPopup().setContent(popup(train));
        if (marker._andenKind !== train.kind) marker.setIcon(icon(train));
      }
      marker._andenKind = train.kind;
      marker.getElement()?.setAttribute('aria-label', title);
    }
    const reported = activeServices.filter(t => t.kind === 'reported').length, estimated = activeServices.length - reported;
    let message = activeServices.length ? `${activeServices.length} trenes con ubicación disponible: ${reported} posiciones informadas y ${estimated} estimadas.`
      : 'La fuente no devolvió ubicaciones utilizables para esta vista.';
    if (scanning) message += ' Consultando el resto de la red…';
    if (errors) message += ' Cobertura parcial: algunas consultas no respondieron con datos actuales.';
    if (paused) message += ' Actualización automática pausada.';
    say(message, errors || paused || !activeServices.length && !scanning ? 'warning' : 'neutral');
    if (pendingFocus) {
      const found = activeServices.find(t => t.serviceId === pendingFocus && t.line === selection.lineId);
      if (found) {
        camera(() => map.setView(found.coord, 13, { animate: false })); markers.get(found.id).openPopup(); pendingFocus = null; userMoved = true;
      } else if (!scanning) { say('La ubicación de este tren ya no está disponible en la consulta actual.', 'warning'); pendingFocus = null; }
    }
  }

  function consume(stationId, data) {
    const snapshot = model.extract(data, network);
    if (snapshot.error) return false;
    const prior = cache.get(Number(stationId));
    if (!prior || snapshot.feedAt >= prior.snapshot.feedAt) cache.set(Number(stationId), { snapshot, receivedAt: Date.now() });
    render(); return true;
  }

  async function readStation(id, force = false) {
    const cached = cache.get(id);
    if (!force && cached && Date.now() - cached.receivedAt < 25000) return true;
    if (requests.has(id)) return requests.get(id).promise;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const promise = (async () => {
      try {
        const response = await fetch(`https://api-servicios.sofse.gob.ar/v1/arribos/estacion/${id}?cantidad=20`, { signal: controller.signal });
        if (!response.ok) return false;
        return consume(id, await response.json());
      } catch { return false; }
      finally { clearTimeout(timeout); if (requests.get(id)?.controller === controller) requests.delete(id); }
    })();
    requests.set(id, { controller, promise }); return promise;
  }
  function cancelScan() {
    generation++; clearTimeout(timer); scanning = false;
    for (const request of requests.values()) request.controller.abort();
    requests.clear();
  }
  function schedule() {
    clearTimeout(timer);
    if (open && !paused && !document.hidden) timer = setTimeout(() => scan(), 60000);
  }
  async function scan(force = false) {
    cancelScan();
    if (!open || paused && !force || document.hidden) { render(); return; }
    const thisScan = generation, lines = visibleLines();
    const ids = [...new Set([Number(selection.stationId), ...network.lines.filter(l => lines.includes(l.id)).flatMap(l => l.pollStations)])];
    let next = 0; errors = 0; scanning = true; render();
    async function work() {
      while (next < ids.length && generation === thisScan) {
        const id = ids[next++];
        const ok = await readStation(id, force && id !== Number(selection.stationId));
        if (generation !== thisScan) return;
        if (!ok) errors++;
        render();
      }
    }
    await Promise.all([work(), work()]);
    if (generation !== thisScan) return;
    scanning = false; render();
    if (!userMoved) fitTrains();
    schedule();
  }

  function show() {
    panel.hidden = false; open = true; toggle.setAttribute('aria-expanded', 'true'); toggle.textContent = 'Ocultar mapa';
    initialize(); map.invalidateSize({ animate: false }); render(); scan();
  }
  toggle.addEventListener('click', () => {
    if (!open) show();
    else { open = false; panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.textContent = 'Mostrar mapa de trenes'; cancelScan(); }
  });
  scope.addEventListener('change', () => { userMoved = false; pendingFocus = null; drawReference(); render(); fitTrains(); scan(); });
  document.querySelector('#mapa-centrar-trenes').addEventListener('click', () => { userMoved = true; fitTrains(); });
  document.querySelector('#mapa-centrar-estacion').addEventListener('click', () => {
    const station = stations.get(Number(selection.stationId));
    if (station) { userMoved = true; camera(() => map.setView(station.coord, 13, { animate: false })); }
  });
  document.addEventListener('anden:arrivals-data', event => consume(event.detail.stationId, event.detail.data));
  document.addEventListener('anden:selection-change', event => {
    selection = event.detail; pendingFocus = null;
    if (open) { userMoved = false; drawReference(); render(); fitTrains(); scan(); }
  });
  document.addEventListener('anden:pause-change', event => {
    paused = event.detail.paused;
    if (paused) { cancelScan(); render(); } else if (open) scan();
  });
  document.addEventListener('anden:manual-refresh', () => { if (open) scan(true); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelScan(); else if (open && !paused) scan(); else render();
  });
  setInterval(() => {
    for (const [id, item] of cache) if (Date.now() - item.snapshot.feedAt > model.MAX_AGE) cache.delete(id);
    if (open && !document.hidden) render();
  }, 15000);
  globalThis.AndenTrainMap = {
    hasPosition(serviceId) { return model.merge([...cache.values()].map(item => item.snapshot), Date.now(), [selection.lineId]).some(t => t.serviceId === serviceId); },
    focus(serviceId) {
      pendingFocus = serviceId;
      if (!open) show(); else render();
      panel.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    },
  };
})();
