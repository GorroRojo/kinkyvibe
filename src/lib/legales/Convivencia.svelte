<script>
	/**
	 * Esqueleto del código de convivencia (docs/legales.md). Parte de los «Códigos de convivencia»
	 * del grupo ¡AUCH! (src/lib/posts/amigues/AUCH.md), que son del grupo de Telegram: llevarlos a los
	 * eventos y al sitio lo tiene que decidir la comunidad. Por eso casi todo va con «Para revisar».
	 */
	import Legal from './Legal.svelte';
	import Revisar from './Revisar.svelte';
	import { DEFAULT_CONTACT_EMAIL } from '$lib/utils/tickets.js';

	export let slug = '';
	/** @type {readonly import('./paginas.js').PaginaLegal[]} */
	export let paginas = [];

	const contacto = DEFAULT_CONTACT_EMAIL;

	const secciones = [
		{ id: 'para-que', titulo: 'Para qué es esto' },
		{ id: 'discursos', titulo: 'Discursos que no' },
		{ id: 'pronombres', titulo: 'Pronombres' },
		{ id: 'consentimiento', titulo: 'Consentimiento' },
		{ id: 'privacidad', titulo: 'Fotos, capturas y privacidad' },
		{ id: 'advertencias', titulo: 'Advertencias de contenido' },
		{ id: 'buena-fe', titulo: 'Buena fe y no amontonarnos' },
		{ id: 'si-pasa-algo', titulo: 'Si pasa algo' }
	];
</script>

<Legal titulo="Código de convivencia" {slug} {paginas} {secciones}>
	<Revisar>
		esto es un esqueleto. Las ideas salen de los códigos de convivencia que ya usa el grupo
		<a href="/amigues/AUCH">¡AUCH!</a> en Telegram, pero un código para los eventos y el sitio tiene que
		salir de la comunidad: quién lo escribe, cómo se discute y cómo se aprueba.
	</Revisar>

	<section id="para-que">
		<h2>Para qué es esto</h2>
		<p>
			Kinky Vibe está hecho por y para la comunidad cuir y kinky. Muches somos personas trans,
			neurodivergentes o de comunidades vulneradas, así que el cuidado, el respeto a las identidades
			y la accesibilidad están en el centro de cómo nos manejamos. Estos acuerdos valen en los
			eventos, en los talleres, en el sitio y en los espacios de la comunidad.
		</p>
		<Revisar>
			¿vale igual en los eventos de otres organizadores que se difunden en el calendario? ¿Cada
			evento puede sumar sus propias reglas (por ejemplo, de juego o de vestimenta)?
		</Revisar>
	</section>

	<section id="discursos">
		<h2>Discursos que no</h2>
		<p>
			No permitimos discursos patologizantes, capacitistas, cisexistas, transodiantes, clasistas,
			gordodiantes, fascistas ni kinkshameros. Si no sabés lo que significa algo, preguntanos.
		</p>
	</section>

	<section id="pronombres">
		<h2>Pronombres</h2>
		<p>
			No asumamos el género de nadie: preguntemos los pronombres y respetémoslos. Por eso las
			entradas llevan los pronombres de cada persona. Si no sabés bien de qué se trata,
			<a href="https://pronombr.es" target="_blank" rel="noopener">pronombr.es</a> tiene una guía corta.
		</p>
	</section>

	<section id="consentimiento">
		<h2>Consentimiento</h2>
		<Revisar>
			falta: cómo se pide y se da consentimiento en los eventos (para tocar, para jugar, para
			sumarse a una escena), palabras de seguridad, alcohol y otras sustancias, y qué pasa si
			alguien no lo respeta. Hay material del sitio sobre consentimiento que puede servir de base.
		</Revisar>
	</section>

	<section id="privacidad">
		<h2>Fotos, capturas y privacidad</h2>
		<p>
			No compartamos fuera de un espacio las capturas de las conversaciones ni las imágenes
			personales que se compartieron ahí.
		</p>
		<Revisar>
			reglas de fotos y videos en los eventos (¿se puede sacar fotos? ¿con permiso de quién?) y cómo
			se pide que se borre una foto.
		</Revisar>
	</section>

	<section id="advertencias">
		<h2>Advertencias de contenido</h2>
		<p>
			Para cuidarnos de ver cosas que nos pueden hacer mal, avisemos antes de hablar de temas
			sensibles o de pasar imágenes explícitas, y describamos lo que hay. Así cada quien decide si
			lo quiere ver.
		</p>
	</section>

	<section id="buena-fe">
		<h2>Buena fe y no amontonarnos</h2>
		<p>
			Si hay un desacuerdo, asumamos que la otra persona habla de buena fe y no quiere dañarnos.
			Muchas veces desescalar es aclarar un malentendido. Si alguien le pifia, fijémonos si alguien
			ya lo marcó antes de sumarnos: seamos amistoses ante el error, aun mientras ponemos límites.
		</p>
	</section>

	<section id="si-pasa-algo">
		<h2>Si pasa algo</h2>
		<p>
			Buscamos ser un espacio de cuidados y antipunitivo: acompañar a quien se sintió dañade, y
			escuchar sin vilificar a quien dañó, para que se haga cargo. Si algo te incomodó o te lastimó,
			podés escribirnos a <a href="mailto:{contacto}">{contacto}</a>. Podemos ver cómo hacer para
			que no compartan el mismo espacio, o mediar si las dos partes quieren.
		</p>
		<Revisar>
			a quién se le habla en un evento (¿hay personas de cuidado identificables?), un contacto para
			cuando el problema es con alguien del equipo, qué medidas se pueden tomar (desde pedir que
			alguien se retire hasta no venderle entradas) y quién las decide.
		</Revisar>
	</section>
</Legal>
