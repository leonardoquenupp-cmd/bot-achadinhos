# Validação

Pacote recriado após constatar ausência da entrega anterior na pasta outputs.

Origem preservada em work: index.js, README.md, package.json, package-lock.json e .gitignore. Dependências embarcadas não reutilizadas. Assinatura e consulta foram aproveitadas conceitualmente. Foram substituídos IA, Sheets, cron local e envio sem confirmação por módulos sem dependências, workflow remoto e histórico persistente.

Executar node --test: 17 testes com serviços simulados. Cobrem assinatura, filtros, variações de preço, identificadores, horário/cota, erro GraphQL, retentativas, timeout sem reenvio, pipeline, concorrência, reserva persistente, pendências, prévia e pausa.

Não há comprovação de compatibilidade com a conta Shopee real sem credenciais. Não houve postagem Telegram, implantação GitHub ou execução schedule. Estoque e desconto histórico não são garantidos. Ativação de publicação depende de BOT_ENABLED=true e pausas desativadas.
