import io, { type Socket } from 'socket.io-client'
import { CHUNK_SIZE, chunkByteLength } from '../const'
import type { Client2Server, Server2Client, ChunkName } from '../server'

const canvas = document.querySelector('canvas') as HTMLCanvasElement
const context = canvas.getContext('2d')!

function rerender(clear = true) {
  context.imageSmoothingEnabled = false
  context.resetTransform()
  if (clear) context.clearRect(0, 0, canvas.width, canvas.height)
  context.setTransform(camera.zoom, 0, 0, camera.zoom, Math.round(canvas.width / 2 + camera.x * camera.zoom), Math.round(canvas.height / 2 + camera.y * camera.zoom))

  const chunkX1 = Math.floor((-camera.x * camera.zoom - canvas.width / 2) / camera.zoom / CHUNK_SIZE)
  const chunkY1 = Math.floor((-camera.y * camera.zoom - canvas.height / 2) / camera.zoom / CHUNK_SIZE)
  const chunkX2 = Math.ceil((-camera.x * camera.zoom + canvas.width / 2) / camera.zoom / CHUNK_SIZE)
  const chunkY2 = Math.ceil((-camera.y * camera.zoom + canvas.height / 2) / camera.zoom / CHUNK_SIZE)

  const promises = []
  for (let chunkY = BigInt(chunkY1); chunkY < chunkY2; ++chunkY) for (let chunkX = BigInt(chunkX1); chunkX < chunkX2; ++chunkX) promises.push((async () => {
    putImageContext.putImageData(new ImageData(await readChunk(BigInt(chunkX), BigInt(chunkY)), CHUNK_SIZE), 0, 0)
    context.clearRect(Number(chunkX) * CHUNK_SIZE, Number(chunkY) * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE)
    context.drawImage(putImageCanvas, Number(chunkX) * CHUNK_SIZE, Number(chunkY) * CHUNK_SIZE)
  })())
}

new ResizeObserver(entries => entries.forEach(({ target, devicePixelContentBoxSize: [ { inlineSize, blockSize } ] }) => {
  if (target != canvas) return
  canvas.width = inlineSize
  canvas.height = blockSize
  rerender()
})).observe(canvas, { box: 'device-pixel-content-box' })

const enum DrawMode {
  VIEW = 0,
  DRAW = 1,
  ERASE = 2,
}

const camera = {
  x: 0,
  y: 0,
  zoom: 1,
}

const drawOptions = {
  mode: DrawMode.DRAW,
  lineWidth: 1,
  color: '#000',
}

canvas.style.cursor = 'crosshair'
window.addEventListener('keydown', event => {
  switch (event.key) {
    case 'Enter':
      switch (drawOptions.mode) {
        case DrawMode.VIEW:
          drawOptions.mode = DrawMode.DRAW
          canvas.style.cursor = 'crosshair'
          break
        case DrawMode.DRAW:
          drawOptions.mode = DrawMode.ERASE
          canvas.style.cursor = 'crosshair'
          break
        case DrawMode.ERASE:
          drawOptions.mode = DrawMode.VIEW
          canvas.style.cursor = 'move'
          break
      }
      break
    case 'ArrowUp':
      drawOptions.lineWidth = drawOptions.lineWidth + 1
      break
    case 'ArrowDown':
      drawOptions.lineWidth = Math.max(1, drawOptions.lineWidth - 1)
      break
  }
})

const getCoord = (x: number, width: number, cameraX: number) => Math.round((x * devicePixelRatio - width / 2) / camera.zoom - cameraX - drawOptions.lineWidth % 2 / 2) + drawOptions.lineWidth % 2 / 2

canvas.addEventListener('mousedown', event => {
  switch (event.button) {
    case 0: {
      const lineAction = (event: MouseEvent, isErase = false) => drawLine(
        oldX, oldY,
        oldX = getCoord(event.clientX, canvas.width, camera.x), oldY = getCoord(event.clientY, canvas.height, camera.y),
        drawOptions.lineWidth, drawOptions.color,
        isErase,
      )
      let oldX = getCoord(event.clientX, canvas.width, camera.x), oldY = getCoord(event.clientY, canvas.height, camera.y)

      function move(event: MouseEvent) {
        switch (drawOptions.mode) {
          case DrawMode.VIEW:
            camera.x += event.movementX / camera.zoom
            camera.y += event.movementY / camera.zoom
            rerender()
            break
          case DrawMode.DRAW:
            lineAction(event)
            break
          case DrawMode.ERASE:
            lineAction(event, true)
            break
        }
      }

      function stop() {
        removeEventListener('mousemove', move)
        removeEventListener('mouseup', stop)
      }

      addEventListener('mousemove', move)
      addEventListener('mouseup', stop)

      move(event)
      break
    }
    case 1: {
      let x = 0, y = 0

      function move(moveEvent: MouseEvent) {
        x -= moveEvent.movementX
        y -= moveEvent.movementY
      }

      function stop() {
        removeEventListener('mousemove', move)
        removeEventListener('mouseup', stop)
        clearInterval(interval)
      }

      const interval = setInterval(() => {
        camera.x += x * 0.05 / camera.zoom
        camera.y += y * 0.05 / camera.zoom
        rerender()
      })

      addEventListener('mousemove', move)
      addEventListener('mouseup', stop)
      break
    }
  }
})

