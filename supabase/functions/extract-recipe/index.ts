import { authorize } from '../_shared/auth.ts';
import { handler, json, readJson, HttpError } from '../_shared/http.ts';
import { extractFromPage, extractFromPhotos, extractFromText, type ImageInput } from '../_shared/claude.ts';
import { fetchPublicPage } from '../_shared/safeFetch.ts';

/**
 * Read a recipe out of a photo, loose text, or a web page.
 *
 * This is the only place the Claude API key is used. The app never sees it.
 */

type Body =
  | { kind: 'photo'; images: ImageInput[] }
  | { kind: 'text'; text: string; sourceUrl?: string }
  | { kind: 'url'; url: string };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

Deno.serve(
  handler(async (req) => {
    const body = await readJson<Body>(req);
    await authorize(req, body.kind ?? 'unknown');

    switch (body.kind) {
      case 'photo':
        return json(await extractFromPhotos(validateImages(body.images)));

      case 'text': {
        if (typeof body.text !== 'string' || body.text.trim().length < 20) {
          throw new HttpError(400, 'There is not enough text here to make a recipe from.');
        }
        return json(await extractFromText(body.text, body.sourceUrl));
      }

      case 'url': {
        if (typeof body.url !== 'string') throw new HttpError(400, 'No link was sent.');
        const page = await fetchPublicPage(body.url);
        return json(await extractFromPage(page.html, page.finalUrl));
      }

      default:
        throw new HttpError(400, 'Unknown import type.');
    }
  }),
);

function validateImages(images: unknown): ImageInput[] {
  if (!Array.isArray(images) || images.length === 0) {
    throw new HttpError(400, 'No photos were sent.');
  }

  return images.map((image, index) => {
    if (typeof image?.base64 !== 'string' || !ALLOWED_MEDIA_TYPES.has(image?.mediaType)) {
      throw new HttpError(400, `Photo ${index + 1} is not a supported image.`);
    }
    // base64 inflates by 4/3; check the decoded size against the API's limit.
    if ((image.base64.length * 3) / 4 > MAX_IMAGE_BYTES) {
      throw new HttpError(413, `Photo ${index + 1} is too large. Resize it under 5 MB.`);
    }
    return { base64: image.base64, mediaType: image.mediaType } as ImageInput;
  });
}
