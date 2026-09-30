# Registro de decisiones

Acá quedan anotadas las decisiones de producto y de arquitectura de kinkyvibe: qué se decidió, por
qué y qué se descartó. Con muchos agentes trabajando en paralelo, es lo que evita que uno deshaga
lo que decidió otro.

No hay decisiones legales acá: eso queda para abogades.

## Reglas

- **Antes de tocar un área, leé las decisiones que la cubren** (mirá el índice de abajo).
- Un cambio que contradice una decisión necesita **una decisión nueva**, no una edición
  silenciosa. La nueva explica qué cambia y la vieja pasa a "Reemplazada por NNNN".
- Las decisiones las toma gorrite (o les superadmins). Si una no está clara, preguntá antes de
  inventar.
- Nada privado: sin datos de personas de la comunidad, secretos ni detalles de vulnerabilidades.
  El repo es público.

## Cómo agregar una

1. Copiá la plantilla en `NNNN-tema-corto.md`, con el número siguiente.
2. Completala en español, corta y concreta.
3. Sumala al índice en el mismo PR.

```md
# NNNN. Título

- Fecha: AAAA-MM-DD
- Estado: Aceptada | Reemplazada por NNNN

## Contexto

Qué pasaba y por qué había que decidir.

## Decisión

Qué se decidió, en frases cortas.

## Descartado

Qué opciones no se eligieron y por qué.

## Consecuencias

Qué implica para el código, el panel o el trabajo que viene.
```

Una decisión puede agrupar varias respuestas del mismo tema.

## Índice

| Nº                                                | Tema                                             | Fecha      | Estado   |
| ------------------------------------------------- | ------------------------------------------------ | ---------- | -------- |
| [0001](0001-ritmo-y-orden.md)                     | Ritmo y orden del plan                           | 2026-09-30 | Aceptada |
| [0002](0002-cuentas-y-perfiles.md)                | Cuentas y perfiles                               | 2026-09-30 | Aceptada |
| [0003](0003-superadmins-y-permisos.md)            | Superadmins y permisos                           | 2026-09-30 | Aceptada |
| [0004](0004-modelo-de-contenido.md)               | Modelo de contenido (propuesta 6)                | 2026-09-30 | Aceptada |
| [0005](0005-series-lugares-roles-campos.md)       | Series, lugares, roles y campos personalizados   | 2026-09-30 | Aceptada |
| [0006](0006-entradas.md)                          | Entradas: cupo, puerta, preventas y límites      | 2026-09-30 | Aceptada |
| [0007](0007-amistades-guardados-suscripciones.md) | Amistades, asistencia, guardados y suscripciones | 2026-09-30 | Aceptada |
| [0008](0008-crm.md)                               | El panel como CRM                                | 2026-09-30 | Aceptada |
| [0009](0009-infraestructura.md)                   | Infraestructura, backups, pagos y documentación  | 2026-09-30 | Aceptada |
| [0010](0010-panel.md)                             | Panel: tema, formularios, Inicio y detalles      | 2026-09-30 | Aceptada |
