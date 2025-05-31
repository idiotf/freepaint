/// <reference path='../bgm.d.ts' />

import { useEffect, useState } from 'react'
import { Canvas, DrawMode } from './canvas'
import { BGM } from './bgm'
import bgmURL from '../media/bgm.mp3'
import './style.css'

export default function App() {
  const [ drawMode, setDrawMode ] = useState(DrawMode.DRAW)
  const [ lineWidth, setLineWidth ] = useState(1)
  const [ lineColor, setLineColor ] = useState('#000000')

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

  return (
    <main className='h-full font-["Noto_Sans_KR"]'>
      <Canvas
        drawMode={drawMode}
        lineWidth={lineWidth}
        lineColor={lineColor}
      />
      <BGM src={bgmURL} />
      <div className='fixed left-0 top-0 bottom-0 w-64 bg-yellow-200 p-6'>
        <h1 className='text-xl font-semibold'>Freepaint</h1>
        <input type='range' value={lineWidth} min={1} max={100} onChange={({ target: { value } }) => setLineWidth(+value)} />
        <input type='color' value={lineColor} onChange={({ target: { value } }) => setLineColor(value)} />
      </div>
    </main>
  )
}
