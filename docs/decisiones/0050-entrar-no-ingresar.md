# 0050. «Entrar», no «Ingresar»

- Fecha: 2026-10-26
- Estado: Aceptada (gorrite, tarjeta `ux-entrar-ingresar` de la Mesa, opción a). Reemplaza el
  texto «Ingresar» de [0002](0002-cuentas-y-perfiles.md); el resto de 0002 sigue igual.

## Contexto

[0002](0002-cuentas-y-perfiles.md) eligió «Ingresar» para el link de las cuentas del público,
pero la guía de estilo ([estilo.md](../estilo.md)) ya decía «Entrar» y el sitio terminó usando
las dos: «Entrar» en el encabezado, el pie, la página y los mails del código; «ingresar» en algunos
avisos y en la documentación. Además «ingresar» e «ingreso» también se usan para entrar a un
evento (la Puerta, «Ya ingresó»), y mezclar los dos sentidos confunde.

## Decisión

- **«Entrar» en todos los textos que se refieren a entrar a la cuenta**: link del encabezado y del
  pie, página, avisos de error, mails y documentación («Entrá con tu mail», «Volvé a entrar»,
  «Tu código para entrar»).
- **La dirección `/ingresar` no cambia**, para no romper links guardados ni los `?next=`.
- «Ingresar» e «ingreso» quedan solo para entrar a un evento: la entrada «ya no es válida para
  ingresar», «Ya ingresó», el control de ingreso.

## Descartado

- Mantener «Ingresar» como decía 0002: chocaba con la guía de estilo y con el sentido de la
  Puerta.
- Cambiar también la dirección a `/entrar`: rompe links y no suma nada para quien usa el sitio.

## Consecuencias

- Un texto nuevo sobre la cuenta dice «Entrar»; el código y las rutas siguen llamándose
  `ingresar`.

## Cómo va (26/10)

- En el PR de este cambio: se cambiaron los últimos «ingresar» de la cuenta (el aviso del mapa en
  Mi rincón, la ayuda de visibilidad de los perfiles) y la documentación.
