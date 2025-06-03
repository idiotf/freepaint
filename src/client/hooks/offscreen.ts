import { useRef } from 'react'

export default function useOffscreen(width: number, height: number) {
  const canvasRef = useRef<OffscreenCanvas>(null)
  if (!canvasRef.current) canvasRef.current = new OffscreenCanvas(width, height)
  return canvasRef.current
}
