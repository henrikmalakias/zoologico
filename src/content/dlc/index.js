// Expansões publicadas. Cada DLC vive em src/content/dlc/<id>/ (ver contrato-dlc.md no Drive).
// Integrar uma DLC = importar o pacote aqui. O catálogo passa a mostrá-la como "Disponível" sozinho.
// Exemplo:
//   import { PACK as biomas } from './biomas/pack.js';
//   import { ZOOPEDIA as zBiomas } from './biomas/zoopedia.js';
//   export const DLC_PACKS = { biomas };
//   export const DLC_ZOOPEDIA = { ...zBiomas };
export const DLC_PACKS = {};
export const DLC_ZOOPEDIA = {};
