import { createRoot } from 'react-dom/client'
import App from './app'

const root = document.createElement('div')
root.id = 'root'
createRoot(document.body.appendChild(root)).render(<App />)
