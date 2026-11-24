/**
 * Subir a la biblioteca desde el conector de Claude (docs/conector-claude.md, «Subir a la
 * biblioteca»; docs/imagenes.md). gorrite, 24/11: que el asistente del equipo pueda poner imágenes
 * y archivos en la biblioteca y después usarlos, sin abrir el panel.
 *
 * - **El mismo camino que el panel**: `storeImage` y `storeFile` (src/lib/server/media/library.js),
 *   con el tipo real sacado de los bytes (media/sniff.js, nunca del nombre), los mismos pesos
 *   máximos (imágenes 10 MB, documentos y video 25 MB), sin metadatos, con clave por contenido (los
 *   mismos bytes dos veces son la misma imagen: reintentar no duplica nada) y las copias chicas
 *   validadas igual que las del navegador (`validCopy`).
 * - **Subir solo suma a la biblioteca**: nada público cambia hasta que algo la usa, y usarla sigue
 *   siendo `editar_objeto` con `vista_previa` y `aplicar`. Por eso no hay vista previa; cada subida
 *   queda en Actividad con quién la pidió (como `aplicar`) y en `created_by` («rutina «…» (@login) ·
 *   pedido por Mel»).
 * - **Quién**: solo con permiso de cambiar (una llave para rutinas o una conexión con `edicion`) y
 *   los dos interruptores prendidos ({@link requireEditing}). Borrar, solo desde el panel.
 * - **Tope por día**: {@link UPLOAD_CAPS} (30 subidas y 200 MB en 24 horas) por llave (o por admin,
 *   con una conexión de claude.ai), en `rate_limits` (media/uploadCap.js, el de las cuentas).
 * - **Nunca va a buscar nada a otra dirección** (nada de SSRF): los bytes llegan en el pedido, en
 *   base64 (`subir_imagen`, `subir_archivo`, hasta {@link INLINE_MAX_BYTES}) o con un PUT a una
 *   dirección firmada que da `pedir_subida` (hasta el máximo del panel) y después
 *   `confirmar_subida`.
 * - **El lado largo de una imagen, hasta {@link MAX_IMAGE_SIDE} px** (lo que hace el navegador al
 *   subir). El Worker no achica ni hace las copias de 360 y 720 px (no tiene con qué sin gastar el
 *   cupo de transformaciones, que gorrite descartó para esto): las manda quien sube, o la tarjeta
 *   usa la original (la dirección de la copia redirige) hasta la pasada de scripts/copias-chicas.js.
 */
import { adminById } from './oauth.js';
import { claudeLabel, cleanConfirmedBy, cleanRequest, requireEditing } from './cambios.js';
import { ToolInputError } from './tools.js';
import { getObject } from '$lib/server/objects/read.js';
import { storedSecret } from '$lib/server/signedLinks.js';
import { timingSafeEqual } from '$lib/server/hash.js';
import { foldText } from '$lib/utils/text.js';
import {
	FILE_TYPE,
	IMAGE_TYPE,
	ImageError,
	MAX_FILE_BYTES,
	MAX_UPLOAD_BYTES,
	findLibraryObject,
	libraryItem,
	libraryUses,
	searchLibrary,
	storeFile,
	storeImage,
	useText
} from '$lib/server/media/library.js';
import { mediaPath, sniffDocument, sniffImage } from '$lib/server/media/sniff.js';
import {
	UPLOAD_CAPS,
	uploadBytesAllowed,
	uploadCountAllowed
} from '$lib/server/media/uploadCap.js';
import { COPY_SIDES, MAX_COPY_BYTES, copyKey } from '$lib/utils/mediaCopies.js';
import { fromBase64, fromBase64url, toBase64url } from '$lib/utils/base64.js';

/** @typedef {import('./tools.js').ToolContext} ToolContext */
/** @typedef {import('./tools.js').ToolOutput} ToolOutput */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */
/** @typedef {import('@cloudflare/workers-types').R2Bucket} R2Bucket */

/** Lo que se sube: una imagen (objeto `imagen`) o un documento o video (objeto `archivo`). */
export const LIBRARY_TYPES = Object.freeze([IMAGE_TYPE, FILE_TYPE]);

/** El archivo en base64 dentro del pedido (`contenido`), como mucho (decodificado). */
export const INLINE_MAX_BYTES = 1024 * 1024;

/**
 * Tope de un mensaje a `/mcp` (src/routes/mcp/+server.js): el archivo en base64 (4/3 de
 * {@link INLINE_MAX_BYTES}), sus copias chicas y el resto del pedido.
 */
export const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;

/** El lado más largo de una imagen, como mucho (el navegador del panel la achica a esto). */
export const MAX_IMAGE_SIDE = 2000;

/** Cuánto vale la dirección para el PUT de `pedir_subida`. */
export const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;

/**
 * Cuánto queda lo subido con el PUT esperando `confirmar_subida` (y la marca de que ya se
 * confirmó, para que reintentar devuelva lo mismo). Después se borra.
 */
export const UPLOAD_KEEP_MS = 60 * 60 * 1000;

/** Dónde espera en R2 lo subido con el PUT (fuera de `img/` y `file/`: ni copia ni bloqueo). */
const TEMP_PREFIX = 'subidas/';

/** Fila de `ticket_settings` con la clave que firma las direcciones de subida. */
const UPLOAD_KEY_SETTING = 'mcp_subidas_clave';

/** Cuántas se borran, como mucho, en cada limpieza de lo que quedó sin confirmar. */
const CLEANUP_BATCH = 100;

const MB = 1024 * 1024;

/** @param {number} bytes */
const mbText = (bytes) => `${(bytes / MB).toFixed(1).replace('.', ',')} MB`;

