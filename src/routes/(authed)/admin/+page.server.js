//@ts-nocheck
// import { env } from '$env/dynamic/private';
// import { Octokit } from '@octokit/core';
// import { error } from '@sveltejs/kit';
export async function load() {
	// const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
	let existing=false;
	// try {
		// existing = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
		// 	owner: 'GorroRojo',
		// 	repo: 'KinkyVibe',
		// 	path: 'src/lib/posts/nuevo.md',
		// 	headers: {
		// 		'X-GitHub-Api-Version': '2022-11-28'
		// 	}
		// });
	// } catch (e) {
		// throw error(400,e);
	// }
    let gitHubRequestOptions = {
		owner: 'GorroRojo',
		repo: 'KinkyVibe',
		path: 'src/lib/posts/nuevo.md',
		message: 'my commit message',
		content: 'bXkgbmV3IGZpbGUgY29udGVudHM=',
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	}
    if (existing && existing?.status != 404) {
        gitHubRequestOptions.sha = existing.data.sha;
    }
	// let i;
	// i = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', gitHubRequestOptions);
	return {
		res: existing?.data?.content
	};
}
