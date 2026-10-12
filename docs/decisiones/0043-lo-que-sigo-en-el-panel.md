# 0043. «Lo que sigo» en el panel: qué ven les admins

- Fecha: 2026-10-12
- Estado: Aceptada (respuestas de gorrite del 12/10; cambiada el mismo día en la revisión de #320:
  «Lo más seguido» arriba y quiénes siguen cada cosa). Completa 0025: aclara que «es privado» habla
  del sitio público y de otras cuentas, no del panel.

## Contexto

Lo que sigue cada cuenta es privado (0025, [lo-que-sigo.md](../lo-que-sigo.md)): no se muestra en
ninguna página pública ni a otras cuentas. Pero la ficha de una persona en el panel (Comunidad ›
Personas o Cuentas) ya mostraba, en «Lo que sigue», cada cosa seguida con sus avisos, y los docs no
decían que eso estaba bien. Además faltaba la página reservada Mensajes › Lo que sigo.

## Decisión

- **Les admins pueden ver lo que sigue cada persona en su ficha** («Lo que sigue»), como hasta
  ahora: sirve para ayudar a alguien que dice «no me llegan los mails».
- **Mensajes › Lo que sigo** (`/admin/mensajes/lo-que-sigo`) es para mirar: los interruptores y,
  justo debajo, **«Lo más seguido»** (lo más útil de la página): cada etiqueta, serie, perfil o
  lugar con cuántas cuentas lo siguen, **aunque sea una** (sin piso). Después los totales, los
  avisos que salieron, el paso de «Avisame si se repite» y Telegram.
- **Les admins ven quién sigue cada cosa desde esa página**, sin entrar ficha por ficha (gorrite,
  revisión de #320): cada fila de «Lo más seguido» se abre («Quiénes») y lista las cuentas que la
  siguen (el mail, como en Comunidad › Cuentas), con link a «Lo que sigue» en su ficha. Y
  **«Por persona»**: cada cuenta con cuántas cosas sigue y cuáles. Sin las cuentas borradas. Nunca
  los ids de chats de Telegram.
- Nada de esto sale del panel: ni en el sitio, ni en `/api/sigo`, ni en el bot, ni como «N
  personas siguen esto». Se arma en el `load` de esa página, detrás de `requireAdmin`, sin caché.

## Descartado

- Un piso de 3 cuentas en «Lo más seguido» (con menos, «menos de 3»).
- Sacar de la ficha los nombres de lo seguido y dejar solo cuántas cosas y qué avisos.
- ~~Una lista por persona en Mensajes › Lo que sigo (eso ya está en la ficha).~~ Descartada en la
  primera versión («nunca quiénes» en esa página); gorrite la pidió en la revisión de #320: entrar
  ficha por ficha no sirve para ver quién sigue qué.

## Consecuencias

- Les admins ven quién sigue qué en dos lugares (la ficha y Mensajes › Lo que sigo); nadie más.
  La página tiene mails: va sin caché y sin referrer, como Cuentas.
- Las capturas de estas páginas en los PRs van con datos inventados (el repo es público).
