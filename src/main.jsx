import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ConsoleWindow from './ConsoleWindow.jsx'
import AudioService from './AudioService.jsx'
import './styles.css'

// 依 hash 決定這個視窗渲染「藥丸字幕」還是「控制台」
const route = window.location.hash.replace('#', '')
const isConsole = route === 'console'
const isAudioService = route === 'audio-service'
document.body.dataset.route = isAudioService ? 'audio-service' : (isConsole ? 'console' : 'overlay')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isAudioService ? <AudioService /> : (isConsole ? <ConsoleWindow /> : <App />)}
  </React.StrictMode>
)
