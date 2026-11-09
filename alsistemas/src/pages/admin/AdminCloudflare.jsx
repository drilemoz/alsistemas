import { lazyWithRetry } from '../../utils/lazyWithRetry'
/**
 * AdminCloudflare.jsx — Página dedicada ao gerenciamento Cloudflare.
 *
 * Rota: /admin/cloudflare
 *
 * Estrutura:
 *   DSPageHeader  — título, sub, botão de docs externos
 *   AbaCloudflare — componente com as 5 abas internas:
 *                   Visão Geral · Zonas · DNS · Analytics · Workers
 *
 * Segue 100% os padrões do DS (adm-page, DSPageHeader, tokens).
 */
import { Suspense } from 'react'
import { Spin }           from '../../components/admin/infra/InfraBase'
import { DSPageHeader }   from '../../components/admin/ui/DS'
import { DSBtn }          from '../../components/admin/ui/DS'
import { SPACE }          from '../../themes/tokens'

const AbaCloudflare = lazyWithRetry(() => import('../../components/admin/infra/AbaCloudflare'))

function IconoCF() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      aria-hidden="true" style={{ width: 22, height: 22, flexShrink: 0 }}>
      {/* Ícone de nuvem com relâmpago — representa CDN/proxy */}
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" />
      <path d="M13 11l-2 4h3l-2 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconoExternal() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      style={{ width: 13, height: 13 }}>
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

export default function AdminCloudflare() {
  return (
    <div className="adm-page">
      <DSPageHeader
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
            <IconoCF /> Cloudflare
          </span>
        }
        sub="DNS · Zonas · Analytics · Workers · SSL — gerenciamento completo da sua conta"
        actions={
          <DSBtn
            variant="secondary"
            onClick={() => window.open('https://dash.cloudflare.com', '_blank', 'noopener')}
            title="Abrir painel Cloudflare em nova aba"
          >
            <IconoExternal /> Painel CF
          </DSBtn>
        }
      />

      <Suspense fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spin size={26} />
        </div>
      }>
        <AbaCloudflare />
      </Suspense>
    </div>
  )
}
