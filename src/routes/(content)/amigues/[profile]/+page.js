// The profile comes whole from the server (the database): there is no .md component to load.
/** @type {import("./$types").PageLoad} */
export async function load({ data }) {
	return { ...data, content: undefined };
}
