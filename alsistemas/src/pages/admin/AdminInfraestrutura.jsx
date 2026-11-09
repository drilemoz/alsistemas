import { lazyWithRetry } from '../../utils/lazyWithRetry'
/**
 * AdminInfraestrutura.jsx — Componente-roteador de abas.
 *
 * Abas:
 *   AbaConfiguracoes — MongoDB / Cloudinary config
 *   AbaMongoDB       — exploração do banco
 *   AbaCloudinary    — galeria de mídia
 *   AbaSistema       — CPU / memória / cache
 *   AbaCloudflare    — DNS, zonas, analytics, workers ☁️
 */
import { useState, Suspense } from 'react'
import { C, Ico, Spin } from '../../components/admin/infra/InfraBase'
import { SPACE } from '../../themes/tokens'

const AbaConfiguracoes = lazyWithRetry(() => import('../../components/admin/infra/AbaConfiguracoes'))
const AbaMongoDB       = lazyWithRetry(() => import('../../components/admin/infra/AbaMongoDB'))
const AbaCloudinary    = lazyWithRetry(() => import('../../components/admin/infra/AbaCloudinary'))
const AbaSistema       = lazyWithRetry(() => import('../../components/admin/infra/AbaSistema'))
const AbaCloudflare    = lazyWithRetry(() => import('../../components/admin/infra/AbaCloudflare'))

const ABAS = [
  { id: 'config',      label: 'Configurações', icon: Ico.gear  },
  { id: 'mongodb',     label: 'MongoDB',       icon: Ico.db    },
  { id: 'cloudinary',  label: 'Cloudinary',    icon: Ico.cloud },
  { id: 'sistema',     label: 'Sistema',       icon: Ico.cpu   },
  { id: 'cloudflare',  label: 'Cloudflare',    icon: '☁️'      },
]

const ABA_COMPONENTE = {
  config:      <AbaConfiguracoes />,
  mongodb:     <AbaMongoDB />,
  cloudinary:  <AbaCloudinary />,
  sistema:     <AbaSistema />,
  cloudflare:  <AbaCloudflare />,
}

export default function AdminInfraestrutura() {
  const [abaAtiva, setAbaAtiva] = useState('config')

  return (
    <div className="adm-page">
      <div className="adm-page-header">
        <h1 className="adm-page-title">Infraestrutura</h1>
        <p className="adm-page-sub">Configurações, banco de dados, mídia, sistema e Cloudflare</p>
      </div>

      <div className="adm-tabs" style={{ marginBottom: 24 }}>
        {ABAS.map(aba => (
          <button
            key={aba.id}
            className={`adm-tab-btn${abaAtiva === aba.id ? ' active' : ''}`}
            onClick={() => setAbaAtiva(aba.id)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
              {aba.icon} {aba.label}
            </span>
          </button>
        ))}
      </div>

      <Suspense fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: C.muted }}>
          <Spin size={24} />
        </div>
      }>
        {ABA_COMPONENTE[abaAtiva]}
      </Suspense>
    </div>
  )
}