/** Las partes que se pueden subir con el PUT: el archivo y, de una imagen, sus copias. */
export const UPLOAD_PARTS = Object.freeze(['original', ...COPY_SIDES.map(String)]);

/** El tope del día: por llave (una rutina) o por admin (una conexión de claude.ai). @param {ToolContext} ctx */
const capId = (ctx) =>
	ctx.via === 'llave' && ctx.llave
		? `conector:llave:${ctx.llave.id}`
		: `conector:admin:${ctx.user.id}`;

/** @param {ToolContext} ctx */
const capMessage = (ctx) =>
	`Llegaste al tope de subidas del conector: ${UPLOAD_CAPS.count.limit} por día y ${UPLOAD_CAPS.megabytes.limit} MB en las últimas 24 horas${ctx.via === 'llave' ? ', por llave' : ''}. Probá más tarde, o subilo desde el panel (Contenido → Biblioteca).`;

/**
 * Quién subió, para `created_by` del objeto: la rutina (o Claude), le admin dueñe de la llave o de
 * la conexión y quién lo pidió. Por ejemplo «rutina «Asistente» (@login) · pedido por Mel».
 * @param {ToolContext} ctx
 * @param {string | null} confirmedBy
 */
export function uploaderLabel(ctx, confirmedBy) {
	const who = ctx.via === 'llave' && ctx.llave?.name ? `rutina «${ctx.llave.name}»` : 'Claude';
	return `${who} (@${ctx.user.login})${confirmedBy ? ` · pedido por ${confirmedBy}` : ''}`;
}

/** Texto de una línea, sin caracteres de control. @param {unknown} v @param {number} max */
function oneLine(v, max) {
	return typeof v === 'string'
		? v
				// eslint-disable-next-line no-control-regex -- sacar caracteres de control es la idea
				.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, max)
				.trim()
		: '';
}

/** El nombre (obligatorio) y el texto alternativo de lo que se sube. @param {Record<string, unknown>} args */
function namesOf(args) {
	const nombre = oneLine(args.nombre, 200);
	if (!nombre)
		throw new ToolInputError(
			'Falta `nombre`: es el nombre en la biblioteca, con el que se busca (y el que se ve en el enlace de un archivo).'
		);
	return { nombre, alt: oneLine(args.alt, 500) };
}

/**
 * Los bytes de un `contenido` en base64 (con o sin `data:…;base64,`; también base64url). Nunca una
 * dirección: no se va a buscar nada a otro lado.
 * @param {unknown} raw
 * @param {string} field
 * @param {number} max
 */
export function decodeContent(raw, field, max) {
	const text = typeof raw === 'string' ? raw.trim() : '';
	if (!text) throw new ToolInputError(`Falta \`${field}\` (el archivo en base64).`);
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || text.startsWith('//')) {
		throw new ToolInputError(
			'No bajo archivos de otras direcciones: mandá los bytes en base64 en `contenido`, o pedí una dirección para subirlo con `pedir_subida`.'
		);
	}
	const b64 = text.replace(/^data:[^,]{0,100};base64,/i, '').replace(/\s+/g, '');
	// Antes de decodificar: 4 caracteres de base64 son 3 bytes.
	if (Math.floor((b64.length * 3) / 4) - 2 > max) {
		throw new ToolInputError(
			`\`${field}\` pesa más de ${mbText(max)} (el máximo en un mensaje). Para algo más grande, usá \`pedir_subida\` y subilo con un PUT.`
		);
	}
	if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(b64)) {
		throw new ToolInputError(`\`${field}\` no es base64.`);
	}
	try {
		const bytes = fromBase64(b64.replace(/-/g, '+').replace(/_/g, '/'));
		if (!bytes.length) throw new ToolInputError(`\`${field}\` está vacío.`);
		if (bytes.length > max)
			throw new ToolInputError(
				`\`${field}\` pesa ${mbText(bytes.length)}: el máximo en un mensaje es ${mbText(max)}. Usá \`pedir_subida\`.`
			);
		return bytes;
	} catch (e) {
		if (e instanceof ToolInputError) throw e;
		throw new ToolInputError(`\`${field}\` no es base64.`);
	}
}

/**
 * ¿Se puede subir esto como `tipo`? El tipo sale de los bytes; el peso y las medidas, los del
 * panel. Devuelve el problema en palabras, o `null`. (El PUT lo mira antes de guardar nada, y
 * `storeImage`/`storeFile` lo vuelven a mirar al guardar.)
 * @param {'imagen' | 'archivo'} tipo
 * @param {Uint8Array} bytes
 * @returns {{ status: number, message: string } | null}
 */
export function uploadProblem(tipo, bytes) {
	if (!bytes.length) return { status: 400, message: 'Llegó vacío.' };
	if (tipo === IMAGE_TYPE) {
		const image = sniffImage(bytes);
		if (!image) {
			return sniffDocument(bytes)
				? {
						status: 415,
						message: 'Eso es un documento o un video, no una imagen: subilo con `subir_archivo`.'
					}
				: {
						status: 415,
						message:
							'No es una imagen JPG, PNG, WEBP, GIF o AVIF (se mira por los bytes, no por el nombre ni la extensión).'
					};
		}
		if (bytes.length > MAX_UPLOAD_BYTES) {
			return {
				status: 413,
				message: `La imagen pesa ${mbText(bytes.length)}. El máximo es ${MAX_UPLOAD_BYTES / MB} MB.`
			};
		}
		const side = Math.max(image.width ?? 0, image.height ?? 0);
		if (side > MAX_IMAGE_SIDE) {
			return {
				status: 413,
				message: `La imagen mide ${image.width} × ${image.height} px: el lado más largo puede tener hasta ${MAX_IMAGE_SIDE} px (como la achica el panel). Achicala (mejor en WEBP, calidad 85) y volvé a subirla.`
			};
		}
		return null;
	}
	if (!sniffDocument(bytes)) {
		return sniffImage(bytes)
			? { status: 415, message: 'Eso es una imagen: subila con `subir_imagen`.' }
			: {
					status: 415,
					message:
						'No es un PDF, un video MP4 o WebM, ni un documento ODT, ODS u ODP (se mira por los bytes, no por el nombre ni la extensión).'
				};
	}
	if (bytes.length > MAX_FILE_BYTES) {
		return {
			status: 413,
			message: `El archivo pesa ${mbText(bytes.length)}. El máximo es ${MAX_FILE_BYTES / MB} MB: achicalo o subilo a otro lado y poné el link.`
		};
	}
	return null;
}

