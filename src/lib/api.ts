// Chamadas à API do Clara Cadastros. Em local o Vite repassa /api pra :3013; em produção VITE_API_URL = endereço da API.
const BASE = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '') + '/api'
export const tokenAtual = () => localStorage.getItem('cad_token') || ''

export type Usuario = { id: number; name: string; email: string; role: 'diretoria' | 'analise' | 'administrativo'; active: boolean }
export const usuarioAtual = (): Usuario | null => { try { return JSON.parse(localStorage.getItem('cad_user') || 'null') } catch { return null } }

export class ErroApi extends Error { constructor(msg: string, public status: number) { super(msg) } }

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const t = tokenAtual()
  if (t) headers.Authorization = 'Bearer ' + t
  const isForm = body instanceof FormData
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) })
  const txt = await r.text()
  let data: any = null
  try { data = txt ? JSON.parse(txt) : null } catch { data = txt }
  if (r.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/publico')) {
    localStorage.removeItem('cad_token'); localStorage.removeItem('cad_user')
    window.location.href = '/login'
  }
  if (!r.ok) throw new ErroApi(data?.error || 'Erro ' + r.status, r.status)
  return data as T
}
export const arquivoUrl = (docId: number) => `${BASE}/documentos/${docId}/arquivo?token=${encodeURIComponent(tokenAtual())}`
