# API para Gancho (gancho.kinkyvibe.ar)

El contrato entre este sitio y la app de Gancho Fácil (otra app, otro repo). La app lee las
respuestas de un formulario que tiene una pregunta «Foto» y las fotos, para mostrarle a cada
persona las fotos de sus matches. **Qué ve cada quien lo decide la app de Gancho**, no este sitio.
Cómo se suben y se guardan las fotos: [formularios.md](formularios.md#foto).

Código: `src/lib/server/gancho/api.js` y `src/routes/api/gancho/`. Pruebas:
`src/routes/(content)/formularios/formularios-foto.test.js`.

## Autenticación

- Header `x-gancho-secret: <GANCHO_SECRET>` en cada pedido, de servidor a servidor (sin CORS: un
  navegador de otro sitio no puede leer la respuesta). Se compara en tiempo constante (sobre los
  SHA-256, como `x-fondo-secret`).
- `GANCHO_SECRET` es un Secret del Worker `kinkyvibe` (el mismo valor en la app de Gancho), de 16
  caracteres o más. Sin él (o más corto), **todo `/api/gancho/*` contesta 404**.
- Header que falta o no coincide: **401**, sin cuerpo.

## Qué formularios sirve

Solo formularios comunes (`/formularios/<dirección>`, no encuestas ni plantillas), no borrados y
con **al menos una pregunta «Foto»**. Cualquier otro: 404. Así el secreto no abre los demás
formularios del sitio.

## `GET /api/gancho/formularios/<dirección>/respuestas`

Todas las respuestas del formulario, de la más vieja a la más nueva, en JSON, con
`cache-control: private, no-store`.

**Quién respondió.** La app necesita identificar a las personas para armar los matches, así que
cada respuesta trae `name`, `pronouns` y `email`: los que guarda el formulario (los que escribió la
persona en uno «Cualquiera con el link», el mail de la cuenta en uno «Con cuenta», los de la compra
en uno «Quienes tenían entrada»). Van **solo si la privacidad de hoy deja verlos**, la misma regla
que el panel: en un formulario «Anónimo», o en una respuesta que marcó «Responder anónimamente»,
van `null` y `anonymous: true` (este sitio nunca guardó quién era). Para Gancho, el formulario
tiene que ser «Con nombre» (o «Que cada persona elija», sabiendo que las anónimas no se pueden
emparejar).

Ejemplo (datos inventados):

```json
{
	"form": {
		"slug": "gancho-facil",
		"title": "Gancho Fácil",
		"privacy": "named",
		"open": true,
		"questions": [
			{ "id": "p1", "label": "¿Cómo te dicen?", "kind": "short", "required": true },
			{ "id": "p2", "label": "Tu foto", "kind": "photo", "required": true },
			{
				"id": "p3",
				"label": "¿Qué buscás?",
				"kind": "multi",
				"required": false,
				"options": ["Charla", "Juego", "Amistad"]
			}
		]
	},
	"responses": [
		{
			"id": 42,
			"createdAt": "2026-11-25T18:03:12.000Z",
			"day": "2026-11-25",
			"anonymous": false,
			"name": "Persona Demo",
			"pronouns": "elle",
			"email": "demo@example.com",
			"ticket": null,
			"answers": [
				{ "id": "p1", "label": "¿Cómo te dicen?", "kind": "short", "value": "Demo" },
				{
					"id": "p2",
					"label": "Tu foto",
					"kind": "photo",
					"value": "/api/gancho/formularios/gancho-facil/fotos/42/p2"
				},
				{ "id": "p3", "label": "¿Qué buscás?", "kind": "multi", "value": "Charla | Juego" }
			]
		}
	]
}
```

- `id`: el id de la respuesta (número, estable).
- `ticket`: de qué entrada es la respuesta, si llegó por el link personal de un formulario
  «Quienes tenían entrada» (un link por entrada, [formularios.md](formularios.md#el-link-personal))
  y quién respondió se ve: `{ "order": "KV-1A2B3C4D", "number": 2, "holderName": "Persona Demo" }`.
  `order` es la referencia corta de la compra (la que ve quien compró), `number` el número de
  entrada dentro de la compra (1, 2…; las de antes de los links por entrada son la 1) y
  `holderName` el titular de hoy de esa entrada (`null` si la entrada ya no existe). En la entrada
  1, `name` es el de quien compró; en las demás, el del titular; `email` es siempre el de la
  compra. En cualquier otro caso, `null`.
- `createdAt`: ISO 8601 en UTC, o `null` en una anónima (no se guarda la hora); `day`: el día en
  Argentina (`aaaa-mm-dd`), siempre.
- `answers`: solo las preguntas respondidas, en el orden del formulario cuando se respondió. Cada
  una con `id` y `label` de la pregunta como estaba, `kind` (el de hoy; `null` si la pregunta ya
  no está, salvo una foto) y `value` como se guarda: texto; «Varias opciones» separadas por
  `" | "`; un número con punto; una fecha `aaaa-mm-dd`; una casilla `"Sí"`; un puntaje `"1"`–`"5"`.
- Una **foto** (`kind: "photo"`): `value` es la dirección **relativa** de la foto en esta API (ver
  abajo), nunca una dirección pública. Para pedirla hace falta el mismo header.
- `kind` puede ser `text`, `short`, `choice`, `multi`, `select`, `checkbox`, `rating`, `number`,
  `date` o `photo`.

## `GET /api/gancho/formularios/<dirección>/fotos/<respuesta>/<pregunta>`

Los bytes de la foto: `200` con `content-type` (`image/jpeg`, `image/png`, `image/webp`,
`image/gif` o `image/avif`), `content-length`, `cache-control: private, no-store` y
`x-content-type-options: nosniff`. La foto ya no tiene metadatos (sin GPS ni datos del celu).

404 si el formulario no se sirve, la respuesta no es de ese formulario, la pregunta no es una foto
de esa respuesta o el archivo no está.

## Códigos

| Código | Cuándo                                                                  |
| ------ | ----------------------------------------------------------------------- |
| 200    | Bien.                                                                   |
| 401    | Falta `x-gancho-secret` o no coincide.                                  |
| 404    | `GANCHO_SECRET` no configurado, o el formulario/respuesta/foto no está. |
| 503    | No hay base de datos.                                                   |

## Lo que no hace

- No borra nada: ni las respuestas ni las fotos se borran solas (gorrite, 24/11). Se borran a mano
  si hace falta.
- No pagina: devuelve todas las respuestas de una vez (un evento tiene decenas o pocos cientos).
- No escribe: la app de Gancho no puede cambiar respuestas.
