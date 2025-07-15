import React, { useCallback } from 'react'
import ResizableCanvas from './ResizableCanvas'

export const enum DrawMode {
  VIEW = 0,
  DRAW = 1,
  ERASE = 2,
}

export function Canvas({ drawMode, lineWidth, lineColor, loading, onCursorMove, ...params }: React.JSX.IntrinsicElements['canvas'] & {
  drawMode: DrawMode
  lineWidth: number
  lineColor: string
  loading?: React.ReactElement
  onCursorMove?: (cursor: [ number, number ]) => void
}) {
  const render = useCallback((canvas: HTMLCanvasElement) => {
    console.log(canvas)
  }, [])

  return (
    <ResizableCanvas
      render={render}
      {...params}
    />
  )
}
