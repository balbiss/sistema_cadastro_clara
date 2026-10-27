import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { api, type Usuario } from '../lib/api'
import { CARGO } from '../lib/status'
import { Modal, btn, inputStyle, labelStyle } from '../components/ui'
import { Carregando, PageHeader, toast } from '../components/extra'

// Item 10: acesso por cargo. Consultoras não entram aqui (elas ficam no CRM e veem só o status).
export default function Usuarios() {
  const [lista, setLista] = useState<Usuario[] | null>(null)
  const [novo, setNovo] = useState(false)
  const carregar = () => api('GET', '/usuarios').then(setLista)
  useEffect(() => { carregar() }, [])
  const mudar = async (u: Usuario, body: object) => { try { await api('PATCH', '/usuarios/' + u.id, body); toast('Salvo'); carregar() } catch (e) { toast((e as Error).message, 'error') } }
  return (
    <div>
      <PageHeader title="Usuários" subtitle="Quem acessa o Clara Cadastros e o que cada cargo pode fazer"
        right={<button style={btn('primary')} onClick={() => setNovo(true)}><Plus size={16} /> Novo usuário</button>} />
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 3, marginBottom: 16 }}>
        {!lista ? <Carregando /> : (
          <table className="tabela">
            <thead><tr><th>Nome</th><th>E-mail</th><th>Cargo</th><th>Situação</th></tr></thead>
            <tbody>{lista.map(u => (
              <tr key={u.id}>
                <td><b>{u.name}</b></td><td>{u.email}</td>
                <td><select value={u.role} onChange={e => mudar(u, { role: e.target.value })} style={{ ...inputStyle, width: 'auto' }}>{Object.entries(CARGO).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></td>
                <td><button style={btn(u.active ? 'ghost' : 'soft', { minHeight: 30 })} onClick={() => mudar(u, { active: !u.active })}>{u.active ? 'Ativo' : 'Inativo'}</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.7 }}>
        <b>Diretoria:</b> tudo, inclusive regras, integração e usuários.<br />
        <b>Análise cadastral:</b> decide crédito (aprovar, reprovar, pedir avalista), confere documentos, pendências.<br />
        <b>Administrativo / documental:</b> confere documentos e cuida das pendências — não decide crédito.
      </div>
      {novo && <NovoUsuario onClose={() => setNovo(false)} onOk={carregar} />}
    </div>
  )
}

function NovoUsuario({ onClose, onOk }: { onClose: () => void; onOk: () => void }) {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'analise' })
  const salvar = async () => { try { await api('POST', '/usuarios', f); toast('Usuário criado'); onClose(); onOk() } catch (e) { toast((e as Error).message, 'error') } }
  const campo = (k: keyof typeof f, l: string, type = 'text') => <div style={{ marginBottom: 12 }}><label style={labelStyle}>{l}</label><input type={type} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} style={inputStyle} /></div>
  return (
    <Modal title="Novo usuário" onClose={onClose} footer={<><button style={btn('ghost')} onClick={onClose}>Cancelar</button><button style={btn('primary')} onClick={salvar}>Criar</button></>}>
      {campo('name', 'Nome')}{campo('email', 'E-mail', 'email')}{campo('password', 'Senha (mín. 6)', 'password')}
      <label style={labelStyle}>Cargo</label>
      <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })} style={inputStyle}>{Object.entries(CARGO).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
    </Modal>
  )
}
