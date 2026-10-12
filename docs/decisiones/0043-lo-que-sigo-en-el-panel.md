# 0043. «Lo que sigo» en el panel: qué ven les admins

- Fecha: 2026-10-12
- Estado: Aceptada (respuestas de gorrite del 12/10). Completa 0025: aclara que «es privado» habla
  del sitio público y de otras cuentas, no del panel.

## Contexto

Lo que sigue cada cuenta es privado (0025, [lo-que-sigo.md](../lo-que-sigo.md)): no se muestra en
ninguna página pública ni a otras cuentas. Pero la ficha de una persona en el panel (Comunidad ›
Personas o Cuentas) ya mostraba, en «Lo que sigue», cada cosa seguida con sus avisos, y los docs no
decían que eso estaba bien. Además faltaba la página reservada Mensajes › Lo que sigo.

## Decisión

- **Les admins pueden ver lo que sigue cada persona en su ficha** («Lo que sigue»), como hasta
  ahora: sirve para ayudar a alguien que dice «no me llegan los mails».
- **Mensajes › Lo que sigo** (`/admin/mensajes/lo-que-sigo`) es para mirar: los interruptores, los
  totales, los avisos que salieron, el paso de «Avisame si se repite», Telegram y **«Lo más
  seguido»**: cada etiqueta, serie, perfil o lugar con cuántas cuentas lo siguen, **aunque sea una**
  (sin piso). Nunca quiénes: esa página no lista personas, ni ids de cuentas, mails o chats.
- Nada de esto sale del panel: ni en el sitio, ni en `/api/sigo`, ni en el bot, ni como «N
  personas siguen esto».

## Descartado

- Un piso de 3 cuentas en «Lo más seguido» (con menos, «menos de 3»).
- Sacar de la ficha los nombres de lo seguido y dejar solo cuántas cosas y qué avisos.
- Una lista por persona en Mensajes › Lo que sigo (eso ya está en la ficha).

## Consecuencias

- El número exacto puede dejar adivinar quién sigue algo cuando es 1: solo lo ven les admins, que
  igual ven la ficha.
- Las capturas de estas páginas en los PRs van con datos inventados (el repo es público).
