# 0051. Avisos de puerta para personas que la organización no admite

- Fecha: 2026-10-27
- Estado: Aceptada. Decidido por gorrite en la Mesa (tarjetas `com-herramientas-moderacion`,
  opción 2a, y `puerta-aviso-no-admitides`: 1a, 2b «para los de Kinky Vibe» y 3b «con mail
  recordatorio»).

## Contexto

Cuando la comunidad acuerda que una persona no entra a sus eventos, hoy no hay cómo recordarlo en
la puerta: la compra no pide cuenta y la entrada sale válida. Todo depende de que alguien la
reconozca esa noche. Hacía falta una herramienta chica, que no exponga a nadie y que no reemplace
el criterio de la organización.

## Decisión

- **Avisa, nunca frena.** Si una entrada escaneada o buscada coincide, la puerta muestra solo
  «Avisá a la organización antes de dejar pasar». El ingreso se marca igual; decide quien está en
  la puerta, después de hablar con la organización. No rechaza compras.
- **Solo para los eventos de Kinky Vibe**: los que tienen la etiqueta KinkyVibe («Lo organiza
  KinkyVibe»), la misma regla que el Fondo. En los demás eventos nunca aparece.
- **Solo les admins** cargan, renuevan y quitan avisos, desde Comunidad › Avisos de puerta.
- **Por cuenta o por mail, nunca por nombre.** De un mail se guarda solo un hash: alcanza para
  comparar en la puerta.
- **Vence siempre**: 6 meses, 1 año o una fecha de hasta 2 años. Al vencer se borra solo, y 14
  días antes llega un mail a la casilla de la organización para renovarlo o dejarlo vencer
  (sin datos de la persona).
- **El motivo es opcional y privado**: lo ven solo les admins en esa página. Nunca va a la
  puerta, a la entrada ni a los mails de la persona, a exportaciones ni al registro de actividad.
- **Registro**: quién cargó, renovó o quitó cada aviso y cuándo, sin el mail ni el motivo.

## Descartado

- **Rechazar la compra o el ingreso automáticamente**: un error de tipeo o un mail compartido
  dejaría afuera a otra persona, y la decisión es de la organización.
- **Avisos por nombre**: los nombres se repiten y se cambian; señalaría a otras personas.
- **Avisos sin vencimiento**: obligan a revisar; si sigue haciendo falta, se renueva.
- **Mostrar el motivo en la puerta**: lo vería quien tenga el celu de la puerta y quedaría en la
  lista sin conexión.

## Consecuencias

- Una pantalla de puerta nueva (por ejemplo, el link de puerta por evento) tiene que mostrar el
  mismo texto genérico y nada más (ver [tickets.md](../tickets.md#avisos-de-puerta)).
- El mail se guarda como hash sin clave: quien ya tiene acceso a la base y sospecha de un mail
  puede confirmar si tiene aviso. Es aceptable porque la base solo la ven les admins.
- Queda para después, aparte: «derecho de admisión» en las condiciones de compra (decisión 0044) y
  avisar al panel si una compra nueva coincide.