/** El bucket de la biblioteca, o un error claro. @param {ToolContext} ctx */
function bucketOf(ctx) {
	const bucket = /** @type {R2Bucket | undefined} */ (ctx.platform?.env?.MEDIA);
	if (!bucket) throw new ToolInputError('Este sitio todavía no tiene dónde guardar la biblioteca.');
	return bucket;
}

/** Una dirección absoluta del sitio. @param {ToolContext} ctx @param {string} path */
const absolute = (ctx, path) => `${ctx.origin}${path}`;

/** La miniatura de una imagen: su copia de 360 px (redirige a la original si no está). @param {string} key */
const thumbPath = (key) => mediaPath(copyKey(key, 360) || key);

/**
 * ¿Qué copias chicas tiene una imagen en R2? (Un GIF no tiene.)
 * @param {R2Bucket | undefined} bucket
 * @param {string} key
 * @returns {Promise<number[] | null>} los lados, o `null` si no se puede saber
 */
async function copiesOf(bucket, key) {
	if (!bucket) return null;
	const sides = [];
	for (const side of COPY_SIDES) {
		const k = copyKey(key, side);
		if (k && (await bucket.head(k).catch(() => null))) sides.push(side);
	}
	return sides;
}

/** Un uso de la biblioteca para Claude. @param {import('$lib/server/media/library.js').LibraryUse} u */
const useForClaude = (u) =>
	u.hidden ? useText(u) : { tipo: u.type, slug: u.slug, titulo: u.title };

/**
 * Algo de la biblioteca como lo ve Claude: id (para `editar_objeto` con `imagen`), slug (el hash),
 * nombre, direcciones absolutas, peso y, de una imagen, texto alternativo, medidas y miniatura.
 * @param {ToolContext} ctx
 * @param {import('$lib/server/media/library.js').LibraryItem} item
 */
export function itemForClaude(ctx, item) {
	const slug = item.key.split('/')[1]?.slice(0, 64) ?? '';
	const common = {
		tipo: item.kind === 'imagen' ? IMAGE_TYPE : FILE_TYPE,
		id: item.id,
		slug,
		titulo: item.title,
		clase: item.typeLabel,
		url: absolute(ctx, item.url),
		peso: mbText(item.size),
		bytes: item.size
	};
	if (item.kind !== 'imagen') {
		return {
			...common,
			...(item.originalName ? { nombre_original: item.originalName } : {}),
			// Un texto lo enlaza por su dirección: `[Nombre](/media/file/<hash>.pdf)`.
			enlace_markdown: `[${item.title}](${item.url})`
		};
	}
	return {
		...common,
		alt: item.alt,
		...(item.width && item.height ? { medidas: `${item.width} × ${item.height} px` } : {}),
		miniatura: absolute(ctx, thumbPath(item.key))
	};
}

/**
 * Guarda lo subido por el mismo camino que el panel y arma la respuesta y la línea de Actividad.
 * @param {ToolContext} ctx
 * @param {{ tipo: 'imagen' | 'archivo', bytes: Uint8Array, nombre: string, alt: string,
 *   copies?: { side: number, bytes: Uint8Array }[], confirmedBy: string | null,
 *   request: string | null, via: 'mensaje' | 'put' }} up
 * @returns {Promise<ToolOutput>}
 */
async function storeUpload(ctx, up) {
	const problem = uploadProblem(up.tipo, up.bytes);
	if (problem) throw new ToolInputError(problem.message);
	const bucket = bucketOf(ctx);
	const total = (up.copies ?? []).reduce((n, c) => n + c.bytes.length, up.bytes.length);
	if (!(await uploadBytesAllowed(ctx.db, capId(ctx), total, ctx.now))) {
		throw new ToolInputError(capMessage(ctx));
	}
	const actor = uploaderLabel(ctx, up.confirmedBy);
	/** @type {import('$lib/server/media/library.js').LibraryItem} */
	let item;
	let created;
	try {
		if (up.tipo === IMAGE_TYPE) {
			const r = await storeImage(
				ctx.db,
				bucket,
				{ bytes: up.bytes, title: up.nombre, alt: up.alt, copies: up.copies ?? [] },
				{ actor, now: ctx.now }
			);
			const o = await findLibraryObject(ctx.db, r.image.id);
			if (!o) throw new Error('la imagen recién guardada no está');
			item = libraryItem(o);
			created = r.created;
		} else {
			const r = await storeFile(
				ctx.db,
				bucket,
				{ bytes: up.bytes, title: up.nombre },
				{ actor, now: ctx.now }
			);
			item = r.file;
			created = r.created;
		}
	} catch (e) {
		if (e instanceof ImageError) throw new ToolInputError(e.message);
		throw e;
	}
	return uploadResult(ctx, { item, created, up });
}

