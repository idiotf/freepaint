import path from 'path'
import fs from 'fs/promises'
import express from 'express'
import { Server } from 'socket.io'
import { createServer } from 'http'
// import { chunkByteLength } from '../const'

const app = express()
app.disable('x-powered-by')

app.use(express.static('public'))
app.use(express.raw({ limit: Infinity }))

app.get('/paint_chunks/:name', (_req, res) => res.sendFile('blank.png', { root: process.cwd() }))
app.post('/paint_chunks/:x.:y.png', async (req, res) => {
  await writeChunk(BigInt(req.params.x), BigInt(req.params.y), req.body)
  res.end()
})
app.use((_req, res) => res.redirect('/'))

export interface Client2Server {
  setRange(x1: string, y1: string, x2: string, y2: string): void
  // chunk(x: string, y: string, data: Uint8ClampedArray): void
}

export interface Server2Client {
  chunk(x: string, y: string): void
}

const server = createServer(app)
const io = new Server<Client2Server, Server2Client>(server.listen(3001, () => console.log(server.address())))

io.on('connection', socket => {
  const range = {
    x1: 0n,
    y1: 0n,
    x2: 0n,
    y2: 0n,
  }
  socket.on('setRange', (x1, y1, x2, y2) => {
    try {
      range.x1 = BigInt(x1)
      range.y1 = BigInt(y1)
      range.x2 = BigInt(x2)
      range.y2 = BigInt(y2)
    } catch {}
  })
  // socket.on('chunk', async (x, y, data) => {
  //   socket.broadcast.emit('chunk', x, y)
  //   await writeChunk(BigInt(x), BigInt(y), data)
  // })
})

export type ChunkName<X extends bigint = bigint, Y extends bigint = bigint> = `${X}.${Y}.png`

// const chunks: Record<ChunkName, Promise<Uint8ClampedArray>> = {}

// async function readChunk<X extends bigint, Y extends bigint>(x: X, y: Y) {
//   const name: ChunkName<X, Y> = `${x},${y}.png`
//   const cachedChunk = await chunks[name]
//   if (cachedChunk) return cachedChunk

//   try {
//     return await (chunks[name] = (async () => new Uint8ClampedArray(await fs.readFile(path.join('paint_chunks', name))))())
//   } catch {
//     return chunks[name] = (async () => new Uint8ClampedArray(chunkByteLength))()
//   }
// }

// async function writeChunk<X extends bigint, Y extends bigint>(x: X, y: Y, data: Uint8ClampedArray) {
//   if (data.length != chunkByteLength) throw new RangeError(`Chunk size is not matching (Expected ${chunkByteLength}, Received ${data.length})`)

//   const name: ChunkName<X, Y> = `${x},${y}.png`
//   chunks[name] = (async () => data)()

//   await fs.writeFile(path.join('public/paint_chunks', name), data)
// }

async function writeChunk<X extends bigint, Y extends bigint>(x: X, y: Y, data: string | import('stream') | NodeJS.ArrayBufferView<ArrayBufferLike> | Iterable<string | NodeJS.ArrayBufferView<ArrayBufferLike>> | AsyncIterable<string | NodeJS.ArrayBufferView<ArrayBufferLike>>) {
  const name: ChunkName<X, Y> = `${x}.${y}.png`
  await fs.writeFile(path.join('public/paint_chunks', name), data)
}
