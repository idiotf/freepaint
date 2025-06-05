import { createRef, useEffect } from 'react'

export function useBgm(src: string, enabled = true) {
  const audioRef = createRef<HTMLAudioElement>()

  useEffect(() => {
    if (!enabled) return

    const audio = audioRef.current = audioRef.current || new Audio
    audio.src = src
    audio.autoplay = true
    audio.loop = true

    const playOnClick = () => audio.play().catch(() => {})
    addEventListener('click', playOnClick)

    const onPlay = () => removeEventListener('click', playOnClick)
    audio.addEventListener('play', onPlay, { once: true })
    return () => {
      audio.pause()
      audio.removeEventListener('play', onPlay)
      removeEventListener('click', playOnClick)
    }
  }, [ src, enabled ])
}
