---
name: publicar
description: Actualiza la documentación según los cambios pendientes, los valida, arma commits en español y hace push de main. Usar solo cuando el usuario lo pide con /publicar.
disable-model-invocation: true
argument-hint: "[nota opcional sobre qué se publica]"
allowed-tools: Bash(git *), Bash(npm run *), Bash(jq *), Read, Edit, Write, Grep, Glob
---

# Publicar cambios en main

Invocar esta skill **es** el pedido explícito de commitear y pushear. Fuera de
ella, los cambios quedan sin commitear.

Nota del usuario (puede estar vacía): $ARGUMENTS

## 1. Relevar qué cambió

```bash
git status --short
git diff
git diff --staged
git log --oneline -5
```

- Si no hay cambios, decirlo y terminar.
- La rama tiene que ser `main`. Si no lo es, frenar y preguntar.
- Si aparece algo que parece secreto (`.env`, claves `service_role`, tokens,
  `firma.cjs`), no agregarlo y avisar.
- Si hay cambios que no se entienden o no parecen de esta sesión, preguntar
  antes de incluirlos.

## 2. Actualizar la documentación

Leer el diff y decidir qué documento describe cada cambio. Solo tocar lo que
el cambio vuelve incorrecto o incompleto; no reescribir secciones enteras.

| Cambio en | Documento |
|---|---|
| Reglas de datos, flujos, tracker, cobertura, decisiones de diseño | `web/AGENTS.md` (fuente canónica, ver `web/CLAUDE.md`) |
| Pantallas, instalación, variables de entorno, scripts de npm | `web/README.md` |
| JSON de `n8n/` | `n8n/README.md` |
| `firefox-extension/` | `firefox-extension/README.md` |
| Estructura general del repo | `README.md` |

- Nuevas migraciones en `web/supabase/`: mencionarlas donde se documenta la
  tabla que tocan, con la instrucción «Instalar `…sql`».
- Mantener el tono del documento: español, frases que explican el porqué.
- No agregar un bloque de changelog; eso lo cuenta git.
- Si ningún documento queda desactualizado, decirlo y seguir.

## 3. Validar

Si el diff toca `web/`, desde `web/`:

```bash
npm run typecheck
npm run lint
npm run test:siniestrados
npm run test:cobros
npm run test:seguimiento
npm run test:tracker
```

Si toca `n8n/`: `jq empty n8n/*.json` desde la raíz.

Si algo falla, **no commitear**: mostrar el error y preguntar. No saltear
pruebas ni desactivar reglas para que pase.

## 4. Commitear

Agrupar en commits por intención (una funcionalidad, un fix, la documentación
que la acompaña puede ir en el mismo commit que el código). Agregar archivos
por nombre, nunca `git add -A` ni `git add .`.

Formato, igual al historial:

- Título en español, imperativo en tercera persona, sin punto final, ≤ 72
  caracteres. Ej.: «Agrega selector de tema claro, oscuro y sistema».
- Si hace falta, cuerpo con viñetas `- ` que expliquen qué y por qué.
- Terminar con la línea de coautoría que indique el sistema.

```bash
git add <archivos>
git commit -F - <<'EOF'
Título del commit

- Detalle

Co-Authored-By: ...
EOF
```

No usar `--amend`, `--no-verify` ni reescribir commits ya publicados.

## 5. Push

```bash
git fetch origin main
git status -sb
```

- Si `origin/main` tiene commits que no están local, **no forzar**: hacer
  `git pull --rebase origin main`, volver a validar si hubo cambios en código y
  recién ahí pushear. Si el rebase da conflictos, frenar y avisar.
- Nunca `git push --force`.

```bash
git push origin main
```

## 6. Informar

Resumir en pocas líneas: qué documentos se actualizaron, qué validaciones
corrieron y su resultado, los commits creados (hash corto + título) y
confirmación del push.
