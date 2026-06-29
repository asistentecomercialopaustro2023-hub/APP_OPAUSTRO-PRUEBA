# Control De Versiones OPAUSTRO

## Estructura

- `VERSION.json`: versión activa que la app instalada consulta para pedir actualización.
- `CHANGELOG.md`: historial humano de cambios.
- Git tags: puntos recuperables de publicación, por ejemplo `opaustro-v1.0`.
- Rama `gh-pages`: versión publicada en GitHub Pages.

## Publicar Una Versión Nueva

1. Actualizar `VERSION.json`.
2. Actualizar `CHANGELOG.md`.
3. Cambiar `APP_VERSION` y `APP_RELEASE` en `Login/index.html`.
4. Probar local y web pública.
5. Crear commit.
6. Crear tag:

```bash
git tag opaustro-v1.0
git push origin opaustro-v1.0
```

Para una corrección posterior:

```bash
git tag opaustro-v1.1
git push origin opaustro-v1.1
```

## Rollback Rápido

Si una versión falla, volver temporalmente a una versión anterior publicada:

```bash
git checkout gh-pages
git reset --hard opaustro-v1.0
git push origin gh-pages --force-with-lease
```

Después se corrige la versión nueva en una rama aparte y se vuelve a publicar como `opaustro-v1.2`.

## Reglas

- No guardar contraseñas en el frontend.
- No subir archivos con claves o tokens privados.
- Mantener Apps Script como capa de validación y acceso a datos.
- Antes de publicar, validar login, ventas, logística, gerencia y PWA móvil.
- Cada versión debe tener tag, changelog y `VERSION.json` actualizado.
