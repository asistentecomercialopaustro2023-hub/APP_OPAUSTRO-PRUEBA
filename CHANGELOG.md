# Changelog OPAUSTRO

## OPAUSTRO v1.4.2 - 2026-07-07

- Separacion de entornos: el historial de accesos (eliminar/respaldar) usa una hoja de calculo distinta cuando se prueba en local, para no afectar los datos publicados. Borrar desde el sitio publicado tambien reinicia el sandbox local.
- Corregido: Usuarios conectados ahora es siempre la misma vista en vivo (BD_Sesiones_App), sin importar si se consulta desde local o desde el sitio publicado.
- Corregido: las sesiones se eliminan de la hoja al desconectarse (logout, cierre de pestaña o inactividad prolongada) en vez de acumularse como historial.
- Agregadas tarjetas de resumen clicables en Informe de accesos, Administrar accesos y Control de usuarios: al seleccionar una, filtra la tabla o lista correspondiente.
- Reemplazado el texto clicable de "usuarios conectados" por un boton de icono que abre una ventana superpuesta con el listado.
- Agregado boton para limpiar todos los filtros y busquedas en Informe de accesos, reordenado junto a "Buscar" y "Sinc".

## OPAUSTRO v1.4.1 - 2026-07-07

- Corregido Informe de accesos: ahora calcula los roles controlados aunque la pagina no tenga los chips de seleccion, por lo que respeta lo activado en Administrar accesos y muestra los ingresos reales (antes quedaba siempre en 0).
- Agregado boton "Eliminar historial" en Informe de accesos con confirmacion, respaldo opcional con nombre personalizado y limpieza total de la copia local del navegador.
- Agregado archivado automatico mensual del historial de accesos hacia Google Drive (JSON liviano), con panel de consulta historica por mes y descarga en CSV.
- Se actualizo `VERSION.json`, `APP_VERSION`, `APP_RELEASE` y `APP_RELEASE_KEY` para notificar actualizacion a apps instaladas.

## OPAUSTRO v1.3 - 2026-07-03

- Control de acceso queda sin cabecera interna duplicada y con sincronizacion compacta junto a la busqueda.
- La barra lateral conserva scroll interno invisible sin desplazar el contenido ni el encabezado.
- BI Vendedor queda integrado con icono propio y precarga dentro del flujo de actualizacion.
- Tablero Control y Revision Costo muestran mensaje 404 limpio cuando falta el archivo local.
- Se actualizo `VERSION.json`, `APP_VERSION`, `APP_RELEASE`, `APP_RELEASE_KEY` y `manifest.webmanifest` para activar actualizacion en apps instaladas.
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

