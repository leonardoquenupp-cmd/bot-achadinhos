# Bot de ofertas Shopee para Telegram

Node.js 24, sem dependências npm, IA ou Google Sheets. Após ativar o GitHub Actions, o computador pode ficar desligado.

## Ativação

1. Envie todo o conteúdo desta pasta para um repositório GitHub. Inclua `.github`, `src`, `test` e `data/history.json`. Nunca envie `.env`.
2. Em Settings → Secrets and variables → Actions → Secrets, crie `SHOPEE_APP_ID`, `SHOPEE_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Não compartilhe segredos na conversa.
3. Adicione o bot como administrador do canal Telegram, permitindo publicar. O chat pode ser `@canalpublico` ou ID `-100...`.
4. Na aba Variables, crie `BOT_PAUSED=true`. Não ative `BOT_ENABLED` ainda.
5. Habilite Actions e permita escrita de conteúdo. Proteções da branch e políticas da organização podem impedir gravação do histórico; nesse caso o bot não envia.
6. Configure horários, filtros e palavras-chave em `config.json`. Padrão: quatro ofertas/dia, janelas às 09h, 12h, 15h e 18h de São Paulo. Cada janela admite uma oferta. Para dez ofertas, configure pelo menos dez horários e limite dez.
7. Em Actions → Ofertas Shopee → Run workflow, rode `check` e depois `preview`. Esses modos funcionam durante a pausa e nunca publicam. Confira `connectivity_ok` e `preview_valid` nos logs.
8. Só depois de autorizar a publicação, crie `BOT_ENABLED=true`, altere `BOT_PAUSED=false` e mantenha `config.json` com `paused: false`. Rode `publish` dentro de uma janela configurada. O cron também poderá publicar a partir desse momento. Uma postagem de teste conta no histórico e limite.
9. Confira a mensagem e o link no canal. Depois confira uma execução com evento `schedule`, não apenas uma execução manual.

## Configuração

`timezone`: fuso IANA. `times`: horários HH:MM. `dailyLimit`: teto diário de 1 a 24. `windowMinutes`: tolerância ao atraso, padrão 90. Não compensa janelas perdidas no dia seguinte. `keywords`: buscas de diferentes categorias; a prioridade alterna a cada publicação. `minRating`, `minSales` e `minDiscount`: filtros mínimos. `requestIntervalMs`: intervalo entre consultas, padrão 2000ms; ajuste aos limites da sua conta. `pagesPerSearch`: limite de páginas, de 1 a 5. Não há garantia de preencher a cota se faltarem ofertas.

`paused: true` no arquivo ou variável `BOT_PAUSED=true` pausa sem apagar histórico. Para retomar, ambas devem permitir execução e `BOT_ENABLED` deve ser `true`. Check e preview nunca enviam.

## Dados e limitações

Consulta autenticada no endpoint oficial, assinatura SHA256 do corpo exato (não HMAC). Usa o `offerLink` retornado pela API como link de afiliado; não inventa links. O rastreamento da comissão e contrato GraphQL (campos e filtros itemId/shopId) precisam de validação real com sua conta aprovada.

Preço máximo de variação não é preço anterior. O bot omite preço anterior porque a consulta usada não o oferece independentemente. O percentual é identificado como **desconto informado pela Shopee**, não desconto histórico comprovado. Produtos são reconsultados antes da publicação, mas isso não garante estoque. `strictStock: true` exige estoque positivo explícito e bloqueia todas as ofertas na consulta atual, que não retorna estoque.

Foto ausente, dados inválidos, URLs não autorizadas ou produto ausente na reconsulta impedem postagem. O Telegram baixa a foto oficial por URL; não existe fallback para texto.

## Histórico e falhas

`data/history.json` guarda produtos, janelas e status. Em Actions é atualizado por commits na branch padrão com comparação de SHA; antes de enviar grava `pending`, após confirmar grava `sent` e messageId. Conflitos abortam sem envio. Execuções do workflow são serializadas. Há trava local adicional.

Falhas ambíguas (timeout, erro após envio ou falha ao salvar a confirmação) mantêm `pending` e bloqueiam novas publicações. Telegram não oferece chave de idempotência: não há garantia de entrega exatamente uma vez. A estratégia evita reenvio incerto, podendo perder uma oferta. Só retenta envio após rejeição explícita 429 com espera limitada.

Para resolver pending: pause, espere a execução ativa terminar, confira o canal e edite o registro afetado para `sent` se confirmou a mensagem ou `skipped` se não confirmou. Preserve produto e janela nos dois casos para não reenviar. Depois retome. Não apague nem restaure histórico antigo. Não rode cópias com históricos independentes no mesmo canal.

Histórico público contém IDs de produtos, mensagens e horários, nunca credenciais. Estado local não sincroniza com GitHub. Se um processo local morrer, remova `.state.lock` somente após confirmar que não há instância ativa.

## Testes locais

Instale Node.js 24. Não precisa npm install. Na pasta do projeto:

```powershell
node --test
Copy-Item .env.example .env
# Preencha .env apenas no computador
node --env-file-if-exists=.env index.js --check
node --env-file-if-exists=.env index.js --preview
```

Publicação local exige `--publish` e janela elegível. Produção deve ter apenas o GitHub como publicador. Preview pode registrar links públicos de afiliado; nunca registra tokens ou corpos de erro de serviços.

## Gratuidade e manutenção

Runners padrão em repositórios públicos são gratuitos; privados usam franquia da conta. Configure bloqueio de gastos no GitHub para impedir excedentes pagos. Não há banco, servidor ou API de IA pagos no projeto.

GitHub pode atrasar ou descartar disparos e pode desativar cron após 60 dias de inatividade em repositórios públicos. Commits de histórico ocorrem quando há publicação; sem ofertas por muito tempo pode ser necessária reativação manual. Monitore Actions e notificações de falha. Não é um serviço com disponibilidade/horário garantidos nem promessa de hospedagem gratuita permanente. Alternativa: cron em servidor Linux já disponível, que precisa permanecer ligado.

Fontes: [Shopee](https://affiliate.shopee.com.br/open_api), [Telegram](https://core.telegram.org/bots/api#sendphoto), [agendamento GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [custos](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Estado da entrega

Shopee em produção no GitHub Actions, com acionamento externo pelo cron-job.org. A integração experimental do Mercado Livre permanece em uma branch separada e não participa da publicação.

## Variedade e ritmo (18/11/2026)

- Até 180 oportunidades diárias entre 08h e 23h (Brasília), uma por janela de cinco minutos. O intervalo mínimo de quatro minutos tolera pequenas variações do runner, sem recuperar filas em rajada. Não há garantia de preencher todas as janelas.
- Busca alterna três categorias por ciclo dentre 11 raízes obtidas da API, páginas de 1 a 5 e três ordenações. Categorias temporariamente indisponíveis são ignoradas. A lista geral é uma fonte adicional.
- Mantém avaliação mínima 4,5 e 50 vendas; desconto mínimo informado pela API passou a 10%. Preços antigos, frete e desconto na legenda continuam dependendo de confirmação.
- Bloqueia IDs publicados e compara títulos com todo o histórico disponível. Novas entregas também guardam a identidade da foto. Evita a mesma família nas últimas quatro entregas e prioriza departamentos menos recentes. A comparação de títulos é heurística.
- Revalida o item e a loja por seus IDs exatos imediatamente antes da entrega. Se a consulta direta for recusada pela API, refaz a consulta de origem e exige ambos os IDs, sem reutilizar preços em cache. O histórico persistente, a reserva antes do envio e a proteção para entregas incertas permanecem ativos.
- Diagnóstico manual `discovery-probe.yml` consulta apenas a Shopee; não possui token Telegram e não publica. As prévias do workflow de ofertas também não enviam mensagens.


## Recuperação de entrega incerta (19/11/2026)

O envio de foto aguarda até 90 segundos. Uma falha de comunicação nunca causa reenvio automático.
Novas reservas guardam um resumo criptográfico da legenda e o link de afiliado. No ciclo seguinte,
o bot pode confirmar a entrega no canal público, exigindo legenda, botão, foto, canal e horário
compatíveis e uma única mensagem correspondente, antes de atualizar o histórico e retomar.
Se não houver prova, a reserva continua bloqueando novos envios; os ciclos registram
`delivery_awaiting_confirmation`, sem repetir a mesma falha por e-mail a cada cinco minutos.
A falha inicial continua sendo notificada. Novos erros de autenticação, estado ou código
continuam falhando normalmente. Canais privados e reservas antigas sem os dados de conferência
precisam de revisão manual; nunca são considerados entregues por suposição.
