const encoder = new TextEncoder()

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

// Matches `git hash-object` so local baselines compare directly against
// blob SHAs in GitHub tree listings.
export const gitBlobShaFromText = async (text: string) => {
  const content = encoder.encode(text)
  const header = encoder.encode(`blob ${content.byteLength}\0`)
  const payload = new Uint8Array(header.byteLength + content.byteLength)
  payload.set(header, 0)
  payload.set(content, header.byteLength)
  return toHex(await crypto.subtle.digest('SHA-1', payload))
}
