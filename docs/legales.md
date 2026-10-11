# Páginas legales (borradores)

## Qué hace

Cuatro páginas con las reglas del sitio, escritas en castellano rioplatense y sin jerga legal
donde se puede:

| Página                  | Dirección              | De qué trata                                                                                 |
| ----------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| Índice                  | `/legales`             | la lista                                                                                     |
| Política de privacidad  | `/legales/privacidad`  | qué datos, para qué, base legal, cuánto tiempo, quién más los procesa, cookies, derechos     |
| Términos y condiciones  | `/legales/terminos`    | uso del sitio, cuentas, perfiles, de quién es el contenido, uso aceptable                    |
| Entradas y devoluciones | `/legales/entradas`    | lo que ya dicen la compra y los mails: reservas, Fondo, titular, devoluciones, fechas        |
| Código de convivencia   | `/legales/convivencia` | esqueleto a partir de los códigos de convivencia de ¡AUCH! (`src/lib/posts/amigues/AUCH.md`) |

**Son borradores y no están publicados** (decisión de gorrite): no son asesoramiento legal y
tienen que revisarlos gorrite, la organización y une abogade. Cada cosa que falta decidir lleva en
la página una nota amarilla «Para revisar» (`Revisar.svelte`, con el ícono de alerta).

## Lo que nunca se tiene que romper

- **En producción dan 404 y no entran en el bundle**, igual que la galería `/estilo`
  ([estilo.md](estilo.md)): `src/routes/(content)/legales/[[pagina]]/+page.js` importa los textos
  solo dentro de `if (import.meta.env.DEV || (__DEPLOY_BRANCH__ !== '' && __DEPLOY_BRANCH__ !== 'main'))`.
  Se ven en `npm run dev` y en el preview de cualquier rama que no sea `main`.
- Nada de la app importa `$lib/legales/` fuera de esa ruta (tampoco el pie de página: no hay links
  hasta que se publiquen).
- **No inventar reglas.** La de entradas junta lo que ya existe y usa las mismas funciones que la
  compra y los mails (`purchaseConditions`, `refundPolicy`, `transferRuleText`, la plantilla
  `date_change`): si cambia una condición, la página cambia sola. Lo que no está definido va en
  «Para revisar».
- **Lo que dice la privacidad tiene que ser cierto.** Si un PR cambia qué se guarda (cuentas,
  entradas, analíticas, «Lo que sigo», Telegram, perfiles, mails, cookies), actualiza
  `Privacidad.svelte` en el mismo PR.
- Sin datos de personas: el único mail es el contacto público (`DEFAULT_CONTACT_EMAIL` de
  `src/lib/utils/tickets.js`). Lo chequea la prueba.

## Lo que hay que revisar

Todo está en las páginas; esta es la lista corta.

**Privacidad**

- Responsable de la base (nombre o razón social, CUIT, domicilio) e inscripción en el Registro
  Nacional de Bases de Datos de la AAIP.
- El script de Cloudflare Web Analytics (`src/app.html`): qué junta, y si se deja. Qué guardan los
  logs del Worker y por cuánto.
- El DNI en todas las compras (¿también en eventos online?) y para qué se usa exactamente. Que les
  organizadores vean las respuestas de inscripción (decisión 0024): ¿avisarlo en la pregunta?
- Fichas de amigues viejas en la historia del repo público: qué se le dice a quien pida borrarlas.
- Notas internas del equipo sobre personas (`person_notes`): para qué, acceso, borrado.
- Gmail (Google) como destino del mail de contacto y de los comprobantes; transferencias
  internacionales de datos (Cloudflare, Resend, Telegram, Google).
- Datos sensibles: ir a un evento kink o seguir ciertas etiquetas puede decir algo de la vida
  sexual (art. 2 y 7 de la Ley 25.326). ¿Consentimiento expreso aparte?
- Cuánto se guardan las compras (con DNI) y las copias anuales de la base, que hoy no se borran.
- El texto obligatorio de la AAIP (adaptado con lenguaje inclusivo) y cómo se verifica la
  identidad de quien pide sus datos.
