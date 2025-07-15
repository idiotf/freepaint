import React, { useEffect, useState } from 'react'
import { Canvas, DrawMode } from './Canvas'
import Loading from './Loading'
import { useBgm } from './hooks'
import bgmURL from '../media/bgm.mp3'
import './style'
import '../bgm.d.ts'

export default function App() {
  const [ drawMode, setDrawMode ] = useState(DrawMode.DRAW)
  const [ lineWidth, setLineWidth ] = useState(1)
  const [ lineColor, setLineColor ] = useState('#000000')

  const [ hovering, setHovering ] = useState(false)
  const [ [ x, y ], setCursor ] = useState([ NaN, NaN ])

  useBgm(bgmURL, process.env.NODE_ENV != 'development')

  useEffect(() => {
    function handler(event: KeyboardEvent) {
      switch (event.key) {
        case 'Enter':
          setDrawMode(drawMode => ({
            [DrawMode.VIEW]: DrawMode.DRAW,
            [DrawMode.DRAW]: DrawMode.ERASE,
            [DrawMode.ERASE]: DrawMode.VIEW,
          }[drawMode]))
      }
    }

    addEventListener('keydown', handler)
    return () => removeEventListener('keydown', handler)
  }, [])

  return <>
    <Canvas
      drawMode={drawMode}
      lineWidth={lineWidth}
      lineColor={lineColor}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onCursorMove={setCursor}
      className='w-full h-full pixelated'
      loading={<Loading />}
    />
    <aside className='fixed left-0 top-0 bottom-0 w-64 bg-yellow-200 p-6 select-none'>
      <h1 className='text-xl font-semibold'>Freepaint</h1>
      <input type='range' value={lineWidth} min={1} max={100} onChange={({ target: { value } }) => setLineWidth(+value)} />
      <input type='color' value={lineColor} onChange={({ target: { value } }) => setLineColor(value)} />
      {hovering && <div>x: {x}, y: {y}</div>}
    </aside>
  </>
}
