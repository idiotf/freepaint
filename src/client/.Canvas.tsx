import { useEffect, useRef } from 'react'
import type { Socket } from 'socket.io-client'
import { useSocket } from './hooks/socket'
import { useOffscreen } from './hooks/offscreen'
import ResizableCanvas from './ResizableCanvas'
import { CHUNK_SIZE, chunkByteLength } from '../const'
import type { ChunkName, Client2Server, Server2Client } from '../server'

export const enum DrawMode {
  VIEW = 0,
  DRAW = 1,
  ERASE = 2,
}

const chunks: Record<ChunkName, Promise<Uint8ClampedArray>> = {}
const lastModifiedTable: Record<ChunkName, number> = {}

const chunkCanvas = new OffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE)
const chunkContext = chunkCanvas.getContext('2d', { willReadFrequently: true })!
chunkContext.lineCap = 'round'

const putImageCanvas = new OffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE)
const putImageContext = putImageCanvas.getContext('2d')!

export function Canvas({ drawMode, lineWidth, lineColor, ...params }: React.JSX.IntrinsicElements['canvas'] & { drawMode: DrawMode, lineWidth: number, lineColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mainCanvas = useOffscreen(0, 0)
  const mainContext = mainCanvas.getContext('2d')!

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

  const socket: Socket<Server2Client, Client2Server> = useSocket()
  useEffect(() => {
    // const interval = setInterval(() => socket.volatile.emit('ping'), 1000)
    function onChunk(strX: string, strY: string, data: Uint8ClampedArray) {
      const x = BigInt(strX), y = BigInt(strY)
      const name: ChunkName = `${x},${y}`
      chunks[name] = Promise.resolve(new Uint8ClampedArray(data))
      if (canvasRef.current) drawChunk(x, y, canvasRef.current, new Uint8ClampedArray(data))
    }
    function reset() {
      for (const key in chunks) delete chunks[key as ChunkName]
      range.x1 = range.y1 = range.x2 = range.y2 = 0n
      if (canvasRef.current) render(canvasRef.current)
    }
    socket.on('chunk', onChunk)
    socket.on('connect', getRange)
    socket.on('disconnect', reset)
    return () => {
      if (process.env.NODE_ENV != 'development') socket.disconnect()
      socket.off('chunk', onChunk)
      socket.off('connect', getRange)
      socket.off('disconnect', reset)
      // clearInterval(interval)
    }
  }, [])

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

  function readChunk<X extends bigint, Y extends bigint>(x: X, y: Y) {
    const name: ChunkName<X, Y> = `${x},${y}`
    const cachedChunk = chunks[name]
    if (cachedChunk) return cachedChunk

    return chunks[name] = (function step(): Promise<Uint8ClampedArray> {
      return socket.timeout(1000).emitWithAck('readChunk', x + '', y + '').then(v => new Uint8ClampedArray(v)).catch(step)
    })()
  }

  async function writeChunk<X extends bigint, Y extends bigint>(x: X, y: Y, data: Uint8ClampedArray, isErase = false) {
    if (data.length != chunkByteLength) throw new RangeError(`Chunk size is not matching (Expected ${chunkByteLength}, Received ${data.length})`)

    const name: ChunkName<X, Y> = `${x},${y}`
    const lastModified = lastModifiedTable[name] = performance.now()
    chunks[name] = (async () => {
      let chunk: Uint8ClampedArray = new Uint8ClampedArray(chunkByteLength)
      chunks[name]?.then(v => chunk = v)
      await new Promise<void>(queueMicrotask)
      chunkContext.putImageData(new ImageData(chunk, CHUNK_SIZE), 0, 0)

      if (isErase) chunkContext.globalCompositeOperation = 'destination-out'
      putImageContext.putImageData(new ImageData(data, CHUNK_SIZE), 0, 0)
      chunkContext.drawImage(putImageCanvas, 0, 0)
      chunkContext.globalCompositeOperation = 'source-over'
      return chunkContext.getImageData(0, 0, CHUNK_SIZE, CHUNK_SIZE).data
    })()
    try {
      data = new Uint8ClampedArray(await socket.emitWithAck('writeChunk', x + '', y + '', data, isErase))
      if (lastModified != lastModifiedTable[name]) return
      chunks[name] = Promise.resolve(data)
      if (canvasRef.current) drawChunk(x, y, canvasRef.current, data)
    } catch {}
  }

  function applyLayer(canvas: HTMLCanvasElement) {
    if (!mainCanvas.width || !mainCanvas.height) return
    const context = canvas.getContext('2d')!
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(mainCanvas, 0, 0)
    if (drawMode == DrawMode.DRAW || drawMode == DrawMode.ERASE) drawCursor(canvas)
  }

  function drawCursor(canvas: HTMLCanvasElement) {
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

  async function drawChunk<X extends bigint, Y extends bigint>(x: X, y: Y, canvas: HTMLCanvasElement, chunk?: Uint8ClampedArray) {
    if (!chunk) {
      const name: ChunkName<X, Y> = `${x},${y}`
      const lastModified = lastModifiedTable[name]
      chunk = await readChunk(x, y)
      if (lastModified != lastModifiedTable[name]) return
    }

    const posX = Number(x) * CHUNK_SIZE, posY = Number(y) * CHUNK_SIZE
    putImageContext.putImageData(new ImageData(chunk, CHUNK_SIZE), 0, 0)
    mainContext.clearRect(posX, posY, CHUNK_SIZE, CHUNK_SIZE)
    mainContext.drawImage(putImageCanvas, posX, posY)
    applyLayer(canvas)
  }

  function render(canvas: HTMLCanvasElement) {
    mainCanvas.width = canvas.width
    mainCanvas.height = canvas.height

    mainContext.setTransform(camera.zoom, 0, 0, camera.zoom, Math.round(mainCanvas.width / 2 - camera.x * camera.zoom), Math.round(mainCanvas.height / 2 - camera.y * camera.zoom))
    mainContext.imageSmoothingEnabled = false

    const { chunkX1, chunkY1, chunkX2, chunkY2 } = getRange()

    const promises: Promise<void>[] = []
    for (let chunkY = chunkY1; chunkY < chunkY2; ++chunkY) for (let chunkX = chunkX1; chunkX < chunkX2; ++chunkX) promises.push(drawChunk(chunkX, chunkY, canvas))
  }

  async function drawLine(x1: number, y1: number, x2: number, y2: number, isErase = false) {
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
  
      if (canvasRef.current) applyLayer(canvasRef.current)
      await writeChunk(chunkX, chunkY, data, isErase)
    })())
    await Promise.all(promises)
  }

  function leftButtonDrag(event: MouseEvent, prevEvent: MouseEvent) {
    const canvas = canvasRef.current!
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

  function dragHandler(event: React.MouseEvent) {
    let prevEvent: MouseEvent = event.nativeEvent

    function move(event: MouseEvent) {
      [leftButtonDrag][event.button]?.(event, prevEvent)
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

  function applyCursorPosition(event: React.MouseEvent) {
    cursor.x = event.clientX * devicePixelRatio
    cursor.y = event.clientY * devicePixelRatio
    if (canvasRef.current) applyLayer(canvasRef.current)
  }

  return (
    <ResizableCanvas
      {...params}
      ref={canvasRef}
      render={render}
      onMouseDown={dragHandler}
      onMouseMove={applyCursorPosition}
      style={{
        cursor: {
          [DrawMode.VIEW]: 'move',
          [DrawMode.DRAW]: 'crosshair',
          [DrawMode.ERASE]: 'crosshair',
        }[drawMode],
      }}
    />
  )
}
