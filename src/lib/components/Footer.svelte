<script>
	import {
		ArrowRight,
		BookOpen,
		Heart,
		CalendarRange,
		ShoppingCart,
		Rss,
		Layers,
		Globe,
		Home,
		LogIn,
		UserRound,
		HandCoins
	} from '@lucide/svelte';
	import { siTiktok, siInstagram, siTwitter, siYoutube, siTelegram } from 'simple-icons';
	import SimpleIcon from '$lib/components/SimpleIcon.svelte';
	import { accountLink } from '$lib/utils/cuentas.js';
	import { supportLink } from '$lib/utils/footer.js';
	/**
	 * Datos del layout raíz (`member`).
	 * @type {{ member?: boolean }}
	 */
	export let data = {};
	$: cuenta = accountLink(data);
	const apoyo = supportLink();
	let style = `scale:var(--scale,1);
				 translate:var(--translate,0 0);`;
</script>

<footer>
	<div class="wip">
		Este sitio está en constante construcción. Reportar problemas a <a
			href="https://t.me/Gorro_Rojo"
		>
			@Gorro_Rojo
		</a>
		por Telegram. O directamente en
		<a href="https://github.com/GorroRojo/kinkyvibe/issues/new">GitHub</a>.
	</div>
	Codigueado por
	<a href="/amigues/Gorro_Rojo">Gorro_Rojo</a>. Esta página es
	<a href="https://github.com/gorrorojo/kinkyvibe">código abierto</a>
	y software libre.
	<ul>
		<li>
			<h3>Contenido</h3>
			<ul class="contenido">
				<li><a href="/" rel="home"><Home {style} />Inicio</a></li>
				<li><a href="/material"><BookOpen {style} />Material</a></li>
				<li><a href="/amigues"><Heart {style} />Amigues</a></li>
				<li><a href="/calendario"><CalendarRange {style} />Calendario</a></li>
				<li><a href="/todo"><Layers {style} />Todo</a></li>
				<li><a href="/wiki"><Globe {style} />Kinkipedia</a></li>
			</ul>
		</li>
		<li>
			<h3>Sobre nosotres</h3>
			<ul>
				<li>
					<a href="https://fondo.kinkyvibe.ar"><ArrowRight {style} />Fondo de Kinky Vibe</a>
				</li>
				<li>
					<a href="https://tienda.kinkyvibe.ar" target="_blank"><ShoppingCart {style} />Tienda</a>
				</li>
				<li>
					<a href={apoyo.href} target="_blank"><HandCoins {style} />{apoyo.label}</a>
				</li>
			</ul>
		</li>
		<li>
			<h3>Redes</h3>
			<ul class="redes">
				<li>
					<a href="https://t.me/BDSMtextos" target="_blank">
						<SimpleIcon icon={siTelegram} />
						Telegram
					</a>
				</li>
				<li>
					<a href="https://www.instagram.com/kinkyvibeargentina/" target="_blank">
						<SimpleIcon icon={siInstagram} />
						Instagram
					</a>
				</li>
				<li>
					<a href="https://twitter.com/kinkyvibearg"><SimpleIcon icon={siTwitter} />Twitter</a>
				</li>
				<li>
					<a href="https://www.youtube.com/@KinkyVibe"><SimpleIcon icon={siYoutube} />Youtube</a>
				</li>
				<li>
					<a href="https://www.tiktok.com/@kinkyvibearg"><SimpleIcon icon={siTiktok} />TikTok</a>
				</li>
				<li>
					<a data-sveltekit-reload href="https://kinkyvibe.ar/rss"><Rss {style} />RSS</a>
				</li>
			</ul>
		</li>
		{#if cuenta}
			<!-- Cuentas del público (docs/cuentas.md) -->
			<li>
				<h3>Tu cuenta</h3>
				<ul>
					<li>
						<a href={cuenta.href}>
							{#if data.member}<UserRound {style} />{:else}<LogIn {style} />{/if}{cuenta.label}
						</a>
					</li>
				</ul>
			</li>
		{/if}
	</ul>
	<!-- para el equipo: el panel (login con GitHub) -->
	<p class="panel"><a href="/login">Entrar al panel</a></p>
</footer>

<style>
	.wip {
		background: var(--2-dark);
		color: white;
		text-align: center;
		padding: 0.5em 1em;
		margin-bottom: 1em;
		border-radius: var(--round-sm);
	}
	.wip a:hover {
		color: white;
		text-decoration-color: white;
	}
	footer {
		margin: 0;
		margin-top: 8em;
		padding: 2em;
		background: indigo;
		color: white;
		border-radius: 2em 2em 0 0;
		box-sizing: border-box;
		font-size: var(--step--1);
	}
	a {
		color: white;
		text-decoration: underline;
		text-decoration-color: rgba(250, 250, 250, 0.4);
		text-underline-offset: 0.15em;
	}
	li a {
		--scale: 0.8;
		--color: white;
		display: inline-flex;
		align-items: center;
		gap: 0.45em;
		min-height: 2em;
	}
	a:hover {
		text-decoration-color: var(--1);
	}
	a:focus-visible {
		outline-color: white;
	}
	h3 {
		font-size: var(--step-0);
		margin-bottom: 0.6em;
	}
	footer > ul {
		display: flex;
		list-style: none;
		justify-content: space-around;
		padding: 0;
		flex-wrap: wrap;
		gap: 0 2em;
	}
	li > ul {
		padding: 0;
		list-style: none;
		margin-top: 0;
	}
	.panel {
		margin: 1.5em 0 0;
		text-align: center;
		font-size: var(--step--2);
		opacity: 0.85;
	}
	.panel a {
		display: inline-flex;
		align-items: center;
		min-height: 2em;
	}
	@media screen and (max-width: 680px) {
		footer {
			padding-inline: var(--space-xs);
			/* 6rem de la barra de navegación inferior + lugar para el botón flotante
			de búsqueda (56px + 16px de margen arriba y abajo), así lo último de la
			página se puede scrollear hasta quedar libre del FAB. Va en el footer (no en el
			body) para que el violeta llegue hasta abajo, sin una franja gris debajo. */
			padding-bottom: calc(2em + 6rem + 88px);
		}
		footer > ul {
			justify-content: flex-start;
		}
		footer > ul > li {
			flex: 1 1 10rem;
		}
		/* links de al menos 44 px de alto para el dedo */
		li a,
		.panel a {
			min-height: var(--tap);
		}
	}
</style>
