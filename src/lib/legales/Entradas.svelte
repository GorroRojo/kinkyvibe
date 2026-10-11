<script>
	/**
	 * Borrador de la política de entradas y devoluciones (docs/legales.md). No inventa reglas: junta
	 * lo que ya dicen el formulario de compra y los mails. Las condiciones y la política de
	 * devoluciones salen de las mismas funciones que usan la compra y los mails
	 * (`purchaseConditions`, `refundPolicy`, la plantilla `date_change`), así no se desincronizan.
	 * Lo que no está definido va en una nota «Para revisar».
	 */
	import Legal from './Legal.svelte';
	import Revisar from './Revisar.svelte';
	import {
		DEFAULT_CONTACT_EMAIL,
		FONDO_OPTIONS,
		fondoOptionLabel,
		purchaseConditions,
		refundPolicy
	} from '$lib/utils/tickets.js';
	import { transferRuleText } from '$lib/utils/transferDeadline.js';
	import { templateDef } from '$lib/utils/emailTemplates.js';

	export let slug = '';
	/** @type {readonly import('./paginas.js').PaginaLegal[]} */
	export let paginas = [];

	const contacto = DEFAULT_CONTACT_EMAIL;
	const condiciones = purchaseConditions({
		contactEmail: contacto,
		methods: ['mercadopago', 'transferencia']
	});
	const devoluciones = refundPolicy(contacto);
	const cambioDeFecha = templateDef('date_change')?.extras.help?.default ?? '';
	const solidarias = FONDO_OPTIONS.filter((o) => o.percent > 0).map(
		(o) => `«${fondoOptionLabel(o.id)}»`
	);
	const solidariasTexto =
		solidarias.length > 1
			? `${solidarias.slice(0, -1).join(', ')} o ${solidarias[solidarias.length - 1]}`
			: solidarias.join('');

	const secciones = [
		{ id: 'condiciones', titulo: 'Lo que aceptás al comprar' },
		{ id: 'precio', titulo: 'Precio, Fondo y recargo' },
		{ id: 'reserva', titulo: 'Reserva y pago' },
		{ id: 'entrada', titulo: 'Tu entrada' },
		{ id: 'titular', titulo: 'Pasarle tu entrada a otra persona' },
		{ id: 'devoluciones', titulo: 'Devoluciones' },
		{ id: 'fecha', titulo: 'Si cambia la fecha' },
		{ id: 'cancelacion', titulo: 'Si se cancela el evento' }
	];
</script>

