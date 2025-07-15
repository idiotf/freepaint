import { useRef, useEffect } from 'react'
import { io, type Socket, type ManagerOptions, type SocketOptions } from 'socket.io-client'
import type { EventsMap } from '@socket.io/component-emitter'

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

export function useListener<
  ListenEvents extends EventsMap,
  EmitEvents extends EventsMap,
>(socket: Socket<ListenEvents, EmitEvents>, ...args: Parameters<Socket<ListenEvents, EmitEvents>['on']>) {
  useEffect(() => {
    socket.on(...args)
    return () => void socket.off(...args)
  })
}
