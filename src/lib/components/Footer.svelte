<script>
	import {
		ArrowRight,
		BookOpen,
		Heart,
		Sparkles,
		CalendarRange,
		ShoppingCart
	} from 'lucide-svelte';
	import { siTiktok, siInstagram, siTwitter, siKofi, siYoutube, siTelegram } from 'simple-icons';
	import SimpleIcon from '$lib/components/SimpleIcon.svelte';
	let style = "scale:var(--scale,1);translate:var(--translate,0 0);"
</script>

<footer>
	Codigueado por <a href="https://www.gorro.ar/">Gorro_Rojo</a>
	<ul>
		<li>
			<h3>Contenido</h3>
			<ul class="contenido">
				<li><a href="/nosotres"><ArrowRight {style}/>Nosotres</a></li>
				<li><a href="/material"><BookOpen {style}/>Información</a></li>
				<li><a href="/amigues"><Heart {style}/>Amigues</a></li>
				<li><a href="/calendario"><CalendarRange {style}/>Calendario</a></li>
				<li><a href="https://kinkyvibe.mitiendanube.com"><ShoppingCart {style}/>Tienda</a></li>
				<li><a href="/servicios"><Sparkles {style} />Servicios</a></li>
			</ul>
		</li>
		<li>
			<h3>Redes</h3>
			<ul class="redes">
				<li>
					<a href="https://cafecito.app/kinkyvibe"><SimpleIcon icon={siKofi} />CafecitoApp</a>
				</li>
				<li><a href="https://t.me/BDSMtextos"><SimpleIcon icon={siTelegram} />Telegram</a></li>
				<li>
					<a href="https://www.instagram.com/kinkyvibeargentina/"
						><SimpleIcon icon={siInstagram} />Instagram</a
					>
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
			</ul>
		</li>
	</ul>
</footer>

<style>
	footer {
		margin: 0;
		margin-top: 8em;
		padding: 2em;
		background: indigo;
		color: white;
		border-radius: 2em 2em 0 0;
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		box-sizing: border-box;
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
	}
	li > ul {
		padding: 0;
		list-style: none;
	}
</style>
