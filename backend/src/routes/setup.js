/**
 * Setup / Instalação — AL Sistemas
 *
 * Endpoints:
 *   GET  /api/setup/status            — verifica se o setup já foi feito + estado do banco
 *   GET  /api/setup/env-config        — lê configurações MongoDB/Cloudinary (mascaradas)
 *   POST /api/setup                   — instalação inicial (cria admin + perfis + seed seletivo)
 *   POST /api/setup/seed              — importa dados de exemplo (autenticado)
 *   POST /api/setup/env-config        — grava configurações MongoDB/Cloudinary no .env
 *   POST /api/setup/reset-db          — apaga TUDO e recria do zero (requer confirmação)
 *   POST /api/setup/desativar-arquivo — grava SETUP_DISABLED=true no .env (sem renomear o arquivo)
 */
import { Router }  from 'express'
import mongoose    from 'mongoose'
import jwt         from 'jsonwebtoken'
import Usuario     from '../models/Usuario.js'
import PerfilAcesso, {
  PERMISSOES, PERMISSOES_JORNALISTA,
} from '../models/PerfilAcesso.js'
import Categoria        from '../models/Categoria.js'
import Noticia          from '../models/Noticia.js'
import ConfiguracaoHome from '../models/ConfiguracaoHome.js'
import ModuloHome       from '../models/ModuloHome.js'
import { Topico, NoticiaExterna } from '../models/Extras.js'
import { Onibus }       from '../models/Onibus.js'
import { Evento }       from '../models/Evento.js'
import Fonte            from '../models/Fonte.js'
import { autenticar }   from '../middleware/auth.js'

const router = Router()

// ─── Guarda global: bloqueia o setup se foi desativado via .env ───────────────
router.use((req, res, next) => {
  // Rota de status é sempre permitida (usada pelo frontend para checar instalação)
  // Rota de desativar-arquivo também deve funcionar se ainda não foi desativado
  if (process.env.SETUP_DISABLED === 'true' && req.path !== '/status') {
    return res.status(410).json({
      erro: 'O setup foi desativado pelo administrador e não está mais disponível.',
    })
  }
  next()
})

async function contarDados() {
  const [usuarios, noticias, categorias, eventos, onibus] = await Promise.all([
    Usuario.countDocuments(),
    Noticia.countDocuments(),
    Categoria.countDocuments(),
    Evento.countDocuments(),
    Onibus.countDocuments(),
  ])
  return { usuarios, noticias, categorias, eventos, onibus }
}

async function criarPerfis() {
  await PerfilAcesso.deleteMany({ sistema: true })

  // ── 3 perfis do sistema ──────────────────────────────────────────────────
  const [superadmin, jornalista, usuario] = await Promise.all([

    // 1. Superadmin — acesso irrestrito a tudo
    PerfilAcesso.create({
      nome:      'Superadmin',
      descricao: 'Acesso total ao sistema. Não pode ser excluído.',
      permissoes: [PERMISSOES.SUPERADMIN],
      cor: '#ef4444', sistema: true,
    }),

    // 2. Jornalista — trabalha com conteúdo editorial
    //    NÃO tem: SEO, backup, usuários, erros avançados
    PerfilAcesso.create({
      nome:      'Jornalista',
      descricao: 'Cria e edita notícias, categorias, fontes, eventos, newsletter e módulos. Sem acesso a SEO, backup ou usuários.',
      permissoes: PERMISSOES_JORNALISTA,
      cor: '#f97316', sistema: true,
    }),

    // 3. Usuário — sem acesso ao painel admin
    //    Reservado para uso futuro (área do leitor, comentários, favoritos…)
    PerfilAcesso.create({
      nome:      'Usuário',
      descricao: 'Usuário do site. Sem acesso ao painel administrativo.',
      permissoes: [],
      cor: '#94a3b8', sistema: true,
    }),
  ])

  return { superadmin, jornalista, usuario }
}

