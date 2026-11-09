import { BASE_PACK } from './base.js';

export const APP_VERSION = '1.6.5';
export const AVAILABLE_PACKS = { base: BASE_PACK };

// Catálogo de expansões. "em_breve" = ainda não publicada.
export const DLC_CATALOG = [
  { id: 'aquario', nome: 'Aquário', desc: 'Tanques com vidro, filtragem, salinidade e temperatura, equipe de mergulho e túnel de vidro.', tamanho: '~30 MB', estado: 'em_breve' },
  { id: 'hoteis', nome: 'Hotéis', desc: 'Visitantes que passam a noite, diárias e noites ao vivo no parque.', tamanho: '~15 MB', estado: 'em_breve' },
  { id: 'pesquisa', nome: 'Centro de Pesquisa', desc: 'Pontos de pesquisa que liberam melhorias de veterinária, reprodução e espécies.', tamanho: '~10 MB', estado: 'em_breve' },
  { id: 'museu', nome: 'Museu', desc: 'Educação e prestígio: aumenta a reputação e atrai visitantes.', tamanho: '~12 MB', estado: 'em_breve' },
  { id: 'conservacao', nome: 'Conservação e Reservas', desc: 'Solte animais em reservas naturais e restaure ecossistemas.', tamanho: '~40 MB', estado: 'em_breve' },
  { id: 'compras', nome: 'Compras e Estoque', desc: 'Almoxarifado, comprador contratado, fornecedores com preço e prazo, estoques de carne, feno, frutas, remédios e produtos de limpeza, entregas por caminhão e alertas de estoque baixo.', tamanho: '~10 MB', estado: 'em_breve' },
  { id: 'energia', nome: 'Energia e Iluminação', desc: 'Postes e luz nos habitats, rede elétrica, gerador, conta de luz mensal e quedas de energia.', tamanho: '~8 MB', estado: 'em_breve' },
  { id: 'noturno', nome: 'Passeio Noturno', desc: 'Visitação à noite com iluminação especial. Reajusta o relógio para noites mais longas.', tamanho: '~8 MB', estado: 'em_breve' },
  { id: 'fachadas', nome: 'Fachadas', desc: 'Entrada nova com bilheterias e catracas, portal temático e estacionamento pago para gerar mais receita.', tamanho: '~12 MB', estado: 'em_breve' },
  { id: 'biomas', nome: 'Biomas', desc: 'Deserto, floresta tropical, ártico, montanha, Pantanal e litoral, com espécies novas e domos imersivos: paisagem 360° por dentro, habitat com animais e tela de LED por fora.', tamanho: '~60 MB', estado: 'em_breve' },
  { id: 'clima', nome: 'Clima e Estações', desc: 'Estações do ano e clima mudando o ambiente e as necessidades.', tamanho: '~8 MB', estado: 'em_breve' },
];

