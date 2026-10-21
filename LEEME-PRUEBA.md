# Prueba de próximos trenes

Abrí `proximos-trenes.html` con conexión a Internet. Incluye seis líneas de Trenes Argentinos y consulta una sola estación por vez. También funciona al subir esta carpeta a GitHub Pages, sin compilación ni servidor propio.

- `js/estaciones.js`: catálogo de estaciones normalizado de la infraestructura pública de Trenes Argentinos.
- `js/arribos-model.js`: interpretación de los datos, fechas y estados.
- `js/arribos.js`: filtros, consultas y presentación.
- `css/arribos.css`: diseño de la herramienta y su acceso desde la portada.

La prueba usa datos reales de una fuente externa; su disponibilidad puede cambiar. No incluye datos simulados ni bloques de anuncios.

La carpeta contiene un borrador del sitio completo. La rama principal y la publicación de trenes.com.ar no se modificaron. Para publicar esta propuesta, primero revisar los archivos y luego incorporarlos al repositorio habitual, manteniendo `CNAME`.

Prueba de la interpretación de horarios: `node tests/arribos.test.cjs`.
