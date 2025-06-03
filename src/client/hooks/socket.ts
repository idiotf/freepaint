import { useRef } from 'react'
import { io, type Socket, type ManagerOptions, type SocketOptions } from 'socket.io-client'

export default function useSocket(opts?: Partial<ManagerOptions & SocketOptions>) {
  const ref = useRef<Socket>(null)
  if (!ref.current) ref.current = io(opts)
  return ref.current
}
