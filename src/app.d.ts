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
		// interface Platform {}
	}
}

export {};
