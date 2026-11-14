// Pacote base: todo o conteúdo do jogo base vive aqui, em dados.
export const BASE_PACK = {
  id: 'base', versao: '1.0.0', nome: 'Jogo base',
  // duração das horas em minutos reais: o dia (aberto à visitação) passa devagar e a noite passa rápido. Total: 1 dia = 1 hora real.
  tempo: { inicioDia: 6, fimDia: 20, minutosPorHoraDia: 3.75, minutosPorHoraNoite: 0.75 },
  terrains: {
    g: { nome: 'Capim', cor: '#7d9b45', custo: 5 },
    d: { nome: 'Terra', cor: '#8c6a44', custo: 5 },
    s: { nome: 'Areia', cor: '#d6c28b', custo: 5 },
    m: { nome: 'Lama', cor: '#5b4632', custo: 8 },
    w: { nome: 'Água', cor: '#3d7ea6', custo: 15 },
    r: { nome: 'Rocha', cor: '#8d8b86', custo: 10 },
    p: { nome: 'Caminho de pedra', cor: '#cbc2b0', custo: 20, caminho: true },
    q: { nome: 'Caminho de terra', cor: '#a98259', custo: 8, caminho: true },
    c: { nome: 'Caminho cimentado', cor: '#bdbdb7', custo: 30, caminho: true },
    k: { nome: 'Cimentado com calçada', cor: '#b4b4ae', custo: 45, caminho: true },
  },
  // mobiliário de caminho: sai junto com o caminho, nas bordas ou na calçada
  furniture: {
    poste: { nome: 'Poste de luz', custo: 120, base: 1.25, padrao: 5 },
    lixeira: { nome: 'Lixeira', custo: 60, base: 0.85, padrao: 5 },
    banco: { nome: 'Banco', custo: 150, base: 1.0, padrao: 5 },
  },
  biomes: {
    savana: { nome: 'Savana', terreno: { g: 0.6, d: 0.3, s: 0.1 }, plantas: ['acacia', 'baoba', 'capim_alto', 'arbusto_seco'] },
    floresta: { nome: 'Floresta', terreno: { g: 0.5, d: 0.2, m: 0.3 }, plantas: ['arvore_floresta', 'arvore_cipo', 'samambaia', 'arbusto'] },
  },
  plants: {
    acacia: { nome: 'Acácia', bioma: 'savana', custo: 250, alta: true, tronco: 0.3, galho: 2.7, copa: 1.8 },
    baoba: { nome: 'Baobá', bioma: 'savana', custo: 400, alta: true, tronco: 0.95, galho: 4.05, copa: 1.1 },
    capim_alto: { nome: 'Capim alto', bioma: 'savana', custo: 60 },
    arbusto_seco: { nome: 'Arbusto seco', bioma: 'savana', custo: 80 },
    arvore_floresta: { nome: 'Árvore tropical', bioma: 'floresta', custo: 300, alta: true, tronco: 0.42, galho: 3.35, copa: 1.5 },
    arvore_cipo: { nome: 'Árvore com cipós', bioma: 'floresta', custo: 350, alta: true, tronco: 0.4, galho: 3.4, copa: 1.7 },
    samambaia: { nome: 'Samambaia', bioma: 'floresta', custo: 70 },
    arbusto: { nome: 'Arbusto', bioma: 'floresta', custo: 80 },
  },
  fences: {
    ferro: { nome: 'Cerca de ferro', altura: 2.5, resistencia: 5, custo: 60, desgaste: 0.04 },
    muro: { nome: 'Muro com plataforma', altura: 4, resistencia: 9, custo: 160, desgaste: 0.02, plataforma: true },
    tela: { nome: 'Viveiro com tela', altura: 9, resistencia: 4, custo: 110, desgaste: 0.03, teto: true },
    fosso: { nome: 'Ilha com fosso', altura: 9, resistencia: 10, custo: 140, desgaste: 0.004, fosso: true },
  },
  // estruturas dentro do habitat (1.7.2b): toca 2 x 2 com vidro; o modelo combina com o bioma
  estruturas: {
    toca: { nome: 'Toca com vidro', custo: 1200, w: 2, h: 2,
      modelos: { pedra: { nome: 'Toca de pedra', biomas: ['savana'] }, madeira: { nome: 'Toca de madeira', biomas: ['floresta'] } } },
  },
  // rotina (1.7.2b): acorda/dorme em horas do jogo (se acorda > dorme, o animal é ativo à noite); janelas = [início, fim, atividade];
  // dormeEm: toca | arvore | agua; descanso: deitado | empe | umaperna. perigo: 0 a 5 (modo selvagem, vale para os funcionários desde a 1.7.2c)
  // árvores (alta: true): tronco = raio sólido (m), galho = altura onde os macacos sentam, copa = raio dos galhos
  // água (1.7.2a): aguaModo anfibio | vadeador | evita; aguaMax = profundidade máxima (m) em que o animal entra andando
  // espacoPorAnimal em blocos (1 bloco = 2 m x 2 m)
  species: {
    leao: { nome: 'Leão', custo: 8000, bioma: 'savana', dieta: 'Carnívoro', espaco: 20, barreira: { altura: 3, resistencia: 6 },
      tracos: { pula: true, escala: false, forca: 6, perigoso: true }, social: { min: 2, max: 6 }, plantas: 3, agua: 0, apelo: 9, aguaModo: 'evita', aguaMax: 0.25,
      perigo: 4, rotina: { acorda: 5, dorme: 21, janelas: [[5, 8, 'pastar'], [11, 16, 'descanso'], [17, 20, 'social']], dormeEm: 'toca', descanso: 'deitado' },
      vida: { adulto: 6, velhice: 90, max: 120 }, cor: '#c8963e' },
    zebra: { nome: 'Zebra', custo: 2500, bioma: 'savana', dieta: 'Herbívoro', espaco: 15, barreira: { altura: 2, resistencia: 4 },
      tracos: { pula: false, escala: false, forca: 3, perigoso: false }, social: { min: 3, max: 10 }, plantas: 2, agua: 0, apelo: 5, aguaModo: 'evita', aguaMax: 0.3,
      perigo: 1, rotina: { acorda: 5, dorme: 20, janelas: [[6, 10, 'pastar'], [12, 15, 'descanso'], [16, 19, 'pastar']], dormeEm: 'toca', descanso: 'empe' },
      vida: { adulto: 5, velhice: 80, max: 110 }, cor: '#f2f2ee' },
    elefante: { nome: 'Elefante', custo: 15000, bioma: 'savana', dieta: 'Herbívoro', espaco: 35, barreira: { altura: 2, resistencia: 9 },
      tracos: { pula: false, escala: false, forca: 10, perigoso: true, nada: true }, social: { min: 2, max: 6 }, plantas: 4, agua: 4, aguaFunda: 2, apelo: 10, aguaModo: 'vadeador', aguaMax: 1.3,
      perigo: 3, poeira: true, rotina: { acorda: 5, dorme: 21, janelas: [[6, 11, 'pastar'], [12, 14, 'banho'], [15, 19, 'pastar']], dormeEm: 'toca', descanso: 'empe' },
      vida: { adulto: 10, velhice: 160, max: 200 }, cor: '#8e8a86' },
    girafa: { nome: 'Girafa', custo: 9000, bioma: 'savana', dieta: 'Herbívoro', espaco: 25, barreira: { altura: 2.5, resistencia: 5 },
      tracos: { pula: false, escala: false, forca: 5, perigoso: false }, social: { min: 2, max: 8 }, plantas: 3, plantasAltas: true, agua: 0, apelo: 8, aguaModo: 'evita', aguaMax: 0.4,
      perigo: 1, alto: true, rotina: { acorda: 5, dorme: 21, janelas: [[6, 9, 'pastar'], [10, 16, 'descanso'], [17, 20, 'pastar']], dormeEm: 'toca', descanso: 'empe' },
      vida: { adulto: 6, velhice: 100, max: 130 }, cor: '#d9a54a' },
    macaco: { nome: 'Macaco', custo: 3000, bioma: 'floresta', dieta: 'Onívoro', espaco: 8, barreira: { altura: 4, resistencia: 3 },
      tracos: { pula: true, escala: true, forca: 2, perigoso: false }, social: { min: 4, max: 12 }, plantas: 6, plantasAltas: true, agua: 0, apelo: 7, aguaModo: 'evita', aguaMax: 0.08,
      perigo: 1, rotina: { acorda: 6, dorme: 19, janelas: [[6, 9, 'pastar'], [11, 14, 'social'], [15, 18, 'pastar']], dormeEm: 'arvore', descanso: 'deitado' },
      vida: { adulto: 4, velhice: 70, max: 95 }, cor: '#6b4a32' },
    hipopotamo: { nome: 'Hipopótamo', custo: 14000, bioma: 'savana', dieta: 'Herbívoro', espaco: 30, barreira: { altura: 1.8, resistencia: 8 },
      tracos: { pula: false, escala: false, forca: 9, perigoso: true, nada: true }, social: { min: 2, max: 8 }, plantas: 1, agua: 10, aguaFunda: 6, apelo: 9, aguaModo: 'anfibio', aguaMax: 9,
      perigo: 4, rotina: { acorda: 17, dorme: 8, janelas: [[18, 24, 'pastar'], [0, 5, 'pastar']], dormeEm: 'agua', descanso: 'deitado' },
      vida: { adulto: 8, velhice: 130, max: 160 }, cor: '#7d6a66' },
    rinoceronte: { nome: 'Rinoceronte', custo: 18000, bioma: 'savana', dieta: 'Herbívoro', espaco: 35, barreira: { altura: 1.8, resistencia: 9 },
      tracos: { pula: false, escala: false, forca: 9, perigoso: true }, social: { min: 1, max: 5 }, plantas: 2, agua: 2, apelo: 10, aguaModo: 'vadeador', aguaMax: 0.6,
      perigo: 4, poeira: true, rotina: { acorda: 5, dorme: 20, janelas: [[6, 9, 'pastar'], [12, 14, 'banho'], [15, 19, 'pastar']], dormeEm: 'toca', descanso: 'deitado' },
      vida: { adulto: 8, velhice: 130, max: 160 }, cor: '#8d8780' },
    flamingo: { nome: 'Flamingo', custo: 1200, bioma: 'savana', dieta: 'Filtrador (algas e camarões)', espaco: 3, barreira: { altura: 1.5, resistencia: 1 },
      tracos: { pula: false, escala: false, forca: 1, perigoso: false }, social: { min: 8, max: 30 }, plantas: 0, agua: 6, apelo: 6, aguaModo: 'vadeador', aguaMax: 0.5,
      perigo: 0, rotina: { acorda: 5, dorme: 21, janelas: [[6, 10, 'filtrar'], [11, 15, 'descanso'], [16, 19, 'filtrar']], dormeEm: 'toca', descanso: 'umaperna' },
      vida: { adulto: 3, velhice: 100, max: 130 }, cor: '#f08aa0' },
    gorila: { nome: 'Gorila', custo: 20000, bioma: 'floresta', dieta: 'Herbívoro', espaco: 30, barreira: { altura: 4, resistencia: 7 },
      tracos: { pula: false, escala: true, forca: 8, perigoso: true }, social: { min: 3, max: 10 }, plantas: 6, plantasAltas: true, agua: 0, apelo: 10, aguaModo: 'evita', aguaMax: 0.1,
      perigo: 3, rotina: { acorda: 6, dorme: 19, janelas: [[6, 10, 'pastar'], [11, 14, 'descanso'], [15, 18, 'pastar']], dormeEm: 'toca', descanso: 'deitado' },
      vida: { adulto: 10, velhice: 120, max: 150 }, cor: '#2a2624' },
    tartaruga: { nome: 'Tartaruga-gigante', custo: 4000, bioma: 'savana', dieta: 'Herbívoro', espaco: 10, barreira: { altura: 0.8, resistencia: 3 },
      tracos: { pula: false, escala: false, forca: 3, perigoso: false }, social: { min: 1, max: 10 }, plantas: 2, agua: 0, apelo: 6, aguaModo: 'vadeador', aguaMax: 0.3,
      perigo: 0, rotina: { acorda: 7, dorme: 19, janelas: [[7, 11, 'pastar'], [12, 16, 'descanso'], [17, 18, 'pastar']], dormeEm: 'toca', descanso: 'deitado' },
      vida: { adulto: 15, velhice: 300, max: 400 }, cor: '#5a4a32' },
  },
  facilities: {
    entrada: { nome: 'Entrada', w: 2, h: 1, custo: 0, fixo: true },
    lanchonete: { nome: 'Lanchonete', w: 2, h: 2, custo: 3000, venda: 15, custoVenda: 6, cor: '#e0703a', manut: 20 },
    banheiro: { nome: 'Banheiro', w: 2, h: 2, custo: 2000, cor: '#4a90c8', manut: 15 },
    loja: { nome: 'Loja de presentes', w: 2, h: 2, custo: 4000, venda: 25, custoVenda: 10, cor: '#b0479a', manut: 20 },
    playground: { nome: 'Playground', w: 3, h: 3, custo: 3500, cor: '#f2c230', manut: 10 },
    banco: { nome: 'Banco', w: 1, h: 1, custo: 150, cor: '#7a5230', manut: 0 },
    mesas: { nome: 'Área de mesas', w: 3, h: 3, custo: 2800, cor: '#c0803a', manut: 12 },
    placa: { nome: 'Placa educativa', w: 1, h: 1, custo: 300, cor: '#2e6b54', manut: 0 },
    centro: { nome: 'Centro de cuidados básicos', w: 3, h: 3, custo: 12000, cor: '#e9ecef', manut: 40, semCaminho: true, lugares: 8, desc: 'Base da equipe: 8 lugares, refeitório para os intervalos, descanso e recuperação de quem se feriu. Pode construir vários.' },
    // 1.7.3: banheiro familiar (as famílias com criança preferem) e estacionamento nos lotes do outro lado da rua da frente
    banheiro_familiar: { nome: 'Banheiro familiar', w: 3, h: 2, custo: 3500, cor: '#5aa0d8', manut: 20, comportamento: 'banheiro', familiar: true, desc: 'Banheiro maior, com trocador e cabine para a família. As famílias com criança preferem este e ficam mais satisfeitas.' },
    estacionamento: { nome: 'Estacionamento', w: 6, h: 5, custo: 6000, cor: '#5b5f63', manut: 15, vagas: 12, cobra: 10, zona: 'lote', semCaminho: true, desc: 'Fica nos lotes do outro lado da rua da frente. Cobra R$ 10 por carro e traz mais visitantes (contam até 2 estacionamentos).' },
    // 1.7.2c: internação dos casos graves (2 vagas por clínica; pode construir várias). Precisa de caminho (o veículo chega pela frente)
    clinica: { nome: 'Clínica veterinária', w: 3, h: 3, custo: 15000, cor: '#dff1f7', manut: 45, vagas: 2, desc: 'Interna os animais em estado grave (2 vagas) e deixa o tratamento por dardo mais rápido.' },
  },
  roles: {
    tratador: { nome: 'Tratador', salario: 120, cor: '#3f8f3a' },
    veterinario: { nome: 'Veterinário', salario: 220, cor: '#f4f4f4' },
    faxineiro: { nome: 'Faxineiro', salario: 90, cor: '#3a6fb0' },
    seguranca: { nome: 'Segurança', salario: 130, cor: '#2b2b2b' },
    subgerente: { nome: 'Subgerente', salario: 300, cor: '#7b2d2d' },
  },
};