/**
 * La respuesta de una subida (y su línea de Actividad).
 * @param {ToolContext} ctx
 * @param {{ item: import('$lib/server/media/library.js').LibraryItem, created: boolean,
 *   up: { tipo: 'imagen' | 'archivo', alt: string, confirmedBy: string | null,
 *   request: string | null, via: 'mensaje' | 'put' } }} r
 * @returns {Promise<ToolOutput>}
 */
async function uploadResult(ctx, { item, created, up }) {
	const isImage = up.tipo === IMAGE_TYPE;
	const avisos = [];
	if (!created) {
		avisos.push(
			`Ya estaba en la biblioteca (los mismos bytes), con su nombre de antes: «${item.title}». No se duplicó.`
		);
	}
	/** @type {number[] | null} */
	let copias = null;
	if (isImage && item.kind === 'imagen') {
		copias = item.mime === 'image/gif' ? [] : await copiesOf(bucketOf(ctx), item.key);
		if (item.mime !== 'image/gif' && copias && copias.length < COPY_SIDES.length) {
			avisos.push(
				'Sin las copias chicas de 360 y 720 px (el sitio no las hace solo): las tarjetas usan la original hasta que corra la pasada de copias (scripts/copias-chicas.js). Para que estén ya, mandá `copia_360` y `copia_720` (WEBP, calidad 80, el lado más corto en 360 y 720 px) la próxima vez que subas una imagen nueva.'
			);
		}
		if (!item.alt) {
			avisos.push(
				'Sin texto alternativo (lo leen quienes usan lector de pantalla): volvé a subir los mismos bytes con `alt` para sumarlo.'
			);
		}
	}
	const what = isImage ? 'la imagen' : 'el archivo';
	return {
		result: {
			subido: true,
			nuevo: created,
			...itemForClaude(ctx, item),
			...(copias ? { copias_chicas: copias } : {}),
			avisos,
			para_usar: isImage
				? `\`vista_previa\` con \`operacion: editar_objeto\` y \`cambios: { imagen: "${item.id}" }\` (la portada de un evento o un material, o la imagen de un perfil), y después \`aplicar\`.`
				: `Enlazalo en el texto de un material con \`editar_objeto\` (\`descripcion\`): [${item.title}](${item.url}).`
		},
		log: {
			summary: `${claudeLabel(up.confirmedBy)}: subió ${what} «${item.title}» a la biblioteca${created ? '' : ' (ya estaba)'}`,
			targetType: 'library',
			targetId: String(item.id),
			detail: {
				tipo: up.tipo,
				id: item.id,
				bytes: item.size,
				nuevo: created,
				via: up.via,
				...(copias ? { copias } : {}),
				confirmado_por: up.confirmedBy,
				// Sin el texto del pedido (puede tener datos de alguien): solo su largo, como `aplicar`.
				pedido_largo: up.request ? up.request.length : 0
			}
		}
	};
}

/** Las copias chicas en base64 de `subir_imagen`. @param {Record<string, unknown>} args */
function inlineCopies(args) {
	/** @type {{ side: number, bytes: Uint8Array }[]} */
	const copies = [];
	for (const side of COPY_SIDES) {
		const raw = args[`copia_${side}`];
		if (raw === undefined || raw === null || raw === '') continue;
		copies.push({ side, bytes: decodeContent(raw, `copia_${side}`, MAX_COPY_BYTES) });
	}
	return copies;
}

// ---------------------------------------------------------------------------------------------
// Subir en dos pasos: una dirección firmada para el PUT y después `confirmar_subida`.

/**
 * @typedef {{ v: 1, a: number, t: 'imagen' | 'archivo', n: string, e: number, nm: string,
 *   al?: string, cb?: string }} UploadClaims
 *   `a`: le admin; `t`: el tipo; `n`: al azar (la clave en R2); `e`: hasta cuándo vale el PUT;
 *   `nm`, `al`, `cb`: nombre, texto alternativo y quién lo pidió (firmados: no se cambian en el medio).
 */

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} payload
 */
async function signPayload(db, payload) {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(await storedSecret(db, UPLOAD_KEY_SETTING)),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
	return toBase64url(new Uint8Array(sig));
}

/**
 * La ficha firmada de una subida (va en la dirección del PUT y en `confirmar_subida`).
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {UploadClaims} claims
 */
export async function makeUploadToken(db, claims) {
	const payload = toBase64url(JSON.stringify(claims));
	return `${payload}.${await signPayload(db, payload)}`;
}

/**
 * La ficha de una subida si la firma vale (sin mirar si venció), o `null`.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {unknown} token
 * @returns {Promise<UploadClaims | null>}
 */
export async function readUploadToken(db, token) {
	if (typeof token !== 'string' || token.length > 4000) return null;
	const m = /^([A-Za-z0-9_-]{10,})\.([A-Za-z0-9_-]{43})$/.exec(token);
	if (!m) return null;
	if (!timingSafeEqual(await signPayload(db, m[1]), m[2])) return null;
	const raw = fromBase64url(m[1]);
	if (!raw) return null;
	try {
		const c = JSON.parse(new TextDecoder().decode(raw));
		if (
			c?.v !== 1 ||
			!Number.isSafeInteger(c.a) ||
			!LIBRARY_TYPES.includes(c.t) ||
			typeof c.n !== 'string' ||
			!/^[A-Za-z0-9_-]{16,64}$/.test(c.n) ||
			!Number.isSafeInteger(c.e) ||
			typeof c.nm !== 'string'
		)
			return null;
		return /** @type {UploadClaims} */ (c);
	} catch {
		return null;
	}
}

/** Dónde espera en R2 una parte subida con el PUT. @param {string} nonce @param {string} part */
export const tempKey = (nonce, part) =>
	`${TEMP_PREFIX}${nonce}${part === 'original' ? '' : `-${part}`}`;

