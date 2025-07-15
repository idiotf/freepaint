import './socket'
import server from './express'
import { createInterface } from 'readline'

const readline = createInterface({
  input: process.stdin,
  output: process.stdout,
})

let exiting = false
readline.on('SIGINT', () => {
  if (exiting) process.exit()
  exiting = true

  console.log('Gracefully shutting down')
  server.once('close', () => process.exit())
  server.close()
})
