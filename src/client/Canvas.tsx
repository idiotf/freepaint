import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { useSocket } from './hooks/socket'
import { useOffscreen } from './hooks/offscreen'
import ResizableCanvas from './ResizableCanvas'
import Loading from './Loading'
import { CHUNK_SIZE, chunkByteLength } from '../const'
import type { ChunkName, Client2Server, Server2Client } from '../server'

export const enum DrawMode {
  VIEW = 0,
  DRAW = 1,
  ERASE = 2,
}

const chunks: Record<ChunkName, Promise<Uint8ClampedArray> | undefined> = {}
const lastModifiedTable: Record<ChunkName, number | undefined> = {}

const chunkCanvas = new OffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE)
const chunkContext = chunkCanvas.getContext('2d', { willReadFrequently: true })!
chunkContext.lineCap = 'round'

const putImageCanvas = new OffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE)
const putImageContext = putImageCanvas.getContext('2d')!

export function Canvas({ drawMode, lineWidth, lineColor, ...params }: React.JSX.IntrinsicElements['canvas'] & {
  drawMode: DrawMode
  lineWidth: number
  lineColor: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mainCanvas = useOffscreen(0, 0)
  const mainContext = mainCanvas.getContext('2d')!

  const [ disconnected, setDisconnected ] = useState(false)

  const camera = useRef({
    x: 0,
    y: 0,
    zoom: 1,
  }).current

  const range = useRef({
    x1: 0n,
    y1: 0n,
    x2: 0n,
    y2: 0n,
  }).current

  const cursor = useRef({
    x: 0,
    y: 0,
  }).current

  function getRange() {
    const { width, height } = mainCanvas
    const chunkX1 = BigInt(Math.floor((camera.x * camera.zoom - width / 2) / camera.zoom / CHUNK_SIZE))
    const chunkY1 = BigInt(Math.floor((camera.y * camera.zoom - height / 2) / camera.zoom / CHUNK_SIZE))
    const chunkX2 = BigInt(Math.ceil((camera.x * camera.zoom + width / 2) / camera.zoom / CHUNK_SIZE))
    const chunkY2 = BigInt(Math.ceil((camera.y * camera.zoom + height / 2) / camera.zoom / CHUNK_SIZE))

    if (range.x1 != chunkX1 || range.y1 != chunkY1 || range.x2 != chunkX2 || range.y2 != chunkY2)
      socket.emit('setRange', (range.x1 = chunkX1) + '', (range.y1 = chunkY1) + '', (range.x2 = chunkX2) + '', (range.y2 = chunkY2) + '')

    return { chunkX1, chunkY1, chunkX2, chunkY2 }
  }

  const socket: Socket<Server2Client, Client2Server> = useSocket((socket: Socket<Server2Client, Client2Server>) => {
    socket.on('chunk', (strX, strY, data) => {
      const x = BigInt(strX), y = BigInt(strY)
      const name: ChunkName = `${x},${y}`
      const chunk = new Uint8ClampedArray(data)
      chunks[name] = Promise.resolve(chunk)

      const posX = Number(x) * CHUNK_SIZE, posY = Number(y) * CHUNK_SIZE
      putImageContext.putImageData(new ImageData(chunk, CHUNK_SIZE), 0, 0)
      mainContext.clearRect(posX, posY, CHUNK_SIZE, CHUNK_SIZE)
      mainContext.drawImage(putImageCanvas, posX, posY)
      applyLayer()
    })
    socket.on('connect', () => {
      setDisconnected(false)
      getRange()
      if (canvasRef.current) render(canvasRef.current)
    })
    socket.on('disconnect', () => {
      setDisconnected(true)
      for (const key in chunks) delete chunks[key as ChunkName]

      mainContext.save()
      mainContext.resetTransform()
      mainContext.clearRect(0, 0, mainCanvas.width, mainCanvas.height)
      mainContext.restore()
      applyLayer()
    })
  })

  function readChunk<X extends bigint, Y extends bigint>(x: X, y: Y) {
    const name: ChunkName<X, Y> = `${x},${y}`
    const chunk = chunks[name]
    if (chunk) return chunk.then(chunk => ({
      chunk,
      latest: true,
    }))

    const lastModified = lastModifiedTable[name]
    return (function step(): Promise<{ chunk: Uint8ClampedArray, latest: boolean }> {
      return (chunks[name] = socket.timeout(1000).emitWithAck('readChunk', x + '', y + '').then(v => new Uint8ClampedArray(v)))
        .then(chunk => ({
          chunk,
          latest: lastModified == lastModifiedTable[name],
        }))
        .catch(step)
    })()
  }

  async function mergeChunk<X extends bigint, Y extends bigint>(x: X, y: Y, data: Uint8ClampedArray, isErase = false) {
    const name: ChunkName<X, Y> = `${x},${y}`
    let chunk: Uint8ClampedArray = new Uint8ClampedArray(chunkByteLength)
    chunks[name]?.then(v => chunk = v)
    await new Promise<void>(queueMicrotask)
    chunkContext.putImageData(new ImageData(chunk, CHUNK_SIZE), 0, 0)

    if (isErase) chunkContext.globalCompositeOperation = 'destination-out'
    putImageContext.putImageData(new ImageData(data, CHUNK_SIZE), 0, 0)
    chunkContext.drawImage(putImageCanvas, 0, 0)
    chunkContext.globalCompositeOperation = 'source-over'
    return chunkContext.getImageData(0, 0, CHUNK_SIZE, CHUNK_SIZE).data
  }

  async function writeChunk<X extends bigint, Y extends bigint>(x: X, y: Y, data: Uint8ClampedArray, isErase = false) {
    if (data.length != chunkByteLength) throw new RangeError(`Chunk size is not matching (Expected ${chunkByteLength}, Received ${data.length})`)

    const name: ChunkName<X, Y> = `${x},${y}`
    const lastModified = lastModifiedTable[name] = performance.now()
    chunks[name] = mergeChunk(x, y, data, isErase)

    const promise = socket.emitWithAck('writeChunk', x + '', y + '', data, isErase).then(v => new Uint8ClampedArray(v))
    const chunk = await promise
    if (lastModified == lastModifiedTable[name]) {
      lastModifiedTable[name] = performance.now()
      chunks[name] = promise
      return { chunk, latest: true }
    }
    return { chunk, latest: false }
  }

  function render(canvas: HTMLCanvasElement) {
    canvasRef.current = canvas
    mainCanvas.width = canvas.width
    mainCanvas.height = canvas.height

    mainContext.setTransform(camera.zoom, 0, 0, camera.zoom, Math.round(mainCanvas.width / 2 - camera.x * camera.zoom), Math.round(mainCanvas.height / 2 - camera.y * camera.zoom))
    mainContext.imageSmoothingEnabled = false

    applyLayer()

    const { chunkX1, chunkY1, chunkX2, chunkY2 } = getRange()
    const promises: Promise<void>[] = []
    for (let chunkY = chunkY1; chunkY < chunkY2; ++chunkY) for (let chunkX = chunkX1; chunkX < chunkX2; ++chunkX) promises.push((async () => {
      const x = Number(chunkX) * CHUNK_SIZE, y = Number(chunkY) * CHUNK_SIZE
      const { chunk, latest } = await readChunk(chunkX, chunkY)
      if (!latest) return

      chunkContext.putImageData(new ImageData(chunk, CHUNK_SIZE), 0, 0)
      mainContext.clearRect(x, y, CHUNK_SIZE, CHUNK_SIZE)
      mainContext.drawImage(chunkCanvas, x, y)
      applyLayer()
    })())
  }

  function applyLayer() {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')!

    if (mainCanvas.width && mainCanvas.height) {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(mainCanvas, 0, 0)
    }
    if ([ DrawMode.DRAW, DrawMode.ERASE ].includes(drawMode)) drawCursor()
  }

  function drawCursor() {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')!

    context.strokeStyle = '#000'
    context.beginPath()
    context.arc(cursor.x, cursor.y, lineWidth * camera.zoom / 2, 0, Math.PI * 2)
    context.stroke()

    context.strokeStyle = '#fff'
    context.beginPath()
    context.arc(cursor.x, cursor.y, lineWidth * camera.zoom / 2 + 2, 0, Math.PI * 2)
    context.stroke()
  }

  function drawLine(x1: number, y1: number, x2: number, y2: number, isErase = false) {
    const chunkX1 = BigInt(Math.floor((Math.min(x1, x2) - lineWidth / 2) / CHUNK_SIZE))
    const chunkY1 = BigInt(Math.floor((Math.min(y1, y2) - lineWidth / 2) / CHUNK_SIZE))
    const chunkX2 = BigInt(Math.ceil((Math.max(x1, x2) + lineWidth / 2) / CHUNK_SIZE))
    const chunkY2 = BigInt(Math.ceil((Math.max(y1, y2) + lineWidth / 2) / CHUNK_SIZE))
  
    chunkContext.strokeStyle = lineColor
    chunkContext.lineWidth = lineWidth
    
    const promises: Promise<void>[] = []
    for (let chunkY = chunkY1; chunkY < chunkY2; ++chunkY) for (let chunkX = chunkX1; chunkX < chunkX2; ++chunkX) promises.push((async () => {
      const x = Number(chunkX) * CHUNK_SIZE, y = Number(chunkY) * CHUNK_SIZE

      chunkContext.clearRect(0, 0, CHUNK_SIZE, CHUNK_SIZE)
      chunkContext.beginPath()
      chunkContext.moveTo(x1 - x, y1 - y)
      chunkContext.lineTo(x2 - x, y2 - y)
      chunkContext.stroke()

      const imgData = chunkContext.getImageData(0, 0, CHUNK_SIZE, CHUNK_SIZE)
      const { data } = imgData
      for (let i = 3; i < data.length; i += 4) data[i] = data[i] < 96 ? 0 : 255
      chunkContext.putImageData(imgData, 0, 0)

      if (isErase) mainContext.globalCompositeOperation = 'destination-out'
      mainContext.drawImage(chunkCanvas, x, y)
      mainContext.globalCompositeOperation = 'source-over'
      applyLayer()

      const { chunk, latest } = await writeChunk(chunkX, chunkY, data, isErase)
      if (!latest) return

      const posX = Number(x) * CHUNK_SIZE, posY = Number(y) * CHUNK_SIZE
      putImageContext.putImageData(new ImageData(chunk, CHUNK_SIZE), 0, 0)
      mainContext.clearRect(posX, posY, CHUNK_SIZE, CHUNK_SIZE)
      mainContext.drawImage(putImageCanvas, posX, posY)
      applyLayer()
    })())
  }

  function leftButtonMove(event: MouseEvent, prevEvent: MouseEvent) {
    if (unmounted) return
    const canvas = canvasRef.current
    if (!canvas) return
    const { width, height } = canvas

    const x1Float = (prevEvent.clientX * devicePixelRatio - width / 2) / camera.zoom + camera.x
    const y1Float = (prevEvent.clientY * devicePixelRatio - height / 2) / camera.zoom + camera.y
    const x2Float = (event.clientX * devicePixelRatio - width / 2) / camera.zoom + camera.x
    const y2Float = (event.clientY * devicePixelRatio - height / 2) / camera.zoom + camera.y
  
    const x1 = Math.round(x1Float - lineWidth % 2 / 2) + lineWidth % 2 / 2
    const y1 = Math.round(y1Float - lineWidth % 2 / 2) + lineWidth % 2 / 2
    const x2 = Math.round(x2Float - lineWidth % 2 / 2) + lineWidth % 2 / 2
    const y2 = Math.round(y2Float - lineWidth % 2 / 2) + lineWidth % 2 / 2

    switch (drawMode) {
      case DrawMode.VIEW:
        camera.x += x1Float - x2Float
        camera.y += y1Float - y2Float
        render(canvas)
        break
      case DrawMode.DRAW:
        drawLine(x1, y1, x2, y2)
        break
      case DrawMode.ERASE:
        drawLine(x1, y1, x2, y2, true)
        break
    }
  }

  function mouseDownHandler(event: React.MouseEvent) {
    let prevEvent: MouseEvent = event.nativeEvent

    function move(event: MouseEvent) {
      [leftButtonMove][event.button]?.(event, prevEvent)
      prevEvent = event
    }

    function stop() {
      removeEventListener('mousemove', move)
      removeEventListener('mouseup', stop)
    }

    addEventListener('mousemove', move)
    addEventListener('mouseup', stop)

    move(event.nativeEvent)
  }

  function mouseMoveHandler(event: React.MouseEvent) {
    cursor.x = event.clientX
    cursor.y = event.clientY
    applyLayer()
  }

  let unmounted = false
  useEffect(() => {
    return () => void (unmounted = true)
  })

  useLayoutEffect(applyLayer, [
    [ DrawMode.DRAW, DrawMode.ERASE ].includes(drawMode),
    lineWidth,
  ])

  return (
    <>
      <ResizableCanvas
        {...params}
        ref={canvasRef}
        deps={[]}
        render={render}
        onMouseDown={mouseDownHandler}
        onMouseMove={mouseMoveHandler}
        style={{
          cursor: {
            [DrawMode.VIEW]: 'move',
            [DrawMode.DRAW]: 'crosshair',
            [DrawMode.ERASE]: 'crosshair',
          }[drawMode],
        }}
      />
      <div className='absolute inset-0 bg-gray-300/25 flex justify-center items-center' style={{ display: disconnected ? '' : 'none' }}>
        <Loading className='w-1/2 h-1/2' />
      </div>
    </>
  )
}
