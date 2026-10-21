const assert = require('node:assert/strict');
require('../js/arribos-model.js');
const model = globalThis.AndenArribos;
const now = Date.parse('2026-10-21T13:00:00Z');
const selection = { stationId: 386, gerencia: 11 };
const iso = seconds => new Date(now + seconds * 1000).toISOString();
const row = (change = {}) => ({
  arribo: { idElemento: 386, parada: true, llegada: { programada: iso(600), estimada: iso(900) }, segundos: 900, ...change.arribo },
  servicio: { id: 'test-train', numero: 5408, gerencia: { id: 11 }, oculto: false, cancelacion: null,
    desde: { estacion: { idElemento: 13, nombre: 'Alejandro Korn' } },
    hasta: { estacion: { idElemento: 93, nombre: 'Constitución' } }, ...change.servicio },
});
const feed = results => ({ timestamp: now / 1000, results });
let result = model.normalize(feed([row()]), selection, now);
assert.equal(result.rows.length, 1);
assert.equal(result.rows[0].basis, 'estimated');
assert.equal(model.remaining(result.rows[0], now), 15);
assert.equal(result.rows[0].scheduled, now + 600000);

result = model.normalize(feed([row({ arribo: { llegada: { programada: iso(600) }, segundos: 600 } })]), selection, now);
assert.equal(result.rows[0].basis, 'scheduled', 'La programación no se presenta como estimación en tiempo real');

result = model.normalize(feed([row({ arribo: { llegada: { programada: iso(-120) }, segundos: 0 } })]), selection, now);
assert.equal(result.rows[0].basis, 'unconfirmed');
assert.equal(model.remaining(result.rows[0], now), null, 'Una demora con cero segundos no confirma un tren en estación');

for (const change of [
  { servicio: { oculto: true } }, { servicio: { cancelacion: { motivo: 'Cancelado' } } },
  { arribo: { parada: false } }, { arribo: { idElemento: 93 } },
  { servicio: { gerencia: { id: 5 } } }, { arribo: { llegada: { real: iso(-30), programada: iso(600) } } },
]) assert.equal(model.normalize(feed([row(change)]), selection, now).rows.length, 0);

assert.equal(model.normalize({ timestamp: now / 1000 - 121, results: [row()] }, selection, now).error, 'stale');
assert.equal(model.normalize({ timestamp: now / 1000 + 61, results: [row()] }, selection, now).error, 'stale');
assert.equal(model.normalize({ timestamp: '', results: [row()] }, selection, now).error, 'invalid');
assert.equal(model.normalize({ timestamp: now / 1000, results: {} }, selection, now).error, 'invalid');
assert.equal(model.normalize(feed([]), selection, now).rows.length, 0);
assert.equal(model.normalize(feed([row(), row()]), selection, now).rows.length, 1);

result = model.normalize(feed([row({ arribo: { llegada: {}, segundos: null } })]), selection, now);
assert.equal(result.rows[0].target, null, 'Un dato ausente no se convierte en un arribo inmediato');
result = model.normalize(feed([row({ arribo: { llegada: {}, segundos: 300 } })]), selection, now);
assert.equal(result.rows[0].basis, 'published');
assert.equal(model.remaining(result.rows[0], now), 5);
console.log('OK: estimaciones, programación, demoras, datos vencidos, filtros y datos ausentes.');