/**
 * El tope de una parte del PUT.
 * @param {'imagen' | 'archivo'} tipo
 * @param {string} part
 */
export const partMax = (tipo, part) =>
	part !== 'original' ? MAX_COPY_BYTES : tipo === IMAGE_TYPE ? MAX_UPLOAD_BYTES : MAX_FILE_BYTES;

/**
 * Recibe una parte con el PUT (src/routes/mcp/subida/[token]/+server.js): mira la firma, el
 * vencimiento, que le admin siga siéndolo, el tipo real y el peso, y la deja en R2 esperando
 * `confirmar_subida`. Cada parte, una sola vez.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {R2Bucket | undefined} bucket
 * @param {{ token: string, part: string | null, bytes: (max: number) => Promise<Uint8Array | null>,
 *   now?: number }} req `bytes`: lee el cuerpo con ese tope ({@link partMax}; `null` si pasa)
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function receiveUploadPart(db, bucket, { token, part, bytes, now = Date.now() }) {
	const claims = await readUploadToken(db, token);
	if (!claims || claims.e < now || !adminById(claims.a)) {
		return {
			status: 403,
			body: {
				error:
					'Esta dirección de subida no vale o venció (dura 15 minutos). Pedí otra con `pedir_subida`.'
			}
		};
	}
	const which = part ?? 'original';
	if (!UPLOAD_PARTS.includes(which) || (which !== 'original' && claims.t !== IMAGE_TYPE)) {
		return {
			status: 400,
			body: { error: '`parte` es `360` o `720` (las copias chicas de una imagen), o nada.' }
		};
	}
	if (!bucket)
		return { status: 503, body: { error: 'Este sitio todavía no tiene dónde guardar.' } };
	const key = tempKey(claims.n, which);
	if (await bucket.head(key)) {
		return {
			status: 409,
			body: { error: 'Eso ya llegó. Seguí con `confirmar_subida` (con la misma `subida`).' }
		};
	}
	const max = partMax(claims.t, which);
	const body = await bytes(max);
	if (!body) {
		return {
			status: 413,
			body: { error: `Pesa más de ${max / MB} MB, el máximo para esto.` }
		};
	}
	if (which === 'original') {
		const problem = uploadProblem(claims.t, body);
		if (problem) return { status: problem.status, body: { error: problem.message } };
	} else if (sniffImage(body)?.mime !== 'image/webp') {
		return { status: 415, body: { error: 'Una copia chica tiene que ser WEBP.' } };
	}
	await bucket.put(key, body, { customMetadata: { tipo: claims.t } });
	return {
		status: 201,
		body: {
			recibido: true,
			parte: which,
			bytes: body.length,
			siguiente:
				which === 'original' && claims.t === IMAGE_TYPE
					? 'Si tenés las copias chicas, subilas con `?parte=360` y `?parte=720`; después, `confirmar_subida` con la misma `subida`.'
					: 'Ahora `confirmar_subida` con la misma `subida`.'
		}
	};
}

/**
 * Borra lo subido con el PUT que pasó de {@link UPLOAD_KEEP_MS} (confirmado o no). Nunca tira: si
 * falla, queda para la próxima.
 * @param {R2Bucket} bucket
 * @param {number} now
 */
export async function cleanupUploads(bucket, now) {
	try {
		const page = await bucket.list({ prefix: TEMP_PREFIX, limit: CLEANUP_BATCH });
		const old = page.objects
			.filter((o) => now - new Date(o.uploaded).getTime() > UPLOAD_KEEP_MS)
			.map((o) => o.key);
		if (old.length) await bucket.delete(old);
	} catch (e) {
		console.log('conector: no se pudieron limpiar las subidas viejas', e);
	}
}

// ---------------------------------------------------------------------------------------------
// Buscar y leer la biblioteca (`buscar` y `leer` con `tipo: imagen` o `archivo`, ./tools.js).

/**
 * `buscar` en la biblioteca: por nombre (y texto alternativo de las imágenes); sin texto, lo más
 * nuevo. Cada cosa con su miniatura (las imágenes) y dónde se usa.
 * @param {ToolContext} ctx
 * @param {{ texto: string, tipo: 'imagen' | 'archivo', limite: number }} q
 * @returns {Promise<ToolOutput>}
 */
export async function searchLibraryForClaude(ctx, { texto, tipo, limite }) {
	const viewer = adminViewer(ctx);
	const found = await searchLibrary(ctx.db, {
		q: texto,
		kind: tipo === IMAGE_TYPE ? 'imagen' : 'archivo',
		viewer,
		limit: Math.min(limite, 50)
	});
	const uses = await libraryUses(
		ctx.db,
		found.map((i) => i.id),
		viewer
	);
	const items = found.map((i) => ({
		...itemForClaude(ctx, i),
		usos: (uses.get(i.id) ?? []).map(useForClaude)
	}));
	return {
		result: { resultados: items, total: items.length },
		log: {
			summary: `Claude: buscó «${texto}» en la biblioteca (${tipo}): ${items.length} resultados`,
			detail: { texto, tipo }
		}
	};
}

/** @param {ToolContext} ctx */
const adminViewer = (ctx) =>
	/** @type {import('$lib/server/objects/visibility.js').Viewer} */ ({
		role: 'admin',
		id: ctx.user.login
	});

/**
 * Cómo se nombra algo de la biblioteca en un pedido: su id (el número que da `subir_imagen`), su
 * slug (el SHA-256), su dirección (`/media/img/<hash>.webp`, también la de una copia) o, si no,
 * su nombre.
 * @param {string} q
 * @returns {{ id: number } | { slug: string } | null}
 */
