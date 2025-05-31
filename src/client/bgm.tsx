import { useEffect } from 'react'

export function BGM({ src }: { src: string }) {
  useEffect(() => {
    const audio = new Audio(src)
    audio.autoplay = true

    const playOnClick = () => audio.play()
    addEventListener('click', playOnClick)

    audio.addEventListener('play', () => removeEventListener('click', playOnClick), { once: true })
    return () => {
      audio.pause()
      removeEventListener('click', playOnClick)
    }
  }, [])

  return false
}
