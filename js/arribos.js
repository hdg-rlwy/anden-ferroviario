(() => {
  const catalog = globalThis.ANDEN_CATALOG, model = globalThis.AndenArribos;
  const lineSelect = document.querySelector('#linea');
  const stationSelect = document.querySelector('#estacion');
  const destinationSelect = document.querySelector('#destino');
  const resultList = document.querySelector('#arribos');
  const message = document.querySelector('#mensaje');
  const refreshButton = document.querySelector('#actualizar');
  const updated = document.querySelector('#actualizado');
  const heading = document.querySelector('#resultados-titulo');
  const count = document.querySelector('#cantidad');
  const pauseButton = document.querySelector('#pausar');
  const moreButton = document.querySelector('#ver-mas');
  const clock = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let snapshot = null, controller = null, requestId = 0, timer = null, paused = false, visibleLimit = 12;

  const option = (value, name) => { const node = document.createElement('option'); node.value = value; node.textContent = name; return node; };
  function line() { return catalog.lines.find(item => item.id === lineSelect.value); }
  function station() { return line().stations.find(item => String(item.id) === stationSelect.value); }
  function say(text, kind = 'neutral') { message.textContent = text; message.dataset.kind = kind; }
  function span(className, content) { const node = document.createElement('span'); node.className = className; node.textContent = content; return node; }
  function stationName(id, fallback) { return catalog.names[id] || fallback; }

  function render() {
    resultList.replaceChildren();
    moreButton.hidden = true;
    if (!snapshot) { count.textContent = ''; return; }
    const now = Date.now();
    if (now - snapshot.feedAt > model.MAX_AGE) {
      count.textContent = '';
      say('La última información tiene más de dos minutos. Esperando una nueva consulta.', 'warning');
      updated.textContent = `Último dato recibido: ${clock.format(snapshot.feedAt)}.`;
      return;
    }
    const rows = snapshot.rows.filter(row => !destinationSelect.value || row.destination === destinationSelect.value);
    for (const row of rows.slice(0, visibleLimit)) {
      const card = document.createElement('li'); card.className = 'arrival-card';
      const main = document.createElement('div'); main.className = 'arrival-main';
      const title = document.createElement('h3'); title.textContent = stationName(row.destinationId, row.destination);
      main.append(span('arrival-number', `${row.event} · Tren ${row.number || 'sin número'}`), title);
      const details = document.createElement('p');
      details.textContent = [row.branch, row.platform ? `Andén ${row.platform}` : 'Andén sin informar'].filter(Boolean).join(' · ');
      main.append(details);
      if (row.basis === 'estimated' && row.scheduled !== null) {
        const planned = document.createElement('p'); planned.className = 'arrival-programmed';
        planned.textContent = `Horario programado: ${clock.format(row.scheduled)}`; main.append(planned);
      }
      const timing = document.createElement('div'); timing.className = 'arrival-time';
      const minutes = model.remaining(row, now);
      const value = document.createElement('strong');
      value.textContent = minutes === null ? 'A confirmar' : minutes === 0 ? 'Menos de 1 min' : `${minutes} min`;
      const labels = { estimated: 'Llegada estimada', scheduled: 'Horario programado', published: 'Tiempo publicado', unconfirmed: 'Sin nueva estimación' };
      timing.append(value, span(`arrival-basis basis-${row.basis}`, row.basis === 'estimated' && row.event === 'Salida' ? 'Salida estimada' : labels[row.basis]));
      if (row.target !== null && minutes !== null) timing.append(span('arrival-clock', clock.format(row.target)));
      if (row.basis === 'unconfirmed' && row.event === 'Salida' && row.state) timing.append(span('arrival-clock', row.state));
      card.append(main, timing); resultList.append(card);
    }
    count.textContent = `${rows.length} ${rows.length === 1 ? 'servicio publicado' : 'servicios publicados'}`;
    moreButton.hidden = rows.length <= visibleLimit;
    moreButton.textContent = `Ver ${Math.min(12, rows.length - visibleLimit)} servicios más`;
    if (!rows.length) say(snapshot.rows.length ? 'No hay resultados para ese destino en esta consulta.' : 'La fuente no devolvió próximas llegadas o salidas para esta estación. Consultá los avisos oficiales antes de viajar.');
    else say(paused ? 'Actualización automática pausada.' : 'La consulta se actualiza cada 30 segundos mientras esta pestaña está visible.', paused ? 'warning' : 'ok');
    updated.textContent = `Dato de la fuente: ${clock.format(snapshot.feedAt)} · Hora de Buenos Aires.`;
  }

  function destinations() {
    const previous = destinationSelect.value;
    const names = [...new Set(snapshot.rows.map(item => item.destination))].sort((a, b) => a.localeCompare(b, 'es'));
    destinationSelect.replaceChildren(option('', 'Todos los destinos'), ...names.map(name => {
      const row = snapshot.rows.find(item => item.destination === name);
      return option(name, stationName(row.destinationId, name));
    }));
    if (names.includes(previous)) destinationSelect.value = previous;
    destinationSelect.disabled = !names.length;
  }
  function schedule() {
    clearTimeout(timer);
    if (!paused && !document.hidden) timer = setTimeout(load, 30000);
  }

  async function load() {
    clearTimeout(timer);
    controller?.abort(); controller = new AbortController();
    const activeController = controller;
    const active = ++requestId, currentLine = line(), currentStation = station();
    const timeout = setTimeout(() => activeController.abort(), 12000);
    refreshButton.disabled = true;
    resultList.setAttribute('aria-busy', 'true');
    say('Consultando las próximas llegadas y salidas…');
    try {
      const response = await fetch(`https://api-servicios.sofse.gob.ar/v1/arribos/estacion/${currentStation.id}?cantidad=60`, { signal: activeController.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (active !== requestId) return;
      const result = model.normalize(data, { stationId: currentStation.id, gerencia: currentLine.gerencia });
      if (result.error) throw new Error(result.error);
      snapshot = result;
      destinations(); render();
    } catch (error) {
      if (active !== requestId) return;
      snapshot = null; render();
      destinationSelect.replaceChildren(option('', 'Todos los destinos')); destinationSelect.disabled = true;
      updated.textContent = '';
      say(error.message === 'stale' ? 'La fuente devolvió información desactualizada. Volveremos a consultar.' : 'No pudimos obtener información actualizada. Podés reintentar o consultar el sitio oficial de Trenes Argentinos.', 'warning');
    } finally {
      clearTimeout(timeout);
      if (active === requestId) { refreshButton.disabled = false; resultList.setAttribute('aria-busy', 'false'); schedule(); }
    }
  }

  function changeStation() {
    snapshot = null; visibleLimit = 12; render();
    heading.textContent = `${station().name} · ${line().name}`;
    destinationSelect.replaceChildren(option('', 'Todos los destinos')); destinationSelect.disabled = true;
    load();
  }
  function changeLine() {
    const selectedLine = line();
    stationSelect.replaceChildren(...selectedLine.stations.map(item => option(item.id, item.name)));
    stationSelect.value = String(selectedLine.defaultStation);
    changeStation();
  }
  lineSelect.replaceChildren(...catalog.lines.map(item => option(item.id, item.name)));
  lineSelect.value = 'roca';
  lineSelect.addEventListener('change', changeLine);
  stationSelect.addEventListener('change', changeStation);
  destinationSelect.addEventListener('change', () => { visibleLimit = 12; render(); });
  moreButton.addEventListener('click', () => { visibleLimit += 12; render(); });
  refreshButton.addEventListener('click', load);
  pauseButton.addEventListener('click', () => {
    paused = !paused; pauseButton.textContent = paused ? 'Reanudar actualización' : 'Pausar actualización';
    pauseButton.setAttribute('aria-pressed', String(paused));
    if (paused) { clearTimeout(timer); render(); } else load();
  });
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (document.hidden) { requestId++; controller?.abort(); refreshButton.disabled = false; resultList.setAttribute('aria-busy', 'false'); }
    else if (!paused) load(); else render();
  });
  setInterval(() => { if (!document.hidden && snapshot) render(); }, 15000);
  changeLine();
})();
