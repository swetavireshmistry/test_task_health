import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Appointments from './components/Appointments'
import AppointmentDetail from './components/AppointmentDetail'
import ChatInterface from './components/ChatInterface'
import DrConfig from './components/DrConfig'
import VoiceCall from './components/VoiceCall'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Appointments />} />
        <Route path="appointment/:id" element={<AppointmentDetail />} />
        <Route path="chat/:appointmentId" element={<ChatInterface />} />
        <Route path="dr-config" element={<DrConfig />} />
      </Route>
      {/* Full-screen voice call — outside Layout so it takes over the whole screen */}
      <Route path="voice/:appointmentId" element={<VoiceCall />} />
    </Routes>
  )
}

export default App
