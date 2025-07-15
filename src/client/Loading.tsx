import React from 'react'

export default function Loading() {
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
