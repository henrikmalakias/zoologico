# Projeto Zoológico — v1.7.3

Jogo particular de gestão de zoológico 3D para celular (PWA offline). Three.js + JavaScript em módulos, empacotado com Vite.

## Rodar e publicar
- `npm install` e `npm run dev` para testar no navegador.
- `npm run build` gera a pasta `dist/`, que é o site pronto.
- GitHub Pages: o workflow `.github/workflows/pages.yml` testa, gera e publica sozinho a cada envio para a branch `main` (em Settings > Pages, escolha Source: GitHub Actions). Endereço: `https://henrikmalakias.github.io/zoologico/`.
- `npm test` roda os testes da simulação. Outros: `node tests/v14.test.js` e os testes de navegador `tests/*_browser.py` (Playwright, com `dist/` servido em localhost:8765).

## Nova versão
1. Atualize `APP_VERSION` e `CHANGELOG` em `src/content/registry.js`.
2. Atualize `public/version.json` (versão e novidades) e o nome do cache em `public/sw.js`.
3. Mudou o formato do save? Suba `SCHEMA` em `src/sim/core.js` e crie a migração em `src/save/save.js`.

## Estrutura
- `src/content/` pacotes de conteúdo (base) e catálogo de DLCs
- `src/sim/` simulação (tempo, animais, equipe, alertas, visitantes, economia, construção)
- `src/save/` save no IndexedDB, migrações, exportar/importar
- `src/render/` cena 3D, modelos procedurais, qualidade Baixo/Alto
- `src/ui/` interface de gerente, câmera de toque (`controls.js`), tutorial (`tutorial.js`) e AO VIVO
- `src/audio/` sons gerados na hora com Web Audio (sem arquivos)

## Modelos realistas (gráfico Alto)
- Especificações em `src/content/modelos/*.json` (ossos, formas, cores, padrões).
- `node tools/gerar-modelos.mjs` recria os JSON a partir dos parâmetros de cada espécie.
- `src/render/sdf.js` transforma o JSON em malha com esqueleto (roda num Web Worker e fica em cache no aparelho).
- Ao mudar o gerador, suba `GEN` em `src/render/library.js` para invalidar o cache.

## Gráfico Ultra
- `src/render/ultra.js`: céu 360° por hora (Poly Haven, CC0), luz do ambiente, terreno com texturas (array de texturas), capim instanciado, água com ondas, copas de folhas, pelo em camadas e rugas.
- `python3 tools/baixar-polyhaven.py` baixa e converte as texturas e céus para `public/ultra/` (créditos em `public/ultra/CREDITOS.txt`).
- Só carrega os arquivos do Ultra quando o jogador escolhe esse gráfico.

## Turnos, Centro de cuidados e rua da frente (1.7.3)
- `src/sim/turnos.js`: `TURNOS` (dia 6h–18h, noite 18h–6h +25%, integral 6h–22h +40% e cansa ×1,3), `emServico` (chega 15 min antes), `pausaDevida` (intervalos escalonados: mantém max(min(2, n−1), ⌊n/2⌋) do setor trabalhando), `chamar`/`pagarExtra` (hora extra +50%, quem está em casa chega em ~20 min de jogo), Centro com 8 lugares (`centroPara`, `ocupacaoCentro`; `st.dentro` esconde o funcionário), `cobertura`, `turnoSugerido`, `distribuirTurnos` (migração).
- `src/sim/staff.js`: no fim do turno a tarefa `casa` leva ao ponto de ônibus (`st.fora`); tarefa `pausa`; `eligibleStaff` devolve `folga`; `dispatch`, `orderTask` e `orderTransfer` chamam a hora extra. Salário do dia = `salarioDia(p)` (salário × `p.adic`).
- `src/sim/grid.js`: `AREAS` com `y1 = 51` (só crescem para trás do portão); `RUA` (muro na linha 52 com o portão em x 35–36, calçadas 53–54 e 59–60, rua 55–58, lotes 61–67); `staffPassable` bloqueia o muro e libera a catraca da Entrada.
- `src/sim/rua.js`: ônibus a cada 20 min de jogo das 7h às 19h (`s._bus`, `s._fila`), origem dos visitantes (`sortearOrigem`: carro/ônibus/a pé), `rotaChegada`, estacionamento (+15% de chegada, R$ 10 por carro). Visitante na rua = `v.rua` (lista de pontos); `v.kid` = família com criança (meia-entrada).
- `src/sim/build.js`: `limparRuaDaFrente` (chamada ao carregar um save 9): tudo da linha 52 para baixo sai com 100% devolvido; habitat que cruza a linha é cortado (ou sai inteiro, com os animais, se perder portão/comedouro/bebedouro/toca ou ficar com menos de 12 blocos).
- Desenho: `src/render/rua.js` (`RuaView`: muro, calçadas, asfalto, faixa de pedestres, ponto, postes, ônibus, carros passando e parados); modelos `banheiro_familiar`, `estacionamento`, `buildCar`, `buildBus` em models.js; capim do Ultra não nasce na rua.
- Save 10. Testes: `tests/v173.test.js` (aceita SEED) e `tests/v173_browser.py [baixo|alto|ultra]`.

