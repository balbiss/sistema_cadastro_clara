import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { tokenAtual, usuarioAtual } from './lib/api'
import { AppShell } from './components/AppShell'
import Login from './pages/Login'
import Painel from './pages/Painel'
import Cadastros from './pages/Cadastros'
import CadastroDetalhe from './pages/CadastroDetalhe'
import Pendencias from './pages/Pendencias'
import Regras from './pages/Regras'
import Integracao from './pages/Integracao'
import Usuarios from './pages/Usuarios'
import FormularioPublico from './pages/FormularioPublico'
import Inicializacao from './pages/Inicializacao'
import Modelos from './pages/Modelos'
import Assinar from './pages/Assinar'
import Quiz from './pages/Quiz'
import QuizConfig from './pages/QuizConfig'
import Relatorios from './pages/Relatorios'
import Operacao from './pages/Operacao'
import ConsultasSpc from './pages/ConsultasSpc'
import Distribuicao from './pages/Distribuicao'

const Logado = ({ children }: { children: ReactNode }) => (tokenAtual() ? <>{children}</> : <Navigate to="/login" replace />)
// Logística só trabalha na fila de inicialização
const Inicio = () => (usuarioAtual()?.role === 'logistica' ? <Navigate to="/inicializacao" replace /> : <Painel />)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/f/:token" element={<FormularioPublico />} />
        <Route path="/assinar/:token" element={<Assinar />} />
        <Route path="/quiz" element={<Quiz />} />
        <Route path="/quiz/:slug" element={<Quiz />} />
        <Route element={<Logado><AppShell /></Logado>}>
          <Route path="/" element={<Inicio />} />
          <Route path="/quiz-perfil" element={<QuizConfig />} />
          <Route path="/quiz-perfil/:id" element={<QuizConfig />} />
          <Route path="/cadastros" element={<Cadastros />} />
          <Route path="/cadastros/:id" element={<CadastroDetalhe />} />
          <Route path="/inicializacao" element={<Inicializacao />} />
          <Route path="/pendencias" element={<Pendencias />} />
          <Route path="/modelos" element={<Modelos />} />
          <Route path="/regras" element={<Regras />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/consultas-spc" element={<ConsultasSpc />} />
          <Route path="/links" element={<Distribuicao />} />
          <Route path="/operacao" element={<Operacao />} />
          <Route path="/integracao" element={<Integracao />} />
          <Route path="/usuarios" element={<Usuarios />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