canvas.addEventListener('touchstart', event => {
  if (event.touches.length > 1) return
  const lineAction = (event: TouchEvent, isErase = false) => drawLine(
    oldX, oldY,
    oldX = getCoord(event.touches[0].clientX, canvas.width, camera.x), oldY = getCoord(event.touches[0].clientY, canvas.height, camera.y),
    drawOptions.lineWidth, drawOptions.color,
    isErase,
  )
  let oldX = getCoord(event.touches[0].clientX, canvas.width, camera.x), oldY = getCoord(event.touches[0].clientY, canvas.height, camera.y)

  function move(event: TouchEvent) {
    switch (drawOptions.mode) {
      case DrawMode.VIEW:
        camera.x += event.touches[0].clientX - oldX / camera.zoom
        camera.y += event.touches[0].clientY - oldY / camera.zoom
        rerender()
        break
      case DrawMode.DRAW:
        lineAction(event)
        break
      case DrawMode.ERASE:
        lineAction(event, true)
        break
    }
  }

  function stop() {
    removeEventListener('touchmove', move)
    removeEventListener('touchend', stop)
  }

  addEventListener('touchmove', move)
  addEventListener('touchend', stop)

  move(event)
}, { passive: true })

canvas.addEventListener('wheel', event => {
  camera.zoom = Math.max(1, Math.min(camera.zoom * 2 ** -Math.sign(event.deltaY), 256))
  rerender()
}, { passive: true })

const chunkCanvas = new OffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE)
const chunkContext = chunkCanvas.getContext('2d', { willReadFrequently: true })!
chunkContext.lineCap = 'round'

const putImageCanvas = new OffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE)
const putImageContext = putImageCanvas.getContext('2d', { willReadFrequently: true })!

const socket: Socket<Server2Client, Client2Server> = io()
setInterval(() => socket.emit('ping'), 1000)
socket.on('connect', () => {
  setRange(true)
  for (const key in chunks) delete chunks[key as ChunkName]
  rerender(false)
})

const chunks: Record<ChunkName, Promise<Uint8ClampedArray>> = Object.create(null)
const lastModifiedTable: Record<ChunkName, number> = Object.create(null)
socket.on('chunk', (strX, strY, data) => {
  const x = BigInt(strX), y = BigInt(strY)
  const name: ChunkName = `${x},${y}`
  chunks[name] = (async () => data = new Uint8ClampedArray(data))()

  putImageContext.putImageData(new ImageData(data, CHUNK_SIZE), 0, 0)
  context.clearRect(+strX * CHUNK_SIZE, +strY * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE)
  context.drawImage(putImageCanvas, +strX * CHUNK_SIZE, +strY * CHUNK_SIZE)
})

let prevChunkX1: number, prevChunkY1: number, prevChunkX2: number, prevChunkY2: number
function setRange(force = false) {
  const chunkX1 = Math.floor((-camera.x * camera.zoom - canvas.width / 2) / camera.zoom / CHUNK_SIZE)
  const chunkY1 = Math.floor((-camera.y * camera.zoom - canvas.height / 2) / camera.zoom / CHUNK_SIZE)
  const chunkX2 = Math.ceil((-camera.x * camera.zoom + canvas.width / 2) / camera.zoom / CHUNK_SIZE)
  const chunkY2 = Math.ceil((-camera.y * camera.zoom + canvas.height / 2) / camera.zoom / CHUNK_SIZE)
  if (force || chunkX1 != prevChunkX1 || chunkY1 != prevChunkY1 || chunkX2 != prevChunkX2 || chunkY2 != prevChunkY2) socket.emit('setRange', (prevChunkX1 = chunkX1) + '', (prevChunkY1 = chunkY1) + '', (prevChunkX2 = chunkX2) + '', (prevChunkY2 = chunkY2) + '')
}

