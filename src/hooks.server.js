/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event: request, resolve }) {
	//@ts-ignore
	request.locals.user = request.cookies.get('user')
	const response = await resolve(request);

	//@ts-ignore
	response.headers.append('set-cookie', `user=${request.locals.user ?? ''}; path=/; HttpOnly; SameSite=Strict`);
	return response;
}