// ─── executarSeed: dados_escolhidos controla quais coleções popular ───────────
async function executarSeed(
  nomeSite = 'AL Sistemas',
  dados = ['categorias','noticias','fontes','topicos','eventos','onibus','modulos','noticias_externas']
) {
  const incluir = (chave) => dados.includes(chave)

  // Helper: upsert em lote para evitar E11000 em re-importações
  async function upsertMany(Model, docs, campoChave) {
    await Model.bulkWrite(
      docs.map(doc => ({
        updateOne: {
          filter: { [campoChave]: doc[campoChave] },
          update:  { $setOnInsert: doc },
          upsert:  true,
        },
      })),
      { ordered: false }
    )
  }

  // ── Categorias (upsert por slug — sem E11000 em re-importação) ───────────
  let cats = [], catMap = {}
  if (incluir('categorias')) {
    const catDefs = [
      { nome: 'Política',        slug: 'politica',        cor: '#1565C0' },
      { nome: 'Saúde',           slug: 'saude',           cor: '#2E7D32' },
      { nome: 'Educação',        slug: 'educacao',        cor: '#6A1B9A' },
      { nome: 'Esportes',        slug: 'esportes',        cor: '#E53935' },
      { nome: 'Cultura',         slug: 'cultura',         cor: '#F57F17' },
      { nome: 'Economia',        slug: 'economia',        cor: '#00695C' },
      { nome: 'Segurança',       slug: 'seguranca',       cor: '#4E342E' },
      { nome: 'Meio Ambiente',   slug: 'meio-ambiente',   cor: '#558B2F' },
      { nome: 'Curiosidades',    slug: 'curiosidades',    cor: '#AD1457' },
      { nome: 'História',        slug: 'historia',        cor: '#4527A0' },
      { nome: 'Turismo',         slug: 'turismo',         cor: '#0277BD' },
      { nome: 'Obras e Serviços',slug: 'obras-servicos',  cor: '#E65100' },
      { nome: 'Agronegócio',     slug: 'agronegocio',     cor: '#33691E' },
      { nome: 'Trânsito',        slug: 'transito',        cor: '#37474F' },
      { nome: 'Entretenimento',  slug: 'entretenimento',  cor: '#880E4F' },
    ]
    await upsertMany(Categoria, catDefs, 'slug')
    cats  = await Categoria.find({ slug: { $in: catDefs.map(c => c.slug) } }).lean()
    catMap = Object.fromEntries(cats.map(c => [c.slug, c._id]))
  } else {
    // Mesmo sem importar categorias, monta o mapa para uso pelas notícias
    const existentes = await Categoria.find({}).lean()
    catMap = Object.fromEntries(existentes.map(c => [c.slug, c._id]))
  }

  // ── Configuração da home (upsert por chave) ───────────────────
  await upsertMany(ConfiguracaoHome, [
    { chave: 'nome_site',      valor: nomeSite,                            descricao: 'Nome do portal de notícias' },
    { chave: 'descricao',      valor: `Portal de notícias de ${nomeSite}`, descricao: 'Descrição exibida no SEO/meta' },
    { chave: 'cor_primaria',   valor: '#1B5E3B',                           descricao: 'Cor primária do tema' },
    { chave: 'cor_secundaria', valor: '#2E7D32',                           descricao: 'Cor secundária do tema' },
  ], 'chave')

  // ── Módulos da home (upsert por chave) ────────────────────────
  if (incluir('modulos')) {
    await upsertMany(ModuloHome, [
      { chave: 'historia-cidade',  titulo: 'História da cidade',  ativo: true, ordem: 1 },
      { chave: 'belezas-naturais', titulo: 'Belezas naturais',    ativo: true, ordem: 2 },
      { chave: 'eventos',          titulo: 'Eventos',             ativo: true, ordem: 3 },
      { chave: 'horario-onibus',   titulo: 'Horário de ônibus',   ativo: true, ordem: 4 },
    ], 'chave')
  }

  // ── Tópicos da Faixa ──────────────────────────────────────────
  let topicosCnt = 0
  if (incluir('topicos')) {
    await Topico.insertMany([
      { icone: 'church',       label: 'História e tradição', descricao: 'A história da cidade',  link: '/?categoria=historia', ativo: true, ordem: 1 },
      { icone: 'mountain',     label: 'Belezas naturais',    descricao: 'Natureza e turismo',    link: '/?categoria=natureza', ativo: true, ordem: 2 },
      { icone: 'bus',          label: 'Horário de Ônibus',   descricao: 'Linhas e horários',     link: '/onibus',              ativo: true, ordem: 3 },
      { icone: 'calendarDays', label: 'Eventos',             descricao: 'Agenda da cidade',      link: '/eventos',             ativo: true, ordem: 4 },
    ])
    topicosCnt = 4
  }

  // ── Fontes ────────────────────────────────────────────────────
  let fontesCnt = 0
  if (incluir('fontes')) {
    await Fonte.insertMany([
      { nome: 'Prefeitura Municipal',     url: null },
      { nome: 'Câmara Municipal',         url: null },
      { nome: 'Secretaria de Saúde',      url: null },
      { nome: 'Secretaria de Educação',   url: null },
      { nome: 'Polícia Militar',          url: null },
      { nome: 'Corpo de Bombeiros',       url: null },
      { nome: 'Assessoria de Imprensa',   url: null },
      { nome: 'Redação ' + nomeSite,      url: null },
    ])
    fontesCnt = 8
  }

  // ── Notícias de exemplo ───────────────────────────────────────
  let noticiasCnt = 0
  if (incluir('noticias')) {
    await Noticia.insertMany([
      {
        titulo: `Prefeitura de ${nomeSite} anuncia novo programa de infraestrutura`,
        conteudo: `A Prefeitura Municipal anunciou investimentos em infraestrutura urbana para o próximo exercício fiscal. As obras incluem recapeamento de vias, melhoria da iluminação pública e reforma de praças. O prefeito destacou que os recursos foram garantidos por meio de convênios com o governo estadual.`,
        imagem_url: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800&q=80',
        categoria_id: catMap['politica'], destaque: true, status: 'publicado', publicado_em: new Date(),
      },
      {
        titulo: 'Unidade de Saúde amplia atendimento para toda a população',
        conteudo: 'A Unidade Básica de Saúde ampliou seus horários de atendimento, passando a funcionar também aos sábados. A medida visa reduzir filas e melhorar o acesso da população. Especialidades como clínica geral, pediatria e ginecologia estão disponíveis sem necessidade de agendamento.',
        imagem_url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&q=80',
        categoria_id: catMap['saude'], destaque: true, status: 'publicado', publicado_em: new Date(),
      },
      {
        titulo: 'Escola municipal recebe reforma e novos equipamentos',
        conteudo: 'A escola municipal passou por ampla reforma estrutural e recebeu novos computadores e equipamentos pedagógicos. A iniciativa beneficia mais de 300 alunos matriculados no ensino fundamental. A inauguração contou com a presença da secretária de educação e representantes da comunidade.',
        imagem_url: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800&q=80',
        categoria_id: catMap['educacao'], destaque: false, status: 'publicado', publicado_em: new Date(),
      },
      {
        titulo: 'Time local se classifica para o campeonato regional',
        conteudo: 'O time de futebol local garantiu vaga na fase seguinte do campeonato regional após vitória expressiva. A torcida comemorou o resultado nas ruas da cidade. O treinador afirmou que o grupo está focado e preparado para os próximos desafios da temporada.',
        imagem_url: 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=800&q=80',
        categoria_id: catMap['esportes'], destaque: false, status: 'publicado', publicado_em: new Date(),
      },
      {
        titulo: 'Festival cultural movimenta o centro da cidade',
        conteudo: 'O festival reuniu artistas locais e regionais em apresentações de música, dança e teatro. O evento gratuito atraiu milhares de visitantes ao longo do fim de semana. A programação incluiu exposições de artesanato, gastronomia típica e oficinas para crianças.',
        imagem_url: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=80',
        categoria_id: catMap['cultura'], destaque: true, status: 'publicado', publicado_em: new Date(),
      },
      {
        titulo: `Conheça a história e as origens de ${nomeSite}`,
        conteudo: `${nomeSite} foi fundada no início do século passado por colonizadores que buscavam novas terras e oportunidades no interior do estado. Com raízes profundas na agricultura e na fé, a cidade construiu sua identidade ao longo de décadas de trabalho e tradição. Hoje, o patrimônio histórico e cultural é motivo de orgulho para seus moradores.`,
        imagem_url: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&q=80',
        categoria_id: catMap['historia'], destaque: true, status: 'publicado', publicado_em: new Date(),
      },
      {
        titulo: 'Novo parque ecológico abre as portas para visitação pública',
        conteudo: 'A cidade ganhou um novo espaço de lazer e contato com a natureza. O parque ecológico conta com trilhas, área de piquenique, lago artificial e viveiro de aves nativas. A entrada é gratuita e o local funciona de terça a domingo, das 7h às 18h.',
        imagem_url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&q=80',
        categoria_id: catMap['meio-ambiente'], destaque: false, status: 'publicado', publicado_em: new Date(),
      },
      {
        titulo: 'Produtores rurais recebem capacitação em técnicas sustentáveis',
        conteudo: 'A Secretaria de Agricultura promoveu uma série de palestras e workshops voltados aos produtores rurais da região. Os temas abordados incluíram manejo de solo, irrigação eficiente e certificação orgânica. Cerca de 80 agricultores participaram dos treinamentos.',
        imagem_url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&q=80',
        categoria_id: catMap['agronegocio'], destaque: false, status: 'publicado', publicado_em: new Date(),
      },
      {
        titulo: 'Obras de pavimentação iniciam em bairros residenciais',
        conteudo: 'A Prefeitura deu início às obras de pavimentação asfáltica em quatro bairros da cidade. Os serviços incluem terraplenagem, drenagem pluvial e sinalização viária. A previsão é que as obras sejam concluídas em noventa dias, beneficiando mais de dois mil moradores.',
        imagem_url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&q=80',
        categoria_id: catMap['obras-servicos'], destaque: false, status: 'publicado', publicado_em: new Date(),
      },
      {
        titulo: 'Economia local registra crescimento no setor de serviços',
        conteudo: 'De acordo com levantamento da Associação Comercial, o setor de serviços da cidade cresceu significativamente no último trimestre. Novos estabelecimentos abriram as portas, gerando empregos e movimentando a economia local. Especialistas apontam a melhoria da infraestrutura como fator determinante.',
        imagem_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80',
        categoria_id: catMap['economia'], destaque: false, status: 'publicado', publicado_em: new Date(),
      },
      {
        titulo: 'Semana do Turismo destaca atrações naturais da região',
        conteudo: 'A Semana do Turismo reuniu guias, empreendedores e visitantes para explorar o potencial turístico da cidade e da região. Cachoeiras, grutas e mirantes foram apresentados como destaques do roteiro ecológico local. O evento espera fomentar o turismo sustentável como alternativa econômica.',
        imagem_url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
        categoria_id: catMap['turismo'], destaque: true, status: 'publicado', publicado_em: new Date(),
      },
      {
        titulo: 'Operação policial resulta em apreensões no centro da cidade',
        conteudo: 'A Polícia Militar realizou operação de combate à criminalidade nas principais ruas do centro urbano. A ação resultou em abordagens, apreensão de entorpecentes e condução de suspeitos à delegacia. O comandante regional elogiou o trabalho integrado das forças de segurança.',
        imagem_url: 'https://images.unsplash.com/photo-1453873531674-2151bcd01707?w=800&q=80',
        categoria_id: catMap['seguranca'], destaque: false, status: 'publicado', publicado_em: new Date(),
      },
    ])
    noticiasCnt = 12
  }

  // ── Notícias externas ─────────────────────────────────────────
  if (incluir('noticias_externas')) {
    await NoticiaExterna.insertMany([
      { titulo: 'Câmara aprova projeto de interesse municipal', url_externa: 'https://g1.globo.com', fonte_nome: 'G1', imagem_url: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=400&q=80', categoria_label: 'POLÍTICA', categoria_cor: '#1565C0', ativo: true, ordem: 1 },
      { titulo: 'Investimentos em cidades do interior crescem', url_externa: 'https://www.uol.com.br', fonte_nome: 'UOL', imagem_url: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=400&q=80', categoria_label: 'ECONOMIA', categoria_cor: '#00695C', ativo: true, ordem: 2 },
      { titulo: 'Brasil avança em ranking de saúde pública', url_externa: 'https://www.bbc.com/portuguese', fonte_nome: 'BBC', imagem_url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&q=80', categoria_label: 'SAÚDE', categoria_cor: '#2E7D32', ativo: true, ordem: 3 },
    ])
  }

  // ── Ônibus ────────────────────────────────────────────────────
  let onibusCnt = 0
  if (incluir('onibus')) {
    await Onibus.insertMany([
      {
        destino: 'Capital', origem: nomeSite, empresa: 'Viação Regional', cor: '#1B5E3B', ordem: 1,
        horarios: [
          { hora: '05:30', dias: ['seg','ter','qua','qui','sex'], observacao: 'Saída do Terminal' },
          { hora: '13:00', dias: ['seg','ter','qua','qui','sex'], observacao: '' },
          { hora: '08:00', dias: ['sab','dom'], observacao: 'Fins de semana e feriados' },
        ],
      },
      {
        destino: 'Cidade Vizinha', origem: nomeSite, empresa: 'Expresso Local', cor: '#1565C0', ordem: 2,
        horarios: [
          { hora: '06:00', dias: ['seg','ter','qua','qui','sex'], observacao: '' },
          { hora: '12:30', dias: ['seg','ter','qua','qui','sex'], observacao: '' },
          { hora: '07:00', dias: ['sab','dom'], observacao: '' },
        ],
      },
    ])
    onibusCnt = 2
  }

  // ── Eventos ───────────────────────────────────────────────────
  let eventosCnt = 0
  if (incluir('eventos')) {
    const hoje = new Date()
    const d = (dias) => new Date(hoje.getTime() + dias * 86400000)
    await Evento.insertMany([
      { titulo: 'Festa da Cidade', descricao: 'Celebração do aniversário municipal com shows, barracas e apresentações culturais.', data: d(10), horario: '18:00', local: 'Praça Central', cor: '#1B5E3B', ativo: true },
      { titulo: 'Feira do Produtor Rural', descricao: 'Produtos artesanais e da lavoura diretamente do produtor para sua mesa.', data: d(7), horario: '07:00', local: 'Pavilhão Municipal', cor: '#2E7D32', ativo: true },
      { titulo: 'Reunião do Conselho Municipal', descricao: 'Pauta aberta para debate com a comunidade. Todos são bem-vindos.', data: d(14), horario: '19:00', local: 'Câmara Municipal', cor: '#1565C0', ativo: true },
    ])
    eventosCnt = 3
  }

  return { categorias: cats.length, noticias: noticiasCnt, fontes: fontesCnt, topicos: topicosCnt, eventos: eventosCnt, onibus: onibusCnt }
}

// ─── GET /api/setup/status ────────────────────────────────────────────────────
router.get('/status', async (_req, res, next) => {
  try {
    const dados  = await contarDados()
    const dbNome = mongoose.connection.db?.databaseName ?? 'desconhecido'
    res.json({
      setup_needed: dados.usuarios === 0,
      banco_vazio:  Object.values(dados).every(v => v === 0),
      tem_dados:    dados.noticias > 0 || dados.categorias > 0,
      banco_nome:   dbNome,
      contagens:    dados,
    })
  } catch (err) { next(err) }
})

// ─── GET /api/setup/env-config — lê config MongoDB/Cloudinary ────────────────
// SEGURANÇA: segredos (MONGO_URI, CLOUDINARY_API_SECRET) NUNCA retornam em
// texto puro. Usamos uma sentinel fixa quando o valor já está configurado.
// O POST ignora o campo se vier com a sentinel (= usuário não alterou).
export const ENV_SECRET_PLACEHOLDER = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'

router.get('/env-config', async (_req, res, next) => {
  try {
    const mongoUri  = process.env.MONGO_URI               || ''
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME   || ''
    const cloudKey  = process.env.CLOUDINARY_API_KEY      || ''
    const cloudSec  = process.env.CLOUDINARY_API_SECRET   || ''

    // Retorna a sentinel se configurado, '' se não — nunca o valor real
    const mascarar = (val) => val ? ENV_SECRET_PLACEHOLDER : ''

    res.json({
      mongo_uri:                 mascarar(mongoUri),   // contém usuário:senha na URI
      cloudinary_cloud_name:     cloudName,            // público — seguro expor
      cloudinary_api_key:        cloudKey,             // público — seguro expor
      cloudinary_api_secret:     mascarar(cloudSec),   // segredo — nunca em texto puro
    })
  } catch (err) { next(err) }
})

// ─── POST /api/setup/env-config — grava config no .env ───────────────────────
router.post('/env-config', async (req, res, next) => {
  try {
    const { mongo_uri, cloudinary_cloud_name, cloudinary_api_key, cloudinary_api_secret } = req.body

    // Se o campo vier com a sentinel (usuário não alterou), ignoramos —
    // assim não sobrescrevemos o segredo real com o placeholder.
    const isSentinel = (v) => !v || v === ENV_SECRET_PLACEHOLDER

    if (!isSentinel(mongo_uri))             process.env.MONGO_URI              = mongo_uri
    if (cloudinary_cloud_name)              process.env.CLOUDINARY_CLOUD_NAME  = cloudinary_cloud_name
    if (cloudinary_api_key)                 process.env.CLOUDINARY_API_KEY     = cloudinary_api_key
    if (!isSentinel(cloudinary_api_secret)) process.env.CLOUDINARY_API_SECRET  = cloudinary_api_secret

    // Persiste no arquivo .env
    try {
      const { readFileSync, writeFileSync } = await import('fs')
      const { resolve } = await import('path')
      const envPath = resolve(process.cwd(), '.env')
      let conteudo = ''
      try { conteudo = readFileSync(envPath, 'utf8') } catch { /* arquivo novo */ }

      const setVar = (txt, chave, valor) => {
        const re = new RegExp(`^${chave}=.*$`, 'm')
        const linha = `${chave}=${valor}`
        return re.test(txt) ? txt.replace(re, linha) : txt + `\n${linha}`
      }

      if (!isSentinel(mongo_uri))             conteudo = setVar(conteudo, 'MONGO_URI',             mongo_uri)
      if (cloudinary_cloud_name)              conteudo = setVar(conteudo, 'CLOUDINARY_CLOUD_NAME', cloudinary_cloud_name)
      if (cloudinary_api_key)                 conteudo = setVar(conteudo, 'CLOUDINARY_API_KEY',    cloudinary_api_key)
      if (!isSentinel(cloudinary_api_secret)) conteudo = setVar(conteudo, 'CLOUDINARY_API_SECRET', cloudinary_api_secret)

      writeFileSync(envPath, conteudo.trimStart(), 'utf8')
    } catch (fsErr) {
      console.warn('[setup] Não foi possível persistir no .env:', fsErr.message)
    }

    res.json({ mensagem: 'Configurações salvas com sucesso.' })
  } catch (err) { next(err) }
})

// ─── POST /api/setup — instalação inicial ────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const total = await Usuario.countDocuments()
    if (total > 0) {
      return res.status(410).json({ erro: 'Setup já foi realizado. Esta rota não está mais disponível.' })
    }

    const {
      nome, email, senha,
      nome_site       = 'AL Sistemas',
      importar_seed   = false,
      dados_escolhidos = ['categorias','noticias','fontes','topicos','eventos','onibus','modulos','noticias_externas'],
    } = req.body

    if (!nome?.trim() || !email?.trim() || !senha?.trim()) {
      return res.status(400).json({ erro: 'Nome, email e senha são obrigatórios.' })
    }
    if (senha.length < 8) {
      return res.status(400).json({ erro: 'A senha deve ter pelo menos 8 caracteres.' })
    }

    const perfis  = await criarPerfis()
    const usuario = await Usuario.create({
      nome:      nome.trim(),
      email:     email.trim().toLowerCase(),
      senha,
      role:      'superadmin',
      perfil_id: perfis.superadmin._id,
      ativo:     true,
    })

    // ── Seed: executado separadamente para não derrubar a instalação ─────────
    let seedInfo  = null
    let seedErro  = null
    if (importar_seed) {
      try {
        seedInfo = await executarSeed(nome_site, dados_escolhidos)
      } catch (seedErr) {
        seedErro = seedErr.message || 'Erro ao importar dados de exemplo'
      }
    }

    // ── Auto-login: gera cookie para o admin recém-criado ────────────────────
    const COOKIE_OPTS = {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge:   7 * 24 * 60 * 60 * 1000,
      path:     '/',
    }
    const token = jwt.sign({ id: usuario._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    })
    res.cookie('alsistemas_token', token, COOKIE_OPTS)

    res.status(201).json({
      mensagem:       'Instalação concluída com sucesso!',
      usuario:        { nome: usuario.nome, email: usuario.email },
      perfis_criados: Object.values(perfis).map(p => p.nome),
      seed:           seedInfo,
      seed_erro:      seedErro,
      auto_login:     true,
    })
  } catch (err) { next(err) }
})

