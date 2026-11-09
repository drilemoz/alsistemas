/**
 * AbaCloudinary.jsx — Galeria de mídia e métricas do Cloudinary.
 */
import { useState, useEffect } from 'react'
import { infraestruturaService } from '../../../services/api'
import toast from 'react-hot-toast'
import {
  C, Ico, Spin, PageCard, SectionTitle, Btn, BarraProgresso, ModalConfirm,
} from './InfraBase'

export default function AbaCloudinary() {
  const [status,     setStatus]     = useState(null)
  const [recursos,   setRecursos]   = useState([])
  const [cursor,     setCursor]     = useState(null)
  const [tipo,       setTipo]       = useState('image')
  const [carregando, setCarregando] = useState(true)
  const [loadMore,   setLoadMore]   = useState(false)
  const [erro,       setErro]       = useState(null)
  const [delConfirm, setDelConfirm] = useState(null)
  const [deletando,  setDeletando]  = useState(false)

  async function carregarStatus() {
    try { setStatus(await infraestruturaService.cloudinaryStatus()) }
    catch (e) { setErro(e.message) }
  }

  async function carregarRecursos(novoCursor = null, novoTipo = tipo, reset = false) {
    reset ? setCarregando(true) : setLoadMore(true)
    try {
      const r = await infraestruturaService.cloudinaryRecursos(novoTipo, 20, novoCursor)
      setRecursos(prev => reset ? r.recursos : [...prev, ...r.recursos])
      setCursor(r.cursor_proximo)
    } catch (e) { toast.error(e.message || 'Erro ao carregar mídia') }
    finally { setCarregando(false); setLoadMore(false) }
  }

  useEffect(() => {
    carregarStatus()
    carregarRecursos(null, tipo, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function trocarTipo(t) {
    setTipo(t); setRecursos([]); setCursor(null)
    carregarRecursos(null, t, true)
  }

  async function handleDelete() {
    if (!delConfirm) return
    setDeletando(true)
    try {
      await infraestruturaService.cloudinaryExcluir(delConfirm.public_id, delConfirm.tipo)
      toast.success('Recurso excluído do Cloudinary')
      setRecursos(prev => prev.filter(r => r.public_id !== delConfirm.public_id))
      setDelConfirm(null)
      await carregarStatus()
    } catch (e) { toast.error(e.message || 'Erro ao excluir') }
    finally { setDeletando(false) }
  }

  if (erro) return (
    <PageCard>
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <span style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>⚠️</span>
        <p style={{ color: C.red, fontSize: 13, marginBottom: 14 }}>{erro}</p>
        <Btn onClick={() => { setErro(null); carregarStatus(); carregarRecursos(null, tipo, true) }} variant="ghost">
          {Ico.refresh} Tentar novamente
        </Btn>
      </div>
    </PageCard>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {delConfirm && (
        <ModalConfirm
          titulo="Excluir recurso do Cloudinary?"
          descricao={`O arquivo "${delConfirm.public_id}" será permanentemente removido.`}
          loading={deletando} onConfirm={handleDelete} onCancel={() => setDelConfirm(null)}
        />
      )}

      {status && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {[
            { label: 'Cloud Name',       valor: status.cloud_name,       sub: status.plano },
            { label: 'Armazenamento',    valor: status.storage_fmt,      sub: `de ${status.storage_limite}`,   barra: status.storage_pct,   cor: status.storage_pct   > 80 ? C.red : C.green },
            { label: 'Bandwidth',        valor: status.bandwidth_fmt,    sub: `de ${status.bandwidth_limite}`, barra: status.bandwidth_pct, cor: status.bandwidth_pct > 80 ? C.red : C.blue },
            { label: 'Imagens',          valor: String(status.total_imagens) },
            { label: 'Vídeos',           valor: String(status.total_videos) },
            { label: 'Transformações',   valor: String(status.transformacoes) },
          ].map(({ label, valor, sub, barra, cor }) => (
            <div key={label} style={{ background: C.surf2, borderRadius: 10, padding: '12px 14px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 4px' }}>{label}</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: cor || C.text, margin: '0 0 2px' }}>{valor}</p>
              {sub   && <p style={{ fontSize: 11, color: C.muted, margin: '0 0 6px' }}>{sub}</p>}
              {barra !== undefined && <BarraProgresso pct={barra} color={cor} />}
            </div>
          ))}
        </div>
      )}

      <PageCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <SectionTitle icon={tipo === 'image' ? Ico.img : Ico.video}>
            {tipo === 'image' ? 'Imagens' : 'Vídeos'} ({recursos.length})
          </SectionTitle>
          <div style={{ display: 'flex', gap: 6 }}>
            {['image', 'video'].map(t => (
              <button key={t} onClick={() => trocarTipo(t)} style={{
                padding: '6px 14px', borderRadius: 7, border: `1px solid ${t === tipo ? C.blue : C.border}`,
                background: t === tipo ? C.blue + '22' : 'transparent',
                color: t === tipo ? C.blue : C.muted, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}>
                {t === 'image' ? '🖼 Imagens' : '🎬 Vídeos'}
              </button>
            ))}
          </div>
        </div>

        {carregando ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size={24} /></div>
        ) : recursos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: C.muted }}>
            <p style={{ margin: 0, fontSize: 13 }}>Nenhum recurso encontrado</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              {recursos.map(r => (
                <div key={r.public_id} style={{ background: C.surf2, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>
                  {r.tipo === 'image' ? (
                    <div style={{ height: 100, overflow: 'hidden', background: C.bg }}>
                      <img src={r.display_url} alt={r.public_id} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy"
                        onError={e => e.target.style.display = 'none'} />
                    </div>
                  ) : (
                    <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, color: C.muted, fontSize: 28 }}>🎬</div>
                  )}
                  <div style={{ padding: '8px 10px', flex: 1 }}>
                    <p style={{ fontSize: 11, color: C.subtle, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.public_id}>
                      {r.public_id.split('/').pop()}
                    </p>
                    <p style={{ fontSize: 10, color: C.muted, margin: '0 0 6px' }}>
                      {r.bytes_fmt} {r.largura ? `· ${r.largura}×${r.altura}` : ''}
                    </p>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <a href={r.display_url} target="_blank" rel="noreferrer"
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '4px 0', borderRadius: 6, background: C.blue + '22', color: C.blue, fontSize: 11, textDecoration: 'none', fontWeight: 600 }}>
                        {Ico.extLink} Ver
                      </a>
                      <button onClick={() => setDelConfirm({ public_id: r.public_id, tipo: r.tipo })}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '4px 0', borderRadius: 6, background: C.red + '22', color: C.red, fontSize: 11, border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                        {Ico.trash} Apagar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {cursor && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                <Btn onClick={() => carregarRecursos(cursor, tipo, false)} loading={loadMore} variant="ghost">
                  {Ico.refresh} Carregar mais
                </Btn>
              </div>
            )}
          </>
        )}
      </PageCard>
    </div>
  )
}
