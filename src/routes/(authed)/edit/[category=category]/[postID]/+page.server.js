import { Buffer } from 'buffer';
import { ghGet, ghPut } from '$lib/external/github.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ locals, params }) {
	return {
		post: {sha:'',path:'',raw:`---
published_date: 2000-08-04Z-03:00
updated_date: 2024-01-12Z-03:00
title: gorrite
summary: Programadore, artista, captive.
tags:
- español
- BDSM
- arte
- profesional
- AMBA
layout: amigues
category: amigues
authors:
- Gorro_Rojo
featured: 1
#force_unlisted: false
#force_unpublished: false
pronoun: https://pronombr.es/eso&elle,le,le,une,eso&elle,les,unes,les,e,co,
link: https://gorro.ar
logo: 1
# photo: 1
email: gorro.rojo@gmail.com
#location: Thames 240, Ciudad Autónoma de Buenos Aires
#tel: +54 9 11 5555 3333
# job_title: Educador BDSM
gender_identity: Agénero
bday: 2000-08-04
---

> Este perfil no es útil porque no estoy contratable para nada, pero como armé todo el sitio tenía que incluirme jsajss así que yafu. Lolamento (?

Holi, soy gorrite <small>(así, en minúscula)</small>, soy une captive juguete de bondage; estoy autocollareade en una dinámica D/s 24/7 conmigo misme, con un comité de Doms y Tops, y con toda la comunidad; y programé todo este sitio web 🌈.

Colaboro con @KinkyVibe armando el sitio, organizando el grupo de sumis, monitoreando eventos, modelando talleres, y ayudando a gestionar la comunidad de @AUCH .

Por fuera de eso, hago arte 3D usando mi eterno amor [Blender](https://www.blender.org), y juego un poco con todos los tipos de arte con los que me cruzo. Actuación, canto, baile, escritura, animación, piano y cine.

Soy arro-ase fetichista, agénero, neurodivergente, no-monógame, anticapacitista, y antiespecista vegane. Estoy en contra de la propiedad intelectual y amo el software libre. Me dan pánico los insectos. 

## Contacto

- Por telegram: [\@Gorro_Rojo](https://t.me/Gorro_Rojo)
- Por instagram: [\@Gorro_Rojo](https://instagram.com/Gorro_Rojo)
- Por mail: [gorro.rojo@gmail.com](mailto:gorro.rojo@gmail.com)

Mucho gusto`} ||
		await getFileContent(
			locals.user_token,
			`src/lib/posts/${params.category}/${params.postID}.md`
		)
	};
}

/** @type {import("./$types").Actions} */
export const actions = {
	save: async ({ params, cookies, request }) => {
		const token = cookies.get('userToken') ?? 'TOKEN NOT FOUND';
		const data = await request.formData();
		const fileContent = data.get('content');
		let userName = cookies.get('userName');
		if (userName == "null") userName = cookies.get('userLogin')
		// @ts-ignore
		saveFileContent(token, data.get('path') ?? '', fileContent, data.get('sha'), userName, params.category, params.postID);
		return { save: 'Guardado' };
	},
	load: async ({ cookies, request }) => {
		const token = cookies.get('userToken') || 'TOKEN NOT FOUND';
		const data = await request.formData();
		const fileContent = await getFileContent(
			token,
			'src/lib/posts/' + data.get('category') + '/' + data.get('path') + '.md'
		);
		return { post: fileContent };
	}
};
/**
 *
 * @param {string} token
 * @param {string} path
 * @returns {Promise<*>}
 */
async function getFileContent(token, path) {
	let fileContent = await ghGet('repos/GorroRojo/kinkyvibe/contents/' + path, token);
	let raw = Buffer.from(fileContent.content, fileContent.encoding).toString();
	return { raw, ...fileContent };
}

/**
 * Saves the content of a file to a specified path in a GitHub repository.
 *
 * @param {string} token - The access token for the GitHub repository.
 * @param {string} path - The path to the file in the GitHub repository.
 * @param {string} content - The content to be saved in the file.
 * @param {string} sha - The file's original sha
 * @param {string} userName - The user's name
 * @param {string} category - The category of the post
 * @param {string} postID - The post ID
 * @return {Promise<*>} A promise that resolves with the response from the GitHub API.
 */
async function saveFileContent(token, path, content, sha, userName, category, postID) {
	return await ghPut('repos/GorroRojo/kinkyvibe/contents/' + path, token, content, sha, userName, category, postID);
}
