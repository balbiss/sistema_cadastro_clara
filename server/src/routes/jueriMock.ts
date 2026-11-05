import { Router } from 'express';

// "Jueri de mentira" SÓ PRA TESTE: mesmo formato da API real (/api/v1/:cliente/revendedor|pedido|venda,
// paginado com data/next_page_url). Só é montado com JUERI_MOCK=1 — nunca em produção.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const jueriMockRouter = Router();
let dados: { revendedores: any[]; pedidos: any[]; vendas: any[] } = { revendedores: [], pedidos: [], vendas: [] };

jueriMockRouter.post('/api/jueri-mock/seed', (req, res) => { dados = { revendedores: [], pedidos: [], vendas: [], ...req.body }; res.json({ ok: true }); });
const pagina = (lista: any[], req: any) => {
  const per = Number(req.query.per_page) || 500, page = Number(req.query.page) || 1;
  const fatia = lista.slice((page - 1) * per, page * per);
  return { data: fatia, next_page_url: page * per < lista.length ? 'mais' : null };
};
jueriMockRouter.get('/api/jueri-mock/api/v1/:cli/revendedor', (req, res) => res.json(pagina(dados.revendedores, req)));
jueriMockRouter.get('/api/jueri-mock/api/v1/:cli/pedido', (req, res) => res.json(pagina(dados.pedidos, req)));
jueriMockRouter.get('/api/jueri-mock/api/v1/:cli/venda', (req, res) => {
  const id = req.query.fk_revendedor_id;
  res.json(pagina(id ? dados.vendas.filter(v => String(v.fk_revendedor_id) === String(id)) : dados.vendas, req));
});
