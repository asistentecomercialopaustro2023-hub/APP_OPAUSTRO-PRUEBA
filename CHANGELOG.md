# Changelog OPAUSTRO

## OPAUSTRO v1.1 - 2026-06-30

- Integrado modulo ICE Pinguino dentro del menu principal con submodulos Resumen, Inventario, Reportes, Escaneo y Mis visitas.
- El login principal ya no se bloquea si ICE u otro modulo no puede preparar datos; el error queda contenido en el modulo afectado.
- ICE usa recursos centralizados desde `Recuros_imagenes` y su carpeta queda sin logos o imagenes duplicadas.
- Se agrego `.editorconfig` y `tools/check-encoding.ps1` para controlar UTF-8 y evitar mojibake en tildes, signos y caracteres especiales.
- Se actualizo `VERSION.json`, `APP_VERSION`, `manifest.webmanifest` y cache names de service workers para notificar actualizacion a apps instaladas.

## OPAUSTRO v1.0 - 2026-06-29

- Restaurado el mapa de ventas con `markerClusterGroup`, `L.marker`, `divIcon` y tooltip del HTML inicial.
- Conservada la correccion de coordenadas positivas para Ecuador.
- Agregada restauracion de ultima pantalla si el usuario sale y vuelve antes del cierre por inactividad.
- Agregado `VERSION.json` para detectar nuevas versiones en la app instalada.
