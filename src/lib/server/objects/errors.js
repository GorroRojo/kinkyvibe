/**
 * Errores de los objetos. `code` es estable (para la API y los tests); `message` es para mostrar
 * (castellano, voseo); `status` es el HTTP que le corresponde.
 */

/**
 * @typedef {'invalid' | 'unknown_type' | 'not_found' | 'slug_taken' | 'version_conflict' | 'invalid_reference'} ObjectErrorCode
 */

export class ObjectError extends Error {
	/**
	 * @param {ObjectErrorCode} code
	 * @param {string} message
	 * @param {{ status?: number, errors?: import('./fields.js').FieldError[], cause?: unknown }} [extra]
	 */
	constructor(code, message, { status = 400, errors = [], cause } = {}) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = 'ObjectError';
		this.code = code;
		this.status = status;
		this.errors = errors;
	}
}

/**
 * Alguien guardó el objeto mientras se editaba: se guardó con una versión vieja. Nunca se pisa
 * en silencio; la pantalla tiene que mostrar el aviso y ofrecer recargar (o comparar).
 */
export class VersionConflictError extends ObjectError {
	/**
	 * @param {number} id
	 * @param {number} expected la versión con la que se abrió el editor
	 * @param {number | null} current la que hay ahora (null si no se pudo leer)
	 * @param {unknown} [cause]
	 */
	constructor(id, expected, current, cause) {
		super(
			'version_conflict',
			'Alguien más guardó cambios mientras editabas. Recargá para ver la versión nueva antes de guardar; tus cambios no se guardaron.',
			{ status: 409, cause }
		);
		this.name = 'VersionConflictError';
		this.id = id;
		this.expected = expected;
		this.current = current;
	}
}
