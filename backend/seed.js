/**
 * Seed — limpa o banco e recria tudo do zero.
 * Roda automaticamente após npm install (postinstall).
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import Usuario from './src/models/Usuario.js'
import PerfilAcesso, { PERMISSOES, PERMISSOES_JORNALISTA } from './src/models/PerfilAcesso.js'
import Categoria from './src/models/Categoria.js'
import Noticia from './src/models/Noticia.js'
import ConfiguracaoHome from './src/models/ConfiguracaoHome.js'
import ModuloHome from './src/models/ModuloHome.js'
import { Topico, NoticiaExterna } from './src/models/Extras.js'
import { Onibus } from './src/models/Onibus.js'
import { Evento } from './src/models/Evento.js'

// ── Códigos MongoDB que NÃO devem abortar o seed ─────────────────────────────
// IndexNotFound    (code 27) → índice não existe (já corrigido ou nunca criado)
// NamespaceNotFound(code 26) → coleção não existe (fresh install / banco limpo)
//
// A checagem usa AMBAS as propriedades porque o comportamento varia por versão
// do driver MongoDB:
//   • drivers mais antigos expõem apenas `e.code`  (número)
//   • drivers mais novos expõem `e.codeName` (string) e `e.code`
// Checar só `codeName` é suficiente na maioria dos casos, mas se `codeName`
// vier `undefined` a guarda falha silenciosamente e o erro é relançado — que
// é exatamente o bug que causava o travamento do seed.
const IGNORAR_NAMES = new Set(['IndexNotFound', 'NamespaceNotFound'])
const IGNORAR_CODES = new Set([26, 27])

function deveIgnorar(e) {
  return IGNORAR_NAMES.has(e.codeName) || IGNORAR_CODES.has(e.code)
}

async function seed() {
  // Este script legado apaga coleções. Nunca executá-lo por acidente numa VPS.
  if (!process.argv.includes('--confirm-reset-data')) {
    throw new Error('Seed destrutivo bloqueado. Exige --confirm-reset-data e backup prévio.')
  }
  if (typeof process.env.ADMIN_SENHA !== 'string' || process.env.ADMIN_SENHA.length < 12) {
    throw new Error('Defina ADMIN_SENHA com pelo menos 12 caracteres; sem senha padrão.')
  }
  console.log('🌱 Seed: conectando ao MongoDB...')
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 })
  console.log('✅ Seed: conectado!')

  // ── Recria índice guid_1 corretamente (sparse) ───────────────────────────
  // O índice precisa ser sparse para que notícias manuais (guid ausente) não
  // colidam entre si. Se o índice já existia sem sparse (criado antes desta
  // correção), o drop aqui garante que o Mongoose o recrie com a opção correta
  // na próxima inicialização do servidor ou ao rodar syncIndexes.
  try {
    await Noticia.collection.dropIndex('guid_1')
    console.log('🔧 Índice guid_1 removido — será recriado como sparse na próxima inicialização')
  } catch (e) {
    if (!deveIgnorar(e)) throw e
    console.log('ℹ️  Índice guid_1 não encontrado — nada a remover')
  }

  // ── Limpa tudo (exceto usuários) para recriar do zero ────────
  console.log('🗑️  Limpando coleções...')
  await Promise.all([
    PerfilAcesso.deleteMany({}), // recria todos os perfis do zero
    Categoria.deleteMany({}),
    Noticia.deleteMany({}),
    ConfiguracaoHome.deleteMany({}),
    ModuloHome.deleteMany({}),
    Topico.deleteMany({}),
    NoticiaExterna.deleteMany({}),
    Onibus.deleteMany({}),
    Evento.deleteMany({}),
  ])
  console.log('✅ Coleções limpas')


  // ── Perfis de Acesso Padrão (3 tipos) ───────────────────────────────────
  const perfisPadrao = [
    {
      nome: 'Superadmin',
      descricao: 'Acesso total ao sistema. Não pode ser excluído.',
      permissoes: [PERMISSOES.SUPERADMIN],
      cor: '#ef4444',
      sistema: true,
    },
    {
      nome: 'Jornalista',
      descricao: 'Cria e edita notícias, categorias, fontes, eventos, newsletter e módulos. Sem acesso a SEO, backup ou usuários.',
      permissoes: PERMISSOES_JORNALISTA,
      cor: '#f97316',
      sistema: true,
    },
    {
      nome: 'Usuário',
      descricao: 'Usuário do site. Sem acesso ao painel administrativo.',
      permissoes: [],
      cor: '#94a3b8',
      sistema: true,
    },
  ]
  for (const perfil of perfisPadrao) {
    await PerfilAcesso.findOneAndUpdate(
      { nome: perfil.nome },
      perfil,
      { upsert: true, new: true }
    )
  }
  console.log('✅ Perfis de acesso padrão prontos')

  // ── Admin ────────────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@al-sistemas.com'
  const adminSenha = process.env.ADMIN_SENHA
  const adminExiste = await Usuario.findOne({ email: adminEmail })
  if (!adminExiste) {
    await Usuario.create({ email: adminEmail, senha: adminSenha, nome: 'Admin' })
    console.log(`✅ Admin criado: ${adminEmail} (senha omitida dos logs)`)
  }

  // ── Categorias ───────────────────────────────────────
  const cats = [
    { nome: 'Cidades',            slug: 'cidades',      cor: '#1B5E3B' },
    { nome: 'História e Tradição',slug: 'historia',     cor: '#795548' },
    { nome: 'Belezas Naturais',   slug: 'natureza',     cor: '#2E7D32' },
    { nome: 'Política',           slug: 'politica',     cor: '#1565C0' },
    { nome: 'Esportes',           slug: 'esportes',     cor: '#E53935' },
    { nome: 'Cultura',            slug: 'cultura',      cor: '#6A1B9A' },
    { nome: 'Economia',           slug: 'economia',     cor: '#F57F17' },
    { nome: 'Curiosidades',       slug: 'curiosidades', cor: '#E65100' },
  ]
  const catMap = {}
  for (const cat of cats) {
    const c = await Categoria.findOneAndUpdate(
      { slug: cat.slug }, cat, { upsert: true, new: true, lean: false }
    )
    catMap[cat.slug] = c._id
  }
  console.log('✅ Categorias prontas')

  // ── Configurações da Home ────────────────────────────
  const configs = [
    { chave: 'hero_titulo_linha1',     valor: 'Nossa cidade,' },
    { chave: 'hero_titulo_linha2',     valor: 'nossa história.' },
    { chave: 'hero_subtitulo',         valor: 'Seu portal de notícias, curiosidades e histórias sobre Iguatama e tudo que faz parte da nossa gente.' },
    { chave: 'hero_imagem_url',        valor: 'https://images.unsplash.com/photo-1598395927056-8d895e701c3b?w=1400&q=80' },
    { chave: 'hero_btn1_label',        valor: 'Últimas Notícias' },
    { chave: 'hero_btn1_link',         valor: '/#noticias' },
    { chave: 'hero_btn2_label',        valor: 'Curiosidades' },
    { chave: 'hero_btn2_link',         valor: '/?categoria=curiosidades' },
    { chave: 'footer_texto_principal', valor: 'Iguatama é feita de histórias, pessoas e lugares inesquecíveis.' },
    { chave: 'social_facebook',        valor: 'https://facebook.com' },
    { chave: 'social_instagram',       valor: 'https://instagram.com' },
    { chave: 'social_youtube',         valor: 'https://youtube.com' },
    { chave: 'social_whatsapp',        valor: 'https://wa.me/' },
    // ── SEO / Metadados ────────────────────────────────
    { chave: 'site_titulo',       valor: 'Iguatama em Notícias' },
    { chave: 'site_descricao',    valor: 'Seu portal de notícias, curiosidades e histórias sobre Iguatama e tudo que faz parte da nossa gente.' },
    { chave: 'site_imagem',       valor: 'https://images.unsplash.com/photo-1598395927056-8d895e701c3b?w=1200&q=80' },
    { chave: 'site_keywords',     valor: 'Iguatama, notícias, portal, cidade, Minas Gerais' },
    { chave: 'site_author',       valor: 'Iguatama em Notícias' },
  ]
  for (const c of configs) {
    await ConfiguracaoHome.findOneAndUpdate({ chave: c.chave }, c, { upsert: true })
  }
  console.log('✅ Configurações prontas')

  // ── Módulos ──────────────────────────────────────────
  const modulos = [
    { chave: 'historia-cidade',  titulo: 'História da cidade',  ativo: true, ordem: 1 },
    { chave: 'belezas-naturais', titulo: 'Belezas naturais',    ativo: true, ordem: 2 },
    { chave: 'eventos',          titulo: 'Eventos',             ativo: true, ordem: 3 },
    { chave: 'horario-onibus',   titulo: 'Horário de ônibus',   ativo: true, ordem: 4 },
  ]
  for (const m of modulos) {
    await ModuloHome.findOneAndUpdate({ chave: m.chave }, m, { upsert: true })
  }
  console.log('✅ Módulos prontos')

  // ── Tópicos (4 módulos — sem "Orgulho de ser iguatamense") ───
  await Topico.insertMany([
    { icone: 'church',        label: 'História e tradição', descricao: 'A história da cidade',  link: '/?categoria=historia', ativo: true, ordem: 1 },
    { icone: 'mountain',      label: 'Belezas naturais',    descricao: 'Natureza e turismo',    link: '/?categoria=natureza', ativo: true, ordem: 2 },
    { icone: 'bus',           label: 'Horário de Ônibus',   descricao: 'Linhas e horários',     link: '/onibus',              ativo: true, ordem: 3 },
    { icone: 'calendarDays',  label: 'Eventos',             descricao: 'Agenda da cidade',      link: '/eventos',             ativo: true, ordem: 4 },
  ])
  console.log('✅ Tópicos prontos')

  // ── Notícias ─────────────────────────────────────────
  const noticias = [
    {
      titulo: 'Iguatama celebra 61 anos com programação especial de aniversário',
      conteudo: 'A cidade de Iguatama completou 61 anos de emancipação política e celebrou a data com uma programação especial que reuniu centenas de moradores na Praça Central. Eventos, shows e atividades culturais marcaram o aniversário da nossa cidade. O prefeito destacou os avanços na infraestrutura e saúde pública ao longo do último ano. A festa contou com apresentações de grupos folclóricos locais, bandas regionais e distribuição gratuita de quentão e pamonha.',
      imagem_url: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80',
      categoria_id: catMap['cidades'], destaque: false,
    },
    {
      titulo: 'A história da Capela de São Sebastião, símbolo de fé em Iguatama',
      conteudo: 'Construída no século XIX, a Capela de São Sebastião é um dos marcos históricos mais importantes de Iguatama. A edificação, que atravessa gerações em perfeito estado de conservação, recebe visitantes de toda a região. A capela foi tombada como patrimônio histórico municipal em 1998 e passou por restauração completa em 2015.',
      imagem_url: 'https://images.unsplash.com/photo-1548625149-fc4a29cf7092?w=800&q=80',
      categoria_id: catMap['historia'], destaque: true,
    },
    {
      titulo: 'Conheça as belezas da Cachoeira do Paredão, joia rural de Iguatama',
      conteudo: 'A Cachoeira do Paredão, localizada a 12 km do centro de Iguatama, é um dos destinos mais encantadores da zona rural do município. Com uma queda d\'água de aproximadamente 18 metros, o local atrai turistas de cidades como Divinópolis, Pará de Minas e até da capital Belo Horizonte.',
      imagem_url: 'https://images.unsplash.com/photo-1560707303-4e980ce876ad?w=800&q=80',
      categoria_id: catMap['natureza'], destaque: true,
    },
    {
      titulo: 'Iguatama já foi conhecida como "Prata do Oeste" — descubra o motivo',
      conteudo: 'Poucos moradores sabem que Iguatama já carregou o apelido de "Prata do Oeste" durante décadas no século XIX. A origem do curioso apelido está diretamente ligada à extração de minérios na região, em especial à prata encontrada nas margens do Rio São Francisco.',
      imagem_url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&q=80',
      categoria_id: catMap['historia'], destaque: true,
    },
    {
      titulo: 'Prefeitura anuncia pavimentação de mais 4 km de estradas rurais',
      conteudo: 'A Prefeitura Municipal de Iguatama anunciou nesta semana o início das obras de pavimentação de aproximadamente 4 quilômetros de estradas na zona rural do município. O investimento, estimado em R$ 2,3 milhões, é fruto de uma emenda parlamentar estadual.',
      imagem_url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
      categoria_id: catMap['politica'], destaque: false,
    },
    {
      titulo: 'Sabores que representam Iguatama: pratos típicos que você precisa provar',
      conteudo: 'A culinária de Iguatama é um reflexo genuíno das tradições mineiras, com influências rurais e uma identidade gastronômica única. Entre os pratos mais representativos estão o feijão tropeiro com linguiça caseira, o frango caipira com mandioca frita e o tradicional pão de queijo.',
      imagem_url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80',
      categoria_id: catMap['curiosidades'], destaque: true,
    },
    {
      titulo: 'Iguatama tem mais de 100 anos de história: relembre os marcos da cidade',
      conteudo: 'Fundada oficialmente em 1963 como município independente, Iguatama tem raízes que remontam ao século XVIII. Os primeiros registros de ocupação humana permanente na região datam de 1812, quando famílias mineiras se estabeleceram às margens do Córrego do Cedro.',
      imagem_url: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800&q=80',
      categoria_id: catMap['historia'], destaque: false,
    },
    {
      titulo: 'Time de futebol de Iguatama vai disputar o Campeonato Regional em 2025',
      conteudo: 'O Esporte Clube Iguatamense confirmou sua participação no Campeonato Regional do Médio São Francisco para a temporada 2025. A equipe, que disputa competições amadoras desde 1974, passou por uma renovação de elenco com a contratação de seis atletas.',
      imagem_url: 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=800&q=80',
      categoria_id: catMap['esportes'], destaque: false,
    },
  ]
  // Notícias publicadas (visíveis no portal)
  const publicado_em = new Date()
  await Noticia.insertMany(noticias.map(n => ({
    ...n,
    status: 'publicado',
    publicado_em,
  })))

  // Exemplos de notícias em outros status (para testar o fluxo editorial)
  await Noticia.insertMany([
    {
      titulo: '[RASCUNHO] Nova UBS deve ser inaugurada no segundo semestre',
      conteudo: 'A Secretaria Municipal de Saúde confirmou que as obras da nova Unidade Básica de Saúde do bairro São João estão na fase final. A previsão de entrega é para agosto.',
      categoria_id: catMap['politica'], destaque: false,
      status: 'rascunho',
    },
    {
      titulo: '[REVISÃO] Festival de Cultura Popular acontece em junho',
      conteudo: 'O Festival de Cultura Popular de Iguatama, que reúne grupos de congado, folia de reis e capoeira, está confirmado para a última semana de junho na Praça Central.',
      categoria_id: catMap['cultura'], destaque: false,
      status: 'revisao',
    },
  ])
  console.log(`✅ ${noticias.length + 2} notícias criadas (${noticias.length} publicadas, 1 rascunho, 1 em revisão)`)

  // ── Notícias Externas (exemplos) ─────────────────────
  await NoticiaExterna.insertMany([
    {
      titulo: 'Câmara aprova projeto que amplia isenção do Imposto de Renda',
      url_externa: 'https://g1.globo.com',
      fonte_nome: 'G1',
      imagem_url: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=400&q=80',
      categoria_label: 'POLÍTICA',
      categoria_cor: '#1565C0',
      ativo: true, ordem: 1,
    },
    {
      titulo: 'Inteligência Artificial: entenda os avanços que estão moldando o futuro',
      url_externa: 'https://www.uol.com.br',
      fonte_nome: 'UOL',
      imagem_url: 'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=400&q=80',
      categoria_label: 'TECNOLOGIA',
      categoria_cor: '#6A1B9A',
      ativo: true, ordem: 2,
    },
    {
      titulo: 'Brasil vence e se classifica para a próxima fase da competição',
      url_externa: 'https://www.espn.com.br',
      fonte_nome: 'ESPN',
      imagem_url: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=400&q=80',
      categoria_label: 'ESPORTES',
      categoria_cor: '#E53935',
      ativo: true, ordem: 3,
    },
    {
      titulo: 'ONU alerta para aquecimento global acima do esperado em relatório',
      url_externa: 'https://www.bbc.com/portuguese',
      fonte_nome: 'BBC',
      imagem_url: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=400&q=80',
      categoria_label: 'MUNDO',
      categoria_cor: '#E65100',
      ativo: true, ordem: 4,
    },
  ])
  console.log('✅ Notícias externas criadas')

  // ── Ônibus ───────────────────────────────────────────
  await Onibus.insertMany([
    {
      destino: 'Divinópolis',
      origem: 'Iguatama',
      empresa: 'Viação Cidade Verde',
      cor: '#1B5E3B',
      ordem: 1,
      horarios: [
        { hora: '05:30', dias: ['seg','ter','qua','qui','sex'], observacao: 'Saída do Terminal Rodoviário' },
        { hora: '08:00', dias: ['seg','ter','qua','qui','sex','sab'], observacao: '' },
        { hora: '13:00', dias: ['seg','ter','qua','qui','sex'], observacao: '' },
        { hora: '17:30', dias: ['seg','ter','qua','qui','sex','sab'], observacao: 'Última saída' },
        { hora: '08:00', dias: ['dom'], observacao: 'Domingos e feriados' },
      ],
    },
    {
      destino: 'Pará de Minas',
      origem: 'Iguatama',
      empresa: 'Expresso Sertanejo',
      cor: '#1565C0',
      ordem: 2,
      horarios: [
        { hora: '06:00', dias: ['seg','ter','qua','qui','sex'], observacao: '' },
        { hora: '12:30', dias: ['seg','ter','qua','qui','sex'], observacao: '' },
        { hora: '16:00', dias: ['seg','ter','qua','qui','sex','sab'], observacao: '' },
        { hora: '09:00', dias: ['dom'], observacao: 'Domingos e feriados' },
      ],
    },
    {
      destino: 'Belo Horizonte',
      origem: 'Iguatama',
      empresa: 'Cometa / Util',
      cor: '#C62828',
      ordem: 3,
      horarios: [
        { hora: '05:00', dias: ['seg','ter','qua','qui','sex'], observacao: 'Via Divinópolis' },
        { hora: '07:30', dias: ['seg','ter','qua','qui','sex','sab','dom'], observacao: 'Via Pará de Minas' },
        { hora: '14:00', dias: ['seg','ter','qua','qui','sex','sab'], observacao: 'Via Divinópolis' },
        { hora: '22:00', dias: ['seg','ter','qua','qui','sex','dom'], observacao: 'Noturno (leito)' },
      ],
    },
    {
      destino: 'Formiga',
      origem: 'Iguatama',
      empresa: 'Auto Viação Formiga',
      cor: '#6A1B9A',
      ordem: 4,
      horarios: [
        { hora: '07:00', dias: ['seg','ter','qua','qui','sex'], observacao: '' },
        { hora: '15:30', dias: ['seg','ter','qua','qui','sex'], observacao: '' },
        { hora: '07:00', dias: ['sab','dom'], observacao: 'Fds e feriados' },
      ],
    },
    {
      destino: 'Piumhi',
      origem: 'Iguatama',
      empresa: 'Viação Piumhiense',
      cor: '#F57F17',
      ordem: 5,
      horarios: [
        { hora: '06:30', dias: ['seg','ter','qua','qui','sex'], observacao: '' },
        { hora: '10:00', dias: ['seg','ter','qua','qui','sex','sab'], observacao: 'Expresso' },
        { hora: '14:30', dias: ['seg','ter','qua','qui','sex'], observacao: '' },
      ],
    },
  ])
  console.log('✅ Linhas de ônibus criadas')

  // ── Eventos ──────────────────────────────────────────
  const hoje = new Date()
  const d = (dias) => new Date(hoje.getTime() + dias * 86400000)
  await Evento.insertMany([
    {
      titulo: 'Festa de São Sebastião',
      descricao: 'Tradicional festa religiosa com missa campal, procissão, barraquinhas de comidas típicas e shows com artistas locais.',
      data: d(5), horario: '18:00', local: 'Praça Central e Capela de São Sebastião', cor: '#1B5E3B',
      ativo: true,
    },
    {
      titulo: 'Feira do Produtor Rural',
      descricao: 'Produtos artesanais, orgânicos e da lavoura diretamente do produtor para a sua mesa. Venha prestigiar os agricultores familiares!',
      data: d(8), horario: '07:00', local: 'Pavilhão Municipal', cor: '#2E7D32',
      ativo: true,
    },
    {
      titulo: 'Jogo do EC Iguatamense',
      descricao: 'Iguatamense x Formiga FC — Campeonato Regional. Entrada franca para moradores. Venha torcer!',
      data: d(12), horario: '15:00', local: 'Estádio Municipal João Basílio', cor: '#E53935',
      ativo: true,
    },
    {
      titulo: 'Workshop de Artesanato Mineiro',
      descricao: 'Aprenda técnicas de cestaria, bordado regional e cerâmica com artesãs locais. Vagas limitadas, inscrições na Secretaria de Cultura.',
      data: d(15), horario: '09:00', local: 'Centro Cultural Municipal', cor: '#6A1B9A',
      ativo: true,
    },
    {
      titulo: 'Caminhada Ecológica na Serra',
      descricao: 'Trilha guiada pelos arredores da Cachoeira do Paredão. Leve água, protetor solar e calçado confortável.',
      data: d(20), horario: '06:30', local: 'Saída da Praça Central', cor: '#00695C',
      ativo: true,
    },
    {
      titulo: 'Reunião do Conselho Municipal de Saúde',
      descricao: 'Pauta: apresentação do plano de ampliação da UBS e debate com a comunidade. Todos são bem-vindos.',
      data: d(22), horario: '19:00', local: 'Câmara Municipal', cor: '#1565C0',
      ativo: true,
    },
    {
      titulo: 'Festa Junina da APAE',
      descricao: 'Barracas, comidas típicas, quadrilha e show de prêmios. Toda a renda será revertida para os projetos da APAE.',
      data: d(28), horario: '17:00', local: 'Quadra da APAE', cor: '#F57F17',
      ativo: true,
    },
    {
      titulo: 'Palestra: Empreendedorismo no Campo',
      descricao: 'Com o consultor do SEBRAE, José Silva. Como agregar valor aos produtos rurais e acessar novos mercados.',
      data: d(35), horario: '19:30', local: 'Auditório da Prefeitura', cor: '#2D6A4F',
      ativo: true,
    },
  ])
  console.log('✅ Eventos criados')

  console.log('🎉 Seed concluído!')
  await mongoose.disconnect()
}

seed().catch(err => {
  console.error('❌ Seed falhou:', err.message)
  process.exit(0)
})
