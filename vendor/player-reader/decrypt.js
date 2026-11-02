// Player files are AES-128-CBC encrypted; key and IV are the string "h3y_gUyZ" as UTF-16 LE.

const KEY = new Uint8Array([104, 0, 51, 0, 121, 0, 95, 0, 103, 0, 85, 0, 121, 0, 90, 0])

/** The decrypted bytes of a .plr file (Web Crypto: browsers and Node 20+). */
export async function decryptPlayerFile(data                          )                      {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('Web Crypto (crypto.subtle) is not available')
  const key = await subtle.importKey('raw', KEY, 'AES-CBC', false, ['decrypt'])
  try {
    return new Uint8Array(await subtle.decrypt({ name: 'AES-CBC', iv: KEY }, key, data))
  } catch {
    throw new Error('Not a Terraria player file (decryption failed)')
  }
}