<Legal titulo="Entradas y devoluciones" {slug} {paginas} {secciones}>
	<p>
		Esto junta en un lugar lo que ya te dicen el formulario de compra y los mails de tus entradas.
		Si tenés cualquier duda, escribinos a <a href="mailto:{contacto}">{contacto}</a> o respondé cualquier
		mail de tus entradas.
	</p>

	<section id="condiciones">
		<h2>Lo que aceptás al comprar</h2>
		<p>
			Al comprar tildás «Tengo 18 años o más y acepto las condiciones de compra». Estas son, tal
			cual las muestra el formulario:
		</p>
		<ul>
			{#each condiciones as c}
				<li>{c}</li>
			{/each}
		</ul>
		<Revisar>
			el formulario muestra solo los medios de pago de cada evento; acá están los dos. Si se publica
			esta página, el formulario puede enlazarla.
		</Revisar>
	</section>

	<section id="precio">
		<h2>Precio, Fondo y recargo</h2>
		<ul>
			<li>
				El precio lo calcula siempre el sitio al crear tu compra, y es el que ves en el resumen
				antes de pagar.
			</li>
			<li>
				En los eventos de Kinky Vibe, el <strong>Fondo KinkyVibe</strong> baja el precio para todo
				el mundo: el porcentaje sale de lo que se juntó en
				<a href="https://fondo.kinkyvibe.ar">fondo.kinkyvibe.ar</a> y puede cambiar mientras dura la venta.
				Pagás el que corresponde en el momento de comprar.
			</li>
			<li>
				Si podés, en lugar del descuento elegís pagar el precio completo o una entrada que suma al
				Fondo:
				{solidariasTexto}. Lo que pagás de más va al Fondo.
			</li>
			<li>
				En las entradas <strong>a la gorra</strong> elegís cuánto pagar (desde el mínimo del evento, si
				tiene). Ahí no hay descuento del Fondo ni códigos.
			</li>
			<li>
				Pagar con Mercado Pago suma un recargo para cubrir su comisión; la transferencia no lo
				tiene.
			</li>
		</ul>
	</section>

	<section id="reserva">
		<h2>Reserva y pago</h2>
		<ul>
			<li>
				Con <strong>Mercado Pago</strong>, te guardamos el lugar 20 minutos mientras pagás. Las
				entradas te llegan por mail apenas se aprueba el pago.
			</li>
			<li>
				Con <strong>transferencia</strong>, te guardamos el lugar {transferRuleText()}, o hasta que
				empiece el evento si es antes. La página de tu compra y el mail te dicen el día y la hora
				exactos. Transferí, mandanos el comprobante respondiendo el mail, y cuando confirmamos el
				pago te mandamos las entradas.
			</li>
			<li>Si el pago no se completa a tiempo, la reserva vence y el lugar se libera.</li>
		</ul>
		<Revisar>
			los feriados hoy no se descuentan de los días hábiles de la transferencia. Decidir si se
			aclara.
		</Revisar>
	</section>

	<section id="entrada">
		<h2>Tu entrada</h2>
		<ul>
			<li>
				Cada entrada tiene un QR y un código corto, y sirve para una persona y un solo ingreso: no
				la compartas.
			</li>
			<li>
				En los eventos online, en lugar del QR te mandamos el link de la transmisión (si todavía no
				está, te llega antes del evento).
			</li>
			<li>Antes del evento te mandamos recordatorios por mail con el lugar y tus entradas.</li>
			<li>Es un evento para mayores de 18: en la puerta te pueden pedir documento.</li>
		</ul>
	</section>

	<section id="titular">
		<h2>Pasarle tu entrada a otra persona</h2>
		<p>{devoluciones.paragraphs[1]}</p>
		<Revisar>
			¿hasta cuándo se puede cambiar de titular? ¿Hay que reenviarle la entrada a la persona nueva?
		</Revisar>
	</section>

	<section id="devoluciones">
		<h2>Devoluciones</h2>
		<p>Esto es lo que dicen el formulario y el pie de cada mail:</p>
		<blockquote>
			<p><strong>{devoluciones.title}</strong></p>
			{#each devoluciones.paragraphs as p}
				<p>{p}</p>
			{/each}
		</blockquote>
		<p>Cómo te devolvemos la plata:</p>
		<ul>
			<li>
				Si pagaste con <strong>Mercado Pago</strong>, Mercado Pago te la devuelve al mismo medio con
				el que pagaste (con tarjeta, puede tardar en verse en el resumen).
			</li>
			<li>Si pagaste con <strong>transferencia</strong>, te la devolvemos por transferencia.</li>
			<li>
				Te avisamos por mail cuando está hecha. Desde ese momento, las entradas ya no sirven para
				entrar.
			</li>
		</ul>
		<Revisar>
			«5 días hábiles» no está definido: ¿qué días cuentan? (las reservas por transferencia usan de
			martes a sábado). Tampoco está escrito: qué pasa si avisás después de ese plazo o no venís sin
			avisar; si se puede devolver una sola de varias entradas de la misma compra (hoy el sitio solo
			devuelve la compra entera); si la devolución incluye el recargo de Mercado Pago y el aporte al
			Fondo (hoy se devuelve el total pagado); qué datos pedimos para devolver una transferencia;
			cómo se elige y se accede al taller grabado; y que Mercado Pago solo deja devolver dentro de
			los 180 días del pago.
		</Revisar>
		<Revisar>
			la Ley 24.240 da 10 días para arrepentirse de una compra en línea, con excepciones discutidas
			para servicios con fecha, como un evento. Decidir con une abogade si aplica y, si aplica,
			sumar el «botón de arrepentimiento».
		</Revisar>
	</section>

	<section id="fecha">
		<h2>Si cambia la fecha</h2>
		<p>
			Si un evento cambia de día u horario, te mandamos un mail con la fecha nueva y el calendario
			actualizado. Lo que compraste sigue valiendo para la fecha nueva: no tenés que hacer nada.
		</p>
		<p>{cambioDeFecha}</p>
		<Revisar>
			¿hasta cuándo se puede pedir la devolución después de un cambio de fecha? ¿Vale aunque el
			cambio sea de pocas horas?
		</Revisar>
	</section>

	<section id="cancelacion">
		<h2>Si se cancela el evento</h2>
		<Revisar>
			no está definido. Hace falta decidir si se devuelve todo de forma automática, si se ofrece
			crédito para otro evento o un taller grabado, o si se decide caso por caso, y en qué plazo.
			Está en las preguntas abiertas de docs/tickets.md.
		</Revisar>
	</section>
</Legal>

<style>
	blockquote {
		margin: 0 0 var(--space-xs);
		padding: var(--space-2xs) var(--space-xs);
		border-left: 4px solid var(--2-light);
		background: var(--2-tint);
		border-radius: var(--radius-s);
	}
	blockquote p:last-child {
		margin-bottom: 0;
	}
</style>
