// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	/** Rama del deploy (Workers Builds o Pages; '' en local). Ver src/lib/server/deploy.js. */
	const __DEPLOY_BRANCH__: string;
	namespace App {
		interface Locals {
			/** Verified against GitHub in hooks.server.js; never read from client cookies. */
			user: {
				/** Numeric GitHub user id (what admin checks use). Always set for real sessions. */
				id?: number,
				login: string,
				name: string | null,
				avatar_url: string
			} | undefined,
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
				/** Bucket de R2 de los backups de la base (solo en el Worker de producción). */
				BACKUPS?: import('@cloudflare/workers-types').R2Bucket;
			};
			ctx?: import('@cloudflare/workers-types').ExecutionContext;
			caches?: import('@cloudflare/workers-types').CacheStorage;
			cf?: import('@cloudflare/workers-types').IncomingRequestCfProperties;
		}
	}
}

export {};
