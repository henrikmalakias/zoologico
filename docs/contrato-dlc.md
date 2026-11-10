# Contrato de DLC — Projeto Zoológico (para o Gemini)

Jogo: henrikmalakias/zoologico (Three.js + JavaScript em módulos + Vite, PWA). Versão do jogo: 1.7.2a (núcleo já preparado para DLCs).
Este contrato diz o formato de um pacote de expansão (DLC), o que pode e o que não pode ser tocado, e como entregar. O Claude revisa e integra cada DLC.

## 1. Regra de ouro: só arquivos novos

PODE criar:
- `src/content/dlc/<id>/pack.js` — o pacote (dados). Exporta `export const PACK = { ... }`.
- `src/content/dlc/<id>/zoopedia.js` — fatos reais das espécies novas (opcional, ver seção 6).
- `src/content/dlc/<id>/LEIA.md` — resumo da DLC, lista de ids criados, mecânicas que precisam de núcleo (seção 8) e dúvidas.
- `src/content/modelos/<especie>.json` — modelo realista (gráficos Alto/Ultra) de cada espécie NOVA.
- `tests/dlc_<id>.test.js` — teste da DLC (opcional, recomendado).

NÃO PODE (nem uma linha):
- Editar qualquer arquivo que já existe: `src/content/registry.js`, `src/content/base.js`, `src/sim/*`, `src/render/*`, `src/save/*`, `src/ui/*`, `src/audio/*`, `src/main.js`, `public/*`, `package.json`, testes existentes, modelos existentes.
- Mudar `SCHEMA`, migrações de save ou o formato do save.
- Mudar ou reaproveitar ids do jogo base (leao, savana, ferro, lanchonete, tratador etc.).
- Instalar dependências, baixar imagens/sons/modelos da internet ou copiar assets com licença.
- Mexer na branch `main`: todo push na main publica o jogo na hora para a sobrinha.

Integração (importar o pacote em `src/content/dlc/index.js` — o catálogo vira "Disponível" sozinho —, changelog, número de versão, publicação) = Claude.

## 2. Ids

- `<id>` da DLC = exatamente o id do catálogo: `aquario`, `hoteis`, `pesquisa`, `museu`, `conservacao`, `compras`, `energia`, `noturno`, `fachadas`, `biomas`, `clima`, `obras`.
- Ids de itens: minúsculas, sem acento, `snake_case` (ex.: `urso_polar`, `pinheiro_neve`). Nunca repetir um id que já existe no base nem em outra DLC (o conteúdo é mesclado por id; repetir sobrescreve o base e quebra saves).
- Referências entre itens só podem apontar para ids do base ou da própria DLC.

## 3. Esqueleto do pacote

```js
// src/content/dlc/biomas/pack.js
export const PACK = {
  id: 'biomas', versao: '1.0.0', nome: 'Biomas',
  // NÃO incluir "tempo" (relógio). Só a DLC "noturno" pode, e só com aprovação.
  terrains: {}, biomes: {}, plants: {}, fences: {}, species: {}, facilities: {}, roles: {}, furniture: {},
};
```
Chaves vazias podem ser omitidas. Nenhuma outra chave de topo além das listadas (e as da seção 6).

## 4. Campos por tipo (iguais ao `src/content/base.js`; ler o arquivo como referência)

**terrains** — **DLC não cria terreno novo.** O save guarda o mapa como 1 caractere por bloco, e as letras livres são poucas e disputadas entre DLCs. Se precisar (neve, gelo, cascalho), descrever no LEIA.md (seção 8) e o Claude reserva a letra.

**biomes** `{ nome, terreno:{ g:0.6, d:0.3, s:0.1 }, plantas:[ids] }` — proporções somam 1 e só usam letras do base (g capim, d terra, s areia, m lama, w água, r rocha).

**plants** `{ nome, bioma, custo, alta?:true, tronco, galho, copa, parecido }`
- `alta: true` = árvore sólida (animais não atravessam; macacos sobem). Exige `tronco` (raio do tronco em m), `galho` (altura onde o macaco senta, m) e `copa` (raio dos galhos, m). Sem `alta`, a planta é atravessável.
- `parecido`: id de uma planta do base cujo desenho será reaproveitado (`acacia`, `baoba`, `capim_alto`, `arbusto_seco`, `arvore_floresta`, `arvore_cipo`, `samambaia`, `arbusto`), com `cor` opcional (`'#rrggbb'`) para a folhagem.