export function libraryRef(q) {
	if (/^\d{1,15}$/.test(q)) return { id: Number(q) };
	const m = /(?:^|\/)(?:img|file)\/([0-9a-f]{64})(?:-\d+)?\.[a-z0-9]{2,5}$/.exec(q);
	if (m) return { slug: m[1] };
	if (/^[0-9a-f]{64}$/.test(q)) return { slug: q };
	return null;
}

/**
 * Una imagen o un archivo (vivo) por id, slug, dirección o nombre: `{ object }` u `{ options }`.
 * @param {ToolContext} ctx
 * @param {string} query
 * @param {'imagen' | 'archivo'} tipo
 * @returns {Promise<{ object?: StoredObject, options?: Record<string, unknown>[] }>}
 */
export async function resolveLibraryObject(ctx, query, tipo) {
	const viewer = adminViewer(ctx);
	const ref = libraryRef(query);
	if (ref && 'id' in ref) {
		const o = await findLibraryObject(ctx.db, ref.id);
		if (o && o.type === tipo && o.deleted_at === null) return { object: o };
	}
	if (ref && 'slug' in ref) {
		const o = await getObject(ctx.db, { type: tipo, slug: ref.slug }, viewer);
		if (o) return { object: o };
	}
	const found = await searchLibrary(ctx.db, {
		q: query,
		kind: tipo === IMAGE_TYPE ? 'imagen' : 'archivo',
		viewer,
		limit: 10
	});
	const f = foldText(query);
	const exact = found.filter((i) => foldText(i.title) === f);
	const one = exact.length === 1 ? exact[0] : found.length === 1 ? found[0] : null;
	if (one) {
		const o = await findLibraryObject(ctx.db, one.id);
		if (o) return { object: o };
	}
	return {
		options: (exact.length > 1 ? exact : found).map((i) => ({
			tipo,
			id: i.id,
			titulo: i.title,
			url: absolute(ctx, i.url)
		}))
	};
}

/**
 * `leer` una imagen o un archivo: nombre, texto alternativo, peso, medidas, sus copias chicas,
 * quién y cuándo la subió y dónde se usa.
 * @param {ToolContext} ctx
 * @param {string} nombre
 * @param {'imagen' | 'archivo'} tipo
 * @returns {Promise<ToolOutput>}
 */
export async function readLibraryForClaude(ctx, nombre, tipo) {
	const r = await resolveLibraryObject(ctx, nombre, tipo);
	if (!r.object) {
		return {
			result: {
				encontrado: false,
				mensaje: r.options?.length
					? 'Hay varias que coinciden: volvé a pedir con el id o el slug.'
					: `No encontré ${tipo === IMAGE_TYPE ? 'ninguna imagen' : 'ningún archivo'} con ese nombre en la biblioteca.`,
				opciones: r.options ?? []
			},
			log: {
				summary: `Claude: buscó para leer «${nombre}» en la biblioteca (sin uno solo)`,
				detail: { nombre, tipo }
			}
		};
	}
	const o = r.object;
	const item = libraryItem(o);
	const [uses, copias] = await Promise.all([
		libraryUses(ctx.db, [o.id], adminViewer(ctx)),
		item.kind === 'imagen' && item.mime !== 'image/gif'
			? copiesOf(/** @type {R2Bucket | undefined} */ (ctx.platform?.env?.MEDIA), item.key)
			: Promise.resolve(null)
	]);
	return {
		result: {
			encontrado: true,
			...itemForClaude(ctx, item),
			...(copias ? { copias_chicas: copias } : {}),
			creado: { cuando: new Date(o.created_at).toISOString(), por: o.created_by },
			usos: (uses.get(o.id) ?? []).map(useForClaude)
		},
		log: {
			summary: `Claude: leyó ${tipo === IMAGE_TYPE ? 'la imagen' : 'el archivo'} «${o.title}» de la biblioteca`,
			targetType: 'library',
			targetId: String(o.id)
		}
	};
}

// ---------------------------------------------------------------------------------------------
// Las herramientas.

const ANNOTATIONS = Object.freeze({
	readOnlyHint: false,
	// Solo suma a la biblioteca: nada público cambia hasta que algo la usa.
	destructiveHint: false,
	// Los mismos bytes dos veces son la misma imagen.
	idempotentHint: true,
	openWorldHint: false
});

/** Las entradas de quién lo pidió (como en `aplicar`). */
const WHO_PROPERTIES = {
	confirmado_por: {
		type: 'string',
		maxLength: 40,
		description:
			'Quién del equipo pidió la subida (un nombre). Queda en Actividad y en quién la subió.'
	},
	pedido: {
		type: 'string',
		maxLength: 500,
		description: 'El pedido original, en palabras (no se guarda: solo su largo).'
	}
};

const NOMBRE = {
	type: 'string',
	maxLength: 200,
	description:
		'El nombre en la biblioteca (con el que se busca), p. ej. «Flyer fiesta de diciembre».'
};

const ALT = {
	type: 'string',
	maxLength: 500,
	description:
		'Texto alternativo: qué se ve en la imagen (lo leen quienes usan lector de pantalla). Muy recomendado.'
};

