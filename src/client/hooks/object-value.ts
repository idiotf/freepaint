import { useRef } from 'react'

export function useObjectValue<T extends object>(value: T) {
  return useRef(value).current
}
