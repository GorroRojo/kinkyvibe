# Registro de decisiones

Acá quedan anotadas las decisiones de producto y de arquitectura de kinkyvibe: qué se decidió, por
qué y qué se descartó. Con muchos agentes trabajando en paralelo, es lo que evita que uno deshaga
lo que decidió otro.

No hay decisiones legales acá: eso queda para abogades.

## Reglas

- **Antes de tocar un área, leé las decisiones que la cubren** (mirá el índice de abajo).
- Un cambio que contradice una decisión necesita **una decisión nueva**, no una edición
  silenciosa. La nueva explica qué cambia y la vieja pasa a "Reemplazada por NNNN". Si la nueva
  cambia o completa solo una parte, la vieja lo dice en su "Estado".
- Lo que ya se hizo se anota en una sección **"Cómo va"** al final, con los números de PR. Eso no
  cambia lo decidido.
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

Por área. Todas están aceptadas; la fecha es la del día en que se decidió.

### Plan y forma de trabajo

- [0001](0001-ritmo-y-orden.md): Ritmo y orden del plan (30/9; el orden lo reemplaza 0026)
- [0026](0026-orden-1-10.md): Orden del plan (1/10)
- [0027](0027-merges-de-noche.md): Qué se mergea de noche (1/10)
- [0028](0028-migraciones-antes-del-merge.md): Las migraciones van a producción antes del merge
  (1/10)

### Infraestructura

- [0009](0009-infraestructura.md): Infraestructura, backups, pagos y documentación (30/9)

### Cuentas, perfiles y permisos

- [0002](0002-cuentas-y-perfiles.md): Cuentas y perfiles (30/9)
- [0003](0003-superadmins-y-permisos.md): Superadmins y permisos (30/9)
- [0019](0019-proyecto.md): "Proyecto" reemplaza a "grupo" (1/10)

### Contenido, objetos y etiquetas

- [0004](0004-modelo-de-contenido.md): Modelo de contenido, propuesta 6 (30/9)
- [0011](0011-etiquetas.md): Sistema de etiquetas (30/9)

### Series, lugares, roles y campos

- [0005](0005-series-lugares-roles-campos.md): Series, lugares, roles y campos personalizados
  (30/9)
- [0020](0020-evento-lugar-en-la-base.md): El vínculo entre evento y lugar vive en la base (1/10)
- [0021](0021-lugar-sin-nivel.md): Lugar sin nivel de privacidad: dirección completa (1/10)
- [0022](0022-lugares-desde-cuentas.md): Las cuentas también pueden crear lugares (1/10)
- [0023](0023-contacto-publico.md): Se muestra el contacto que ya era público (1/10)
- [0024](0024-organizadores-ven-respuestas.md): Les organizadores ven las respuestas de
  inscripción (1/10)

### Entradas

- [0006](0006-entradas.md): Entradas: cupo, puerta, preventas y límites (30/9)
- [0012](0012-precio-de-puerta-por-tipo.md): Precio de puerta por tipo de entrada (1/10)
- [0013](0013-un-pedido-un-tramo.md): Un pedido entra en un solo tramo (1/10)
- [0014](0014-reserva-vencida.md): Una reserva vencida devuelve el lugar a su tramo (1/10)
- [0015](0015-encadenado-al-comprar.md): Los tipos encadenados se deciden al comprar (1/10)
- [0016](0016-pago-tardio.md): Un pago tardío se acepta al precio de la orden (1/10)

### Propinas

- [0017](0017-destino-de-la-propina.md): La persona elige el destino de su propina (1/10)
- [0018](0018-propinas-al-fondo.md): Las propinas al Fondo suman al total del Fondo (1/10)

### Comunidad y suscripciones

- [0007](0007-amistades-guardados-suscripciones.md): Amistades, asistencia, guardados y
  suscripciones (30/9)
- [0025](0025-lo-que-sigo.md): "Lo que sigo" (1/10)
- [0029](0029-bot-de-telegram.md): Un bot de Telegram como otra vista del sitio (1/10, propuesta)

### Panel y CRM

- [0008](0008-crm.md): El panel como CRM (30/9)
- [0010](0010-panel.md): Panel: tema, formularios, Inicio y detalles (30/9)
