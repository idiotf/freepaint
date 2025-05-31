import path from 'path'
import fs from 'fs/promises'
import express from 'express'
import EventEmitter from 'events'
import { createServer } from 'http'
import { Server, type Socket } from 'socket.io'
import { chunkByteLength } from '../const'

const app = express()
app.disable('x-powered-by')

app.use(express.static('public'))
app.use((_req, res) => res.redirect('/'))

export interface Client2Server {
  ping(): void
  setRange(x1: string, y1: string, x2: string, y2: string): void
  readChunk(x: string, y: string, callback: (data: Uint8ClampedArray) => void): void
  writeChunk(x: string, y: string, data: Uint8ClampedArray, isErase: boolean, callback: (data: Uint8ClampedArray) => void): void
}

export interface Server2Client {
  chunk(x: string, y: string, data: Uint8ClampedArray): void
}

const server = createServer(app)
const io = new Server<Client2Server, Server2Client>(server.listen(4287, () => console.log(server.address())), {
  maxHttpBufferSize: Number.MAX_VALUE,
})

interface ChunkEventMap {
  chunk: [sender: Socket<Client2Server, Server2Client>, x: string, y: string, data: Uint8ClampedArray]
}

const emitter = new EventEmitter<ChunkEventMap>

const chunksDir = 'paint_chunks'
try {
  await fs.access(chunksDir)
} catch {
  await fs.mkdir(chunksDir)
}

io.on('connection', socket => {
  const range = {
    x1: 0n,
    y1: 0n,
    x2: 0n,
    y2: 0n,
  }
  const dirtyChunks: Record<ChunkName, Uint8ClampedArray> = Object.create(null)
  socket.on('setRange', (x1, y1, x2, y2) => {
    try {
      range.x1 = BigInt(x1)
      range.y1 = BigInt(y1)
      range.x2 = BigInt(x2)
      range.y2 = BigInt(y2)
      for (const key in dirtyChunks) {
        const [ x, y ] = key.split(',').map(BigInt)
        if (x < range.x1 || range.x2 <= x || y < range.y1 || range.y2 <= y) continue
        socket.emit('chunk', x + '', y + '', dirtyChunks[key as ChunkName])
        delete dirtyChunks[key as ChunkName]
      }
    } catch {}
  })

  socket.on('readChunk', async (x, y, callback) => {
    try {
      callback(await readChunk(BigInt(x), BigInt(y)))
    } catch {
      callback(new Uint8ClampedArray(chunkByteLength))
    }
  })
  socket.on('writeChunk', async (x, y, data, isErase, callback) => {
    if (data.length != chunkByteLength) throw new RangeError(`Chunk size is not matching (Expected ${chunkByteLength}, Received ${data.length})`)

    callback(data = await (async () => {
      const chunk = await readChunk(BigInt(x), BigInt(y))
      const imgData = new Uint8ClampedArray(data)
      if (isErase) for (let i = 0; i < imgData.length; i += 4) {
        imgData[i + 0] = chunk[i + 0]
        imgData[i + 1] = chunk[i + 1]
        imgData[i + 2] = chunk[i + 2]
        imgData[i + 3] = chunk[i + 3] * (1 - imgData[i + 3] / 255)
      } else for (let i = 0; i < imgData.length; i += 4) {
        imgData[i + 0] = (1 - imgData[i + 3] / 255) * chunk[i + 0] + imgData[i + 3] / 255 * imgData[i + 0]
        imgData[i + 1] = (1 - imgData[i + 3] / 255) * chunk[i + 1] + imgData[i + 3] / 255 * imgData[i + 1]
        imgData[i + 2] = (1 - imgData[i + 3] / 255) * chunk[i + 2] + imgData[i + 3] / 255 * imgData[i + 2]
        imgData[i + 3] = (1 - (1 - chunk[i + 3] / 255) * (1 - imgData[i + 3] / 255)) * 255
      }
      return imgData
    })())
    emitter.emit('chunk', socket, x, y, data)
    await writeChunk(BigInt(x), BigInt(y), data)
  })

  function updateChunk(sender: Socket<Client2Server, Server2Client>, strX: string, strY: string, data: Uint8ClampedArray) {
    const x = BigInt(strX), y = BigInt(strY)
    if (sender == socket) return
    if (x < range.x1 || range.x2 <= x || y < range.y1 || range.y2 <= y) {
      dirtyChunks[`${x},${y}`] = data
      return
    }
    socket.emit('chunk', strX, strY, data)
  }
  emitter.on('chunk', updateChunk)
  socket.on('disconnecting', () => emitter.off('chunk', updateChunk))
})

export type ChunkName<X extends bigint = bigint, Y extends bigint = bigint> = `${X},${Y}`

const chunks: Record<ChunkName, Promise<Uint8ClampedArray>> = Object.create(null)

async function readChunk<X extends bigint, Y extends bigint>(x: X, y: Y) {
  const name: ChunkName<X, Y> = `${x},${y}`
  const cachedChunk = await chunks[name]
  if (cachedChunk) return cachedChunk

  try {
    return await (chunks[name] = (async () => new Uint8ClampedArray(await fs.readFile(path.join(chunksDir, name))))())
  } catch {
    return chunks[name] = (async () => new Uint8ClampedArray(chunkByteLength))()
  }
}

async function writeChunk<X extends bigint, Y extends bigint>(x: X, y: Y, data: Uint8ClampedArray) {
  const name: ChunkName<X, Y> = `${x},${y}`
  chunks[name] = (async () => data)()

  await fs.writeFile(path.join(chunksDir, name), await chunks[name])
}
