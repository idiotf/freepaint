import path from 'path'
import fs from 'fs/promises'
import { chunkByteLength } from '../const'

export type ChunkName = `${bigint},${bigint}`

const chunksDir = process.env.CHUNKS_DIR || 'paint_chunks'
await fs.access(chunksDir).catch(() => fs.mkdir(chunksDir))

const chunks: Record<ChunkName, Promise<Uint8ClampedArray>> = Object.create(null)

export function readChunk(x: bigint, y: bigint) {
  const name: ChunkName = `${x},${y}`
  const promise = chunks[name]
  if (promise) return promise

  return chunks[name] = fs.readFile(path.join(chunksDir, name)).then(
    buffer => new Uint8ClampedArray(buffer),
    () => new Uint8ClampedArray(chunkByteLength),
  )
}

const writeQueue: Record<ChunkName, Uint8ClampedArray> = Object.create(null)

export async function writeChunk(x: bigint, y: bigint, data: Uint8ClampedArray, isErase = false) {
  if (data.length != chunkByteLength) throw new RangeError(`Chunk size is not matching (Expected ${chunkByteLength}, Received ${data.length})`)

  const name: ChunkName = `${x},${y}`
  let promise: Promise<Uint8ClampedArray>, chunk: Uint8ClampedArray
  do {
    promise = readChunk(x, y)
    // mergeChunk는 원본 배열의 값을 변경하므로, 반드시 복사가 필요하다.
    chunk = new Uint8ClampedArray(await promise)
  } while (chunks[name] != promise)

  return chunks[name] = Promise.resolve(writeQueue[name] = mergeChunk(chunk, data, isErase))
}

function mergeChunk(dst: Uint8ClampedArray, src: Uint8ClampedArray, isErase = false) {
  for (let i = 0; i < src.length; i += 4) {
    const r = i + 0, g = i + 1, b = i + 2, a = i + 3
    const dstAlpha = dst[a] * (255 - src[a]) / 255
    if (isErase) {
      dst[a] = dstAlpha
    } else {
      const alpha = src[a] + dstAlpha
      dst[r] = (src[r] * src[a] + dst[r] * dstAlpha) / alpha
      dst[g] = (src[g] * src[a] + dst[g] * dstAlpha) / alpha
      dst[b] = (src[b] * src[a] + dst[b] * dstAlpha) / alpha
      dst[a] = alpha
    }
  }

  return dst
}

setInterval(() => {
  for (const k in writeQueue) {
    const name = k as ChunkName
    fs.writeFile(path.join(chunksDir, name), writeQueue[name])
    delete writeQueue[name]
  }
}, 1000)
