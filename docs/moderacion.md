# Moderación: cuando alguien pide desaparecer

Qué hacer cuando una persona pide que su perfil, su foto o su nombre dejen de estar en el sitio
(«quiero desaparecer»), y qué se puede prometer. Es para les admins que moderan; no reemplaza el
criterio de cada caso. Viene de la auditoría de comunidad (T32).

## Lo que no se rompe

- **Primero se oculta, después se pregunta.** Si alguien escribe asustade, el paso 1 va al toque,
  sin pedir motivos ni pruebas.
- **No prometer lo que no depende de nosotres.** Google, los grupos de chat y archive.org
  guardan copias propias: se les pide, sin plazo garantizado.
- **Nada de esto va a GitHub.** Ni el nombre, ni el link del perfil, ni capturas: el repo es
  público. Si hace falta dejar registro, en Actividad del panel o en la Mesa.

## Cuánto tarda cada cosa en irse

Del sitio:

| Qué                                          | Después de ocultar el perfil                                      |
| -------------------------------------------- | ----------------------------------------------------------------- |
| La página del perfil                         | 404 al toque                                                      |
| Listas (`/amigues`), búsqueda, `/api/posts`  | hasta 5 minutos (`s-maxage=300`)                                  |
| Sitemap y RSS                                | hasta 1 hora (`s-maxage=3600`)                                    |
| La foto del perfil (`/media/img/…`)          | deja de servirse al toque; lo que ya estaba en caché, hasta 1 día |
| Vista previa de un link (`/cdn-cgi/image/…`) | lo que ya estaba en caché, hasta que se purgue                    |

La caché con `s-maxage` es la del borde de Cloudflare (`caches.default`, que el worker del adapter
consulta antes de la app), y es **una por centro de datos**: borrarla desde el código limpia uno
solo. Las fotos de perfiles se guardan un día; las portadas de eventos y material, un año
(`docs/imagenes.md`, «Fotos de perfiles»).

Afuera del sitio: los buscadores, las vistas previas que ya se mandaron en Telegram o WhatsApp,
las capturas y archive.org. Eso no se borra solo.

## Paso a paso

1. **Ocultar el perfil.** En el panel, la ficha del perfil → «Ocultar». También le saca la
   aprobación: si quien lo gestiona lo vuelve a poner público, no reaparece hasta que une admin lo
   apruebe (`docs/amigues.md`). Si la persona solo quiere salir de Google pero seguir en el sitio,
   alcanza con «No aparecer en buscadores» desde Mi rincón (`perfiles-buscadores` en el plan).
2. **La foto.** Con el perfil oculto, `/media` ya no la sirve a nadie salvo a admins y a quien lo
   gestiona. Si la imagen no la usa nada más, sacarla de la biblioteca (Contenido › Biblioteca →
   «Sacar de la biblioteca»). Para que deje de verse antes de un día, purgar en Cloudflare
   (dashboard → Caching → Configuration → Custom Purge, por URL) la dirección de la foto, sus copias
   chicas (`…-360.webp`, `…-720.webp`) y las variantes `/cdn-cgi/image/…` de las vistas previas.
   Lo que quedó en el navegador de alguien no se puede borrar.
3. **El nombre en los eventos y el material.** Ocultar el perfil lo saca de los créditos con
   perfil, pero no de «Organiza» ni de «Autore» cuando el nombre está escrito como texto: hay que
   editar evento por evento y sacarlo o poner «une organizadore». Buscarlo con el buscador del
   panel.
4. **Buscadores.** En Google Search Console, «Retiradas»: pedir la quita temporal de la página del
   perfil y de la imagen. Como la página ya da 404, después Google la saca sola. Pedido, sin plazo
   garantizado.
5. **Telegram.** El bot oficial de Telegram para vistas previas (@WebpageBot) refresca la vista
   previa de un link que ya da 404. WhatsApp no tiene herramienta: la vista previa que ya se mandó
   queda en esos chats.
6. **archive.org.** Si guardó la página o `/amigues`, se le pide la remoción por mail, como dice su
   página de ayuda. Pedido, sin plazo garantizado.
7. **La cuenta.** Si la persona además quiere irse del todo, «Borrar la cuenta» lo hace ella misma
   desde Mi rincón (pide un código por mail; `docs/cuentas.md`). Las órdenes de entradas quedan,
   desvinculadas (decisión P7.6).
8. **Contarle a la persona qué se hizo y qué no.** Por ejemplo: «Ya ocultamos tu perfil y sacamos
   tu foto. Google y los grupos de chat pueden tardar unos días en actualizarse; te avisamos cuando
   lo veamos limpio.» Y volver a mirar a los pocos días: la página, la foto, el sitemap y Google.

## Lo que queda guardado

- El perfil oculto o borrado sigue en la base (borrado suave), con sus relaciones, para poder
  deshacer. Las versiones viejas en `object_revisions` las ven solo les admins.
- El registro de Actividad no se borra desde el panel.
- Borrar del todo (la fila, el historial, el archivo en R2) no tiene botón: es una decisión aparte
  de gorrite.
