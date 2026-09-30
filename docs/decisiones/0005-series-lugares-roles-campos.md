# 0005. Series, lugares, roles y campos personalizados

- Fecha: 2026-09-30
- Estado: Aceptada

## Contexto

Hay eventos que se repiten (ediciones de una serie), lugares que hoy aparecen sueltos, personas
con distintos roles en cada contenido y datos extra que les organizadores quieren pedir al
inscribirse.

## Decisión

- **Series**: una serie es una etiqueta con descripción e imagen (elegida de las imágenes ya
  subidas). Sin página nueva en la Kinkipedia: es parte de la estructura y lista sus eventos y
  talleres. En eventos pasados, botón "Avisame si se repite" (mail cuando se anuncia la próxima
  edición).
- **Lugares**: viven en amigues como tipo de perfil "Lugar", con campos extra (dirección, mapa OSM,
  accesibilidad, cómo llegar) y su lista de eventos.
  - Privacidad por lugar, con excepción por evento, en 4 niveles: **público / solo nombre / solo
    barrio / oculto**.
  - En los niveles 2 a 4, quien compra recibe los datos completos, y la página del lugar no lista
    esos eventos.
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
