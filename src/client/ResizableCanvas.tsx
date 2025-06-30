import React, { useLayoutEffect, useImperativeHandle, useRef } from 'react'

export default function ResizableCanvas({ render, ref, ...props }: React.JSX.IntrinsicElements['canvas'] & {
  render(canvas: HTMLCanvasElement): void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useLayoutEffect(() => {
    const observer = new ResizeObserver(([ { devicePixelContentBoxSize, contentBoxSize, contentRect } ]) => {
      const canvas = canvasRef.current
      if (!canvas) throw new TypeError('Canvas is not rendered')

      if (devicePixelContentBoxSize) {
        const [ { inlineSize, blockSize } ] = devicePixelContentBoxSize
        canvas.width = inlineSize
        canvas.height = blockSize
      } else if (contentBoxSize) {
        contentBoxSize = Array.isArray(contentBoxSize) ? contentBoxSize : [ contentBoxSize ]
        const [ { inlineSize, blockSize } ] = contentBoxSize
        canvas.width = inlineSize * devicePixelRatio
        canvas.height = blockSize * devicePixelRatio
      } else {
        canvas.width = contentRect.width * devicePixelRatio
        canvas.height = contentRect.height * devicePixelRatio
      }

      render(canvas)
    })
    const canvas = canvasRef.current
    if (canvas) observer.observe(canvas, { box: 'device-pixel-content-box' })
    return () => observer.disconnect()
  }, [ render ])

  useImperativeHandle(ref, () => canvasRef.current!)

  return <canvas {...props} ref={canvasRef} />
}
