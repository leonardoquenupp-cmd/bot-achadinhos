import { main } from './src/main.js';
main().catch(() => { console.error(JSON.stringify({event:'run_failed',message:'Execucao interrompida. Confira configuracao, permissoes e historico; nenhum segredo e registrado.'})); process.exitCode=1; });
