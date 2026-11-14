import { BASE_PACK, ZOOPEDIA as Z_BASE } from './base.js';
import { DLC_PACKS, DLC_ZOOPEDIA } from './dlc/index.js';

export const APP_VERSION = '1.7.3';
export const AVAILABLE_PACKS = { base: BASE_PACK, ...DLC_PACKS };
export const ZOOPEDIA = { ...Z_BASE, ...DLC_ZOOPEDIA };

// Catálogo de expansões. "em_breve" = ainda não publicada.
export const DLC_CATALOG = [ // estado: 'em_breve' até o pacote entrar em dlc/index.js (aí vira 'disponivel' sozinho)
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
  { id: 'obras', nome: 'Obras e Construções', desc: 'Reformas, terraplanagens e construções passam a levar dias de jogo, com tapumes e barra de progresso na obra.', tamanho: '~6 MB', estado: 'em_breve' },
].map(d => ({ ...d, estado: AVAILABLE_PACKS[d.id] ? 'disponivel' : d.estado }));

export const CHANGELOG = [
  { versao: '1.7.3', data: '13/11/2026', titulo: 'Versão 1.7.3: turnos, intervalos, Centro de cuidados e rua da frente', itens: [
    'Turnos fixos: Dia (6h–18h), Noite (18h–6h, +25% no salário) e Integral (6h–22h, +40%, cansa mais). Noite só para tratador, veterinário e segurança. O turno é escolhido na contratação (⭐ = o que mais falta no setor) e pode ser trocado na ficha',
    'Fim do turno: o funcionário termina o que está fazendo, sai pelo portão e pega o ônibus; volta 15 min antes do próximo turno com a energia cheia',
    'Alerta sem ninguém de turno: quem está de folga aparece no menu com "hora extra" (+50% da hora, pago no fechamento do mês). Quem está em casa leva ~20 min de jogo para chegar. Com o app fechado, o subgerente faz o mesmo',
    'Intervalos escalonados: café da manhã, almoço e café da tarde (noite: jantar e café da madrugada). Pelo menos 2 de cada setor continuam trabalhando e no máximo metade sai ao mesmo tempo',
    'Centro de cuidados: a equipe entra no prédio (8 lugares, com refeitório) para os intervalos, para descansar e quando se fere. Dá para construir vários. Sem vaga, descansam num banco perto da entrada e recuperam menos',
    'Rua da frente: muro com o portão, calçadas, rua de 2 faixas com carros, faixa de pedestres e ponto de ônibus (de dia, um ônibus a cada 20 min traz visitantes). As áreas novas crescem só para trás do portão; o que estava abaixo dele saiu com 100% do dinheiro devolvido',
    'Estacionamento (nos lotes do outro lado da rua): cobra R$ 10 por carro e traz +15% de visitantes (até 2 estacionamentos)',
    'Famílias: parte dos visitantes chega com criança (meia-entrada). Banheiro familiar novo, com trocador: as famílias preferem e ficam mais satisfeitas',
    'Equipe > Funcionários mostra quantos de cada setor trabalham em cada horário e avisa quando há menos de 2',
  ] },
  { versao: '1.7.2f', data: '13/11/2026', titulo: 'Versão 1.7.2f: correção do funcionário sem caminho', itens: [
    'Funcionário ferido (ou descansando) que estava dentro de um recinto quando o jogo foi fechado ou atualizado não fica mais preso repetindo "não encontrou caminho": ele sai pelo portão e vai descansar',
    'Descanso sem caminho até o Centro de cuidados: o funcionário descansa onde está, sem tentar de novo a cada instante',
    'O aviso "não encontrou caminho" aparece no máximo uma vez por hora de jogo para cada funcionário',
  ] },
  { versao: '1.7.2e', data: '13/11/2026', titulo: 'Versão 1.7.2e: caminhos do veículo e animações', itens: [
    'O veículo de captura (e quem vai até um animal solto) não atravessa mais muros, habitats nem instalações: a rota termina no bloco livre mais perto do animal e o dardo é dado dali. Se o animal corre, a rota é refeita no caminho',
    'Caminhão e jipe ficaram mais estreitos e passam numa via de 1 bloco; nas esquinas eles cortam o canto dentro do próprio bloco. O animal vai deitado no sentido do veículo, sem sobrar para o lado',
    'Animais, funcionários e veículos viram de forma suave, e não de uma vez. O veículo nasce virado para onde o funcionário olha e estaciona logo atrás dele',
    'O animal sedado sobe na carroceria em vez de aparecer lá de repente',
    'Fuga animada: o animal vira para a cerca antes de pular ou empurrar e o pulo sai e chega devagar',
  ] },
  { versao: '1.7.2d', data: '10/11/2026', titulo: 'Versão 1.7.2d: correções da revisão', itens: [
    'Trocar o gráfico (Baixo, Alto, Ultra) agora libera de verdade o que o gráfico antigo usava: dá para alternar sem a memória do aparelho ir acumulando',
    'O recorte do habitat não pode mais pegar os 2 blocos na frente do vidro nem os da entrada da toca, senão ela ficaria sem acesso (o jogo avisa "Mova a toca antes de recortar")',
    'A girafa passa a ocupar sozinha cada toca, como o elefante, o hipopótamo e o rinoceronte',
    'A Central de Expansões mostra a DLC Obras e Construções (ainda em breve): obras com prazo, tapumes e barra de progresso',
    'Sincronia com o Drive: o envio confere a versão do arquivo antes de gravar. Se outro aparelho gravar no mesmo instante, o jogo pergunta em vez de sobrescrever',
    'As novidades da 1.7.2b foram corrigidas: no AO VIVO você é observador desde a 1.7.2c (sem ataque ao jogador, sem "Preparar visita" e sem "Visitante em risco")',
  ] },
  { versao: '1.7.2c', data: '10/11/2026', titulo: 'Versão 1.7.2c: animais e funcionários', itens: [
    'O perigo dos animais agora vale para a equipe: antes de comida, água, limpeza ou checagem, o funcionário para no portão e chama os animais perigosos para as tocas. Faz o serviço e, quando sai, eles são soltos',
    'Sem toca (ou sem vaga): o veterinário vem sedar os perigosos com dardo, de fora da cerca. Cada sedação custa R$ 100 e estressa o animal. A toca compensa',
    'Ataque a funcionário: quando entra sem toca e sem veterinário, quando um funcionário distraído esquece de recolher, ou quando o sedativo acaba num serviço demorado. Ninguém morre: ele fica ferido, 1 dia de jogo afastado no Centro de cuidados, e aparece o alerta "Funcionário ferido". No Modo Tranquilo o animal só ameaça e o serviço atrasa',
    'Os animais que não oferecem perigo têm medo: ficam a uns 4 m de quem trabalha no recinto e esperam a equipe sair de perto do comedouro',
    'Tratamento: caso leve (saúde a partir de 40%) com remédio por dardo, de fora da cerca. Caso grave: sedação, veículo e internação de 1 a 3 dias na Clínica veterinária',
    'Clínica veterinária nova (Construir > Instalações): 2 vagas de internação, pode construir várias. Com mais de uma, você escolhe o destino no alerta; com o app fechado o subgerente escolhe a mais perto com vaga. O Centro de cuidados fica para a equipe',
    'AO VIVO "fantasma": entre e saia dos recintos pelo portão como observador. Os animais não percebem você (sem aviso, ataque nem espera) e a visita não abre o portão de verdade',
  ] },
  { versao: '1.7.2b', data: '10/11/2026', titulo: 'Versão 1.7.2b: vida selvagem', itens: [
    'Tocas com vidro: em Construir > Habitat > Toca com vidro. De pedra na savana e de madeira na floresta, com o vidro virado para os visitantes e a entrada do animal em outro lado. Cada toca abriga 2 animais (1 dos bem grandes); até 6 por habitat',
    'Os animais descansam e dormem dentro das tocas, e dá para vê-los pelo vidro. Tocar na toca mostra quem está lá dentro',
    'Mover objetos agora também move as tocas (o animal que estiver dentro vai junto)',
    'Rotina de cada espécie: pastar de manhã e à tarde, descanso no meio do dia (leão deitado, zebra e girafa em pé, flamingo numa perna só), banho de poeira do elefante e do rinoceronte. O hipopótamo dorme de dia dentro da água e sai à noite para pastar. Vale também com o jogo fechado',
    'AO VIVO dentro dos recintos: chegue ao portão e toque em Entrar (ou use Visitar no painel do habitat). Na ilha, a ponte agora é caminho. Lá dentro você anda mais devagar e não atravessa tocas, troncos nem água funda',
    'Modo selvagem: os animais perigosos reagem a quem entra no recinto. Desde a 1.7.2c isso vale para a equipe, não para você (no AO VIVO você só observa). Dá para desligar em Menu > Configurações',
    'Seu save é convertido sozinho',
  ] },
  { versao: '1.7.2a', data: '09/11/2026', titulo: 'Versão 1.7.2a: correções e preparação para expansões', itens: [
    'Sincronia com o Drive mais segura: não decide mais pelo relógio dos aparelhos, nunca envia por cima sem perguntar, guarda uma cópia do save do Drive antes de substituir e não cria save duplicado',
    'A pergunta "qual zoológico manter" só aparece ao abrir o jogo, ao voltar ao app ou em Sincronizar agora (no meio do jogo vira um aviso)',
    'Tempo fora do jogo: o app em segundo plano não "come" mais o tempo que passou; o relatório "Enquanto você esteve fora" fica certo',
    'Avisos (toasts) aparecem por cima das janelas, e o balão de alerta no mapa fica no lugar certo',
    'Enviar funcionário a um alerta sem destino não cancela mais o que ele fazia e mostra o aviso certo',
    'Funcionário sem caminho até o destino não atravessa mais cercas: desiste e avisa',
    'Botão de próximo alerta percorre só os alertas livres, sem pular nenhum',
    'Som volta sozinho no iPad depois de ligação ou bloqueio de tela',
    'Mais leve: comedouro e bebedouro mudam sem redesenhar o habitat inteiro; viveiros, faíscas, dardos e troca de gráfico liberam memória; arrastar caminho longo ficou leve',
    'Painéis de animal e habitat não travam o jogo com itens de expansão desinstalada',
    'Preparação para expansões (DLCs): o jogo já sabe ler espécies, plantas e instalações novas vindas dos pacotes',
  ] },
  { versao: '1.7.2', data: '09/11/2026', titulo: 'Versão 1.7.2 (etapa 1.7.2a): árvores, água e macacos nas árvores', itens: [
    'Árvores sólidas: os animais não atravessam mais troncos (o do baobá é bem grosso) e desviam deles no caminho; arbustos, capim e samambaia continuam atravessáveis',
    'Água por espécie: hipopótamo passa o dia na água e boia com só olhos e narinas de fora; elefante entra até a barriga e toma banho com a tromba; rinoceronte e tartaruga só no raso; flamingo filtra comida na água rasa; leão, zebra, girafa, macaco e gorila desviam da água funda',
    'Quem entra na água sai molhado (no Ultra, pele e pelo mais escuros por um tempo)',
    'Macacos (e gorilas jovens) sobem nas árvores altas, andam e pulam entre os galhos e dormem lá em cima à noite. Sem árvore alta no habitat, ficam no chão e aparece uma sugestão',
    'Galho por cima da cerca facilita um pouco a fuga de quem sobe (nunca no viveiro com tela; nada muda no Modo Tranquilo)',
    'Ilhas e lagos: a água não aparece mais por fora do muro nem em cima do caminho/calçada; a água termina na linha da cerca',
  ] },
  { versao: '1.7.1', data: '09/11/2026', titulo: 'Versão 1.7.1: som, animais mais naturais e sincronia com o Drive', itens: [
    'Vozes novas: leão, rinoceronte e gorila (e as demais) refeitas com timbre de garganta e formantes, sem o som de "ruído grave". Cada voz é gerada uma vez e reaproveitada',
    'Burburinho do público: vozes indistintas que aumentam com o número de visitantes e com a câmera perto (também no AO VIVO); só durante a visitação. Entra em Configurações > Sons do ambiente',
    'Ultra: animais com menos contraste, cores mais naturais e sombra mais suave; modelo detalhado (pele e pelo) só perto da câmera e simples ao longe',
    'Ultra: pele do rinoceronte e do elefante sem cintilação (rugas suavizadas e que somem com a distância)',
    'Sincronia automática com o Google Drive (Menu > Salvar): abre o zoológico mais recente, envia alterações a cada 3 minutos e ao sair, e pergunta qual manter se os dois aparelhos mudaram. Precisa do ID de cliente do Google (uma vez)',
    'Importar arquivo corrigido para o iPad (seletor sem filtro de tipo)',
  ] },
  { versao: '1.7.0', data: '09/11/2026', titulo: 'Versão 1.7: habitats do seu jeito', itens: [
    'Habitat com formato livre: arraste o retângulo e ele contorna sozinho instalações, caminhos e outros habitats (dá para cercar o playground pelos lados e pelo fundo). A cerca segue o contorno',
    'Construir > Habitat agora tem Ampliar (acrescenta blocos encostados), Recortar (tira um pedaço) e Mover objetos (plantas, comedouro e bebedouro)',
    'Muro com plataforma mais bonito: pedras, pilares e mirantes com escada do lado de fora, que cabem na folga de 1 bloco (não precisa mais deixar 2)',
    'Lagos com margem natural: a água acompanha o relevo, fica clarinha no raso e a terra perto da água fica molhada',
    'Faixa de atualização: quando sair versão nova, aparece um aviso com Atualizar agora e Depois',
    'Botão de alerta na lateral: leva a câmera até o próximo alerta e abre as opções',
    'Mais leve: com o jogo pausado e a câmera parada, a tela é redesenhada só 1 vez por segundo; animais e cercas com menos peças; sombras recalculadas a cada 2 quadros na Economia',
  ] },
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
  const ids = Object.keys(state?.packs || { base: 1 }).filter(id => AVAILABLE_PACKS[id]).sort((a, b) => (b === 'base') - (a === 'base') || a.localeCompare(b));
  const key = ids.join(',');
  if (merged && key === mergedKey) return merged;
  const out = { terrains: {}, biomes: {}, plants: {}, fences: {}, species: {}, facilities: {}, roles: {}, furniture: {}, estruturas: {} };
  for (const id of ids) {
    const p = AVAILABLE_PACKS[id];
    for (const k of Object.keys(out)) for (const [kk, v] of Object.entries(p[k] || {})) {
      if (out[k][kk] && id !== 'base') { console.warn(`DLC ${id}: id repetido ${k}.${kk} ignorado`); continue; } // DLC nunca sobrescreve o base
      out[k][kk] = { ...v, pack: id };
    }
  }
  // biomas e cercas de expansões desinstaladas continuam conhecidos (inativos) para os habitats já construídos não quebrarem
  for (const id of Object.keys(AVAILABLE_PACKS)) if (!ids.includes(id)) for (const k of ['biomes', 'fences'])
    for (const [kk, v] of Object.entries(AVAILABLE_PACKS[id][k] || {})) if (!out[k][kk]) out[k][kk] = { ...v, pack: id, inativo: true };
  out.tempo = ids.map(id => AVAILABLE_PACKS[id].tempo).filter(Boolean).pop();
  merged = out; mergedKey = key; return out;
}
// papel de uma instalação para os visitantes: as do base pelo próprio tipo; as de DLC pelo "comportamento"
const PAPEL = { comida: 'lanchonete', compras: 'loja', banheiro: 'banheiro', lazer: 'playground', mesas: 'mesas', descanso: 'banco', clinica: 'clinica' };
export const papel = (C, t) => { const D = C.facilities[t]; return !D ? null : D.comportamento ? (PAPEL[D.comportamento] || null) : t; };
export const has = (state, kind, id) => !!content(state)[kind][id];
