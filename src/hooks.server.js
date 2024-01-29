/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event: request, resolve }) {
	//@ts-ignore
	request.locals.user_token = request.cookies.get('userToken')
	const response = await resolve(request);
	return response;
}