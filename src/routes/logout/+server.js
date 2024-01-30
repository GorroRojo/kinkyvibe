import { redirect } from '@sveltejs/kit';

export async function GET(request) {
	// @ts-ignore
	request.locals.user_token = '';
	request.cookies.set('prevToken', request.cookies.get('userToken') ?? '', { path: '/' });
	request.cookies.set('userToken', '', { path: '/' });
	throw redirect(302, request.url.searchParams.get('redirectTo') ?? '/admin');
}
