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
  data = new Uint8ClampedArray(data)
  let promise: Promise<Uint8ClampedArray>, chunk: Uint8ClampedArray
  do {
    promise = readChunk(x, y)
    chunk = await promise
  } while (chunks[name] == promise)

  return chunks[name] = Promise.resolve(writeQueue[name] = mergeChunk(chunk, data, isErase))
}

function mergeChunk(chunk: Uint8ClampedArray, data: Uint8ClampedArray, isErase = false) {
  if (isErase) for (let i = 0; i < data.length; i += 4) {
    const r = i + 0, g = i + 1, b = i + 2, a = i + 3
    data[r] = chunk[r]
    data[g] = chunk[g]
    data[b] = chunk[b]
    data[a] = chunk[a] * (255 - data[a]) / 255
  } else for (let i = 0; i < data.length; i += 4) {
    const r = i + 0, g = i + 1, b = i + 2, a = i + 3
    data[r] = (255 - data[a]) * chunk[r] / 255 + data[a] * data[r] / 255
    data[g] = (255 - data[a]) * chunk[g] / 255 + data[a] * data[g] / 255
    data[b] = (255 - data[a]) * chunk[b] / 255 + data[a] * data[b] / 255
    data[a] = 255 - (255 - chunk[a]) * (255 - data[a]) / 255
  }

  return data
}

setInterval(() => {
  for (const k in writeQueue) {
    const name = k as ChunkName
    fs.writeFile(path.join(chunksDir, name), writeQueue[name])
    delete writeQueue[name]
  }
}, 1000)