async function readChunk<X extends bigint, Y extends bigint>(x: X, y: Y) {
  setRange()
  const name: ChunkName<X, Y> = `${x},${y}`
  const cachedChunk = await chunks[name]
  if (cachedChunk) return cachedChunk

  try {
    return await (chunks[name] = (async () => new Uint8ClampedArray(await socket.emitWithAck('readChunk', x + '', y + '')))())
  } catch {
    return chunks[name] = (async () => new Uint8ClampedArray(chunkByteLength))()
  }
}

async function writeChunk<X extends bigint, Y extends bigint>(x: X, y: Y, data: Uint8ClampedArray, isErase: boolean) {
  if (data.length != chunkByteLength) throw new RangeError(`Chunk size is not matching (Expected ${chunkByteLength}, Received ${data.length})`)

  const name: ChunkName<X, Y> = `${x},${y}`
  chunks[name] = (async () => {
    if (isErase) chunkContext.globalCompositeOperation = 'destination-out'
    putImageContext.putImageData(new ImageData(data, CHUNK_SIZE), 0, 0)
    chunkContext.drawImage(putImageCanvas, 0, 0)
    chunkContext.globalCompositeOperation = 'source-over'
    return chunkContext.getImageData(0, 0, chunkCanvas.width, chunkCanvas.height).data
  })()

  const lastModified = lastModifiedTable[name] = performance.now()
  data = new Uint8ClampedArray(await socket.emitWithAck('writeChunk', x + '', y + '', data, isErase))
  if (lastModified != lastModifiedTable[name]) return
  chunks[name] = (async () => data)()
  putImageContext.putImageData(new ImageData(data, CHUNK_SIZE), 0, 0)
  context.clearRect(Number(x) * CHUNK_SIZE, Number(y) * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE)
  context.drawImage(putImageCanvas, Number(x) * CHUNK_SIZE, Number(y) * CHUNK_SIZE)
}

function drawLine(x1: number, y1: number, x2: number, y2: number, lineWidth: number, color: CanvasFillStrokeStyles['strokeStyle'], isErase = false) {
  const chunkX1 = Math.floor((Math.min(x1, x2) - lineWidth / 2) / CHUNK_SIZE)
  const chunkY1 = Math.floor((Math.min(y1, y2) - lineWidth / 2) / CHUNK_SIZE)
  const chunkX2 = Math.ceil((Math.max(x1, x2) + lineWidth / 2) / CHUNK_SIZE)
  const chunkY2 = Math.ceil((Math.max(y1, y2) + lineWidth / 2) / CHUNK_SIZE)

  chunkContext.strokeStyle = color
  chunkContext.lineWidth = lineWidth

  const promises = []
  for (let chunkY = chunkY1; chunkY < chunkY2; ++chunkY) for (let chunkX = chunkX1; chunkX < chunkX2; ++chunkX) promises.push((async () => {
    chunkContext.clearRect(0, 0, chunkCanvas.width, chunkCanvas.height)
    chunkContext.beginPath()
    chunkContext.moveTo(x1 - chunkX * CHUNK_SIZE, y1 - chunkY * CHUNK_SIZE)
    chunkContext.lineTo(x2 - chunkX * CHUNK_SIZE, y2 - chunkY * CHUNK_SIZE)
    chunkContext.stroke()

    const imgData = chunkContext.getImageData(0, 0, chunkCanvas.width, chunkCanvas.height)
    const { data } = imgData
    for (let i = 3; i < data.length; i += 4) data[i] = data[i] < 96 ? 0 : 255

    const chunk = await readChunk(BigInt(chunkX), BigInt(chunkY))

    putImageContext.putImageData(new ImageData(chunk, CHUNK_SIZE), 0, 0)
    chunkContext.clearRect(0, 0, chunkCanvas.width, chunkCanvas.height)
    chunkContext.drawImage(putImageCanvas, 0, 0)

    if (isErase) chunkContext.globalCompositeOperation = 'destination-out'
    putImageContext.putImageData(imgData, 0, 0)
    chunkContext.drawImage(putImageCanvas, 0, 0)
    chunkContext.globalCompositeOperation = 'source-over'

    context.clearRect(chunkX * CHUNK_SIZE, chunkY * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE)
    context.drawImage(chunkCanvas, chunkX * CHUNK_SIZE, chunkY * CHUNK_SIZE)

    await writeChunk(BigInt(chunkX), BigInt(chunkY), putImageContext.getImageData(0, 0, putImageCanvas.width, putImageCanvas.height).data, isErase)
  })())
  return Promise.all(promises)
}

const audio = new Audio('media/bgm.mp3')
audio.autoplay = true
audio.loop = true
addEventListener('click', () => audio.play(), { once: true })
