import io, { type Socket } from 'socket.io-client'
import { CHUNK_SIZE, chunkByteLength } from '../const'
import type { Client2Server, Server2Client, ChunkName } from '../server'

const canvas = document.querySelector('canvas') as HTMLCanvasElement
const context = canvas.getContext('2d')!

function rerender() {
  context.imageSmoothingEnabled = false
  context.resetTransform()
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.setTransform(camera.zoom, 0, 0, camera.zoom, Math.round(canvas.width / 2 + camera.x * camera.zoom), Math.round(canvas.height / 2 + camera.y * camera.zoom))

  const chunkX1 = Math.floor((-camera.x * camera.zoom - canvas.width / 2) / camera.zoom / CHUNK_SIZE)
  const chunkY1 = Math.floor((-camera.y * camera.zoom - canvas.height / 2) / camera.zoom / CHUNK_SIZE)
  const chunkX2 = Math.ceil((-camera.x * camera.zoom + canvas.width / 2) / camera.zoom / CHUNK_SIZE)
  const chunkY2 = Math.ceil((-camera.y * camera.zoom + canvas.height / 2) / camera.zoom / CHUNK_SIZE)

  const promises = []
  for (let chunkY = chunkY1; chunkY < chunkY2; ++chunkY) for (let chunkX = chunkX1; chunkX < chunkX2; ++chunkX) promises.push((async () => {
    // putImageContext.putImageData(new ImageData(await readChunk(BigInt(chunkX), BigInt(chunkY)), CHUNK_SIZE), 0, 0)
    // context.drawImage(putImageCanvas, chunkX * CHUNK_SIZE, chunkY * CHUNK_SIZE)
    const chunk = readChunk(BigInt(chunkX), BigInt(chunkY))
    if (chunk.complete) context.drawImage(chunk, chunkX * CHUNK_SIZE, chunkY * CHUNK_SIZE)
    else chunk.addEventListener('load', () => context.drawImage(chunk, chunkX * CHUNK_SIZE, chunkY * CHUNK_SIZE))
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

window.addEventListener('keydown', event => {
  switch (event.key) {
    case 'Enter':
      switch (drawOptions.mode) {
        case DrawMode.VIEW:
          drawOptions.mode = DrawMode.DRAW
          break
        case DrawMode.DRAW:
          drawOptions.mode = DrawMode.ERASE
          break
        case DrawMode.ERASE:
          drawOptions.mode = DrawMode.VIEW
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

const getCoord = (x: number, width: number, cameraX: number) => Math.round((x * devicePixelRatio - width / 2) / camera.zoom - cameraX) + drawOptions.lineWidth % 2 / 2

canvas.addEventListener('mousedown', event => {
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
})

canvas.addEventListener('wheel', event => {
  const oldZoom = camera.zoom
  camera.zoom = Math.max(1, Math.min(camera.zoom * 2 ** -Math.sign(event.deltaY), 256))
  camera.x += (event.clientX - canvas.width / 2 - camera.x) * camera.zoom / oldZoom
  camera.y += (event.clientY - canvas.height / 2 - camera.y) * camera.zoom / oldZoom
  rerender()
})

class CompleteOffscreenCanvas extends OffscreenCanvas {
  complete: true = true
}

const chunkCanvas = new CompleteOffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE)
const chunkContext = chunkCanvas.getContext('2d', { willReadFrequently: true })!
chunkContext.lineCap = 'round'

const putImageCanvas = new OffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE)
const putImageContext = putImageCanvas.getContext('2d')!

const socket: Socket<Server2Client, Client2Server> = io()
// const chunks: Record<ChunkName, Promise<Uint8ClampedArray>> = {}
// socket.on('chunk', (strX, strY, data) => {
//   const x = BigInt(strX), y = BigInt(strY)
//   const name: ChunkName = `${x},${y}`
//   chunks[name] = (async () => data = new Uint8ClampedArray(data))()

//   context.clearRect(Number(x) * CHUNK_SIZE, Number(y) * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE)
//   putImageContext.putImageData(new ImageData(data, CHUNK_SIZE), 0, 0)
//   context.drawImage(putImageCanvas, Number(x) * CHUNK_SIZE, Number(y) * CHUNK_SIZE)
// })
interface AbortableImage {
  image: HTMLImageElement | CanvasImageSource & { complete: true }
  controller?: AbortController
}

const chunks: Record<ChunkName, AbortableImage> = {}
socket.on('chunk', (x, y) => {
  const name: ChunkName = `${BigInt(x)}.${BigInt(y)}.png`
  const image = new Image
  const controller = new AbortController

  const prevChunk: AbortableImage | undefined = chunks[name]
  chunks[name] = { image, controller }

  image.addEventListener('load', () => {
    prevChunk?.controller?.abort()
    context.clearRect(+x * CHUNK_SIZE, +y * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE)
    context.drawImage(image, +x * CHUNK_SIZE, +y * CHUNK_SIZE)
  }, controller)
  image.src = `/paint_chunks/${name}`
})

// async function readChunk<X extends bigint, Y extends bigint>(x: X, y: Y) {
//   const name: ChunkName<X, Y> = `${x},${y}`
//   const cachedChunk = await chunks[name]
//   if (cachedChunk) return cachedChunk

//   try {
//     return await (chunks[name] = (async () => new Uint8ClampedArray(await socket.emitWithAck('readChunk', x + '', y + '')))())
//   } catch {
//     return chunks[name] = (async () => new Uint8ClampedArray(chunkByteLength))()
//   }
// }

// async function writeChunk<X extends bigint, Y extends bigint>(x: X, y: Y, data: Uint8ClampedArray) {
//   if (data.length != chunkByteLength) throw new RangeError(`Chunk size is not matching (Expected ${chunkByteLength}, Received ${data.length})`)

//   const name: ChunkName<X, Y> = `${x},${y}`
//   chunks[name] = (async () => data)()

//   socket.emit('writeChunk', x + '', y + '', data)
// }

function readChunk<X extends bigint, Y extends bigint>(x: X, y: Y) {
  const name: ChunkName<X, Y> = `${x}.${y}.png`
  const chunk = chunks[name]
  if (chunk) return chunk.image

  const image = new Image
  const controller = new AbortController
  chunks[name] = { image, controller }

  image.src = `/paint_chunks/${name}`
  return image
}

async function writeChunk<X extends bigint, Y extends bigint>(x: X, y: Y, image: CompleteOffscreenCanvas) {
  const name: ChunkName<X, Y> = `${x}.${y}.png`
  chunks[name] = { image }

  return fetch(`/paint_chunks/${name}`, {
    method: 'POST',
    body: await image.convertToBlob(),
  })
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

    const chunk = readChunk(BigInt(chunkX), BigInt(chunkY))
    if (!chunk.complete) return

    chunkContext.clearRect(0, 0, chunkCanvas.width, chunkCanvas.height)
    chunkContext.drawImage(chunk, 0, 0)

    if (isErase) chunkContext.globalCompositeOperation = 'destination-out'
    putImageContext.putImageData(imgData, 0, 0)
    chunkContext.drawImage(putImageCanvas, 0, 0)
    chunkContext.globalCompositeOperation = 'source-over'

    context.clearRect(chunkX * CHUNK_SIZE, chunkY * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE)
    context.drawImage(chunkCanvas, chunkX * CHUNK_SIZE, chunkY * CHUNK_SIZE)

    await writeChunk(BigInt(chunkX), BigInt(chunkY), chunkCanvas)
  })())
  return Promise.all(promises)
}

const audio = new Audio('media/bgm.mp3')
audio.autoplay = true
audio.loop = true
addEventListener('click', () => audio.play(), { once: true })
