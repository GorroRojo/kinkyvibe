# 0002. Cuentas y perfiles

- Fecha: 2026-09-30
- Estado: Aceptada

## Contexto

Hoy solo les admins entran al sitio (con GitHub) y las compras se hacen sin cuenta. Lo que viene
(guardados, amistades, suscripciones) necesita cuentas para el público. Hay que definir temprano
la relación entre cuenta (quién entra) y perfil (quién aparece).

## Decisión

- **Una cuenta, varios perfiles**, de dos tipos:
  - **Personas separadas**: nadie ve que dos perfiles son de la misma cuenta (salvo admins).
  - **Perfiles de grupo**, que manejan varias cuentas. Cada grupo elige si muestra integrantes;
    quienes lo manejan **nunca** se muestran.
- Sin "nombre para mostrar" ni seudónimo aparte: los nombres del sitio ya no son legales.
- Textos: **"Ingresar"** y **"Mi rincón"**.
- Login: **código por mail + passkeys**, y también **contraseña** como alternativa.
- Sesión: dura **hasta que la persona cierra sesión**.
- Cuentas **opcionales**, pero un evento puede exigirlas (se configura por evento).
- Compras viejas: aparecen solas en la cuenta cuando el mail está verificado.
- DNI: se pide en cada compra, con casilla opcional **"Recordar mi DNI"**.
- Al borrar una cuenta, las órdenes quedan, **desvinculadas** de la cuenta.
- Guardados: les superadmins **sí** pueden verlos.
- Admins: siguen entrando con **GitHub por ahora**, sin unificar con las cuentas del público.

## Descartado

- Perfiles vinculados a la vista (que se vea que son de la misma persona).
- Un solo método de login.
- Sesiones que vencen solas.
- Cuentas obligatorias para comprar en todos los eventos.
- Unificar ya el login de admins con el del público.

## Consecuencias

- Cada acción guarda qué perfil la hizo y de qué cuenta; solo se muestra el perfil.
- El vínculo entre perfiles de una cuenta es de los datos más delicados del sitio: se guarda
  separado y con acceso registrado.
- La compra tiene que seguir funcionando sin cuenta.
