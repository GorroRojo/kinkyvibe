import { redirect } from "@sveltejs/kit";

/** @type {import("./$types").RequestHandler} */
export function GET({ url }) {
    url.host = "fed.brid.gy"
    throw redirect(303, url);
}