// ─── POST /api/setup/seed — importar dados de exemplo (autenticado) ──────────
router.post('/seed', autenticar, async (req, res, next) => {
  try {
    const {
      nome_site        = 'AL Sistemas',
      limpar_antes     = false,
      dados_escolhidos = ['categorias','noticias','fontes','topicos','eventos','onibus','modulos','noticias_externas'],
    } = req.body

    if (limpar_antes) {
      await Promise.all([
        Categoria.deleteMany({}),
        Noticia.deleteMany({}),
        ConfiguracaoHome.deleteMany({}),
        ModuloHome.deleteMany({}),
        Topico.deleteMany({}),
        NoticiaExterna.deleteMany({}),
        Onibus.deleteMany({}),
        Evento.deleteMany({}),
        Fonte.deleteMany({}),
      ])
    }

    const resultado = await executarSeed(nome_site, dados_escolhidos)
    res.json({ mensagem: 'Dados de exemplo importados com sucesso!', importados: resultado, limpou_antes: limpar_antes })
  } catch (err) { next(err) }
})

// ─── POST /api/setup/test-mongo — testa conexão com a URI fornecida ──────────
router.post('/test-mongo', async (req, res, next) => {
  try {
    const { mongo_uri } = req.body
    if (!mongo_uri?.trim()) {
      return res.status(400).json({ ok: false, erro: 'URI não fornecida' })
    }
    let conn = null
    try {
      conn = await mongoose.createConnection(mongo_uri.trim()).asPromise()
      const dbName = conn.db?.databaseName ?? '—'
      await conn.close()
      return res.json({ ok: true, mensagem: `Conectado com sucesso ao banco "${dbName}"` })
    } catch (connErr) {
      if (conn) try { await conn.close() } catch {}
      return res.status(200).json({ ok: false, erro: connErr.message || 'Falha na conexão' })
    }
  } catch (err) { next(err) }
})

