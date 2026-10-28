# IndieWeb y ActivityPub: investigación y prototipo

Ítem del plan `proto-indieweb-activitypub`. Para mirar y decidir: qué haría falta para que la agenda
se vea en el fediverso (Mastodon, Mobilizon, Gancio…) y qué riesgos trae para una comunidad kinky.
Investigado en octubre de 2026; las fuentes están al final, con números entre corchetes.

## En una página

- **Ya estamos en el fediverso, por un puente.** `kinkyvibe.ar` está conectado a Bridgy Fed desde
  2024: la cuenta `@kinkyvibe.ar@kinkyvibe.ar` existe, la arma Bridgy con la `h-card` del inicio y
  los posts que lee del sitio, y `/.well-known/*` redirige a `fed.brid.gy` (`src/routes/.well-known/[param]`).
  Funciona sin código nuestro, pero muestra entradas sueltas, no una agenda, y el avatar que tiene
  todavía es el viejo (falta «Update profile», ver [seo.md](../seo.md)).
- **Un actor «solo lectura» casi no sirve con Mastodon.** Mastodon no lee el outbox de una cuenta
  remota para mostrar lo viejo: solo muestra lo que le llega a su inbox después de que alguien
  siguió la cuenta (y lo fijado) [5][6]. Para que los eventos aparezcan en los inicios de la gente
  hace falta lo que el prototipo no tiene: aceptar seguidores, guardarlos y **entregar** cada evento
  firmado a cada servidor.
- **Mastodon muestra un `Event` como un post común**: el texto sale de `content` (o de `name`), le
  agrega el `url`, usa `icon` como miniatura y `summary` como **aviso de contenido** [1]. No hay
  fecha ni lugar en la tarjeta: el texto tiene que decirlos. Mobilizon y Gancio sí entienden
  `startTime`, `location`, etc.
- **Recomendación:** no montar federación propia todavía. Fase 1 (barata, ya casi está): pulir lo que
  Bridgy Fed y los lectores IndieWeb ya leen. Si se quiere una cuenta de agenda que la gente siga,
  fase 2 con una cuenta «solo emite» (acepta seguidores, entrega eventos, no recibe respuestas), y
  recién ahí decidir las preguntas de privacidad de abajo. La federación completa (respuestas,
  menciones, moderación) no compensa para este sitio.

## Qué hay hoy en el sitio

| Pieza                    | Estado                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `h-event` en cada evento | Ya estaba: `p-name`, `p-summary`, `u-url`, `dt-start`, `dt-end`, `p-location`, `u-photo`, `e-content` (`/calendario/<evento>`, `CuandoDonde.svelte`, `VenueLocation.svelte`). Verificado con `microformats-parser` sobre la página con la semilla; los links a les autores pasaron de `p-author u-url` a `p-author h-card` (antes sumaban sus direcciones a la `u-url` del evento). |
| `h-entry`                | Material, wiki y el mismo evento (`h-entry h-event`).                                                                                                                                                                                                                                                                                                                               |
| `h-card` y `rel="me"`    | La del inicio es la que lee Bridgy Fed ([seo.md](../seo.md)).                                                                                                                                                                                                                                                                                                                       |
| Feeds                    | RSS, Atom, JSON Feed (sin lugares) y `.ics` (con el lugar según su privacidad, `feedLocation`).                                                                                                                                                                                                                                                                                     |
| Webmention               | No hay endpoint para recibirlas ni se mandan.                                                                                                                                                                                                                                                                                                                                       |
| Bridgy Fed               | Activo para el dominio; lee el feed (o webmentions, si un día se mandan) [8].                                                                                                                                                                                                                                                                                                       |

## ActivityPub para eventos

**El objeto.** ActivityStreams tiene el tipo `Event` (`name`, `startTime`, `endTime`, `location`).
Cada programa lo extendió a su manera, y FEP-8a8e (borrador, 2024-2026) junta lo común [3]:

- obligatorios: `name` (texto sin HTML), `startTime`, `endTime` (posterior al comienzo; si no hay fin,
  uno «para máquinas» con `displayEndTime: false`) y `organizers` (puede ser `null` para no decirlo);
- `location`: un `Place` con `address` en texto o `PostalAddress` de schema.org (Gancio manda texto,
  Mobilizon la estructura [2][4]), o `VirtualLocation` para lo online; nunca un texto suelto;
- `eventStatus` (`EventScheduled`, `EventCancelled`, `EventTentative`…), `timezone` IANA,
  `joinMode` (`free`, `restricted`, `external` + `externalParticipationUrl`), imagen de portada en
  `attachment` con `isBannerImage`;
