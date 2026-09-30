// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			/** Verified against GitHub in hooks.server.js; never read from client cookies. */
			user: { login: string, name: string | null, avatar_url: string } | undefined,
			/** GitHub OAuth token (server-only, never return it from a load). '' when not logged in. */
			user_token: string
		}
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface Platform {
			env: {
				/** Base de datos D1. Puede faltar (build/prerender, o si no se vinculó en Cloudflare). */
				DB?: import('@cloudflare/workers-types').D1Database;
			};
			ctx?: import('@cloudflare/workers-types').ExecutionContext;
			caches?: import('@cloudflare/workers-types').CacheStorage;
			cf?: import('@cloudflare/workers-types').IncomingRequestCfProperties;
		}
	}
}

export {};
