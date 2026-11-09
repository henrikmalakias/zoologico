# Projeto Zoológico — v1.7.1

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

## Sincronia com o Google Drive (1.7.1)
`src/save/drive.js` guarda o save numa pasta oculta do app no Drive (escopo `drive.appdata`, o jogo não vê outros arquivos). Precisa de um ID de cliente OAuth, criado uma vez:
1. console.cloud.google.com > novo projeto (ex.: "Zoologico") > APIs e serviços > Biblioteca > ative **Google Drive API**.
2. Tela de consentimento OAuth: tipo Externo, nome do app, seu e-mail; em Escopos adicione `.../auth/drive.appdata`; em Usuários de teste adicione seu e-mail (e o da sobrinha). Pode deixar em "Teste".
3. Credenciais > Criar credenciais > ID do cliente OAuth > Aplicativo da Web; em **Origens JavaScript autorizadas** coloque `https://henrikmalakias.github.io`.
4. No jogo: Menu > Salvar > Colar ID > Conectar ao Drive (em cada aparelho). Para já vir pronto, cole o ID em `CLIENT_ID_PADRAO` em `src/save/drive.js`.
Obs.: em modo "Teste" o Google pede para reautorizar a cada 7 dias; publicar o app (escopo não sensível) evita isso.