- los calendarios públicos solo deben mostrar eventos con `Public` en `to`.

Hay un validador de FEP-8a8e (`npx fep-8a8e-validator <archivo|url>`) [3b].

**Cómo lo publican otros.** Gancio expone una sola cuenta tipo `Application` por instancia
(`relay@…`), que cualquiera sigue sin aprobación, y manda `Event`; borra los eventos remotos cuando
terminan [4]. Mobilizon publica eventos de personas y grupos, con extensiones `mz:` (`joinMode`,
`repliesModerationOption`, `anonymousParticipationEnabled`) y `PostalAddress` [2]. El modelo de
Gancio (una cuenta de agenda, solo eventos) es el que más se parece a lo que tendría sentido acá.

**WebFinger** (RFC 7033 [9]): `GET /.well-known/webfinger?resource=acct:agenda@kinkyvibe.ar`
devuelve un JRD con un link `rel="self"` de tipo `application/activity+json` al actor. Mastodon
verifica la vuelta: toma `preferredUsername` (o, desde 4.6, la propiedad `webfinger` de FEP-2c59) y
el dominio, y vuelve a preguntar [7]. Ojo: hoy **todo** `/.well-known/webfinger` va a Bridgy Fed;
una cuenta propia tiene que contestar solo por ella y seguir redirigiendo el resto (el prototipo lo
hace así).

**Firmas HTTP.** Para entregar a un inbox, Mastodon pide firma; con «secure mode» también para
leer [10]. En 2026 conviven dos formatos: el borrador «Cavage» de siempre y RFC 9421 (HTTP Message
Signatures), que Mastodon acepta desde 4.4 y tiene prendido siempre desde 4.5 [11][12]; 4.7 vuelve
a firmar con RFC 9421 si el otro lado rechaza la firma vieja («double knocking»). Para mandar, lo
seguro sigue siendo RSA-SHA256 con el formato viejo y caer a RFC 9421; Ed25519 recién llega [10].
Sin `publicKey` en el actor nadie puede verificar nada, y un actor sin clave puede quedar mal
guardado en caché del otro lado [13].

## Solo lectura, solo emite o federación completa

| Opción                                                      | Qué da                                                                                                                                                                                    | Qué cuesta                                                                                                                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Solo lectura** (el prototipo: WebFinger + actor + outbox) | Se puede buscar `@agenda@kinkyvibe.ar` y ver el perfil. Mobilizon/Gancio u otros lectores pueden mirar el outbox. En Mastodon, el perfil sale vacío o con «ver más en el sitio original». | Casi nada. Sin claves ni base.                                                                                                                                                                           |
| **Solo emite**                                              | La gente sigue la cuenta y ve cada evento nuevo (y sus cambios y cancelaciones) en su inicio.                                                                                             | Clave privada como secreto, tabla de seguidores (migración), procesar `Follow`/`Undo` firmados, entregar `Create`/`Update`/`Delete` a cada inbox con reintentos (cola). Responder `Ignore` a los `Join`. |
| **Federación completa**                                     | Respuestas, menciones, «me gusta» visibles en el sitio.                                                                                                                                   | Moderación: spam, acoso, contenido de otros servidores en nuestras páginas, bloqueos de dominios, reportes. Para una comunidad kinky, una carga de moderación que hoy no tiene quién llevar.             |

## En Cloudflare Workers + D1

- **Librería:** Fedify soporta Workers desde 1.6 (`@fedify/cfworkers`: `WorkersKvStore` y
  `WorkersMessageQueue` sobre KV y Queues), con `nodejs_compat` y una federación armada por pedido
  [14]. Es lo más maduro; trae su propio router y su manera de guardar claves. Wildebeest (el servidor
  de Cloudflare en Workers + D1) está archivado [15]. Para «solo emite», hecho a mano es poco: firmar
  con WebCrypto (`crypto.subtle`, RSA-SHA256), verificar las firmas de `Follow`/`Undo` y una cola.
- **Claves:** la privada del actor como secreto del Worker (`wrangler secret put`), nunca en `vars`
  ni en el repo; la pública en el actor. Rotarla obliga a los otros servidores a volver a buscarla.
- **Costo:** verificar una firma RSA con WebCrypto es barato, pero cada `Follow` obliga a bajar el
  actor remoto para tener su clave (una salida de red por pedido, con caché). Entregar un evento a N
  servidores son N `POST` firmados: con muchos seguidores conviene una Queue (reintentos y cola de
  muertos ya incluidos) o el cron de 15 minutos que ya hay, en tandas, para no pasarse del límite de
  subpedidos por invocación [16].
