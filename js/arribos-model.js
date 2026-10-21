/* Las horas estimadas y las programadas conservan su significado en la fuente. */
globalThis.AndenArribos = (() => {
  const MAX_AGE = 120000;
  const time = value => typeof value === 'number' && Number.isFinite(value)
    ? value * (value < 1e12 ? 1000 : 1) : typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
  const text = value => String(value ?? '').trim().slice(0, 140);
  const side = value => value?.estacion || value?.punto || {};
  const populated = value => value && (typeof value !== 'object' || Object.keys(value).length > 0);

  function normalize(data, selection, observedAt = Date.now()) {
    const feedAt = time(data?.timestamp);
    if (!Number.isFinite(feedAt) || !Array.isArray(data?.results)) return { error: 'invalid', rows: [], feedAt: null };
    if (observedAt - feedAt > MAX_AGE || feedAt - observedAt > 60000) return { error: 'stale', rows: [], feedAt };
    const found = new Map();
    for (const item of data.results.slice(0, 200)) {
      const service = item.servicio, stop = item.arribo;
      if (!service || !stop || Number(stop.idElemento) !== Number(selection.stationId)
        || Number(service.gerencia?.id) !== Number(selection.gerencia)
        || service.oculto || populated(service.cancelacion) || stop.parada === false) continue;
      if (service.tipo?.clasificacion?.id != null && Number(service.tipo.clasificacion.id) !== 1) continue;
      const origin = side(service.desde), destination = side(service.hasta);
      const departure = Number(origin.idElemento) === Number(selection.stationId);
      const event = departure ? stop.salida || {} : stop.llegada || {};
      const actual = time(event.real);
      if (Number.isFinite(actual) && actual <= feedAt) continue;
      const estimated = time(event.estimada), scheduled = time(event.programada);
      let target = Number.isFinite(estimated) ? estimated : Number.isFinite(scheduled) ? scheduled : null;
      let basis = Number.isFinite(estimated) ? 'estimated' : Number.isFinite(scheduled) ? 'scheduled' : 'published';
      // Un cero en «segundos» también puede acompañar una salida demorada.
      if (target === null && stop.segundos !== null && stop.segundos !== '' && Number.isFinite(Number(stop.segundos)) && Number(stop.segundos) > 0) {
        target = feedAt + Number(stop.segundos) * 1000;
      }
      if (Number.isFinite(estimated) && estimated < feedAt - 60000) continue;
      if (target !== null && target < observedAt && basis !== 'estimated') {
        target = null;
        basis = 'unconfirmed';
      }
      if (target === null) basis = 'unconfirmed';
      const id = text(service.id || `${service.numero}-${service.sentido}-${service.ramal?.id}`);
      const row = {
        id, number: text(service.numero), destination: text(destination.nombre || service.ramal?.cabeceraFinal?.nombre || 'Destino sin informar'),
        destinationId: Number(destination.idElemento) || null, origin: text(origin.nombre),
        branch: text(service.ramal?.nombre), platform: text(stop.anden?.nombre),
        event: departure ? 'Salida' : 'Llegada', target, scheduled: Number.isFinite(scheduled) ? scheduled : null,
        basis, state: text(service.desde?.estado?.nombre), feedAt,
      };
      if (!found.has(id) || basis === 'estimated') found.set(id, row);
    }
    return { rows: [...found.values()].sort((a, b) => (a.target ?? Infinity) - (b.target ?? Infinity)), feedAt, error: null };
  }

  function remaining(row, now = Date.now()) {
    if (row.target === null) return null;
    const seconds = (row.target - now) / 1000;
    return seconds < 0 ? null : Math.ceil(seconds / 60);
  }
  return { normalize, remaining, MAX_AGE };
})();