export const CHANGELOG = [
  { versao: '1.6.5', data: '09/11/2026', titulo: 'Versão 1.6.5: os alertas são seus', itens: [
    'Avançar o relógio com o jogo aberto agora para no primeiro alerta novo (doença, fome, cerca, portão, fuga...) e o subgerente não age: você resolve o caos. O subgerente continua agindo só com o app fechado ou o celular bloqueado',
    'A pausa em alerta novo já valia nas velocidades normal, 2x e 3x',
  ] },
  { versao: '1.6.4', data: '09/11/2026', titulo: 'Versão 1.6.4: menos calor e mais FPS', itens: [
    'Postes, lixeiras, bancos, plantas, cercas e construções agora são desenhados em lotes: metade das chamadas de desenho (de ~750 para ~350 no exemplo de teste), então o celular trabalha menos e esquenta menos',
    'Nova opção Economia de calor e bateria (ligada): limita a 30 quadros por segundo e usa resolução um pouco menor nos gráficos Alto e Ultra. Desligue em Menu > Configurações para 60 FPS',
  ] },
  { versao: '1.6.3', data: '09/11/2026', titulo: 'Versão 1.6.3: alertas para você, subgerente com o jogo fechado', itens: [
    'Com o jogo aberto, os alertas ficam para você resolver; o subgerente só age enquanto o app está fechado ou o celular bloqueado (e ao avançar o relógio). Dá para mudar em Menu > Configurações > Subgerente só com o jogo fechado',
    'Quando surge um alerta novo, o jogo pausa sozinho para você ler e decidir (não pausa no AO VIVO). Opção: Menu > Configurações > Pausar quando surgir alerta',
  ] },
  { versao: '1.6.2', data: '09/11/2026', titulo: 'Versão 1.6.2: tela sempre ligada', itens: [
    'A tela do celular não apaga mais sozinha com o jogo aberto (dá para desligar em Menu > Configurações > Manter a tela ligada)',
  ] },
  { versao: '1.6.1', data: '09/11/2026', titulo: 'Versão 1.6.1: parque já cheio ao reabrir', itens: [
    'Ao fechar e abrir o jogo de dia (8h às 18h), o parque já começa com visitantes passeando em vez de zerado; os que passam do limite aparecem só no contador 👥, sem pagar ingresso duas vezes',
    'Aplicativo marcado como jogo (categoria) no manifesto, para ajudar o Game Hub / Game Booster do celular a reconhecê-lo',
  ] },
  { versao: '1.6.0', data: '09/11/2026', titulo: 'Versão 1.6: caminhos, mobiliário e animais sem atravessar nada', itens: [
    'Animais não se sobrepõem mais e não atravessam plantas, comedouro e bebedouro: eles contornam os obstáculos',
    'Máximo de 100 visitantes desenhados: os que passam disso continuam contando no 👥 e pagando, só não aparecem na tela (mais fluidez no celular)',
    '4 tipos de caminho: pedra, terra, cimentado e cimentado com calçada',
    'Postes de luz, lixeiras e bancos: barras para escolher a quantidade ao desenhar o caminho, espalhados sem sobreposição nas bordas ou na calçada; os postes acendem à noite',
    'Visitantes usam as lixeiras (menos lixo no chão) e os bancos (descanso)',
    'Construções sempre viradas para um caminho: a entrada gira sozinha; bancos só ao lado de caminhos, virados para eles',
    'Nova construção: área de mesas, ao lado das lanchonetes. Lanchonetes e mesas ganham uma lixeira de brinde',
    'Lanchonete, banheiro e loja bem mais bonitas: toldos listrados, emblemas, janelas, plantas, luzes e balões',
    'Correção no gráfico Ultra: elefantes, rinocerontes, hipopótamos e tartarugas voltam a aparecer com a pele detalhada (o efeito da pele estava com erro)',
    'Seu save é convertido sozinho' ] },
  { versao: '1.5.0', data: '08/11/2026', titulo: 'Versão 1.5: gráfico Ultra', itens: [
    'Novo gráfico Ultra (o Baixo e o Alto continuam iguais): céu de verdade em 360° que muda com a hora, do amanhecer à noite estrelada',
    'Sol que nasce a leste e se põe a oeste, com luz e sombras mudando de cor; luz do ambiente tirada do próprio céu',
    'Terreno com texturas de foto (capim, terra, areia, lama, rocha e caminho de pedra) e bordas naturais entre elas',
    'Capim em 3D balançando ao vento, água com ondas e reflexo, copas de árvores feitas de folhas e casca de árvore real',
    'Pelo nos leões, macacos e gorilas e rugas na pele de elefantes, rinocerontes, hipopótamos e tartarugas',
    'Se o aparelho ficar lento, o jogo passa sozinho do Ultra para o Alto',
    'Texturas e céus do Poly Haven (licença livre CC0). DLC Biomas no catálogo' ] },
  { versao: '1.4.0', data: '08/11/2026', titulo: 'Versão 1.4: câmera, tutorial e 5 espécies novas', itens: [
    'Câmera feita para o dedo: pinça aproxima na direção dos dedos, dois dedos girando rodam, dois dedos arrastando para cima/baixo inclinam, toque duplo aproxima e o movimento tem inércia',
    'Botões de câmera na tela (girar, inclinar, aproximar) e bússola que volta para o norte; a câmera nunca entra no relevo',
    'Tutorial guiado com setas, que dá para pular e refazer em Menu > Ajuda',
    'Modo Tranquilo: sem fugas e sem mortes por falta de cuidados (escolha no Novo jogo ou nas Configurações)',
    'Desfazer a última construção por 60 segundos e confirmação antes de vender um animal',
    'Sons: cliques, dinheiro, alertas, vozes dos animais e ambiente com pássaros e grilos',
    'Medidor de FPS e ajuste automático da qualidade quando o jogo fica lento',
    'Zoopédia com fatos reais de cada espécie e a opção de dar nome aos animais',
    'Cinco espécies novas com modelos realistas: hipopótamo, rinoceronte, flamingo, gorila e tartaruga-gigante' ] },
  { versao: '1.3.0', data: '08/11/2026', titulo: 'Versão 1.3: gestão mais completa', itens: [
    'Painel do habitat com sugestões de melhoria e botões: enviar funcionário, plantar, pintar terreno, criar lago, comprar ou transferir animais',
    'Fechamento mensal: salários e manutenção são pagos no fim do mês (a cada 30 dias), com relatório e previsão do próximo mês',
    'Dia mais longo e noite mais curta: as horas do dia passam devagar e a noite passa rápido (continua 1 dia = 1 hora real)',
    'Novas expansões no catálogo: Compras e Estoque, Energia e Iluminação, Passeio Noturno e Fachadas' ] },
  { versao: '1.2.0', data: '08/11/2026', titulo: 'Versão 1.2: relevo, ilhas e transferências', itens: [
    'Relevo: suba, baixe, suavize e nivele o terreno; lagos com profundidade (elefantes tomam banho em água funda)',
    'Ilhas prontas com fosso: água funda no lugar da cerca, com ponte e portão',
    'Viveiro com tela: cerca com rede por cima, ideal para macacos',
    'Fugas animadas: macacos escalam, leões pulam, animais fortes derrubam a cerca e elefantes atravessam o fosso a nado',
    'Brechas na cerca: ficam abertas até um segurança consertar, e outros animais podem sair por elas',
    'Animais fortes e estressados desgastam a cerca mais rápido',
    'Transferência de animais entre habitats: toque no animal, 🚚 Mover, escolha o destino e quem leva' ] },
  { versao: '1.1.0', data: '08/11/2026', titulo: 'Versão 1.1: captura, consertos e limpeza', itens: [
    'Captura de verdade: a equipe vai de jipe (ou caminhão para elefante e girafa), aplica dardo tranquilizante, coloca o animal na jaula do veículo e o leva de volta',
    'Consertos animados: maçarico com faíscas na cerca de ferro, martelo no muro, cones de sinalização, e a cerca vai se recuperando aos poucos',
    'Limpeza dos habitats: os animais fazem fezes e espalham comida; o tratador varre item por item',
    'Gráfico Alto com modelos realistas novos: animais e equipe com corpo suave, pelagem com padrões (listras, manchas, juba) e esqueleto animado',
    'Barras de progresso sobre a equipe mostrando cada trabalho',
    'Seu progresso da 1.0 é convertido automaticamente' ] },
  { versao: '1.0.0', data: '08/11/2026', titulo: 'Versão 1.0, a primeira', itens: [
    'Bem-vindo ao seu zoológico!',
    'Savana e floresta, com leão, zebra, elefante, girafa e macaco',
    'Funcionários, subgerente e alertas: você comanda, a equipe trabalha',
    'Gráficos Baixo e Alto, e modo AO VIVO em primeira pessoa',
    'Jogue offline e guarde seu progresso com segurança',
    'Em breve: novas expansões na aba DLCs.' ] },
];

// Conteúdo combinado dos pacotes instalados
let merged = null, mergedKey = '';
export function content(state) {
  const ids = Object.keys(state?.packs || { base: 1 }).filter(id => AVAILABLE_PACKS[id]).sort();
  const key = ids.join(',');
  if (merged && key === mergedKey) return merged;
  const out = { terrains: {}, biomes: {}, plants: {}, fences: {}, species: {}, facilities: {}, roles: {}, furniture: {} };
  for (const id of ids) {
    const p = AVAILABLE_PACKS[id];
    for (const k of Object.keys(out)) for (const [kk, v] of Object.entries(p[k] || {})) out[k][kk] = { ...v, pack: id };
  }
  out.tempo = ids.map(id => AVAILABLE_PACKS[id].tempo).filter(Boolean).pop();
  merged = out; mergedKey = key; return out;
}
export const has = (state, kind, id) => !!content(state)[kind][id];
