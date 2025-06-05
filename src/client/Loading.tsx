export default function Loading(params: React.JSX.IntrinsicElements['svg']) {
  return (
    <svg {...params} xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128' fill='none'>
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
  )
}
