# 0028. Las migraciones van a producción antes del merge

- Fecha: 2026-10-01
- Estado: Aceptada

## Contexto

Lo que entra a `main` se publica enseguida. Si el código espera una tabla o columna que la base
de producción no tiene, el sitio se rompe.

## Decisión

- La migración de un PR se aplica a la base de producción **antes** de mergearlo, con su
  interruptor apagado.
- Por eso cada migración tiene que andar con el código que ya está en `main`.
- Ya se hizo así: `0004`–`0010` antes de #115, `0011` antes de #122 y `0016` antes de #134.

## Descartado

- Aplicar las migraciones después del merge.

## Consecuencias

- El PR dice qué migración trae y cuándo se aplicó en producción.
- Las migraciones siguen siendo solo de agregar (`CLAUDE.md`).
