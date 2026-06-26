# Modulo Logistica

## Archivos principales

- `index.html`: redirige directo a `cabinets.html`.
- `cabinets.html`: frontend del modulo; ya no muestra login interno.
- `Code.gs`: Apps Script del modulo logistico.

## Sheet analizado

ID:

`1yQDKAqIA9H8b53aMYklYxnNQ6eOVNjouFmpAia4A2r4`

Pestanas detectadas:

- `Equipos`
- `Movimientos`
- `Mantenimiento`
- `Hoja 1` vacia

El script usa por defecto ese ID como base de datos de logistica.

## Apps Script nuevo

1. Crea un proyecto nuevo de Apps Script.
2. Pega el contenido de `Code.gs`.
3. Ejecuta `configurarSistema()` una vez.
4. Despliega como aplicacion web.
5. Copia la URL publicada terminada en `/exec`.
6. En `cabinets.html`, reemplaza:

```js
var APPS_URL='AQUI_VA_LA_URL_PUBLICADA_DEL_WEB_APP';
```

## Seguridad opcional

Para exigir clave de API:

1. En Apps Script, ve a `Project Settings`.
2. Agrega Script Property:

```text
LOGISTICA_API_KEY = configura_esta_clave_solo_en_script_properties
```

3. En `cabinets.html`, coloca la misma clave:

```js
var LOGISTICA_API_KEY='';
```

Nota: si el HTML se publica en GitHub Pages, cualquier clave escrita en el frontend sera visible en el codigo. Para seguridad fuerte, deja la clave real solo en `Script Properties` y valida permisos, rol y token en Apps Script.
