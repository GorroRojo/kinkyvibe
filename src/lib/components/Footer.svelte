<script>
	import {
		ArrowRight,
		BookOpen,
		Heart,
		Sparkles,
		CalendarRange,
		ShoppingCart,
		Rss,
		Layers,
		Globe,
		Home
	} from 'lucide-svelte';
	import { siTiktok, siInstagram, siTwitter, siKofi, siYoutube, siTelegram } from 'simple-icons';
	import SimpleIcon from '$lib/components/SimpleIcon.svelte';
	let style = `scale:var(--scale,1);
				 translate:var(--translate,0 0);`;
</script>

<footer>
	Codigueado por <a href="/Gorro_Rojo">Gorro_Rojo</a>. Esta página es <a href="https://github.com/gorrorojo/kinkyvibe">código abierto</a> y software libre.
	<ul>
		<li>
			<h3>Contenido</h3>
			<ul class="contenido">
				<li><a href="/"><Home {style} />Inicio</a></li>
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
				<li><a href="/nosotres"><ArrowRight {style} />Nosotres</a></li>
				<li><a href="https://tienda.kinkyvibe.ar" target="_blank"><ShoppingCart {style} />Tienda</a></li>
				<li><a href="/servicios"><Sparkles {style} />Servicios</a></li>
				<li>
					<a href="https://cafecito.app/kinkyvibe" target="_blank">
						<SimpleIcon icon={siKofi} />CafecitoApp
					</a>
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
	</ul>
</footer>

<style>
	:global(body) {
		/* padding-bottom: 40rem; */
	}
	footer {
		margin: 0;
		margin-top: 8em;
		padding: 2em;
		background: indigo;
		color: white;
		border-radius: 2em 2em 0 0;
		/* position: absolute; */
		bottom: 0;
		left: 0;
		right: 0;
		box-sizing: border-box;
		font-size: var(--step--1);
		/* transition: 1000ms; */
	}
	a {
		color: white;
		text-decoration: underline;
		text-decoration-color: rgba(250, 250, 250, 0.4);
	}
	li a {
		--scale: 0.8;
		--translate: -0.2em 0.4em;
		--color: white;
	}
	a:hover {
		text-decoration-color: var(--1);
	}
	footer > ul {
		display: flex;
		list-style: none;
		justify-content: space-around;
		padding: 0;
		flex-wrap: wrap;
		gap: 4px;
	}
	li > ul {
		padding: 0;
		list-style: none;
	}
	@media screen and (max-width: 680px) {
		footer {
			bottom: 6rem;
		}
		:global(body) {
			padding-bottom: 6rem;
		}
	}
</style>
