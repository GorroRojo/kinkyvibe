/** @type {import("./$types").PageLoad} */
export async function load({ data }) {
	// El evento de la base, ya sin el «Dónde» si tiene lugar (ver +page.server.js).
	return {
		meta: data.event.meta,
		path: data.event.path,
		tickets: data.tickets,
		// Un lugar vinculado manda sobre el «Dónde» del evento (como en la página del evento).
		venue: data.venue ?? null,
		account: data.account,
		// Lista de espera: los alcances agotados donde se puede anotar, o null.
		waitlist: data.waitlist ?? null,
		// Link de una oferta de la lista de espera (`?lista=`): si vale y hasta cuándo, o null.
		offer: data.offer ?? null
	};
}