/** @type {Record<string, { definition: Record<string, unknown>, annotations: Record<string, boolean>, run: (ctx: ToolContext, args: Record<string, unknown>) => Promise<ToolOutput> }>} */
export const LIBRARY_TOOLS = {
	subir_imagen: {
		definition: {
			name: 'subir_imagen',
			title: 'Subir una imagen a la biblioteca',
			description:
				'Sube una imagen (JPG, PNG, WEBP, GIF o AVIF; el tipo se mira por los bytes) a la ' +
				`biblioteca, con los bytes en base64 en \`contenido\` (hasta ${INLINE_MAX_BYTES / MB} MB; ` +
				'más grande, `pedir_subida`). El lado más largo, hasta ' +
				`${MAX_IMAGE_SIDE} px. Solo suma a la biblioteca: nada público cambia hasta que la usás ` +
				'con `vista_previa` y `aplicar` (`editar_objeto`, `cambios: { imagen: <id> }`). Los ' +
				'mismos bytes dos veces son la misma imagen (reintentar es seguro). Opcional: ' +
				'`copia_360` y `copia_720`, sus copias chicas para las tarjetas (WEBP calidad 80, el ' +
				'lado más corto en 360 y 720 px); sin ellas, las tarjetas usan la original hasta la ' +
				`pasada de copias. Tope: ${UPLOAD_CAPS.count.limit} subidas y ` +
				`${UPLOAD_CAPS.megabytes.limit} MB por día. Devuelve id, slug, nombre, url, miniatura y peso.`,
			inputSchema: {
				type: 'object',
				properties: {
					contenido: { type: 'string', description: 'La imagen en base64 (sin saltos de línea).' },
					nombre: NOMBRE,
					alt: ALT,
					copia_360: {
						type: 'string',
						description: 'Opcional: la copia WEBP con el lado más corto en 360 px, en base64.'
					},
					copia_720: {
						type: 'string',
						description: 'Opcional: la copia WEBP con el lado más corto en 720 px, en base64.'
					},
					...WHO_PROPERTIES
				},
				required: ['contenido', 'nombre'],
				additionalProperties: false
			}
		},
		annotations: ANNOTATIONS,
		async run(ctx, args) {
			await requireEditing(ctx);
			const { nombre, alt } = namesOf(args);
			if (!(await uploadCountAllowed(ctx.db, capId(ctx), ctx.now)))
				throw new ToolInputError(capMessage(ctx));
			const bytes = decodeContent(args.contenido, 'contenido', INLINE_MAX_BYTES);
			return storeUpload(ctx, {
				tipo: IMAGE_TYPE,
				bytes,
				nombre,
				alt,
				copies: inlineCopies(args),
				confirmedBy: cleanConfirmedBy(args.confirmado_por),
				request: cleanRequest(args.pedido),
				via: 'mensaje'
			});
		}
	},

	subir_archivo: {
		definition: {
			name: 'subir_archivo',
			title: 'Subir un documento o un video a la biblioteca',
			description:
				'Sube un documento (PDF, ODT, ODS, ODP) o un video (MP4, WebM) a la biblioteca; el tipo ' +
				`se mira por los bytes. Con los bytes en base64 en \`contenido\` (hasta ${INLINE_MAX_BYTES / MB} ` +
				`MB); más grande (hasta ${MAX_FILE_BYTES / MB} MB, como el panel) y todo video, con ` +
				'`pedir_subida`. Solo suma a la biblioteca: un texto lo enlaza por su dirección ' +
				'(`[Nombre](/media/file/<hash>.pdf)`, con `editar_objeto`). Los mismos bytes dos veces ' +
				'son el mismo archivo.',
			inputSchema: {
				type: 'object',
				properties: {
					contenido: { type: 'string', description: 'El archivo en base64.' },
					nombre: {
						...NOMBRE,
						description: 'El nombre: es lo que se ve en el enlace y con lo que se busca.'
					},
					...WHO_PROPERTIES
				},
				required: ['contenido', 'nombre'],
				additionalProperties: false
			}
		},
		annotations: ANNOTATIONS,
		async run(ctx, args) {
			await requireEditing(ctx);
			const { nombre } = namesOf(args);
			if (!(await uploadCountAllowed(ctx.db, capId(ctx), ctx.now)))
				throw new ToolInputError(capMessage(ctx));
			const bytes = decodeContent(args.contenido, 'contenido', INLINE_MAX_BYTES);
			return storeUpload(ctx, {
				tipo: FILE_TYPE,
				bytes,
				nombre,
				alt: '',
				confirmedBy: cleanConfirmedBy(args.confirmado_por),
				request: cleanRequest(args.pedido),
				via: 'mensaje'
			});
		}
	},

	pedir_subida: {
		definition: {
			name: 'pedir_subida',
			title: 'Pedir una dirección para subir un archivo grande',
			description:
				'Primer paso para subir algo que no entra en un mensaje (más de ' +
				`${INLINE_MAX_BYTES / MB} MB, o un video): da una dirección firmada que vale 15 minutos ` +
				'para mandar los bytes con un PUT (`curl -T archivo -H "content-type: ' +
				'application/octet-stream" "<url>"`; de una imagen, también sus copias chicas con ' +
				'`?parte=360` y `?parte=720`). Después, `confirmar_subida` con la `subida` que da esta. ' +
				`Los mismos límites que el panel: imágenes hasta ${MAX_UPLOAD_BYTES / MB} MB y ` +
				`${MAX_IMAGE_SIDE} px de lado largo; documentos y video hasta ${MAX_FILE_BYTES / MB} MB.`,
			inputSchema: {
				type: 'object',
				properties: {
					tipo: {
						type: 'string',
						enum: [...LIBRARY_TYPES],
						description: '`imagen` o `archivo` (documento o video).'
					},
					nombre: NOMBRE,
					alt: { ...ALT, description: `${ALT.description} Solo para una imagen.` },
					...WHO_PROPERTIES
				},
				required: ['tipo', 'nombre'],
				additionalProperties: false
			}
		},
		annotations: { ...ANNOTATIONS, idempotentHint: false },
		async run(ctx, args) {
			await requireEditing(ctx);
			const tipo = args.tipo === IMAGE_TYPE || args.tipo === FILE_TYPE ? args.tipo : null;
			if (!tipo) throw new ToolInputError('`tipo` es `imagen` o `archivo`.');
			const { nombre, alt } = namesOf(args);
			const bucket = bucketOf(ctx);
			if (!(await uploadCountAllowed(ctx.db, capId(ctx), ctx.now)))
				throw new ToolInputError(capMessage(ctx));
			await cleanupUploads(bucket, ctx.now);
			const confirmedBy = cleanConfirmedBy(args.confirmado_por);
			const expires = ctx.now + UPLOAD_URL_TTL_MS;
			const token = await makeUploadToken(ctx.db, {
				v: 1,
				a: ctx.user.id,
				t: tipo,
				n: toBase64url(crypto.getRandomValues(new Uint8Array(18))),
				e: expires,
				nm: nombre,
				...(tipo === IMAGE_TYPE && alt ? { al: alt } : {}),
				...(confirmedBy ? { cb: confirmedBy } : {})
			});
			const url = absolute(ctx, `/mcp/subida/${token}`);
			return {
				result: {
					subida: token,
					url,
					metodo: 'PUT',
					vence: new Date(expires).toISOString(),
					maximo: mbText(partMax(tipo, 'original')),
					...(tipo === IMAGE_TYPE
						? { copias_chicas: { 360: `${url}?parte=360`, 720: `${url}?parte=720` } }
						: {}),
					como: `curl -T <archivo> -H "content-type: application/octet-stream" "${url}"`,
					siguiente: 'Después del PUT, `confirmar_subida` con esta `subida`.'
				},
				log: {
					summary: `${claudeLabel(confirmedBy)}: pidió una dirección para subir ${tipo === IMAGE_TYPE ? 'una imagen' : 'un archivo'} «${nombre}»`,
					targetType: 'library',
					detail: { tipo, confirmado_por: confirmedBy }
				}
			};
		}
	},

	confirmar_subida: {
		definition: {
			name: 'confirmar_subida',
			title: 'Confirmar una subida por PUT',
			description:
				'Segundo paso de `pedir_subida`: después del PUT, guarda en la biblioteca lo que ' +
				'llegó, con el nombre y el texto alternativo que se pidieron, por el mismo camino que ' +
				'el panel. Reintentar devuelve lo mismo. Devuelve id, slug, nombre, url, miniatura y peso.',
			inputSchema: {
				type: 'object',
				properties: {
					subida: { type: 'string', description: 'La `subida` que dio `pedir_subida`.' },
					pedido: WHO_PROPERTIES.pedido
				},
				required: ['subida'],
				additionalProperties: false
			}
		},
		annotations: ANNOTATIONS,
		async run(ctx, args) {
			await requireEditing(ctx);
			const claims = await readUploadToken(ctx.db, args.subida);
			if (!claims || claims.a !== ctx.user.id) {
				throw new ToolInputError(
					'Esa `subida` no vale (o es de otra persona). Pedí otra con `pedir_subida`.'
				);
			}
			if (ctx.now > claims.e + UPLOAD_KEEP_MS) {
				throw new ToolInputError('Esa subida venció. Pedí otra con `pedir_subida`.');
			}
			const bucket = bucketOf(ctx);
			const key = tempKey(claims.n, 'original');
			const head = await bucket.head(key);
			if (!head) {
				throw new ToolInputError(
					ctx.now > claims.e
						? 'No llegó nada con el PUT y la dirección ya venció. Pedí otra con `pedir_subida`.'
						: 'Todavía no llegó el archivo: mandalo con un PUT a la `url` de `pedir_subida` y volvé a confirmar.'
				);
			}
			const confirmedBy = claims.cb ?? null;
			const request = cleanRequest(args.pedido);
			const done = head.customMetadata?.hecho;
			if (done) {
				// Ya se confirmó: lo mismo que la primera vez (sin volver a contarlo en el tope).
				const o = await findLibraryObject(ctx.db, Number(done));
				if (!o || o.deleted_at !== null)
					throw new ToolInputError(
						'Esa subida ya se confirmó, pero lo subido ya no está en la biblioteca.'
					);
				return uploadResult(ctx, {
					item: libraryItem(o),
					created: false,
					up: { tipo: claims.t, alt: claims.al ?? '', confirmedBy, request, via: 'put' }
				});
			}
			const stored = await bucket.get(key);
			if (!stored) throw new ToolInputError('Lo subido ya no está. Pedí otra con `pedir_subida`.');
			const bytes = new Uint8Array(await stored.arrayBuffer());
			/** @type {{ side: number, bytes: Uint8Array }[]} */
			const copies = [];
			if (claims.t === IMAGE_TYPE) {
				for (const side of COPY_SIDES) {
					const c = await bucket.get(tempKey(claims.n, String(side)));
					if (c) copies.push({ side, bytes: new Uint8Array(await c.arrayBuffer()) });
				}
			}
			const out = await storeUpload(ctx, {
				tipo: claims.t,
				bytes,
				nombre: claims.nm,
				alt: claims.al ?? '',
				copies,
				confirmedBy,
				request,
				via: 'put'
			});
			// Lo que esperaba se cambia por una marca chiquita: reintentar devuelve lo mismo, y la
			// limpieza la borra a la hora.
			const id = /** @type {any} */ (out.result).id;
			await bucket.put(key, new Uint8Array(0), { customMetadata: { hecho: String(id) } });
			await bucket
				.delete(COPY_SIDES.map((side) => tempKey(claims.n, String(side))))
				.catch(() => {});
			await cleanupUploads(bucket, ctx.now);
			return out;
		}
	}
};
