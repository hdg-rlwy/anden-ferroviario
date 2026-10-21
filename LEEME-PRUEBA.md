# Prueba de próximos trenes

Abrí `proximos-trenes.html` con conexión a Internet. Incluye seis líneas de Trenes Argentinos y consulta una sola estación por vez. También funciona al subir esta carpeta a GitHub Pages, sin compilación ni servidor propio.

- `js/estaciones.js`: catálogo de estaciones normalizado de la infraestructura pública de Trenes Argentinos.
- `js/arribos-model.js`: interpretación de los datos, fechas y estados.
- `js/arribos.js`: filtros, consultas y presentación.
- `css/arribos.css`: diseño de la herramienta y su acceso desde la portada.
- `js/mapa.js`, `js/mapa-model.js`, `js/mapa-red.js` y `css/mapa.css`: mapa, consulta de posiciones y referencias de la red.
- `vendor/`: Leaflet 1.9.4 y su licencia BSD de dos cláusulas, incluidos localmente.

En la sección de horarios, pulsá **Mostrar mapa de trenes**. Podés ver la línea seleccionada o las seis líneas disponibles, seleccionar un tren y centrar el mapa. Las marcas llenas son posiciones informadas por la fuente; las de borde discontinuo, aproximaciones calculadas con arribos estimados. La fuente no garantiza cobertura completa ni informa la hora individual de cada coordenada.

El mapa consulta ubicaciones al abrirse y cada minuto mientras está visible y la actualización está habilitada. Usa dos consultas simultáneas y reutiliza datos recientes. Ocultarlo o pausar detiene esas consultas. La lista de horarios sigue renovándose cada 30 segundos.

El mapa base usa el servicio estándar de OpenStreetMap, con atribución visible y las reglas de caché del navegador. Las imágenes del mapa base se solicitan solo para la vista abierta; no se incluyen ni se descargan para uso sin conexión. Si abrís el HTML directamente como archivo local, se muestran los recorridos y las posiciones sin las calles; el mapa base se habilita al servirlo por HTTP/HTTPS. La configuración del proveedor está en `js/mapa.js`. Política: https://operations.osmfoundation.org/policies/tiles/.

La prueba usa datos reales de una fuente externa; su disponibilidad puede cambiar. No incluye datos simulados ni bloques de anuncios.

La carpeta contiene un borrador del sitio completo. La rama principal y la publicación de trenes.com.ar no se modificaron. Para publicar esta propuesta, primero revisar los archivos y luego incorporarlos al repositorio habitual, manteniendo `CNAME`.

Prueba de la interpretación de horarios: `node tests/arribos.test.cjs`.
Prueba de las posiciones del mapa: `node tests/mapa.test.cjs`.
