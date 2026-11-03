# 0054. PayPal en las propinas: una app compartida y una cotización propia

- Fecha: 2026-11-02
- Estado: Aceptada. Decidido por gorrite en la coordinación con fondo.kinkyvibe.ar (issue #265).
  Completa [0018](0018-propinas-al-fondo.md): cómo se cuentan las propinas al Fondo que no son en
  pesos.

## Contexto

Hay gente que quiere dejar una propina (o una donación «Una vez» al Fondo) y no tiene Mercado Pago,
sobre todo desde afuera. PayPal cobra en dólares, pero el Fondo se mide en pesos, y
fondo.kinkyvibe.ar también va a cobrar suscripciones mensuales con PayPal. Si cada sitio convierte
con su propio número, la barra del Fondo y el panel no coinciden.

## Decisión

- **PayPal es una segunda forma de pagar en el formulario de propina que ya existe** (el del pie de
  las publicaciones y `/propinas?de=fondo`). No hay otro flujo de «Donar con PayPal» en
  fondo.kinkyvibe.ar: «Una vez» sigue trayendo a la gente acá. fondo.kinkyvibe.ar hace solo las
  suscripciones mensuales con PayPal.
- **Una sola app REST de PayPal para los dos sitios.** Cada sitio registra su propio webhook y se
  suscribe solo a sus eventos (kinkyvibe: los de órdenes y capturas; el Fondo: los de
  suscripciones y ventas). Las órdenes de kinkyvibe llevan `custom_id` con el prefijo
  `kv-propina:`; cada sitio ignora con un 2xx lo que no es suyo. Las credenciales las carga
  gorrite en los dos Workers y se rotan juntas, avisando en #265.
- **Los pagos son en dólares y cuenta lo neto**: lo que queda después de la comisión de PayPal.
- **La cotización es de kinkyvibe.** Todos los días un cron guarda el dólar MEP «compra» del día
  (la **base**). Cada pago guarda la base de su día, que no cambia nunca. kinkyvibe se la pasa al
  Fondo (`GET /api/fondo/cotizacion`), así los dos sitios convierten con el mismo número.
- **gorrite fija un ajuste en %** en el panel (por ejemplo −4).
  Se aplica **al leer**: cambiarlo cambia todas las estimaciones, también las de meses pasados.
  Pesos = floor(neto × base × (1 + ajuste / 100)).
- **Son estimaciones.** La conversión de verdad pasa al retirar la plata de PayPal; cada retiro
  (fecha, dólares, pesos que llegaron) se carga en el panel para comparar lo real con lo estimado
  y elegir el ajuste.
- **Se informa aparte.** En `GET /api/fondo/propinas-total`, `total` y `count` siguen siendo solo
  de Mercado Pago; lo de PayPal va en `paypal: { usd, ars, count }` y el Fondo lo suma él.
- Si traer la cotización falla, queda la última guardada y el panel lo marca como dato viejo.

## Descartado

- **Una app de PayPal por sitio:** el doble de credenciales y de configuración para lo mismo.
- **Que cada sitio convierta con su propio número:** la barra del Fondo y el panel no coincidirían.
- **Guardar los pesos de cada pago al cobrar:** cambiar el ajuste no movería las estimaciones
  viejas, y lo que se quiere es corregirlas con lo que se aprende de los retiros.
- **Sumar PayPal adentro de `total`:** rompería a fondo.kinkyvibe.ar, que ya lo usa.

## Consecuencias

- Todo sale detrás del interruptor `paypal`, apagado
  ([interruptores.md](../interruptores.md)).
- Migración 0071: `mep_rates`, `paypal_withdrawals` y columnas de PayPal en `tips` (`provider`
  'mp' por defecto). Todos los totales de Mercado Pago filtran `provider = 'mp'`.
- El ajuste vive en `ticket_settings` (`paypal_rate_adjustment_pct`), como los otros ajustes de
  plata, y cada cambio queda en Actividad.
- Las fuentes de la cotización (DolarApi y ArgentinaDatos) son gratis y sin garantía: el código
  valida cada número y nunca pisa un día guardado.
- Detalle en [propinas.md](../propinas.md), «PayPal: cotización, ajuste y retiros».

## Cómo va

- Base sin credenciales (cotización, ajuste, retiros, reparto por mes, endpoints): este PR.
- El cobro con PayPal: cuando lleguen las credenciales de prueba.
