/**
 * La cola del prototipo «Lista de espera» (/estilo/prototipos/lista-de-espera), en funciones puras
 * para poder probarla (espera.test.js). Todo es estado local: no hay tabla ni servidor. Si la lista
 * se hace de verdad, esto es la regla a llevar al servidor (con la reserva atómica de siempre,
 * docs/entradas.md), no código para copiar.
 *
 * Dos modos, como pide la decisión 0006 («configurable por evento»):
 * - 'de-a-une': cada lugar libre se le guarda a la próxima persona de la lista por un tiempo; si no
 *   compra, vence y pasa a la siguiente.
 * - 'todes': se avisa a todes a la vez y compra quien llega primero (no se guarda nada).
 */

/** @typedef {'esperando' | 'ofrecido' | 'avisade' | 'compro' | 'vencio' | 'salio'} Estado */
/** @typedef {{ id: string, estado: Estado }} Fila */
/** @typedef {{ modo: 'de-a-une' | 'todes', libres: number, filas: Fila[] }} Cola */

/** Estados que siguen en la lista (para el número de cada une). */
const EN_LISTA = new Set(['esperando', 'ofrecido', 'avisade']);

/**
 * Reparte los lugares libres según el modo.
 * @param {Cola} cola
 * @returns {Cola}
 */
export function repartir(cola) {
	if (cola.modo === 'todes') {
		if (cola.libres <= 0) return cola;
		return {
			...cola,
			filas: cola.filas.map((f) => (f.estado === 'esperando' ? { ...f, estado: 'avisade' } : f))
		};
	}
	let libres = cola.libres;
	const filas = cola.filas.map((f) => {
		if (libres > 0 && f.estado === 'esperando') {
			libres--;
			return { ...f, estado: /** @type {Estado} */ ('ofrecido') };
		}
		return f;
	});
	return { ...cola, libres, filas };
}

/**
 * Se liberó un lugar (una reserva venció, alguien pidió la devolución, se subió el cupo).
 * @param {Cola} cola
 * @returns {Cola}
 */
export function liberarLugar(cola) {
	return repartir({ ...cola, libres: cola.libres + 1 });
}

/**
 * Une admin le ofrece el lugar a una persona puntual («Ofrecer lugar»). Si no hay lugares libres,
 * ofrecerlo pasa el cupo (`pasaCupo`): el panel tiene que pedir confirmación (decisión 0006).
 * @param {Cola} cola
 * @param {string} id
 * @returns {{ cola: Cola, pasaCupo: boolean }}
 */
export function ofrecer(cola, id) {
	const fila = cola.filas.find((f) => f.id === id);
	if (!fila || !['esperando', 'avisade'].includes(fila.estado)) return { cola, pasaCupo: false };
	const pasaCupo = cola.libres <= 0;
	return {
		pasaCupo,
		cola: {
			...cola,
			libres: Math.max(0, cola.libres - 1),
			filas: cola.filas.map((f) => (f.id === id ? { ...f, estado: 'ofrecido' } : f))
		}
	};
}

/**
 * Pasó el tiempo para comprar: los lugares guardados vuelven y pasan a les siguientes.
 * @param {Cola} cola
 * @returns {Cola}
 */
export function vencerOfertas(cola) {
	let vuelven = 0;
	const filas = cola.filas.map((f) => {
		if (f.estado !== 'ofrecido') return f;
		vuelven++;
		return { ...f, estado: /** @type {Estado} */ ('vencio') };
	});
	return repartir({ ...cola, libres: cola.libres + vuelven, filas });
}

/**
 * Alguien de la lista compró. Con un lugar guardado, es suyo; avisade (modo 'todes'), ocupa uno
 * libre si queda (si no, llegó tarde y sigue en la lista).
 * @param {Cola} cola
 * @param {string} id
 * @returns {Cola}
 */
export function comprar(cola, id) {
	const fila = cola.filas.find((f) => f.id === id);
	if (!fila) return cola;
	if (fila.estado === 'avisade' && cola.libres <= 0) return cola;
	if (fila.estado !== 'ofrecido' && fila.estado !== 'avisade') return cola;
	const libres = fila.estado === 'avisade' ? cola.libres - 1 : cola.libres;
	const filas = cola.filas.map((f) =>
		f.id === id ? { ...f, estado: /** @type {Estado} */ ('compro') } : f
	);
	// En 'todes', sin lugares libres les demás avisades vuelven a esperar.
	return {
		...cola,
		libres,
		filas:
			cola.modo === 'todes' && libres <= 0
				? filas.map((f) => (f.estado === 'avisade' ? { ...f, estado: 'esperando' } : f))
				: filas
	};
}

/**
 * El número de una persona en la lista: cuántes siguen adelante, más uno (null si ya no está).
 * @param {Fila[]} filas
 * @param {string} id
 * @returns {number | null}
 */
export function numero(filas, id) {
	let n = 0;
	for (const f of filas) {
		if (!EN_LISTA.has(f.estado)) continue;
		n++;
		if (f.id === id) return n;
	}
	return null;
}