**fences** `{ nome, altura, resistencia, custo, desgaste, plataforma?, teto?, fosso? }` — só variações das 4 cercas do base. Mecânica de cerca nova = seção 8.

**species** — todos os campos do base, mais os "campos de DLC" (seção 5):
```js
urso_polar: { nome:'Urso-polar', custo:22000, bioma:'artico', dieta:'Carnívoro', espaco:35,
  barreira:{ altura:3, resistencia:8 },
  tracos:{ pula:false, escala:false, forca:9, perigoso:true, nada:true },
  social:{ min:1, max:3 }, plantas:1, agua:6, aguaFunda:3, apelo:10,
  aguaModo:'anfibio', aguaMax:9,              // anfibio | vadeador | evita
  vida:{ adulto:6, velhice:100, max:130 }, cor:'#f2f0ea',
  // campos de DLC (seção 5)
  velocidade:1.3, raio:1.1, calado:1.2, fezes:0.25,
  dimorfismo:false, filtrador:false, banhoMin:0.3, caminhao:true,
  baixo:{ len:2.0, bh:1.0, bw:0.9, legH:0.7, legR:0.17, neck:[0.4,0.6], head:0.35, headLen:1.3, tail:0.15, color:'#f2f0ea', dark:'#d9d4c8' },
  voz:{ dur:1.8, f0:110, f1:80, formantes:[[400,6,1],[900,6,0.5]], sopro:0.5, peak:0.2, ataque:0.08 },
  pelo:{ len:0.03, den:260 },                 // null = sem pelo em camadas no Ultra
  pele:0,                                     // rugas da pele no Ultra (0 = nada; elefante 0.3)
},
```
- Escalas: `espaco` em blocos (1 bloco = 2 x 2 m) por animal; `apelo` 1–10; `forca` 1–10; idades em dias de jogo (1 dia = 1 hora real).
- Equilíbrio: custo e apelo coerentes com o base (o rinoceronte custa 18000 com apelo 10; o flamingo 1200 com apelo 6).
- `bioma` precisa existir (base ou a própria DLC).

**facilities** `{ nome, w, h, custo, cor, manut, venda?, custoVenda?, parecido, comportamento }`
- `parecido`: id de instalação do base cujo desenho será reaproveitado (`lanchonete`, `banheiro`, `loja`, `mesas`, `playground`, `placa`, `centro`, `clinica`).
- `comportamento`: `comida` (como lanchonete, usa `venda`/`custoVenda` dela) | `compras` (como loja) | `banheiro` | `lazer` (como playground) | `mesas` | `descanso` (como banco) | `clinica` (desde a 1.7.2c: interna os casos graves; use `vagas`, padrão 2). Sem `comportamento` = só decoração.

**roles** `{ nome, salario, cor }` — só função que repete o trabalho de uma do base. Profissão com trabalho novo = seção 8.

**furniture** `{ nome, custo, base, padrao }` — mobiliário de caminho.

## 5. Campos de DLC (exigidos em toda espécie nova)

O núcleo (desde a 1.7.2a) lê estes campos do pacote; sem eles a espécie nova anda, colide, boia e soa errado. O Gemini só preenche.

| Campo | O que é | Referência no base |
|---|---|---|
| `velocidade` | m/s andando | leão 1.6, elefante 1.1, tartaruga 0.25 |
| `raio` | raio do corpo (m), colisão | leão 0.8, elefante 1.4, macaco 0.35 |
| `calado` | quanto do corpo afunda ao boiar (m) | hipopótamo 1.0, elefante 1.95 |
| `fezes` | sujeira por dia | elefante 0.35, flamingo 0.08 |
| `baixo` | medidas do modelo low-poly (gráfico Baixo) | `DEF` em `src/render/models.js` |
| `voz` | parâmetros da voz sintetizada | `src/audio/sound.js` (função `voz`) |
| `pelo` | pelo em camadas no Ultra ou `null` | `FUR` em `src/render/ultra.js` |
| `pele` | rugas da pele no Ultra (0–0.35) | `SKIN` em `src/render/ultra.js` |

