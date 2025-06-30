import React, { useEffect, useState } from 'react'
import { useBgm } from './hooks/bgm'
import { Canvas, DrawMode } from './Canvas'
import bgmURL from '../media/bgm.mp3'
import '../bgm.d.ts'
import './style'

function Loading() {
  return (
    <div className='absolute inset-0 bg-gray-300/25 flex flex-col justify-center items-center'>
      <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128' fill='none' className='w-1/4 h-1/4'>
        <circle cx='64' cy='64' r='60' stroke='currentColor' strokeWidth='8' strokeLinecap='round' strokeDasharray={376.99111843077515}>
          <animateTransform
            attributeName='transform'
            attributeType='XML'
            type='rotate'
            from='270 64 64'
            to='990 64 64'
            dur='4s'
            repeatCount='indefinite'
          />
          <animate
            attributeName='stroke-dashoffset'
            values='376.99111843077515;-376.99111843077515'
            dur='4s'
            repeatCount='indefinite'
          />
        </circle>
      </svg>
      <p className='my-4 text-center'>
        서버와의 연결이 끊어졌습니다.<br />
        재연결 중...
      </p>
    </div>
  )
}

export default function App() {
  const [ drawMode, setDrawMode ] = useState(DrawMode.DRAW)
  const [ lineWidth, setLineWidth ] = useState(1)
  const [ lineColor, setLineColor ] = useState('#000000')

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
      className='w-full h-full pixelated'
      loading={<Loading />}
    />
    <aside className='fixed left-0 top-0 bottom-0 w-64 bg-yellow-200 p-6 select-none'>
      <h1 className='text-xl font-semibold'>Freepaint</h1>
      <input type='range' value={lineWidth} min={1} max={100} onChange={({ target: { value } }) => setLineWidth(+value)} />
      <input type='color' value={lineColor} onChange={({ target: { value } }) => setLineColor(value)} />
    </aside>
  </>
}
