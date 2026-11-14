import { authorize } from '../_shared/auth.ts';
import { handler, json, readJson, HttpError } from '../_shared/http.ts';
import { fetchPublicPage } from '../_shared/safeFetch.ts';

/**
 * Fetch a public page and hand back its HTML.
 *
 * The app parses schema.org markup itself — that path costs nothing and needs
 * no model. It just cannot do the fetching: the web build is blocked by CORS,
 * and some sites refuse requests that do not look like a browser.
 */
Deno.serve(
  handler(async (req) => {
    const { url } = await readJson<{ url?: string }>(req);
    if (typeof url !== 'string' || !url) throw new HttpError(400, 'No link was sent.');

    await authorize(req, 'fetch-page');
    return json(await fetchPublicPage(url));
  }),
);