Opcionais: `dimorfismo: true` (macho e fêmea com modelo diferente; o JSON precisa de variantes `M` e `F`), `filtrador: true` (come filtrando na água rasa, como o flamingo), `banhoMin` (profundidade mínima do banho, m), `caminhao: true` (captura com caminhão; sem o campo, vale `raio >= 0.9`).
Desde a 1.7.2b (vida selvagem), também opcionais: `perigo` (0 a 5, modo selvagem; desde a 1.7.2c vale para os funcionários: a partir de 3 o animal é recolhido na toca ou sedado antes dos serviços e pode atacar quem entra; abaixo de 3 se afasta da equipe; sem o campo vale 3 se `tracos.perigoso`, senão 0; leão 4, elefante 3, zebra 1, flamingo 0), `rotina: { acorda, dorme, janelas: [[início, fim, atividade]], dormeEm, descanso }` (horas do jogo; atividade `pastar | descanso | banho | social | filtrar`; `dormeEm` `toca | arvore | agua`; `descanso` `deitado | empe | umaperna`; sem o campo a espécie dorme das 20 h às 6 h, como antes), `poeira: true` (toma banho de poeira na janela `banho`) e `alto: true` (tocas do habitat ficam mais altas, como para a girafa). Tocas (`estruturas`) são mecânica do núcleo: DLC não cria estrutura nova.
`baixo`: medidas iguais ao `DEF` de `models.js`, mais `dark` (cor escura), `tex: 'listras' | 'manchas'` e `ave: true` (usa o corpo de ave do flamingo).

## 6. Zoopédia e modelos

- `zoopedia.js`: `export const ZOOPEDIA = { urso_polar: { cientifico:'Ursus maritimus', status:'Vulnerável', curiosidades:['...', '...', '...'] } }`. Fatos reais, 3 curiosidades, status da IUCN.
- Modelo `src/content/modelos/<especie>.json`: copiar o modelo existente mais parecido e ajustar. Quadrúpede: `zebra`, `leao`, `elefante`, `hipopotamo`, `gorila`; ave: `flamingo`. Manter `tipo` e os **nomes dos ossos** (as animações dependem deles); mudar posições, raios, `cores` e `padrao` (`listras` | `manchas` | nenhum). `id` igual ao nome do arquivo, `versao: 1`, `aspereza` (0.7–0.95; pele grossa 0.95, pelo 0.86). JSON válido, sem comentários. Sem o JSON, a espécie usa o modelo `baixo` também no Alto/Ultra.

## 7. Save e desinstalação

- Instalar = `state.packs[id] = versao`. Desinstalar = os itens da DLC ficam no save e ficam inativos; voltam ao reinstalar (biomas e cercas continuam conhecidos para os habitats prontos não quebrarem). Por isso a DLC não pode exigir migração nem campo novo no save.
- Exemplo pronto de pacote mínimo funcionando: `tests/v1721.test.js` (DLC "teste" com urso, pinheiro e quiosque).
- Nada de `localStorage`, IndexedDB ou rede dentro da DLC.

## 8. O que NÃO cabe numa DLC só de dados (vai para o LEIA.md)

Mecânicas novas precisam de núcleo e são feitas pelo Claude: estoque/compras, energia elétrica, hóspedes que dormem no parque, pontos de pesquisa, clima, domos com HDRI 360°, terreno novo, cerca com regra nova, profissão com tarefa nova, animações novas, telas novas.
Para cada uma, escrever no LEIA.md: o que o jogador vê, regras e números, o que fica no save, como desliga no Modo Tranquilo. Sem código.

## 9. Textos

Português do Brasil, para 13+ anos, frases curtas. Sem violência gráfica. Modo Tranquilo: sem mortes e sem fugas.

## 10. Entrega

1. Branch `dlc/<id>` no GitHub (nunca `main`). Se não der para fazer push, subir os arquivos na pasta do Drive `Zoo_Tycoon/DLCs_Gemini/<id>/` com a mesma estrutura de pastas.
2. Antes de entregar, conferir:
   - `node -e "import('./src/content/dlc/<id>/pack.js').then(m=>console.log(Object.keys(m.PACK)))"` roda sem erro;
   - nenhum id repetido com o base; toda referência (bioma, plantas, parecido) existe;
   - todo `.json` abre com `JSON.parse`;
   - `git diff --stat main` mostra só arquivos novos;
   - `npm test` passa.
3. No LEIA.md: lista de ids, pendências da seção 8, dúvidas para o Henrique.

## Prompt para colar no Gemini

> Leia o arquivo contrato-dlc.md (anexo) e o `src/content/base.js` do repositório henrikmalakias/zoologico. Crie a DLC `<id>` seguindo o contrato à risca: só arquivos novos, branch `dlc/<id>`, nunca a main. Conteúdo desejado: <descrever>. Se algo exigir mudar o núcleo, não implemente: descreva no LEIA.md. Ao terminar, rode a checagem da seção 10 e me mostre o resultado.