// ─── POST /api/setup/test-cloudinary — testa credenciais Cloudinary ──────────
router.post('/test-cloudinary', async (req, res, next) => {
  try {
    const { cloudinary_cloud_name, cloudinary_api_key } = req.body
    let { cloudinary_api_secret } = req.body

    // Se o secret vier como sentinel (usuário não alterou), usa o valor do ambiente
    if (!cloudinary_api_secret || cloudinary_api_secret === ENV_SECRET_PLACEHOLDER) {
      cloudinary_api_secret = process.env.CLOUDINARY_API_SECRET || ''
    }

    if (!cloudinary_cloud_name || !cloudinary_api_key || !cloudinary_api_secret) {
      return res.status(400).json({ ok: false, erro: 'Preencha todos os campos do Cloudinary' })
    }
    try {
      const { v2: cloudinary } = await import('cloudinary')
      cloudinary.config({
        cloud_name: cloudinary_cloud_name,
        api_key:    cloudinary_api_key,
        api_secret: cloudinary_api_secret,
      })
      await cloudinary.api.ping()
      return res.json({ ok: true, mensagem: `Cloudinary conectado (cloud: ${cloudinary_cloud_name})` })
    } catch (cloudErr) {
      return res.status(200).json({ ok: false, erro: cloudErr.message || 'Credenciais inválidas' })
    }
  } catch (err) { next(err) }
})

