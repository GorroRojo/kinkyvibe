/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event: request, resolve }) {
	//@ts-ignore
	request.locals.user_token = request.cookies.get('userToken')
	const response = await resolve(request);

	//@ts-ignore
	response.headers.append('set-cookie', `userToken=${request.locals.user_token ?? ''}; path=/; HttpOnly; SameSite=Strict`);
	return response;
}