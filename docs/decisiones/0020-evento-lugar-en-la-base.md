# 0020. El vínculo entre evento y lugar vive en la base

- Fecha: 2026-10-01
- Estado: Aceptada

## Contexto

Los lugares pasan a ser perfiles en la base (#137), pero los eventos siguen en `.md` hasta que se
migren (0026).

## Decisión

- El vínculo evento → lugar se guarda **en la base**, como relación de objetos (0004).
- Mientras los eventos sigan en `.md`, apunta al evento por su dirección (slug), con un link
  provisorio que se convierte cuando el evento pase a la base.

## Descartado

- Guardar el lugar como texto en cada `.md`.

## Consecuencias

- En #137. Sitemap, RSS y demás siguen leyendo los `.md` hasta la migración de eventos.
