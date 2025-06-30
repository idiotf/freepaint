import { useRef, useEffect } from 'react'
import { io, type Socket, type ManagerOptions, type SocketOptions } from 'socket.io-client'

export function useSocket(opts?: Partial<ManagerOptions & SocketOptions>) {
  const ref = useRef<Socket>(null)
  const mountCount = useRef(0)
  useEffect(() => {
    ++mountCount.current
    return () => queueMicrotask(() => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (!--mountCount.current) ref.current?.disconnect()
    })
  }, [])
  if (!ref.current) ref.current = io(opts)
  return ref.current
}
