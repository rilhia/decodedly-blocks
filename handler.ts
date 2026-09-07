import type { StartTaskMessage, TaskContext, HandlerResult } from '@blocks-network/sdk';

/**
 * Decodedly — text steganography via a reverse-engineered Vigenère cipher.
 *
 * Standard Vigenère: cipher = plain + key (mod N).
 * Decodedly flips which side is solved for. Instead of choosing a key and
 * letting ciphertext fall out as gibberish, the *cover text* (real, readable
 * text) and the *secret* are both fixed, and the key is derived as the
 * difference between them: key = cover - secret (mod N). Anyone holding the
 * key can recover the secret from the cover text; anyone without it just
 * reads an ordinary sentence.
 *
 * Operates over the 95 printable ASCII characters (32-126). Matches the
 * behaviour of the original Decodedly web tool, including silently
 * stripping any character outside that range (newlines, emoji, accents,
 * etc.) before the cipher maths runs.
 */

const CHARSET_START = 32;
const CHARSET_LEN = 95; // 126 - 32 + 1

function charIndex(ch: string): number {
  const code = ch.charCodeAt(0);
  return code >= CHARSET_START && code < CHARSET_START + CHARSET_LEN ? code - CHARSET_START : -1;
}

function indexToChar(i: number): string {
  const wrapped = ((i % CHARSET_LEN) + CHARSET_LEN) % CHARSET_LEN;
  return String.fromCharCode(CHARSET_START + wrapped);
}

/** Strips anything outside printable ASCII 32-126. */
function sanitize(str: string): string {
  return Array.from(str)
    .filter((ch) => charIndex(ch) !== -1)
    .join('');
}

type HidePayload = { secretMessage?: string; coverText?: string };
type RevealPayload = { coverText?: string; key?: string };

export default async function handler(
  task: StartTaskMessage,
  ctx?: TaskContext,
): Promise<HandlerResult> {
  const hidePart = task.requestParts?.find((p) => p.partId === 'hide');
  const revealPart = task.requestParts?.find((p) => p.partId === 'reveal');

  if (hidePart) {
    ctx?.reportStatus('Deriving key from cover text...');

    let payload: HidePayload;
    try {
      payload = JSON.parse(hidePart.text ?? '{}');
    } catch {
      throw new Error('The "hide" input must be valid JSON with secretMessage and coverText.');
    }

    const secret = sanitize(payload.secretMessage ?? '');
    const cover = sanitize(payload.coverText ?? '');

    if (!secret) throw new Error('secretMessage is required.');
    if (!cover) throw new Error('coverText is required.');
    if (secret.length > cover.length) {
      throw new Error(
        `coverText must be at least as long as secretMessage once non-printable characters are removed ` +
          `(secretMessage: ${secret.length} chars, coverText: ${cover.length} chars).`,
      );
    }

    let key = '';
    for (let i = 0; i < secret.length; i++) {
      const shift = (charIndex(cover[i]) - charIndex(secret[i]) + CHARSET_LEN) % CHARSET_LEN;
      key += indexToChar(shift);
    }

    return {
      artifacts: [
        {
          data: JSON.stringify({
            key,
            keyLength: key.length,
            note: `Only the first ${key.length} character(s) of coverText were used to derive this key — the rest of your cover text is untouched. Share the key and the full coverText with your contact; keep secretMessage to yourself.`,
          }),
          mimeType: 'application/json',
          outputId: 'key',
        },
      ],
    };
  }

  if (revealPart) {
    ctx?.reportStatus('Decoding cover text with key...');

    let payload: RevealPayload;
    try {
      payload = JSON.parse(revealPart.text ?? '{}');
    } catch {
      throw new Error('The "reveal" input must be valid JSON with coverText and key.');
    }

    const cover = sanitize(payload.coverText ?? '');
    const key = sanitize(payload.key ?? '');

    if (!cover) throw new Error('coverText is required.');
    if (!key) throw new Error('key is required.');
    if (key.length > cover.length) {
      throw new Error('key is longer than coverText — check you have the matching cover text.');
    }

    // Trim to key length: decode exactly as many characters as the key
    // covers, with no cyclic repetition beyond that.
    let secret = '';
    for (let i = 0; i < key.length; i++) {
      secret += indexToChar(charIndex(cover[i]) - charIndex(key[i]));
    }

    return {
      artifacts: [{ data: secret, mimeType: 'text/plain', outputId: 'secretMessage' }],
    };
  }

  throw new Error('Send a "hide" or "reveal" input part.');
}
