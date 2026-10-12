# 0046. Una sola forma de escribir una búsqueda: sitio, bot y panel

- Fecha: 2026-10-12
- Estado: Aceptada (pedido de gorrite, 12/10: «escribamos primero cuál es la sintaxis, después la
  aplicamos en todos lados y la ponemos visible»; la dirección, las respuestas y el registro de
  operadores, en la Mesa el mismo día).

## Contexto

Hay tres buscadores (el del sitio, el del bot y el del panel) y dos motores, y cada uno entiende
una forma distinta de escribir. Lo que se aprende en uno no sirve en otro, y ninguno explica cómo se
busca, salvo una línea de ayuda en la paleta del panel. Cómo es hoy, operador por operador: la
columna «Hoy» de [buscar.md](../buscar.md).

## Decisión

- **Una sola sintaxis base** que entienden los tres buscadores; el panel suma la suya propia.
- **Un solo parser** para esa base en `$lib/utils/`, que usan los tres.
- **La sintaxis vive en un solo lugar, [buscar.md](../buscar.md)**: qué operadores hay, cómo se lee
  lo escrito, qué entiende cada buscador, qué código lo hace y cómo se suma un operador. Esta
  decisión no la repite, y ningún otro documento tampoco ([panel.md](../panel.md) y
  [telegram.md](../telegram.md) la enlazan). Todo PR que cambie cómo se busca actualiza buscar.md en
  el mismo PR.
- **Una guía visible** en cada buscador, que sale de buscar.md (ahí dice dónde va y qué muestra).

## Lo que respondió gorrite

Las tres preguntas de la propuesta quedaron así, y están escritas en buscar.md:

1. Las palabras de fecha sueltas (también los meses) son operadores en el sitio y el bot, con la
   regla de respaldo.
2. Las formas cortas andan en los tres, y la guía las muestra al lado de la larga.
3. `@` es un perfil del sitio (con autocompletado), nunca un usuario de Telegram o GitHub.

Además: «las palabras ordenan, los operadores filtran», un operador de un solo tipo implica ese
tipo, la dirección de «Hacia dónde va» y el registro de operadores.

## Cómo se aplica

Una vez aceptada: un PR por buscador (sitio, bot, panel), con los tests de cada operador, y uno más
para la guía visible. Cada uno actualiza la columna «Hoy» de buscar.md.
