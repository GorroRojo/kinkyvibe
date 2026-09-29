// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user: Partial<GHUser>|undefined,
			user_token: string // Your type here
		}
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface Platform {
			env: {
				/** Base de datos D1. Puede faltar (build/prerender, o si no se vinculó en Cloudflare). */
				DB?: import('@cloudflare/workers-types').D1Database;
				/** Sal secreta opcional para los hashes anónimos de "Me interesa". */
				INTEREST_SALT?: string;
			};
			ctx?: import('@cloudflare/workers-types').ExecutionContext;
			caches?: import('@cloudflare/workers-types').CacheStorage;
			cf?: import('@cloudflare/workers-types').IncomingRequestCfProperties;
		}
	}
}

export {};