export const TRACOS_EQUIPE = {
  distraido: { nome: 'Distraído', desc: 'Às vezes esquece portões abertos.', bom: false },
  dedicado: { nome: 'Dedicado', desc: 'Trabalha 25% mais rápido.', bom: true },
  preguicoso: { nome: 'Preguiçoso', desc: 'Trabalha 25% mais devagar.', bom: false },
  resistente: { nome: 'Resistente', desc: 'Cansa menos.', bom: true },
  reclamao: { nome: 'Reclamão', desc: 'Fica insatisfeito mais fácil.', bom: false },
  talentoso: { nome: 'Talentoso', desc: 'Trabalha 35% mais rápido.', bom: true },
  // 1.8: só por curso (não aparecem em currículo)
  cuidadoso: { nome: 'Cuidadoso', desc: 'Não esquece portão aberto e corre menos risco com animais perigosos.', bom: true, curso: true },
  socorrista: { nome: 'Socorrista', desc: 'Se for ferido, volta ao trabalho na metade do tempo.', bom: true, curso: true },
};
export const TRACOS_GERENTE = {
  indeciso: { nome: 'Indeciso', desc: 'Demora mais para despachar.', bom: false },
  agil: { nome: 'Ágil', desc: 'Despacha muito rápido.', bom: true },
  perdulario: { nome: 'Perdulário', desc: 'Compras de comida 20% mais caras.', bom: false },
  economico: { nome: 'Econômico', desc: 'Compras de comida 15% mais baratas.', bom: true },
  confuso: { nome: 'Confuso', desc: 'Às vezes manda a pessoa errada.', bom: false },
  lider: { nome: 'Líder', desc: 'A equipe fica mais satisfeita.', bom: true },
};

