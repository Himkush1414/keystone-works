const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * ULID-style id: 10 time characters + 16 random characters, lexicographically sortable by creation time.
 * Ids only need to be unique on one device, so Math.random is sufficient (no crypto dependency).
 */
export function newId(now: number = Date.now()): string {
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let rand = '';
  for (let i = 0; i < 16; i++) rand += ALPHABET[Math.floor(Math.random() * 32)];
  return time + rand;
}
