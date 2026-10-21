const assert = require('node:assert/strict');
require('../js/mapa-model.js');
const model = globalThis.AndenMapModel;
const now = Date.parse('2026-10-21T13:00:00Z');
const iso = seconds => new Date(now + seconds * 1000).toISOString();
const network = {
  lines: [{ id: 'roca', name: 'Roca', gerencia: 11, color: '#c7e17a' }],
  stations: [{ id: 1, name: 'Estación A', coord: [-34.7, -58.4] }, { id: 2, name: 'Estación B', coord: [-34.8, -58.5] }],
};
function service(changes = {}) {
  return { id: 'train-1', numero: 5408, gerencia: { id: 11 }, oculto: false, cancelacion: null,
    desde: { estacion: { idElemento: 1 }, estado: { nombre: 'Partió' } },
    hasta: { estacion: { idElemento: 2, nombre: 'Estación B' } },
    location: { lat: -34.75, long: -58.45 }, estaciones: [], ...changes };
}
const feed = s => ({ timestamp: now / 1000, results: [{ servicio: s, arribo: {} }] });
let result = model.extract(feed(service()), network, now);
assert.equal(result.services.length, 1);
assert.deepEqual(result.services[0].coord, [-34.75, -58.45]);
assert.equal(result.services[0].kind, 'reported');
assert.equal(result.services[0].destination, 'Estación B');

for (const changes of [
  { desde: { estacion: { idElemento: 1 }, estado: { nombre: 'Programado' } } },
  { desde: { estacion: { idElemento: 1 }, estado: { nombre: 'En Andén' } } },
  { oculto: true }, { cancelacion: { motivo: 'Cancelado' } },
  { gerencia: { id: 999 } }, { location: { lat: -58.45, long: -34.75 } },
  { hasta: { estacion: { llegada: { real: iso(-10) } } } },
]) assert.equal(model.extract(feed(service(changes)), network, now).services.length, 0);

const historical = feed(service({ location: null }));
historical.results[0].arribo = { llegada: { latitud: -34.75, longitud: -58.45 } };
assert.equal(model.extract(historical, network, now).services.length, 0, 'Una coordenada histórica del arribo no es una posición actual');

const estimated = service({ location: null, estaciones: [
  { idElemento: 1, salida: { estimada: iso(-60) } },
  { idElemento: 2, llegada: { estimada: iso(60) } },
] });
result = model.extract(feed(estimated), network, now);
assert.equal(result.services.length, 1);
assert.equal(result.services[0].kind, 'estimated');
assert.ok(Math.abs(result.services[0].coord[0] + 34.75) < 1e-8);
assert.ok(Math.abs(result.services[0].coord[1] + 58.45) < 1e-8);
const programmed = service({ location: null, estaciones: [
  { idElemento: 1, salida: { programada: iso(-60) } },
  { idElemento: 2, llegada: { programada: iso(60) } },
] });
assert.equal(model.extract(feed(programmed), network, now).services.length, 0, 'La programación por sí sola no genera un tren en circulación');

assert.equal(model.extract({ timestamp: now / 1000 - 121, results: [] }, network, now).error, 'stale');
assert.equal(model.extract({ timestamp: now / 1000 + 61, results: [] }, network, now).error, 'stale');
assert.equal(model.extract({ timestamp: '', results: [] }, network, now).error, 'invalid');
assert.equal(model.extract({ timestamp: now / 1000, results: null }, network, now).error, 'invalid');

const reportedSnapshot = model.extract(feed(service()), network, now);
const estimatedSnapshot = model.extract(feed(estimated), network, now);
assert.equal(model.merge([estimatedSnapshot, reportedSnapshot], now).length, 1);
assert.equal(model.merge([estimatedSnapshot, reportedSnapshot], now)[0].kind, 'reported');
assert.equal(model.merge([reportedSnapshot], now + 121000).length, 0);
assert.equal(model.merge([reportedSnapshot], now, ['mitre']).length, 0);
console.log('OK: posiciones informadas y estimadas, salidas confirmadas, datos históricos, programación, cancelaciones, vigencia y duplicados.');
