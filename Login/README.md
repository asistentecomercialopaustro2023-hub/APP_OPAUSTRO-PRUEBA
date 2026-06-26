# Login OPAUSTRO

## Estructura analizada

- `Admin`: carpeta vacia para el modulo administrativo.
- `Gerencia`: carpeta vacia para consultas y reportes.
- `Login`: contiene el login inicial y el tablero de modulos.
- `Logistica`: carpeta vacia para el modulo logistico.
- `Ventas`: carpeta vacia para el modulo comercial.
- `Recuros_imagenes`: contiene logos e iconos visuales del sistema.

## Sheet analizado

Archivo: `https://docs.google.com/spreadsheets/d/1D4DzASd5yh-tMhKqJvshFcOV4gathx9yAsZ0xHV1F3I/edit`

Hoja detectada: `BD_Login`

Columnas requeridas:

- `Rol`
- `Razon`
- `Usuario`
- `Contrasena` o `Contraseña`, normalizada internamente por Apps Script.

Reglas iniciales de acceso:

- `admin`: acceso a `Admin`, `Ventas`, `Logistica` y `Gerencia` con permiso de edicion.
- `Gerencia`: acceso a `Ventas`, `Logistica` y `Gerencia` con permiso de lectura. No ve `Admin`.
- `Ventas`: acceso solo a `Ventas`.
- `Logistica`: acceso solo a `Logistica`.

## Apps Script

1. Abre el proyecto de Apps Script del modulo Login: `https://script.google.com/home/projects/1HmZRBhBbn-lrqTbSCLNlMB0OMaBL0JCOIQ6HZKcyGUqlxHU4kDWuvJuC/edit`.
2. Carga `Code.gs`.
3. Carga `index.html` como archivo HTML.
4. Ejecuta una sola vez `configurarBaseDatos('ID_DEL_SHEET')` desde Apps Script para guardar el ID en propiedades del script, no en el codigo publico.
5. Ejecuta `configurarSistema()` para crear/verificar columnas base.
6. Ejecuta `migrarContrasenas()` para pasar contrasenas de texto plano a `Password_Hash` y `Password_Salt`.
7. Despliega como aplicacion web.

No pegues el enlace publicado dentro de `index.html` si el mismo Apps Script sirve el login. Ese enlace es para abrir el sistema desde el navegador. El HTML se conecta internamente con `google.script.run`.

Si en el futuro se decide servir el HTML desde GitHub Pages y consumir un backend separado, ahi si se necesitara una URL de API, pero no es la opcion recomendada para el login porque esa URL queda visible en el codigo publico.

## Seguridad inicial

- No se muestran nombres de hojas, rutas, IDs ni origen de conexion en el HTML.
- Las contrasenas se validan en servidor.
- Al ejecutar `migrarContrasenas()`, la columna de contrasena queda vacia y se usan hash + salt.
- El ID del Sheet debe guardarse en `PropertiesService`, no publicarse en Git.
- Para produccion, publicar mediante Apps Script para usar HTTPS y evitar exponer endpoints internos en HTML publico.
