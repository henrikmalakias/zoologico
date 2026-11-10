# Caça de bugs — Projeto Zoológico (para o Deepseek)

Jogo: henrikmalakias/zoologico (Three.js + JavaScript em módulos + Vite, PWA). Versão analisada: ver `APP_VERSION` em `src/content/registry.js`.
Papel do Deepseek: **só ler e relatar**. Não editar código, não fazer commit, não abrir PR. O Claude confere cada item e corrige.

## 1. Onde procurar (por prioridade)

1. **Save** — `src/save/save.js` (migrações, `serialize`), `src/save/drive.js` (sincronia com o Drive), `src/sim/core.js` (estado inicial, `SCHEMA`). Bug aqui = perda de progresso.
2. **Simulação** — `src/sim/animals.js`, `staff.js`, `visitors.js`, `build.js`, `grid.js`, `habshape.js`, `furn.js`.
3. **Atualização e PWA** — `public/sw.js`, `public/version.json`, `applyUpdate` e checagem de versão em `src/main.js`.
4. **Interface** — `src/ui/ui.js`, `controls.js`, `tutorial.js`.
5. **Render e áudio** — `src/render/*`, `src/audio/sound.js` (só erro que quebra ou trava; aparência não).

## 2. NÃO é bug (comportamento decidido de propósito)

- Com o jogo aberto o subgerente não age e o jogo pausa a cada alerta novo; ele só age com o app fechado/celular bloqueado.
- AO VIVO não pausa em alerta (só som e vibração). Avançar o relógio para no primeiro alerta.
- 1 dia de jogo = 1 hora real; das 6h às 20h passa devagar e a noite rápido. Visitação só 8h–18h. Com o app fechado, o tempo corre 1:1 até 72 h.
- Salários e manutenção só no fechamento mensal (30 dias); consumo é debitado na hora.
- Arbustos, capim e samambaia são atravessáveis; só árvores (`alta: true`) bloqueiam. A copa não bloqueia, só o tronco.
- Limites de água por espécie (`aguaModo`, `aguaMax`) são escolhas de design; para comer/beber sem rota seca o animal atravessa água.
- Só macaco e gorila jovem sobem em árvores. Fuga pelo galho é rara e nunca no viveiro com tela nem na ilha.
- Modo Tranquilo: sem fugas e sem mortes por falta de cuidados.
- Chaves que começam com `_`, e `route`, `visitors`, `tgt`, `wp`, não vão para o save (são recalculadas).
- Mais de 100 visitantes (70 no Baixo) viram "fantasmas": contam e pagam, mas não são desenhados.
- Melhorias visuais só no gráfico Ultra; Baixo e Alto ficam como estão.
- Ajustes de gráfico, som, economia, tela ligada e FPS não sincronizam com o Drive (são por aparelho).
- Itens de DLC desinstalada ficam no save e inativos.
- Versões com letra no fim (`1.7.2b`) são válidas e ficam entre `1.7.2` e `1.7.3`.
- No AO VIVO o jogador não entra em recintos nem atravessa a ponte da ilha (entrar nos recintos é da etapa 1.7.2b).
- `touch-action: none` no `body` não bloqueia a rolagem de `.modal`, `.drawer` e `.sheet`: eles são containers de rolagem (`overflow:auto`).
- Sincronia com o Drive (desde a 1.7.2a): quem é mais novo é decidido pela `rev` gravada em `appProperties` e pelo hash do conteúdo, nunca pelo relógio. A API v3 do Drive não tem escrita condicional (If-Match); a janela entre ler e gravar (~1 s) é conhecida e aceita.

Na dúvida, relatar com confiança "suspeita" e citar a regra que parece violada.

## 3. Não relatar

Estilo, nomes, formatação, refatoração, "poderia ser mais limpo", falta de comentários, desempenho sem medida (só relatar desempenho se houver laço claramente quadrático ou vazamento de memória/objetos 3D não liberados).

## 4. Gravidade

- **Crítico**: perde ou corrompe o save, trava o jogo, impede abrir/atualizar, quebra a publicação.
- **Alto**: regra do jogo errada e visível (dinheiro errado, animal some, alerta que nunca resolve, funcionário parado para sempre).
- **Médio**: errado em caso raro ou com contorno fácil.
- **Baixo**: detalhe visual ou de texto.

## 5. Formato do relatório

Um arquivo por rodada: `bugs-AAAA-MM-DD-v<versão>.md`, na pasta `Zoo_Tycoon/Bugs_Deepseek/` do Drive.

```markdown
# Rodada AAAA-MM-DD — versão 1.7.2 — commit <hash curto>
Áreas analisadas: save, sim/animals.js
Resumo: 1 crítico, 2 altos, 0 médios, 1 baixo

## B01 — <título curto>
- Gravidade: crítico | alto | médio | baixo
- Confiança: certeza | provável | suspeita
- Local: src/save/save.js:42 (função `migrate`)
- Trecho:
  ```js
  <até 10 linhas do código atual>
  ```
- O que acontece: <efeito no jogo, em 1–3 frases>
- Como reproduzir: <passos no jogo OU chamada de função com entrada concreta e saída esperada x obtida>
- Por que é bug: <regra violada; se for regra do jogo, citar a seção 2 ou a ficha>
- Correção sugerida:
  ```diff
  - linha antiga
  + linha nova
  ```
- Teste que pegaria: <1 frase: o que verificar em tests/*.test.js>
```

Regras do relatório:
- Um bug por bloco, numerados B01, B02… na ordem de gravidade.
- Linha e trecho reais do commit analisado (nada de linha aproximada).
- Sem "como reproduzir" concreto, a confiança é no máximo "suspeita".
- Não repetir bug de rodada anterior; se ainda existe, escrever "continua: B03 de AAAA-MM-DD".

## 6. Prompt para colar no Deepseek

> Leia o arquivo modelo-relatorio-bugs.md (anexo) e analise o repositório henrikmalakias/zoologico, branch main, só leitura. Foque em: <áreas, ex.: save e sincronia com o Drive>. Siga a seção 2 para não relatar comportamento intencional e a seção 3 para o que ignorar. Entregue o relatório exatamente no formato da seção 5, em um único arquivo .md.
