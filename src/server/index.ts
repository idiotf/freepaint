import express from 'express'
import EventEmitter from 'events'
import { createServer } from 'http'
import { createInterface } from 'readline'
import { chunkByteLength } from '../const'
import { Server, type Socket } from 'socket.io'
import { readChunk, writeChunk, type ChunkName } from './chunk'

const app = express()
app.disable('x-powered-by')

app.use(express.static('public'))
app.use(express.static('dist'))
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

const DEVELOPMENT_PORT = 3001
const PRODUCTION_PORT = 4287

const port = process.env.PORT || process.env.NODE_ENV == 'development' ? DEVELOPMENT_PORT : PRODUCTION_PORT
const server = createServer(app).listen(port, () => console.log(server.address()))
const io = new Server<Client2Server, Server2Client>(server, {
  maxHttpBufferSize: Number.MAX_VALUE,
  pingInterval: 3000,
  pingTimeout: 3000,
})

interface ChunkEventMap {
  chunk: [sender: Socket, x: bigint, y: bigint, data: Uint8ClampedArray]
}

const emitter = new EventEmitter<ChunkEventMap>

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

      for (let y = range.y1; y < range.y2; ++y) for (let x = range.x1; x < range.x2; ++x) {
        const name: ChunkName = `${x},${y}`
        const chunk = dirtyChunks[name]
        if (!chunk || x < range.x1 || range.x2 <= x || y < range.y1 || range.y2 <= y) continue

        socket.emit('chunk', x + '', y + '', chunk)
        delete dirtyChunks[name]
      }
    } catch { /* empty */ }
  })

  socket.on('readChunk', async (x, y, callback) => {
    try {
      callback(await readChunk(BigInt(x), BigInt(y)))
    } catch {
      callback(new Uint8ClampedArray(chunkByteLength))
    }
  })

  socket.on('writeChunk', async (strX, strY, data, isErase, callback) => {
    const x = BigInt(strX), y = BigInt(strY)
    const chunk = await writeChunk(x, y, data, isErase)
    emitter.emit('chunk', socket, x, y, chunk)
    callback(chunk)
  })

  function updateChunk(sender: Socket, x: bigint, y: bigint, data: Uint8ClampedArray) {
    if (sender == socket) return
    if (x < range.x1 || range.x2 <= x || y < range.y1 || range.y2 <= y) {
      const name: ChunkName = `${x},${y}`
      dirtyChunks[name] = data
      return
    }
    socket.emit('chunk', x + '', y + '', data)
  }

  emitter.on('chunk', updateChunk)
  socket.on('disconnecting', () => emitter.off('chunk', updateChunk))
})

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
})

rl.on('SIGINT', () => {
  console.log('Gracefully shutting down')
  server.close()
  server.once('close', () => process.exit())
})