- **WAF:** las reglas anti-bots de Cloudflare pueden frenar a los servidores del fediverso sin
  avisar; hace falta una regla que saltee los pedidos con `application/activity+json` [14].
- **Caché:** las páginas públicas ya tienen la caché de 1 minuto
  ([0049](../decisiones/0049-cache-de-1-minuto-sin-sesion.md)); las respuestas de ActivityPub del
  prototipo usan 5 minutos, como los feeds.

## Webmention y microformats

Webmention (recomendación del W3C [17]) es un aviso «te enlacé» entre sitios. Lo que daría: que
Bridgy Fed publique al momento (en lugar de esperar a leer el feed) y traiga de vuelta respuestas
del fediverso como webmentions [8]. Recibirlas implica guardar y moderar texto de terceros: mismo
problema que la federación completa. Mandarlas (al publicar un evento, a Bridgy) es chico y no
guarda nada de nadie. `h-event` [18] ya está bien armado; Bridgy Fed entiende `h-event` pero en
Mastodon lo muestra como un post [8].

## Privacidad y seguridad (lo que más pesa acá)

- **Lo que sale no vuelve.** Un `Delete` es un pedido: el spec dice que el otro servidor «SHOULD»
  borrar y «MAY» dejar una lápida, y no hay forma de obligarlo [19]. Copias en cachés, backups,
  archivadores o servidores que no borran quedan para siempre [20]. Editar suele propagarse mejor
  que borrar. Para un calendario esto importa poco si solo sale lo público, y mucho si alguna vez
  sale una dirección que después se oculta.
- **Lugares privados.** El `.ics` ya manda el lugar según su privacidad (`feedLocation`); la
  federación es más «pegajosa» que un `.ics` (que se reemplaza entero cada hora). Opciones: lo mismo
  que el `.ics` (el prototipo), o como RSS (sin lugar, solo el link). Una dirección que pasa de
  pública a oculta después de federada **no se puede retirar** de verdad. Propuesta: barrio y
  ciudad como máximo en el fediverso, aunque el lugar sea público.
- **Personas.** Nombres y cuentas de quien organiza o tallerea no salen en el prototipo
  (`organizers: null`). Mencionar una cuenta del fediverso la notifica y la expone a quien siga la
  agenda; tiene que ser algo que cada persona elige (un campo de su perfil, apagado por defecto).
- **Moderación y bloqueos.** Muchos servidores silencian o bloquean dominios con contenido sexual;
  una cuenta de agenda kinky puede quedar invisible en partes del fediverso, y sus seguidores quedan
  visibles en la lista de seguidores (no publicarla). Con «solo emite» no hay texto de terceros que
  moderar; con respuestas, sí.
- **Aviso de contenido.** Como Mastodon usa `summary` como aviso, se podría usar a propósito (p. ej.
  «Evento kink, +18») en lugar del resumen. Es una decisión de tono, no técnica.
- **Indexación.** Mastodon tiene `discoverable`/`indexable` en el actor para salir (o no) en
  búsquedas y directorios; el prototipo no los pone: queda para decidir.

## Recomendación por fases

1. **Fase 1, IndieWeb (chica, sin riesgo nuevo):** «Update profile» en Bridgy Fed (avatar viejo);
   revisar qué publica hoy Bridgy de los eventos (¿un post por evento, con fecha?); opcional, mandar
   un webmention a Bridgy al publicar un evento para que salga al momento. Ningún dato nuevo sale.
2. **Fase 2, cuenta de agenda «solo emite»** (si se quiere que la gente la siga): sobre este
   prototipo, sumar clave (secreto), tabla de seguidores (migración), `Follow`/`Undo`/`Join→Ignore`
   firmados y entregas por cola o cron. Antes, decidir: qué nivel de lugar sale, si va aviso de
   contenido, si la cuenta aparece en directorios, y qué pasa con la cuenta de Bridgy (¿convive o se
   reemplaza?).
3. **Fase 3, federación completa:** no la recomiendo mientras no haya quien modere.

## El prototipo (interruptor `fediverso`, apagado)

Solo lectura, sin claves, sin entregas, sin migración. Con el interruptor prendido
([interruptores.md](../interruptores.md)):