// ─── POST /api/setup/reset-db — apaga TUDO (confirmação por texto) ───────────
router.post('/reset-db', async (req, res, next) => {
  try {
    const { confirmar, manter_usuarios = true } = req.body
    if (confirmar !== 'CONFIRMAR_RESET') {
      return res.status(400).json({ erro: 'Envie confirmar: "CONFIRMAR_RESET" para prosseguir.' })
    }

    const ops = [
      Categoria.deleteMany({}),
      Noticia.deleteMany({}),
      ConfiguracaoHome.deleteMany({}),
      ModuloHome.deleteMany({}),
      Topico.deleteMany({}),
      NoticiaExterna.deleteMany({}),
      Onibus.deleteMany({}),
      Evento.deleteMany({}),
      PerfilAcesso.deleteMany({ sistema: false }),
    ]
    if (!manter_usuarios) {
      ops.push(Usuario.deleteMany({}))
      ops.push(PerfilAcesso.deleteMany({}))
    }
    await Promise.all(ops)

    res.json({
      mensagem: manter_usuarios
        ? 'Banco resetado. Usuários e perfis foram mantidos.'
        : 'Banco completamente resetado. Acesse /admin/setup para reinstalar.',
      manter_usuarios,
    })
  } catch (err) { next(err) }
})

