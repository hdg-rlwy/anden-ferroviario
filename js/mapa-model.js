globalThis.AndenMapModel = (() => {
  const MAX_AGE = 120000;
  const stamp = x => typeof x === 'number' && Number.isFinite(x) ? x * (x < 1e12 ? 1000 : 1) : typeof x === 'string' && x.trim() ? Date.parse(x) : NaN;
  const name = x => String(x ?? '').trim().slice(0, 140);
  const stationSide = x => x?.estacion || x?.punto || {};
  const validCoord = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)
    && p[0] > -36 && p[0] < -33 && p[1] > -61 && p[1] < -57;

  function extract(data, network, now = Date.now()) {
    const feedAt = stamp(data?.timestamp);
    if (!Number.isFinite(feedAt) || !Array.isArray(data?.results)) return { services: [], feedAt: null, error: 'invalid' };
    if (now - feedAt > MAX_AGE || feedAt - now > 60000) return { services: [], feedAt, error: 'stale' };
    const stations = new Map(network.stations.map(s => [Number(s.id), s]));
    const services = [];
    for (const item of data.results.slice(0, 200)) {
      const s = item.servicio;
      if (!s || s.oculto || s.cancelacion && (typeof s.cancelacion !== 'object' || Object.keys(s.cancelacion).length)) continue;
      if (s.tipo?.clasificacion?.id != null && Number(s.tipo.clasificacion.id) !== 1) continue;
      const line = network.lines.find(l => l.gerencia === Number(s.gerencia?.id));
      if (!line) continue;
      const origin = stationSide(s.desde), destination = stationSide(s.hasta);
      const departedAt = stamp(origin.salida?.real);
      const departed = /parti[oó]/i.test(String(s.desde?.estado?.nombre || '')) || Number.isFinite(departedAt) && departedAt <= feedAt;
      if (!departed) continue;
      const endedAt = stamp(destination.llegada?.real || destination.salida?.real);
      if (Number.isFinite(endedAt) && endedAt <= feedAt) continue;
      const location = s.location;
      let coord = location && location.lat != null && (location.long ?? location.lng ?? location.lon) != null
        ? [Number(location.lat), Number(location.long ?? location.lng ?? location.lon)] : null;
      let kind = 'reported';
      const stops = Array.isArray(s.estaciones) ? s.estaciones.slice(0, 140) : [];
      let nextStation = '', nextAt = null;
      for (const stop of stops) {
        const at = stamp(stop.llegada?.estimada || stop.salida?.estimada);
        if (stop.parada !== false && Number.isFinite(at) && at >= feedAt && (nextAt === null || at < nextAt)) {
          nextStation = stations.get(Number(stop.idElemento))?.name || name(stop.nombre); nextAt = at;
        }
      }
      if (!validCoord(coord)) {
        coord = null;
        for (let i = 1; i < stops.length; i++) {
          const previous = stops[i - 1], next = stops[i];
          const fromAt = stamp(previous.salida?.real || previous.salida?.estimada || previous.llegada?.real || previous.llegada?.estimada);
          const toAt = stamp(next.llegada?.estimada);
          const a = stations.get(Number(previous.idElemento)), b = stations.get(Number(next.idElemento));
          if (!a || !b || !Number.isFinite(fromAt) || !Number.isFinite(toAt) || fromAt > feedAt || toAt <= feedAt || toAt - fromAt < 15000 || toAt - fromAt > 1800000) continue;
          const f = (feedAt - fromAt) / (toAt - fromAt);
          coord = a.coord.map((v, n) => v + (b.coord[n] - v) * f); kind = 'estimated';
          break;
        }
      }
      if (!validCoord(coord)) continue;
      const serviceId = name(s.id || `${s.numero}-${s.ramal?.id}-${s.sentido}`);
      services.push({ id: `${line.id}:${serviceId}`, serviceId, line: line.id, color: line.color,
        number: name(s.numero), destination: stations.get(Number(destination.idElemento))?.name || name(destination.nombre),
        branch: name(s.ramal?.nombre), coord, kind, feedAt, nextStation, nextAt });
    }
    return { services: merge([ { services, feedAt } ], now), feedAt, error: null };
  }

  function merge(snapshots, now = Date.now(), lineIds = null) {
    const result = new Map();
    for (const snapshot of snapshots) {
      if (!Number.isFinite(snapshot.feedAt) || now - snapshot.feedAt > MAX_AGE || snapshot.feedAt - now > 60000) continue;
      for (const train of snapshot.services || []) {
        if (lineIds && !lineIds.includes(train.line)) continue;
        const old = result.get(train.id);
        if (!old || old.kind === 'estimated' && train.kind === 'reported'
          || old.kind === train.kind && train.feedAt > old.feedAt) result.set(train.id, train);
      }
    }
    return [...result.values()];
  }
  return { extract, merge, validCoord, MAX_AGE };
})();
