import express from 'express'
import webpack from './webpack'
import { createServer } from 'http'
import config from '@/webpack.config'
import wdm from 'webpack-dev-middleware'

const app = express()
app.disable('x-powered-by')
app.use(express.static('public'))

if (process.env.NODE_ENV == 'development') {
  const compiler = webpack(config)
  app.use(wdm(compiler))
} else {
  app.use(express.static('dist'))
}

app.use((_req, res) => res.redirect('/'))

const DEVELOPMENT_PORT = 3000
const PRODUCTION_PORT = 4287

const port = Number(process.env.PORT) || (process.env.NODE_ENV == 'development' ? DEVELOPMENT_PORT : PRODUCTION_PORT)
const server = createServer(app)
server.listen(port, () => console.log(server.address()))

export default server