| Dirección                                                  | Qué devuelve                                                                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `/.well-known/webfinger?resource=acct:agenda@kinkyvibe.ar` | El JRD de la agenda. Cualquier otro `resource`, o con el interruptor apagado, 303 a `fed.brid.gy` como siempre.        |
| `/ap/agenda`                                               | El actor (`Application`, `manuallyApprovesFollowers: true`, sin `publicKey`).                                          |
| `/ap/agenda/outbox`                                        | `OrderedCollection` con un `Create` por cada próximo evento listado y no cancelado (hasta 50, el más cercano primero). |
| `/ap/eventos/<evento>`                                     | El `Event` de un evento listado (el `id` de los del outbox).                                                           |
| `POST /ap/agenda/inbox`                                    | 202 vacío: **no procesa nada** (no lee el cuerpo ni guarda nada). Un «Seguir» queda pendiente para siempre.            |

Apagado, todo da 404 (y WebFinger redirige a Bridgy). El `Event` sale de los mismos datos que el
`.ics`: el lugar por `feedVenues` + `feedLocation` (oculto → sin `location`; online →
`VirtualLocation` sin link), `organizers: null`, `joinMode: external` con el link a la página.
Código: `src/lib/utils/activitypub.js` y `src/routes/ap/`.

Cómo se probó (con la semilla, `FEDIVERSO_ENABLED=1 npx vite dev`): `fep-8a8e-validator 0.1.5` sobre
cada `Event` del outbox, sin violaciones salvo una falsa: marca `America/Argentina/Buenos_Aires` como
zona inválida porque compara con la lista de Node (CLDR), que solo trae el alias viejo
`America/Buenos_Aires`; el nombre IANA canónico es el largo. `@fedify/fedify` 2.4 lee el actor, el
outbox y cada evento (`Application`, `OrderedCollection` → `Create` → `Event` con su `Place`). Las
direcciones del outbox coinciden evento por evento con las de `/calendario.ics`. Apagado, `/ap/*` da
404 y WebFinger redirige a Bridgy.

## Fuentes

1. Mastodon, «ActivityPub» (tipos convertidos: `Event` → post; `summary` como aviso): <https://docs.joinmastodon.org/spec/activitypub/>
2. Mobilizon, «Federation with ActivityPub»: <https://docs.mobilizon.org/5.%20Interoperability/1.activity_pub/>
3. FEP-8a8e, «A common approach to using the Event object type» (borrador): <https://fediverse.codeberg.page/fep/fep/8a8e/>
   (3b) validador: <https://codeberg.org/erictapen/fep-8a8e-validator>
4. Gancio, FEDERATION.md (espejo): <https://git.nolog.cz/NoLog.cz/gancio-upstream/raw/branch/master/FEDERATION.md>; SocialHub, «Events interoperability»: <https://socialhub.activitypub.rocks/t/events-interoperability-validation-minimum-requirements-common-extensions/3849/>
5. fedi.tips sobre el «backfill» de posts fijados: <https://fedi.tips/?p=1057>
6. FediFetcher (existe porque Mastodon no trae lo viejo de cuentas remotas): <https://github.com/nanos/FediFetcher>
7. Mastodon, «WebFinger»: <https://docs.joinmastodon.org/spec/webfinger/>
8. Bridgy Fed, documentación: <https://fed.brid.gy/docs>
9. RFC 7033, WebFinger: <https://www.rfc-editor.org/rfc/rfc7033>
10. Mastodon, «Security» (firmas, RFC 9421, secure mode): <https://docs.joinmastodon.org/spec/security/>
11. Mastodon v4.5.0, «RFC9421 HTTP signatures enabled unconditionally»: <https://github.com/mastodon/mastodon/releases/tag/v4.5.0>
12. RFC 9421, HTTP Message Signatures: <https://www.rfc-editor.org/rfc/rfc9421>
13. SocialHub, actores sin clave o con clave cambiada en caché: <https://socialhub.activitypub.rocks/t/actor-profile-not-visible-on-mastodon/4254>
14. Fedify, «Deployment» (Cloudflare Workers, WAF): <https://fedify.dev/manual/deploy>
15. Cloudflare, Wildebeest (archivado): <https://github.com/cloudflare/wildebeest>
16. Cloudflare Workers, límites: <https://developers.cloudflare.com/workers/platform/limits/>
17. W3C, Webmention: <https://www.w3.org/TR/webmention/>
18. microformats, h-event: <https://microformats.org/wiki/h-event>
19. W3C, ActivityPub §6.4 y §7.4 (Delete): <https://www.w3.org/TR/activitypub/>
20. «The Fediverse never forgets» y discusiones sobre borrados: <https://socialhub.activitypub.rocks/t/soft-deletes-and-restoring-deleted-posts/2318>
