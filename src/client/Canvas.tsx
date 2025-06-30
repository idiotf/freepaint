import React, { memo, useCallback, useEffect, useState } from 'react'
import ResizableCanvas from './ResizableCanvas'
import { useObjectValue, useOffscreen, useSocket } from './hooks'
import { CHUNK_SIZE, chunkByteLength } from '../const'
import type { Socket } from 'socket.io-client'
import type { ChunkName, Client2Server, Server2Client } from '../server'

export const enum DrawMode {
  VIEW = 0,
  DRAW = 1,
  ERASE = 2,
}

const chunks: Record<ChunkName, Promise<Uint8ClampedArray>> = {}

const chunkCanvas = new OffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE)
const chunkContext = chunkCanvas.getContext('2d', { willReadFrequently: true })!
chunkContext.lineCap = 'round'

const putImageCanvas = new OffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE)
const putImageContext = putImageCanvas.getContext('2d')!

export function Canvas({ drawMode, lineWidth, lineColor, loading, ...params }: React.JSX.IntrinsicElements['canvas'] & {
  drawMode: DrawMode
  lineWidth: number
  lineColor: string
  loading?: React.ReactNode
}) {
  const [ disconnected, setDisconnected ] = useState(false)

  const mainCanvas = useOffscreen(0, 0)
  const mainContext = mainCanvas.getContext('2d')!

  const camera = useObjectValue({
    x: 0,
    y: 0,
    zoom: 16,
  })

  const range = useObjectValue({
    x1: 0n,
    y1: 0n,
    x2: 0n,
    y2: 0n,
  })

  const cursor = useObjectValue({
    x: 0,
    y: 0,
  })

  const socket: Socket<Server2Client, Client2Server> = useSocket({
    transports: ['websocket', 'polling'],
  })

  const render = useCallback(() => {
    console.log('rendered lol')
  }, [])

  return (
    <>
      <CanvasWrap
        {...params}
        render={render}
        style={{
          cursor: {
            [DrawMode.VIEW]: 'move',
            [DrawMode.DRAW]: 'crosshair',
            [DrawMode.ERASE]: 'crosshair',
          }[drawMode],
        }}
      />
      {disconnected && loading}
    </>
  )
}

function CanvasWrap(params: Parameters<typeof ResizableCanvas>[0]) {
  return (
    <ResizableCanvas {...params} />
  )
}
