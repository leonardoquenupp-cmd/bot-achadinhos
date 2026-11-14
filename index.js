import { main } from './src/main.js';
import { SafeError } from './src/api.js';
const known = new Set(['state_configuration','corrupt_state','pending_delivery_requires_review','missing_environment','invalid_config','invalid_times','local_publish_requires_flag']);
main().catch(error => {
  const code = error instanceof SafeError || known.has(error.message) ? error.message : 'unexpected_internal';
  console.error(JSON.stringify({event:'run_failed',code,message:'Execucao interrompida com seguranca; nenhum segredo e registrado.'}));
  process.exitCode=1;
});
