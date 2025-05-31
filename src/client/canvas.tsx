import { createRef, useRef, useEffect } from 'react'
import { CHUNK_SIZE, chunkByteLength } from '../const'
import type { ChunkName, Client2Server, Server2Client } from '../server'
import { io, type Socket } from 'socket.io-client'

export const enum DrawMode {
  VIEW = 0,
  DRAW = 1,
  ERASE = 2,
}

const socket: Socket<Server2Client, Client2Server> = io()
setInterval(() => socket.emit('ping'), 1000)

const mainCanvas = new OffscreenCanvas(0, 0)
const mainContext = mainCanvas.getContext('2d')!

const chunkCanvas = new OffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE)
const chunkContext = chunkCanvas.getContext('2d', { willReadFrequently: true })!
chunkContext.lineCap = 'round'

const putImageCanvas = new OffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE)
const putImageContext = putImageCanvas.getContext('2d', { willReadFrequently: true })!

export function Canvas({ drawMode, lineWidth, lineColor }: Readonly<{
  drawMode: DrawMode
  lineWidth: number
  lineColor: string
}>) {
  const cursorXRef = useRef(0)
  const cursorYRef = useRef(0)

  const cameraXRef = useRef(0)
  const cameraYRef = useRef(0)
  const cameraZoomRef = useRef(1)

  const chunksRef = useRef<Record<ChunkName, Promise<Uint8ClampedArray>>>({})
  const lastModifiedTableRef = useRef<Record<ChunkName, number>>({})

  const canvasRef = createRef<HTMLCanvasElement>()

  let prevChunkX1: bigint, prevChunkY1: bigint, prevChunkX2: bigint, prevChunkY2: bigint
  function getRange() {
    const canvas = canvasRef.current!
    const cameraX = cameraXRef.current
    const cameraY = cameraYRef.current
    const cameraZoom = cameraZoomRef.current

    const chunkX1 = BigInt(Math.floor((cameraX * cameraZoom - canvas.width / 2) / cameraZoom / CHUNK_SIZE))
    const chunkY1 = BigInt(Math.floor((cameraY * cameraZoom - canvas.height / 2) / cameraZoom / CHUNK_SIZE))
    const chunkX2 = BigInt(Math.ceil((cameraX * cameraZoom + canvas.width / 2) / cameraZoom / CHUNK_SIZE))
    const chunkY2 = BigInt(Math.ceil((cameraY * cameraZoom + canvas.height / 2) / cameraZoom / CHUNK_SIZE))

    if (prevChunkX1 != chunkX1 || prevChunkY1 != chunkY1 || prevChunkX2 != chunkX2 || prevChunkY2 != chunkY2)
      socket.emit('setRange', (prevChunkX1 = chunkX1) + '', (prevChunkY1 = chunkY1) + '', (prevChunkX2 = chunkX2) + '', (prevChunkY2 = chunkY2) + '')

    return { chunkX1, chunkY1, chunkX2, chunkY2 }
  }

  function applyLayer() {
    if (!mainCanvas.width || !mainCanvas.height) return
    const canvas = canvasRef.current!
    const context = canvas.getContext('2d')!

    canvas.width = mainCanvas.width
    canvas.height = mainCanvas.height
    context.drawImage(mainCanvas, 0, 0)

    if (drawMode == DrawMode.DRAW || drawMode == DrawMode.ERASE) drawCursor()
  }

  function drawCursor() {
    const canvas = canvasRef.current!
    const context = canvas.getContext('2d')!

    context.strokeStyle = '#000'
    context.beginPath()
    context.arc(cursorXRef.current, cursorYRef.current, lineWidth * cameraZoomRef.current / 2, 0, Math.PI * 2)
    context.stroke()

    context.strokeStyle = '#fff'
    context.beginPath()
    context.arc(cursorXRef.current, cursorYRef.current, lineWidth * cameraZoomRef.current / 2 + 2, 0, Math.PI * 2)
    context.stroke()
  }

  function render() {
    const cameraX = cameraXRef.current
    const cameraY = cameraYRef.current
    const cameraZoom = cameraZoomRef.current

    mainContext.imageSmoothingEnabled = false
    mainContext.resetTransform()
    mainContext.clearRect(0, 0, mainCanvas.width, mainCanvas.height)
    mainContext.setTransform(cameraZoom, 0, 0, cameraZoom, Math.round(mainCanvas.width / 2 - cameraX * cameraZoom), Math.round(mainCanvas.height / 2 - cameraY * cameraZoom))

    const { chunkX1, chunkY1, chunkX2, chunkY2 } = getRange()

    const lastModifiedTable = lastModifiedTableRef.current
    const promises: Promise<void>[] = []
    for (let chunkY = chunkY1; chunkY < chunkY2; ++chunkY) for (let chunkX = chunkX1; chunkX < chunkX2; ++chunkX) promises.push((async () => {
      const x = Number(chunkX) * CHUNK_SIZE, y = Number(chunkY) * CHUNK_SIZE

      const name: ChunkName = `${chunkX},${chunkY}`
      const lastModified = lastModifiedTable[name]
      const data = await readChunk(chunkX, chunkY)
      if (lastModified != lastModifiedTable[name]) return

      chunkContext.putImageData(new ImageData(data, CHUNK_SIZE), 0, 0)
      mainContext.clearRect(x, y, CHUNK_SIZE, CHUNK_SIZE)
      mainContext.drawImage(chunkCanvas, x, y)

      applyLayer()
    })())
  }

  async function readChunk<X extends bigint = bigint, Y extends bigint = bigint>(x: X, y: Y) {
    const name: ChunkName<X, Y> = `${x},${y}`
    const chunks = chunksRef.current
    const chunk = chunks[name]
    if (chunk) return chunk

    try {
      return await (chunks[name] = (async function step(): Promise<Uint8ClampedArray> {
        return new Uint8ClampedArray(await socket.timeout(1000).emitWithAck('readChunk', x + '', y + '').catch(step))
      })())
    } catch {
      return chunks[name] = (async () => new Uint8ClampedArray(chunkByteLength))()
    }
  }

  async function writeChunk<X extends bigint = bigint, Y extends bigint = bigint>(x: X, y: Y, data: Uint8ClampedArray, isErase = false) {
    const name: ChunkName<X, Y> = `${x},${y}`
    const chunks = chunksRef.current
    const lastModifiedTable = lastModifiedTableRef.current

    chunks[name] = (async () => {
      let chunk: Uint8ClampedArray = new Uint8ClampedArray(chunkByteLength)
      chunks[name]?.then(v => chunk = v)
      await new Promise(queueMicrotask)
      chunkContext.putImageData(new ImageData(chunk, CHUNK_SIZE), 0, 0)

      if (isErase) chunkContext.globalCompositeOperation = 'destination-out'
      putImageContext.putImageData(new ImageData(data, CHUNK_SIZE), 0, 0)
      chunkContext.drawImage(putImageCanvas, 0, 0)
      chunkContext.globalCompositeOperation = 'source-over'

      return chunkContext.getImageData(0, 0, CHUNK_SIZE, CHUNK_SIZE).data
    })()

    const lastModified = lastModifiedTable[name] = performance.now()
    data = new Uint8ClampedArray(await (function step(): Promise<Uint8ClampedArray> {
      return socket.timeout(1000).emitWithAck('writeChunk', x + '', y + '', data, isErase).catch(step)
    })())
    if (lastModified != lastModifiedTable[name]) return
    chunks[name] = (async () => data)()

    const posX = Number(x) * CHUNK_SIZE, posY = Number(y) * CHUNK_SIZE
    putImageContext.putImageData(new ImageData(data, CHUNK_SIZE), 0, 0)
    mainContext.clearRect(posX, posY, CHUNK_SIZE, CHUNK_SIZE)
    mainContext.drawImage(putImageCanvas, posX, posY)

    applyLayer()
  }

  async function drawLine(x1: number, y1: number, x2: number, y2: number, isErase = false) {
    const chunkX1 = Math.floor((Math.min(x1, x2) - lineWidth / 2) / CHUNK_SIZE)
    const chunkY1 = Math.floor((Math.min(y1, y2) - lineWidth / 2) / CHUNK_SIZE)
    const chunkX2 = Math.ceil((Math.max(x1, x2) + lineWidth / 2) / CHUNK_SIZE)
    const chunkY2 = Math.ceil((Math.max(y1, y2) + lineWidth / 2) / CHUNK_SIZE)

    chunkContext.strokeStyle = lineColor
    chunkContext.lineWidth = lineWidth

    const promises: Promise<void>[] = []
    for (let chunkY = chunkY1; chunkY < chunkY2; ++chunkY) for (let chunkX = chunkX1; chunkX < chunkX2; ++chunkX) promises.push((async () => {
      chunkContext.clearRect(0, 0, CHUNK_SIZE, CHUNK_SIZE)
      chunkContext.beginPath()
      chunkContext.moveTo(x1 - chunkX * CHUNK_SIZE, y1 - chunkY * CHUNK_SIZE)
      chunkContext.lineTo(x2 - chunkX * CHUNK_SIZE, y2 - chunkY * CHUNK_SIZE)
      chunkContext.stroke()

      const imgData = chunkContext.getImageData(0, 0, CHUNK_SIZE, CHUNK_SIZE)
      const { data } = imgData
      for (let i = 3; i < data.length; i += 4) data[i] = data[i] < 96 ? 0 : 255
      chunkContext.putImageData(imgData, 0, 0)

      if (isErase) mainContext.globalCompositeOperation = 'destination-out'
      mainContext.drawImage(chunkCanvas, chunkX * CHUNK_SIZE, chunkY * CHUNK_SIZE)
      mainContext.globalCompositeOperation = 'source-over'

      applyLayer()

      await writeChunk(BigInt(chunkX), BigInt(chunkY), data, isErase)
    })())
    await Promise.all(promises)
  }

  function mouseDownHandler(event: React.MouseEvent) {
    const canvas = canvasRef.current!
    const cameraX = cameraXRef.current
    const cameraY = cameraYRef.current
    const cameraZoom = cameraZoomRef.current
    let oldX = Math.round((event.clientX * devicePixelRatio - canvas.width / 2) / cameraZoom + cameraX - lineWidth % 2 / 2) + lineWidth % 2 / 2
    let oldY = Math.round((event.clientY * devicePixelRatio - canvas.height / 2) / cameraZoom + cameraY - lineWidth % 2 / 2) + lineWidth % 2 / 2
    switch (event.button) {
      case 0: {
        function move(event: MouseEvent) {
          const cameraX = cameraXRef.current
          const cameraY = cameraYRef.current
          const cameraZoom = cameraZoomRef.current
          const x = Math.round((event.clientX * devicePixelRatio - canvas.width / 2) / cameraZoom + cameraX - lineWidth % 2 / 2) + lineWidth % 2 / 2
          const y = Math.round((event.clientY * devicePixelRatio - canvas.height / 2) / cameraZoom + cameraY - lineWidth % 2 / 2) + lineWidth % 2 / 2
          switch (drawMode) {
            case DrawMode.VIEW:
              cameraXRef.current -= event.movementX / cameraZoom
              cameraYRef.current -= event.movementY / cameraZoom
              render()
              break
            case DrawMode.DRAW:
              drawLine(oldX, oldY, oldX = x, oldY = y)
              break
            case DrawMode.ERASE:
              drawLine(oldX, oldY, oldX = x, oldY = y, true)
              break
          }
        }

        function stop() {
          removeEventListener('mousemove', move)
          removeEventListener('mouseup', stop)
        }

        addEventListener('mousemove', move)
        addEventListener('mouseup', stop)

        move(event.nativeEvent)
        break
      }
    }
  }

  function wheelHandler(event: React.WheelEvent) {
    const oldZoom = cameraZoomRef.current
    cameraZoomRef.current = Math.max(1, Math.min(oldZoom * 2 ** -Math.sign(event.deltaY), 256))
    render()
  }

  function applyCursor(event: React.MouseEvent) {
    cursorXRef.current = event.clientX
    cursorYRef.current = event.clientY
    applyLayer()
  }

  useEffect(() => {
    const canvas = canvasRef.current!
    const observer = new ResizeObserver(([{ devicePixelContentBoxSize: [ { inlineSize, blockSize } ] }]) => {
      canvas.width = mainCanvas.width = inlineSize
      canvas.height = mainCanvas.height = blockSize
      render()
    })
    observer.observe(canvas, { box: 'device-pixel-content-box' })
    return () => observer.disconnect()
  }, [ canvasRef ])

  useEffect(() => {
    function applyChunk(strX: string, strY: string, data: Uint8ClampedArray) {
      const x = BigInt(strX), y = BigInt(strY)
      const name: ChunkName = `${x},${y}`
      chunksRef.current[name] = (async () => data = new Uint8ClampedArray(data))()

      putImageContext.putImageData(new ImageData(data, CHUNK_SIZE), 0, 0)
      mainContext.clearRect(+strX * CHUNK_SIZE, +strY * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE)
      mainContext.drawImage(putImageCanvas, +strX * CHUNK_SIZE, +strY * CHUNK_SIZE)

      applyLayer()
    }
    socket.on('chunk', applyChunk)
    return () => void socket.off('chunk', applyChunk)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={mouseDownHandler}
      onMouseMove={applyCursor}
      onWheel={wheelHandler}
      className='w-full h-full pixelated'
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