// ─── POST /api/setup/desativar-arquivo — desativa o setup após instalação ────
// IMPORTANTE: apenas grava SETUP_DISABLED=true no .env.
// O rename do arquivo setup.js foi REMOVIDO — ele quebrava o servidor na
// reinicialização porque server.js faz import estático de './routes/setup.js'.
// A guarda no topo deste router (process.env.SETUP_DISABLED === 'true') já é
// suficiente para bloquear todas as rotas de setup após a instalação.
router.post('/desativar-arquivo', autenticar, async (req, res, next) => {
  try {
    const { resolve }                    = await import('path')
    const { writeFileSync, readFileSync } = await import('fs')

    // Grava SETUP_DISABLED=true no .env e em process.env para efeito imediato
    try {
      const envPath = resolve(process.cwd(), '.env')
      let conteudo = ''
      try { conteudo = readFileSync(envPath, 'utf8') } catch { /* arquivo novo */ }
      const re = /^SETUP_DISABLED=.*$/m
      const linha = 'SETUP_DISABLED=true'
      conteudo = re.test(conteudo) ? conteudo.replace(re, linha) : conteudo + `\n${linha}`
      writeFileSync(envPath, conteudo.trimStart(), 'utf8')
      process.env.SETUP_DISABLED = 'true'
    } catch (envErr) {
      console.warn('[setup] Não foi possível gravar SETUP_DISABLED no .env:', envErr.message)
    }

    res.json({
      mensagem: 'Setup desativado com sucesso.',
      env_atualizado: true,
    })
  } catch (err) { next(err) }
})

export default router
