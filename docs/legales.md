# Página legal (borrador mínimo)

## Qué hace

Una sola página, `/legales`, con lo que la ley pide y nada más: quién está a cargo, qué datos se
guardan y para qué, quién más los procesa, cuánto tiempo, tus derechos con la leyenda de la AAIP
y, para las entradas, el derecho de arrepentimiento. Se lee en menos de dos minutos.

Pedido de gorrite: «la versión más corta posible, solo con lo estrictamente necesario», por el
poco movimiento del sitio. Las versiones largas anteriores (privacidad completa, términos,
entradas y devoluciones, código de convivencia) quedaron en la historia de git: commit
`84e2f61` («Borradores de las páginas legales, solo en previews y en dev»).

**Es un borrador y no está publicado** (decisión de gorrite): no es asesoramiento legal. Lo que
tiene que decidir una persona lleva una nota amarilla «Para revisar» (`Revisar.svelte`); son 4.

## Qué es obligatorio y qué no

| Qué                                                                                                                                          | ¿Obligatorio?                                                                          | Fuente                                                                                                                    | Confianza                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Informar al juntar datos: finalidad, destinatarios, responsable (identidad y domicilio), si es obligatorio, qué pasa si no los das, derechos | Sí                                                                                     | Ley 25.326, art. 6                                                                                                        | Alta                                                                                                                                                                                                |
| Leyenda de la AAIP                                                                                                                           | Probablemente sí                                                                       | Res. AAIP 14/2018, art. 3 (derogó la Disp. DNPDP 10/2008, cuyo texto nombraba a la DNPDP)                                 | Media: el art. 2 habla de bancos «públicos o privados destinados a dar informes»; se puede leer como que no alcanza a una base que no da informes a terceros. Ponerla cuesta una línea, así que va. |
| Inscribir la base en el Registro Nacional de Bases de Datos de la AAIP                                                                       | Probablemente sí; **no hay mínimo de tamaño ni de volumen**                            | Ley 25.326, art. 21 y 24 (privados que no sean de «uso exclusivamente personal»); página de la AAIP                       | Media: el art. 21 dice «destinado a proporcionar informes», el 24 alcanza a todo lo que no sea uso personal. No encontré ninguna excepción por tamaño. Decide gorrite (nota «Para revisar»).        |
| Derecho de arrepentimiento en entradas (10 días corridos desde que llega la entrada o el comprobante, avisando 24 h antes del evento)        | Sí, si Kinky Vibe cuenta como «proveedor»                                              | Disp. 954/2025, art. 2 a) y b); Ley 24.240, art. 34; CCyC art. 1110 y 1116 (las excepciones del 1116 no incluyen eventos) | Alta sobre la regla; media sobre si aplica: la Ley 24.240 (art. 2) llama proveedor a quien vende «de manera profesional, aun ocasionalmente». Vender entradas seguido por la web casi seguro entra. |
| **Botón** «Botón de arrepentimiento» visible desde la primera pantalla, sin cuenta ni trámites, con código del pedido en 24 h                | Mismo «sí» que la fila anterior                                                        | Disp. 954/2025, art. 1 y 5                                                                                                | Alta sobre lo que pide; **no está hecho**: nota «Para revisar» con lo que costaría.                                                                                                                 |
| Un canal de contacto para reclamos en la web                                                                                                 | Sí (el mail alcanza: «canal alternativo de comunicación o sitio electrónico»)          | Disp. 954/2025, art. 6                                                                                                    | Alta                                                                                                                                                                                                |
| Botón de baja de servicio                                                                                                                    | No: no hay servicios con suscripción                                                   | Disp. 954/2025, art. 4                                                                                                    | Alta                                                                                                                                                                                                |
| Términos y condiciones de uso                                                                                                                | No hay ley que los exija                                                               | —                                                                                                                         | Alta. Son útiles para moderar perfiles: opcional, más adelante.                                                                                                                                     |
| Código de convivencia                                                                                                                        | No                                                                                     | —                                                                                                                         | Alta. Tiene que salir de la comunidad: opcional, más adelante.                                                                                                                                      |
| Aviso de cookies                                                                                                                             | No: no hay una regla argentina como la europea, y el sitio solo usa cookies necesarias | —                                                                                                                         | Media-alta                                                                                                                                                                                          |

Lo que dice la página de las entradas se apoya en las condiciones que ya muestran la compra y los
mails (`purchaseConditions()` y `refundPolicy()` en `src/lib/utils/tickets.js`); no las repite.

## Qué hace Mazmo

Mazmo (mazmo.net, la red kink/BDSM argentina) es una app de una sola página; el texto legal está en
su bundle (revisado el 11/10/2026):

- **Tiene:** un solo documento en `/info/tos` y `/info/privacy` (el mismo componente, la segunda
  baja hasta la parte de privacidad), con «Descargo», una privacidad genérica (recolección,
  cookies, logs, «no compartimos», boletín, cambios sin aviso) y términos de servicio largos de
  plantilla traducida (18+, licencia sobre el contenido, garantías y responsabilidad en
  mayúsculas, «ley de donde estén las oficinas»).
- **No tiene:** quién es le responsable (ni nombre, ni CUIT, ni domicilio), la leyenda de la AAIP,
  cómo ejercer los derechos, plazos de guarda, la lista de terceros (y su HTML carga Google
  Analytics y verificaciones de redes de publicidad), botón de arrepentimiento ni aviso de
  cookies.