## Funcionário sem caminho (1.7.2f)
- `buildRoute`: quem está de pé dentro de um recinto sem `inHab` (rota interrompida ao recarregar o save) recebe a marca de volta e sai pelo portão. Descanso/afastamento sem rota fica no lugar; o aviso de caminho tem limite de 1 por hora de jogo por funcionário (`st._semRota`). Teste: `tests/v172f.test.js`.

## Caminhos do veículo e animações (1.7.2e)
- `buildRoute` (src/sim/staff.js): destino fora de via (animal solto atrás de um muro ou dentro de outro habitat) vira o bloco livre mais perto com caminho (`blocoDeAproximo`); a rota nunca mais termina em linha reta por cima de muros. Animal que corre: a rota é refeita (`t.chase`, no máximo a cada ~0,8 s).
- Veículo: `vehPassable` (não passa por objetos), vias custam 1 e grama 3, cantos chanfrados (`chanfrar`); caminhão 1,6 x 5,6 m e jipe 1,4 x 3,6 m (cabem em 1 bloco de 2 m).
- Render (src/render/world.js): `giro` (giro suave) para animais, equipe e veículo; carga animada do animal sedado; animal deitado no sentido do veículo.
- Fuga animada (animals.js): vira para a cerca; pulo com partida e chegada suaves. Teste: `tests/v172e.test.js`.

## Correções da revisão (1.7.2d)
- World.dispose() volta a liberar o Kit (materiais, geometrias e texturas), a textura do terreno (ttex), o material do chão e o waterMat a cada troca de gráfico; as três chamadas tinham ficado dentro de um comentário na 1.7.2a.
- checkShrink recusa o recorte que pega os 2 blocos do vidro (dir) ou os da entrada (porta) de uma toca, não só os 4 blocos dela — antes a toca ficava sem acesso e todo serviço caía na sedação.
- tocaVagas: espécie com alto: true (girafa) também fica sozinha na toca, como as de 
aio >= 1,1 m. Máximo continua 6 tocas por habitat e 2 animais por toca (decisão da 1.7.2b).
- DLC_CATALOG ganhou obras ("Obras e Construções", em_breve); comunicacoes saiu do contrato (vira parte da 1.9).
- Drive: meta() pede etag e enviar() manda If-Match; 412 significa que outro aparelho gravou no meio, então o sync refaz a decisão uma vez e pergunta em vez de sobrescrever.
- Changelog da 1.7.2b corrigido (o AO VIVO é observador desde a 1.7.2c). Testes: tests/v172b.test.js, tests/v172c.test.js, tests/v1721.test.js, tests/v171.test.js.

## Animais e funcionários (1.7.2c)
- O perigo vale para a equipe (`perigoDe`, `PERIGOSO`, `wildBehave` em `src/sim/animals.js`, alvo = funcionários dentro do recinto, `equipeDentro`). Os mansos se afastam ~4 m (`MEDO`, estado `medo`).
- Serviços que entram no recinto (feed, water, clean, checkup; transferência e internação também): `startTask` manda primeiro ao portão (`t.pre`); `noPortao` (staff.js) usa `planoServico` (quem cabe nas tocas e quem sobra). Fases: `recolher` (chama de fora para as tocas, `h.seg` segura enquanto alguém está lá dentro) → `espera`/`sedar` (veterinário seda no lugar: `sedarNoLugar`, `SED_MIN` 60 min, R$ 100) → entra. Ataque: sem toca e sem veterinário, traço `distraido` (30% esquece) ou sedativo que acaba. Ferido: `st.ferido` (1 dia), tarefa `ferido`, alerta `ferido` (segurança confere). App fechado: `preAbstrato` (tempo extra + chance de ataque).
- Tratamento: `modoTratamento` (saúde ≥ 40% = dardo de fora; abaixo = internação). `src/sim/clinica.js`: `BASE_PACK.facilities.clinica` (3 x 3, 2 vagas, várias permitidas), `a.internado`, `a.habOrig`, `a.hab = 0`, `a.intAte` (1 a 3 dias), alta no portão de dentro do habitat.
- AO VIVO fantasma (`src/sim/visita.js`): só entrar/sair; sem aviso, ataque, espera nem Preparar visita; `visitOpen` não abre o portão de verdade.
- Save: `SCHEMA 9` (migração 8 → 9: `st.ferido`, `a.internado`, `h.seg`, tira `s.player`, `h.preparo`, `h.visitaAte`, `h.visitaRisco`, alerta `visita`, tarefa `guardar`). Testes: `tests/v172c.test.js`.

