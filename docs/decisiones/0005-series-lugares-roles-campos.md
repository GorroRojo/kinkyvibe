# 0005. Series, lugares, roles y campos personalizados

- Fecha: 2026-09-30
- Estado: Aceptada. Lo completan, del 1/10: [0020](0020-evento-lugar-en-la-base.md) a
  [0024](0024-organizadores-ven-respuestas.md) (lugares, contacto, respuestas) y
  [0025](0025-lo-que-sigo.md) ("Avisame si se repite").

## Contexto

Hay eventos que se repiten (ediciones de una serie), lugares que hoy aparecen sueltos, personas
con distintos roles en cada contenido y datos extra que les organizadores quieren pedir al
inscribirse.

## Decisión

- **Series**: una serie es una etiqueta con descripción e imagen (elegida de las imágenes ya
  subidas). Sin página nueva en la Kinkipedia: es parte de la estructura y lista sus eventos y
  talleres. En eventos pasados, botón "Avisame si se repite" (mail cuando se anuncia la próxima
  edición). El sistema de etiquetas está en 0011.
- **Lugares**: viven en amigues como tipo de perfil "Lugar", con campos extra (dirección, mapa OSM,
  accesibilidad, cómo llegar) y su lista de eventos.
  - Privacidad por lugar, con excepción por evento, en 4 niveles: **público / solo nombre / solo
    barrio / oculto**. Sin nivel elegido, se muestra la dirección completa (0021). gorrite sumó un
    quinto en #153, **sólo dirección** (la dirección y el mapa, sin el nombre: una casa particular,
    por ejemplo).
  - En los niveles que no son "público", quien compra recibe los datos completos. La página del
    lugar no lista esos eventos, salvo los de "solo nombre".
- **Roles**: lista fija, que les admins pueden ampliar: Autore, Traductore, Organiza, Produce,
  Facilita, Monitorea, Enseña, Fotografía, Diseño.
- **Campos personalizados** al inscribirse: por evento + algunos generales (por ejemplo, primera
  vez en KV o en una serie, experiencia, necesidades). Sin bloque de consentimiento ni borrado
  automático.

## Descartado

- Una tabla o página aparte para series.
- Una base de lugares separada de amigues.
- Roles de texto libre.

## Consecuencias

- El modelo de objetos (0004) tiene que soportar el perfil "Lugar" y la privacidad por evento.
- Las vistas públicas filtran la dirección según el nivel; la confirmación de compra la incluye.
