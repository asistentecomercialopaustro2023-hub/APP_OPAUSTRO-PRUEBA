# Control De Versiones OPAUSTRO

## Version activa

- Version: `OPAUSTRO v1.4.4`
- Tag recomendado: `opaustro-v1.4.4`
- Rama publicada: `gh-pages`

## Estructura

- `VERSION.json`: version activa que la app instalada consulta para pedir actualizacion.
- `CHANGELOG.md`: historial humano de cambios.
- `.editorconfig`: regla de codificacion UTF-8 para evitar caracteres distorsionados.
- `tools/check-encoding.ps1`: verificacion previa a publicar contra mojibake.
- `tools/activar-version.ps1`: activa cualquier version publicada (tag) sin perder el trabajo actual. Ver "Rollback Seguro" abajo.
- Git tags: puntos recuperables de publicacion, por ejemplo `opaustro-v1.0`, `opaustro-v1.1`, `opaustro-v1.4.4`.

## Publicar Una Version Nueva

1. Actualizar `VERSION.json`.
2. Actualizar `CHANGELOG.md`.
3. Cambiar `APP_VERSION` y `APP_RELEASE` en `Login/index.html`.
4. Cambiar cache names de service workers si hubo cambios visuales o de HTML.
5. Ejecutar `tools/check-encoding.ps1`.
6. Probar local y web publica.
7. Crear commit.
8. Crear tag y subirlo.

## Rollback Seguro (recomendado)

Si una version falla y se necesita activar una anterior **sin perder el trabajo de la version rota** (porque se sigue arreglando en paralelo), usar `tools/activar-version.ps1`. Nunca usa `reset --hard` ni `push --force`: siempre crea un commit nuevo y un tag de respaldo automatico, asi que nada se pierde nunca.

```powershell
# Ver versiones disponibles
.\tools\activar-version.ps1 -Listar

# Activar una version anterior (deja el commit listo localmente)
.\tools\activar-version.ps1 -Tag opaustro-v1.4.2

# Revisar que todo se ve bien, y recien ahi publicar:
git push origin gh-pages
git push origin respaldo-<fecha-que-mostro-el-script>

# O hacerlo todo en un solo paso:
.\tools\activar-version.ps1 -Tag opaustro-v1.4.2 -Push
```

Cuando la version rota (ej. v1.4.4) ya este corregida, se reactiva de la misma forma, usando el tag de respaldo que el script mostro al momento de activar la version anterior:

```powershell
.\tools\activar-version.ps1 -Tag respaldo-20260708-085141 -Push
```

O simplemente se publica la version corregida como de costumbre (ver "Publicar Una Version Nueva").

### Metodo antiguo (destructivo, evitar)

`git reset --hard <tag> && git push --force` tambien funciona, pero reescribe el historial de `gh-pages` y es facil perder de vista el punto exacto de la version rota mientras se arregla. Usar solo si se sabe exactamente lo que se hace.

## Reglas

- No guardar contrasenas en el frontend.
- No subir archivos con claves o tokens privados.
- Mantener Apps Script como capa de validacion y acceso a datos.
- Antes de publicar, validar login, ventas, logistica, gerencia, ICE y PWA movil.
- Cada version debe tener tag, changelog y `VERSION.json` actualizado.