## Vida selvagem (1.7.2b)
- Tocas com vidro (`s.tocas`, `src/sim/tocas.js`): 2 x 2 blocos dentro do habitat, vidro no lado `dir` e entrada no lado `porta`; colocadas em Construir > Habitat > Toca com vidro e movidas em Mover objetos. Cada toca abriga 2 animais da mesma espécie (1 dos bem grandes); até 6 por habitat.
- Rotina por espécie (`rotina` em `src/content/base.js`): hora de acordar/dormir, janelas de atividade (pastar, descanso, banho, social, filtrar), onde dorme (toca, árvore, água). Vale também no modo abstrato (app fechado).
- Visita no AO VIVO (`src/sim/visita.js`, `Controls.blocked`): botão Entrar no portão, ponte da ilha andável, `h.visitOpen` (não é `gateOpen`: não gera alerta).
- Modo selvagem (`perigoDe`, `wildBehave` em `src/sim/animals.js`): na 1.7.2b o alvo era o jogador (encarar e investida, sem mortes); desde a 1.7.2c o alvo é a equipe e o AO VIVO é observador — veja a seção "Animais e funcionários (1.7.2c)".
- Save: `SCHEMA 8` (migração 7 → 8 cria `tocas`, `player` e o ajuste `selvagem`). Testes: `tests/v172b.test.js`.

## Correções e expansões (1.7.2a)
- Rodada de bugs do Deepseek (B01–B20): sincronia com o Drive por "rev" (contador gravado no Drive) e conteúdo, nunca pelo relógio dos aparelhos; cópia do save do Drive antes de substituir; tempo fora do jogo; avisos; alertas; memória.
- Expansões: pacotes em `src/content/dlc/<id>/pack.js`, registrados em `src/content/dlc/index.js` (o catálogo vira "Disponível" sozinho). Campos de DLC por espécie: `velocidade`, `raio`, `calado`, `fezes`, `baixo`, `voz`, `pelo`, `pele`, `dimorfismo`, `filtrador`, `banhoMin`, `caminhao`; instalações com `parecido` e `comportamento`; plantas com `parecido` e `cor`; modelo realista com `aspereza`. DLC nunca sobrescreve id do jogo base. Biomas e cercas de DLC desinstalada ficam inativos (habitats prontos não quebram).

## Árvores, água e macacos (1.7.2 = etapa 1.7.2a)
- Árvores altas (`alta: true` em `src/content/base.js`) têm `tronco` (raio sólido), `galho` (altura onde os macacos sentam) e `copa`. Em `habObstacles` só elas são sólidas; `collide` empurra para fora do tronco e `detour` desvia as rotas.
- Água por espécie: `aguaModo` (anfibio/vadeador/evita) e `aguaMax` (profundidade máxima). `depthAt` (grid.js) mede a profundidade; rotas e destinos evitam o que for fundo demais. `DRAFT` (animals.js) é o calado de quem boia.
- `fixShore` (grid.js) deixa raso o canto onde a água encosta em caminho, instalação ou cerca; `rebuildWater` só estende a margem para blocos do mesmo lado da cerca.
- Versões com letra (ex.: 1.7.2b) são aceitas na checagem de atualização a partir da 1.7.2.

## Sincronia com o Google Drive (1.7.1)
`src/save/drive.js` guarda o save numa pasta oculta do app no Drive (escopo `drive.appdata`, o jogo não vê outros arquivos). Precisa de um ID de cliente OAuth, criado uma vez:
1. console.cloud.google.com > novo projeto (ex.: "Zoologico") > APIs e serviços > Biblioteca > ative **Google Drive API**.
2. Tela de consentimento OAuth: tipo Externo, nome do app, seu e-mail; em Escopos adicione `.../auth/drive.appdata`; em Usuários de teste adicione seu e-mail (e o da sobrinha). Pode deixar em "Teste".
3. Credenciais > Criar credenciais > ID do cliente OAuth > Aplicativo da Web; em **Origens JavaScript autorizadas** coloque `https://henrikmalakias.github.io`.
4. No jogo: Menu > Salvar > Colar ID > Conectar ao Drive (em cada aparelho). Para já vir pronto, cole o ID em `CLIENT_ID_PADRAO` em `src/save/drive.js`.
Obs.: em modo "Teste" o Google pede para reautorizar a cada 7 dias; publicar o app (escopo não sensível) evita isso.
