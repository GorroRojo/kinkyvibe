/** @type {import('./$types').LayoutServerLoad} */
export function load({ setHeaders }) {
	// Estas páginas llevan ids de orden y tokens de entrada en la URL: que no se filtren por
	// Referer, que no se indexen y que no queden en cachés compartidas.
	setHeaders({
		'referrer-policy': 'no-referrer',
		'x-robots-tag': 'noindex, nofollow',
		'cache-control': 'private, no-store'
	});
	return {};
}
