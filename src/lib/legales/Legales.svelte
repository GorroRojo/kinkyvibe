<script>
	/**
	 * Borrador de la página legal mínima (docs/legales.md): solo lo que pide la ley (art. 6 de la
	 * Ley 25.326, Res. AAIP 14/2018 y, para las entradas, la Disp. 954/2025). Describe lo que hace
	 * el código hoy: si un PR cambia qué se guarda o quién lo procesa, actualiza este texto.
	 *
	 * Lleva la marca que busca `node scripts/demo/guard.js bundle`: si aparece en el bundle de
	 * producción, el borrador se coló.
	 */
	import Notice from '$lib/components/ui/Notice.svelte';
	import Revisar from './Revisar.svelte';
	import { CONTACTO_LEGALES } from './legales.js';

	const contacto = CONTACTO_LEGALES;
</script>

<article class="legal" data-kv-legales={'kv-legales-borrador'}>
	<h1>Legales</h1>

	<Notice tone="warn" role={null}>
		<strong>Borrador sin publicar.</strong> Todavía no está vigente ni lo revisó une abogade. Solo se
		ve en los previews y en desarrollo.
	</Notice>

	<div class="texto">
		<section>
			<h2>Quién está a cargo</h2>
			<p>
				Kinky Vibe (kinkyvibe.ar) es un espacio de educación y comunidad sobre sexualidades, kink y
				BDSM, y es responsable de los datos que se juntan en este sitio. Para cualquier cosa sobre
				tus datos o tus entradas, escribinos a
				<a href="mailto:{contacto}">{contacto}</a>.
			</p>
			<Revisar>
				quién figura como responsable de los datos: nombre (o razón social) y domicilio. La ley pide
				«la identidad y el domicilio» del responsable.
			</Revisar>
		</section>

		<section>
			<h2>Qué datos guardamos y para qué</h2>
			<ul>
				<li>
					<strong>Para mirar el sitio</strong> no hace falta cuenta. Las visitas se cuentan sin cookies
					y sin saber quién sos, para saber qué se lee.
				</li>
				<li>
					<strong>Si comprás una entrada:</strong> nombre, pronombres, mail y DNI de quien compra, y nombre
					y pronombres de cada persona que va. Son para mandarte las entradas, controlar el ingreso y
					avisarte si algo cambia. Sin ellos no podemos venderte la entrada.
				</li>
				<li>
					<strong>Si te hacés una cuenta</strong> (es opcional): tu mail y lo que elijas guardar, como
					tus datos para la próxima compra, lo que seguís o tu chat de Telegram.
				</li>
				<li>
					Las únicas cookies son las de tu sesión y la que recuerda tus últimas compras. No vendemos
					tus datos ni los usamos para publicidad.
				</li>
			</ul>
		</section>

		<section>
			<h2>Quién más los procesa</h2>
			<p>
				<strong>Cloudflare</strong> (aloja el sitio y la base de datos), <strong>Resend</strong>
				(manda los mails), <strong>Mercado Pago</strong> (cobra, si pagás por ahí),
				<strong>Telegram</strong> (si usás el bot) y <strong>Google</strong> (nuestra casilla de mail).
				Algunos guardan datos fuera de Argentina.
			</p>
		</section>

		<section>
			<h2>Cuánto tiempo</h2>
			<ul>
				<li>La cuenta, hasta que la borres desde Mi rincón.</li>
				<li>Las compras, hoy no se borran solas.</li>
				<li>
					Las copias de seguridad: las diarias duran 30 días, las mensuales un año y queda una por
					año.
				</li>
			</ul>
			<Revisar>
				cuánto se guardan las compras (con el DNI) después del evento, y las copias anuales, que hoy
				no se borran nunca.
			</Revisar>
		</section>

		<section>
			<h2>Tus derechos</h2>
			<p>
				Podés pedir gratis ver, corregir o borrar tus datos. Mucho lo hacés vos en Mi rincón; para
				lo demás, escribinos a <a href="mailto:{contacto}">{contacto}</a> desde el mail con el que compraste.
				Respondemos en 10 días corridos si pedís verlos y en 5 días hábiles si pedís corregirlos o borrarlos.
			</p>
			<p class="leyenda">
				LA AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley
				N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes
				resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de
				protección de datos personales.
			</p>
			<Revisar>
				inscribir o no la base en el Registro Nacional de Bases de Datos de la AAIP (la ley no pone
				un mínimo de tamaño).
			</Revisar>
		</section>

		<section>
			<h2>Entradas</h2>
			<p>
				Las condiciones de compra y de devolución están en el formulario de compra y en el mail de
				tus entradas.
			</p>
			<p>
				<strong>Arrepentimiento:</strong> tenés 10 días corridos desde que recibís la entrada o el
				comprobante de pago (lo que llegue primero) para arrepentirte de la compra sin dar motivos,
				siempre que nos avises al menos 24 horas antes del evento. Escribinos a
				<a href="mailto:{contacto}">{contacto}</a> y te devolvemos todo lo que pagaste.
			</p>
			<Revisar>
				botón de arrepentimiento. La Disp. 954/2025 pide un link «Botón de arrepentimiento» visible
				desde la primera pantalla, que funcione sin cuenta ni trámites, y responder en 24 horas con
				un código del pedido. Hacerlo es un link en el pie a un formulario corto (mail y número de
				compra) que guarde el pedido, le mande el código por mail a la persona y le avise al equipo;
				la devolución seguiría siendo a mano.
			</Revisar>
		</section>
	</div>
</article>

<style>
	.legal {
		max-width: 44rem;
		width: calc(100% - 32px);
		box-sizing: border-box;
		margin: var(--space-s) auto var(--space-l);
		background: var(--surface);
		border-radius: var(--radius-l);
		box-shadow: var(--shadow-1);
		padding: var(--space-s-m);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		overflow-wrap: anywhere;
	}
	.legal a {
		color: var(--2-dark);
	}
	h1 {
		margin: 0;
		font-size: var(--text-2xl);
		line-height: 1.15;
	}
	.texto {
		font-size: var(--text-base);
		line-height: 1.55;
	}
	.texto h2 {
		font-size: var(--text-xl);
		margin: var(--space-m) 0 var(--space-2xs);
		line-height: 1.2;
	}
	.texto section:first-child h2 {
		margin-top: var(--space-2xs);
	}
	.texto p,
	.texto ul {
		margin: 0 0 var(--space-2xs);
	}
	.texto li + li {
		margin-top: var(--space-3xs);
	}
	.leyenda {
		font-size: var(--text-sm);
		color: var(--muted);
	}
</style>