- La pregunta de edad es una declaración: ¿alcanza? ¿Qué pasa con la compra de une menor?
- Fecha de vigencia y cómo se avisan los cambios.

**Términos**

- Datos de quien ofrece el servicio (Ley 24.240).
- Criterios para aprobar, ocultar o borrar perfiles y si se avisa.
- Licencia del material y del código; contenido de autores invitades y de otres organizadores.
- Quién responde por los eventos de otres organizadores.
- Alcance de la responsabilidad del sitio (redactarlo con une abogade).
- Proceso cuando no se respetan las reglas (mismo que el de convivencia).
- Vigencia, jurisdicción y «botón de arrepentimiento» (Res. 424/2020).

**Entradas y devoluciones**

- La página muestra los dos medios de pago; el formulario, los de cada evento. ¿Enlazarla desde el
  formulario?
- Feriados en los días hábiles de la transferencia.
- Cambio de titular: hasta cuándo y si se reenvía la entrada.
- «5 días hábiles» para la devolución: qué días cuentan; aviso tardío y no venir sin avisar;
  devolver una entrada de varias (hoy solo la compra entera); si se devuelven el recargo de MP y el
  aporte al Fondo (hoy, el total); datos para devolver una transferencia; el taller grabado; el
  límite de 180 días de Mercado Pago.
- Derecho de arrepentimiento de 10 días (Ley 24.240) en eventos con fecha.
- Cambio de fecha: plazo para pedir la devolución.
- Cancelación del evento: no está definida (preguntas abiertas de [tickets.md](tickets.md)).

**Código de convivencia**

- Es un esqueleto: tiene que salir de la comunidad (quién lo escribe y cómo se aprueba).
- Si vale para eventos de otres organizadores; reglas propias de cada evento.
- Consentimiento en los eventos, fotos y videos, a quién se le habla en un evento, contacto si el
  problema es con el equipo, qué medidas se pueden tomar y quién las decide.

## Cómo publicarlas

Cuando estén revisadas y aprobadas (un PR aparte, con el OK de gorrite):

1. Sacar las notas «Para revisar» ya resueltas y el aviso «Borrador sin publicar» de
   `src/lib/legales/Legal.svelte`.
2. En `src/routes/(content)/legales/[[pagina]]/+page.js`, sacar la condición: importar siempre
   `cargarLegal` y dar 404 solo si la página no existe. Sacar `noindex` de `+page.svelte`.
3. Sacar la marca `data-kv-legales` de `Legal.svelte` y su chequeo en `scripts/demo/guard.js`
   (`LEGALES_BUNDLE_MARKER`), y cambiar las pruebas que esperan 404
   (`src/lib/legales/legalesGuard.test.js` y `tests/smoke.spec.js`) por pruebas de que cargan:
   decirlo en el PR, no es debilitar una prueba sino cambiar la regla.
4. Enlazarlas desde el pie de página (`src/lib/components/Footer.svelte`) y, la de entradas, desde
   las condiciones de compra.
5. Actualizar este documento.

## Dónde está el código

- `src/lib/legales/`: `paginas.js` (la lista y `cargarLegal`), `Legal.svelte` (el marco),
  `Revisar.svelte` (la nota), una página por archivo e `Indice.svelte`.
- `src/routes/(content)/legales/[[pagina]]/`: la ruta con la condición.

## Cómo probarlo

- `npx vitest run src/lib/legales`: 404 fuera de dev y sin rama de preview, que cargan en dev,
  que solo se importan dentro de la condición, la marca del bundle, y que cada página tiene sus
  notas y ningún mail de personas.
- `tests/smoke.spec.js`: `/legales`, `/legales/privacidad` y `/legales/entradas` dan 404 en un
  build sin rama de deploy.
- `node scripts/demo/guard.js bundle .wrangler/dry-run/index.js` (en CI): la marca no está en el
  Worker de producción.
- A mano: `npm run dev` y abrir `/legales`; o el preview del PR.
