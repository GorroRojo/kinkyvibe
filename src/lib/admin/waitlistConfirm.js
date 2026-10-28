/**
 * «Terminar la reserva y pasar a la siguiente» en Ventas › Lista de espera: la pregunta antes de
 * terminar, con la casilla «Mandarle un mail» marcada de entrada (gorrite, 12/10). Si la casilla
 * queda destildada, el form va sin `mail=1` y no sale «se terminó tu lugar»
 * (`+page.server.js`, acción `terminar`).
 */
import { askConfirmCheck } from '$lib/admin/confirm.js';

/**
 * El diálogo de terminar una reserva. Con la lista de espera apagada (`mailsOn` false) no sale
 * ningún mail de la lista: no hay casilla y el texto lo dice.
 *
 * @param {{ email: string, mailsOn: boolean }} o
 * @returns {import('$lib/admin/confirm.js').ConfirmOptions}
 */
export function endHoldQuestion({ email, mailsOn }) {
	const what = 'Su link deja de servir y el lugar pasa a la próxima persona de la fila.';
	return {
		title: '¿Terminar su reserva?',
		text: mailsOn
			? `${what} ¿Le avisamos por mail? Le llega «Se terminó tu lugar», con un botón para volver a anotarse al final de la fila.`
			: `${what} No le llega un mail: la lista de espera está apagada.`,
		confirmLabel: 'Terminar y pasar a la siguiente',
		tone: 'danger',
		...(mailsOn ? { check: { label: `Mandarle un mail a ${email}`, checked: true } } : {})
	};
}

/**
 * La función de `use:enhance` del form «Terminar la reserva»: pregunta y, si se destilda la
 * casilla (o no hay mails), saca `mail` del envío.
 *
 * @param {{ email: string, mailsOn: boolean }} o
 * @returns {import('@sveltejs/kit').SubmitFunction}
 */
export function endHoldSubmit(o) {
	return async ({ formData, cancel }) => {
		const r = await askConfirmCheck(endHoldQuestion(o));
		if (!r.ok) return cancel();
		if (r.checked) formData.set('mail', '1');
		else formData.delete('mail');
		return async ({ update }) => update({ reset: false });
	};
}