- **Vende igual:** entradas de eventos (en pesos, con Mercado Pago), «Sades» y planes.

O sea: Mazmo no es un modelo de cumplimiento, solo muestra que en el ambiente nadie lo controla
mucho. La página mínima de acá ya cubre más que Mazmo.

Para comparar, Alpogo (venta de entradas, alpogo.com) tiene en el pie «Políticas de privacidad»,
«Términos y condiciones» y «Botón de Arrepentimiento»; su privacidad todavía usa la leyenda vieja
de la Disp. 10/2008 (nombra a la Dirección Nacional de Protección de Datos Personales).

## Lo que hay que revisar

Las 4 notas de la página:

1. **Responsable:** quién figura (nombre o razón social y domicilio), como pide el art. 6.
2. **Plazos:** cuánto se guardan las compras con DNI después del evento; las copias anuales hoy no
   se borran nunca.
3. **Registro de la AAIP:** inscribir o no la base.
4. **Botón de arrepentimiento:** un link en el pie a un formulario corto (mail y número de compra)
   que guarde el pedido, mande por mail un código a la persona en el momento y le avise al equipo;
   la devolución sigue siendo a mano. Hasta entonces, el pedido es por mail.

Sin nota, para más adelante: el mail de las entradas (`DEFAULT_CONTACT_EMAIL`) no es el mismo que
el contacto general de esta página (`CONTACTO_LEGALES`); si un evento kink cuenta como «dato
sensible» (art. 2 y 7 de la Ley 25.326); fichas viejas de amigues en la historia del repo.

## Lo que nunca se tiene que romper

- **En producción da 404 y no entra en el bundle**, igual que la galería `/estilo`
  ([estilo.md](estilo.md)): `src/routes/(content)/legales/+page.js` importa el texto solo dentro
  de `if (import.meta.env.DEV || (__DEPLOY_BRANCH__ !== '' && __DEPLOY_BRANCH__ !== 'main'))`. Se
  ve en `npm run dev` y en el preview de cualquier rama que no sea `main`.
- Nada de la app importa `$lib/legales/` fuera de esa ruta (tampoco el pie de página).
- **Lo que dice tiene que ser cierto.** Si un PR cambia qué se guarda (cuentas, entradas,
  analíticas, «Lo que sigo», Telegram, cookies) o quién lo procesa, actualiza `Legales.svelte` en
  el mismo PR.
- Sin datos de personas: el único mail es el contacto general de la organización
  (`CONTACTO_LEGALES` en `src/lib/legales/legales.js`). Lo chequea la prueba.
- La leyenda de la AAIP va con el texto exacto de la Res. 14/2018 (por eso dice «afectados»).

## Cómo publicarla

Cuando esté revisada y aprobada (un PR aparte, con el OK de gorrite):

1. Resolver las notas «Para revisar» y sacar el aviso «Borrador sin publicar» de
   `src/lib/legales/Legales.svelte`.
2. En `src/routes/(content)/legales/+page.js`, sacar la condición. Sacar `noindex` de
   `+page.svelte`.
3. Sacar la marca `data-kv-legales` y su chequeo en `scripts/demo/guard.js`
   (`LEGALES_BUNDLE_MARKER`), y cambiar las pruebas que esperan 404
   (`src/lib/legales/legalesGuard.test.js` y `tests/smoke.spec.js`) por pruebas de que carga:
   decirlo en el PR, no es debilitar una prueba sino cambiar la regla.
4. Enlazarla desde el pie de página (`src/lib/components/Footer.svelte`) y, si se hace, sumar ahí
   el botón de arrepentimiento.
5. Actualizar este documento.

## Dónde está el código

- `src/lib/legales/`: `legales.js` (el contacto y `cargarLegales`), `Legales.svelte` (la página),
  `Revisar.svelte` (la nota).
- `src/routes/(content)/legales/`: la ruta con la condición.

## Cómo probarlo

- `npx vitest run src/lib/legales`: 404 fuera de dev y sin rama de preview, que carga en dev, que
  solo se importa dentro de la condición, la marca del bundle, la leyenda, como mucho 5 notas y
  ningún mail de personas.
- `tests/smoke.spec.js`: `/legales` da 404 en un build sin rama de deploy.
- `node scripts/demo/guard.js bundle .wrangler/dry-run/index.js` (en CI): la marca no está en el
  Worker de producción.
- A mano: `npm run dev` y abrir `/legales`; o el preview del PR.

## Fuentes

- Ley 25.326 (texto actualizado):
  <https://servicios.infoleg.gob.ar/infolegInternet/anexos/60000-64999/64790/texact.htm>
- Res. AAIP 14/2018 (leyenda; deroga la Disp. 10/2008):
  <https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-14-2018-307621/texto>
- AAIP, obligaciones de los responsables de bases de datos: <https://www.argentina.gob.ar/node/53779>
- Disp. 954/2025 (Boletín Oficial, 4/9/2025; deroga las Res. 316/2018 y 424/2020):
  <https://www.boletinoficial.gob.ar/detalleAviso/primera/330827/20250904>
- Ley 24.240 de Defensa del Consumidor:
  <https://servicios.infoleg.gob.ar/infolegInternet/anexos/0-4999/638/texact.htm>
- Mazmo: <https://mazmo.net/info/tos> y <https://mazmo.net/info/privacy>
- Alpogo: <https://alpogo.com/pagina/politicas-de-privacidad>
