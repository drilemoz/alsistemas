/**
 * useRss.js
 *
 * Encapsula todo o estado e lógica de fetch/CRUD do AdminRssImport.
 *
 * Retorna:
 *   fontes, padrao, categorias
 *   carregando
 *   importando          — id da fonte sendo importada (ou null)
 *   importandoTodas     — boolean
 *   adicionando         — url da fonte padrão sendo adicionada (ou null)
 *   resultados          — último resultado de importação (ou null)
 *   setResultados       — para o componente limpar o painel de resultados
 *   temFontesAtivas     — boolean derivado
 *   carregar()
 *   adicionarPadrao(p)
 *   salvarFonte(dados, modalId)  — modalId presente → editar; ausente → criar
 *   excluirFonte(fonte)
 *   importarFonte(fonte)
 *   importarTodas()
 */
import { useState, useEffect, useCallback } from 'react'
import { rssService, categoriasService } from '../services/api'
import toast from 'react-hot-toast'

export function useRss() {
  const [fontes,           setFontes]           = useState([])
  const [padrao,           setPadrao]           = useState([])
  const [categorias,       setCategorias]       = useState([])
  const [carregando,       setCarregando]       = useState(true)
  const [importando,       setImportando]       = useState(null)
  const [importandoTodas,  setImportandoTodas]  = useState(false)
  const [adicionando,      setAdicionando]      = useState(null)
  const [resultados,       setResultados]       = useState(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [fs, ps, cs] = await Promise.all([
        rssService.listarFontes(),
        rssService.fontesPadrao(),
        categoriasService.listar(),
      ])
      setFontes(Array.isArray(fs) ? fs : (fs.fontes ?? []))
      setPadrao(Array.isArray(ps) ? ps : [])
      setCategorias(Array.isArray(cs) ? cs : (cs.categorias ?? []))
    } catch (err) {
      toast.error('Erro ao carregar fontes RSS: ' + err.message)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function adicionarPadrao(p) {
    setAdicionando(p.url)
    try {
      await rssService.criarFonte({ nome: p.nome, url: p.url, padrao: true })
      toast.success(`"${p.nome}" adicionada!`)
      await carregar()
    } catch (err) {
      toast.error(err.message || 'Erro ao adicionar fonte')
    } finally {
      setAdicionando(null)
    }
  }

  /**
   * @param {object} dados    — payload do formulário
   * @param {string} modalId  — id da fonte para editar; falsy → criar nova
   */
  async function salvarFonte(dados, modalId) {
    if (modalId) {
      await rssService.editarFonte(modalId, dados)
      toast.success('Fonte atualizada!')
    } else {
      await rssService.criarFonte(dados)
      toast.success('Fonte cadastrada!')
    }
    await carregar()
  }

  async function excluirFonte(fonte) {
    try {
      await rssService.excluirFonte(fonte.id)
      toast.success('Fonte removida')
      await carregar()
    } catch (err) {
      toast.error(err.message || 'Erro ao excluir')
    }
  }

  async function importarFonte(fonte) {
    setImportando(fonte.id)
    setResultados(null)
    try {
      const categoriaId = fonte.categoria_id?.id || fonte.categoria_id || null
      const r = await rssService.importarFonte(fonte.id, { categoria_id: categoriaId })
      setResultados(r)
      toast.success(`${r.importadas} notícia(s) importada(s)`)
      await carregar()
    } catch (err) {
      toast.error('Erro na importação: ' + err.message)
    } finally {
      setImportando(null)
    }
  }

  async function importarTodas() {
    setImportandoTodas(true)
    setResultados(null)
    try {
      const r = await rssService.importarTodas()
      setResultados(r)
      toast.success(`${r.totalImportadas} notícia(s) importada(s) no total`)
      await carregar()
    } catch (err) {
      toast.error('Erro na importação em massa: ' + err.message)
    } finally {
      setImportandoTodas(false)
    }
  }

  const temFontesAtivas = fontes.some(f => f.ativa)

  return {
    fontes,
    padrao,
    categorias,
    carregando,
    importando,
    importandoTodas,
    adicionando,
    resultados,
    setResultados,
    temFontesAtivas,
    carregar,
    adicionarPadrao,
    salvarFonte,
    excluirFonte,
    importarFonte,
    importarTodas,
  }
}