export const NOMES = ['Ana','Bruno','Carla','Diego','Elisa','Fábio','Gabi','Heitor','Iara','João','Karen','Lucas','Marta','Nilo','Olga','Paulo','Rita','Sérgio','Tânia','Ulisses','Vera','Wagner','Yara','Zeca','Bia','Caio','Duda','Enzo','Lia','Rafa','Teo','Malu'];
export const NOMES_ANIMAIS = ['Simba','Nala','Juba','Listra','Dumbo','Tromba','Pescoço','Manchinha','Chico','Mel','Kiko','Lua','Sol','Tango','Zuri','Amani','Kito','Nina','Bento','Jade','Thor','Pipoca','Biju','Duna'];

// Zoopédia: informações reais e curiosidades de cada espécie
export const ZOOPEDIA = {
  leao: { cientifico: 'Panthera leo', status: 'Vulnerável', curiosidades: ['É o único felino que vive em grupos, chamados de bandos.', 'O rugido pode ser ouvido a até 8 km de distância.', 'As leoas fazem a maior parte das caçadas; o leão costuma dormir de 16 a 20 horas por dia.'] },
  zebra: { cientifico: 'Equus quagga', status: 'Quase ameaçada', curiosidades: ['Cada zebra tem um padrão de listras único, como uma impressão digital.', 'Estudos indicam que as listras ajudam a afastar moscas que picam.', 'Vivem em grupos familiares com um macho, várias fêmeas e filhotes.'] },
  elefante: { cientifico: 'Loxodonta africana', status: 'Em perigo', curiosidades: ['É o maior animal terrestre do planeta.', 'A tromba tem dezenas de milhares de músculos e serve para cheirar, beber, pegar objetos e tomar banho.', 'As orelhas grandes ajudam a perder calor no clima quente.', 'Pode comer mais de 100 kg de vegetação por dia.'] },
  girafa: { cientifico: 'Giraffa camelopardalis', status: 'Vulnerável', curiosidades: ['É o animal mais alto do mundo: pode passar de 5 metros.', 'O pescoço tem 7 vértebras, o mesmo número que o nosso, só que muito maiores.', 'A língua escura pode medir cerca de 45 cm e ajuda a pegar folhas entre os espinhos da acácia.'] },
  macaco: { cientifico: 'Chlorocebus pygerythrus (macaco-vervet)', status: 'Pouco preocupante', curiosidades: ['Tem gritos de alarme diferentes para leopardos, águias e cobras, e o grupo reage de forma diferente a cada um.', 'Vive em grupos de 10 a 70 indivíduos.', 'Passa boa parte do dia no chão, mas dorme nas árvores.'] },
  hipopotamo: { cientifico: 'Hippopotamus amphibius', status: 'Vulnerável', curiosidades: ['Passa o dia na água para se refrescar e sai à noite para pastar.', 'A pele solta uma secreção avermelhada que funciona como protetor solar.', 'Apesar de viver na água, não nada de verdade: anda e se impulsiona pelo fundo.'] },
  rinoceronte: { cientifico: 'Ceratotherium simum (rinoceronte-branco)', status: 'Quase ameaçado', curiosidades: ['O chifre é feito de queratina, o mesmo material das nossas unhas.', 'Pode pesar mais de 2 toneladas.', 'Apesar do nome, não é branco: uma explicação popular diz que o nome veio de uma confusão com a palavra para "largo", por causa da boca.'] },
  flamingo: { cientifico: 'Phoenicopterus roseus (flamingo-grande)', status: 'Pouco preocupante', curiosidades: ['A cor rosa vem dos pigmentos dos alimentos, como algas e pequenos camarões.', 'Costuma descansar apoiado em uma perna só.', 'Come de cabeça para baixo, filtrando a água com o bico.'] },
  gorila: { cientifico: 'Gorilla gorilla gorilla', status: 'Criticamente em perigo', curiosidades: ['Compartilha cerca de 98% do DNA com os humanos.', 'Os machos adultos ganham pelos prateados nas costas e são chamados de costas-prateadas.', 'Constrói um ninho novo de folhas para dormir quase todas as noites.'] },
  tartaruga: { cientifico: 'Aldabrachelys gigantea (tartaruga-gigante-de-Aldabra)', status: 'Vulnerável', curiosidades: ['Pode viver mais de 100 anos.', 'Os machos podem passar de 200 kg.', 'É herbívora e passa a maior parte do dia comendo capim e folhas.'] },
};
