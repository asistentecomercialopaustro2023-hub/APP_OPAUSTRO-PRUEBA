# Control De Versiones OPAUSTRO

## Version activa

- Version: `OPAUSTRO v1.3`
- Tag recomendado: `opaustro-v1.3`
- Rama publicada: `gh-pages`

## Estructura

- `VERSION.json`: version activa que la app instalada consulta para pedir actualizacion.
- `CHANGELOG.md`: historial humano de cambios.
- `.editorconfig`: regla de codificacion UTF-8 para evitar caracteres distorsionados.
- `tools/check-encoding.ps1`: verificacion previa a publicar contra mojibake.
- Git tags: puntos recuperables de publicacion, por ejemplo `opaustro-v1.0` y `opaustro-v1.1`.

## Publicar Una Version Nueva

1. Actualizar `VERSION.json`.
2. Actualizar `CHANGELOG.md`.
3. Cambiar `APP_VERSION` y `APP_RELEASE` en `Login/index.html`.
4. Cambiar cache names de service workers si hubo cambios visuales o de HTML.
5. Ejecutar `tools/check-encoding.ps1`.
6. Probar local y web publica.
7. Crear commit.
8. Crear tag y subirlo.

## Rollback Rapido

Si una version falla, volver temporalmente a una version anterior publicada:

```bash
git checkout gh-pages
git reset --hard opaustro-v1.0
git push origin gh-pages --force-with-lease
```

Despues se corrige la version nueva y se vuelve a publicar como `opaustro-v1.3`.

## Reglas

- No guardar contrasenas en el frontend.
- No subir archivos con claves o tokens privados.
- Mantener Apps Script como capa de validacion y acceso a datos.
- Antes de publicar, validar login, ventas, logistica, gerencia, ICE y PWA movil.
- Cada version debe tener tag, changelog y `VERSION.json` actualizado.

