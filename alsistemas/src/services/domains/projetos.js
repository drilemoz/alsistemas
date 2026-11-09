/**
 * projetos.js — Serviço de domínio: Projetos Locais
 *
 * Sprint 3 — ADIÇÃO PURA.
 * Sprint 7 — GitHub Sync: vincular, desvincular, syncStatus, registrarSincronizacao.
 */
import { api } from './http.js'

export const projetosService = {
  /* ── Originais (Sprint 3 — inalterados) ──────────────────── */

  /** Lista todos os projetos do diretório /projetos */
  listar: () => api('/projetos'),

  /** Detalhes de um projeto específico por nome */
  detalhe: (nome) => api(`/projetos/${encodeURIComponent(nome)}`),

  /* ── GitHub Sync (Sprint 7) ───────────────────────────────── */

  /** Envia um ZIP do browser e extrai na pasta Projetos do servidor */
  upload: (formData) =>
    api('/projetos/upload', { method: 'POST', body: formData, headers: {} }),

  /**
   * Vincula um projeto local a um repositório GitHub.
   * O backend verifica se o repo existe antes de salvar.
   */
  vincular: (nome, owner, repo) =>
    api(`/projetos/${encodeURIComponent(nome)}/vincular`, {
      method: 'POST',
      body:   JSON.stringify({ owner, repo }),
    }),

  /**
   * Remove o vínculo entre o projeto local e o repositório GitHub.
   */
  desvincular: (nome) =>
    api(`/projetos/${encodeURIComponent(nome)}/vincular`, {
      method: 'POST',
      body:   JSON.stringify({ owner: null, repo: null }),
    }),

  /**
   * Retorna o status de sincronização do projeto com o GitHub:
   * { vinculado, owner, repo, statusSync, dataPushGitHub, dataLocalModificacao, ... }
   */
  syncStatus: (nome) =>
    api(`/projetos/${encodeURIComponent(nome)}/sync-status`),

  /**
   * Salva timestamp de última sincronização no MongoDB.
   * Deve ser chamado após um pull (salvar-projeto) bem-sucedido.
   */
  registrarSincronizacao: (nome) =>
    api(`/projetos/${encodeURIComponent(nome)}/registrar-sincronizacao`, {
      method: 'POST',
    }),

  /* ── Cloudflare R2 (Sprint 12) ───────────────────────────── */

  /** Lista projetos (prefixes) no bucket R2 configurado */
  listarR2: () => api('/projetos/r2'),

  /** Lista arquivos de um projeto específico no R2 */
  arquivosR2: (nome) => api(`/projetos/r2/${encodeURIComponent(nome)}`),

  /** Remove todos os arquivos de um projeto do bucket R2 */
  deletarR2: (nome) => api(`/projetos/r2/${encodeURIComponent(nome)}`, { method: 'DELETE' }),

  /** Verifica credenciais, bucket e permissões do Cloudflare R2 */
  r2Health: () => api('/projetos/r2/health'),

  /** Compara data do último commit GitHub com data do deploy (R2 ou GridFS) */
  githubStatus: (nome, uploadedAt) =>
    api(`/projetos/github-status?nome=${encodeURIComponent(nome)}&uploadedAt=${encodeURIComponent(uploadedAt || '')}`),

  /* ── GridFS (Sprint 11) ───────────────────────────────────── */

  /** Upload de um .zip → extração em memória → GridFS (retorna { jobId, total, nomeProjeto }) */
  uploadGridFS: (formData) =>
    api('/projetos/upload-gridfs', { method: 'POST', body: formData, headers: {} }),

  /** Polling do progresso de um job de upload GridFS */
  uploadGridFSStatus: (jobId) =>
    api(`/projetos/upload-gridfs/status/${encodeURIComponent(jobId)}`),

  /** Lista todos os projetos armazenados no GridFS */
  listarGridFS: () => api('/projetos/gridfs'),

  /** Árvore de arquivos de um projeto no GridFS */
  detalheGridFS: (nome) =>
    api(`/projetos/gridfs/${encodeURIComponent(nome)}`),

  /** Conteúdo de um arquivo específico no GridFS */
  arquivoGridFS: (nome, filePath) =>
    api(`/projetos/gridfs/${encodeURIComponent(nome)}/arquivo?path=${encodeURIComponent(filePath)}`),

  /** Remove um projeto inteiro do GridFS */
  deletarGridFS: (nome) =>
    api(`/projetos/gridfs/${encodeURIComponent(nome)}`, { method: 'DELETE' }),
}
