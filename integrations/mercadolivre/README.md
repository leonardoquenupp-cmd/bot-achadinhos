# Mercado Livre: integração em validação

Esta pasta e o workflow de diagnóstico são independentes da Shopee. Não enviam mensagens,
não usam tokens do Telegram e não leem nem escrevem o histórico de entregas.
Não há agendamento ou publicação habilitados.

## Próxima validação

1. Acessar https://developers.mercadolivre.com.br/devcenter com a conta do Mercado Livre.
2. Criar ou selecionar uma aplicação e configurar `ML_CLIENT_ID` e `ML_CLIENT_SECRET`
   nos GitHub Secrets. Não colocar credenciais em arquivos ou no chat.
3. Alternativamente, configurar `ML_ACCESS_TOKEN` obtido pelo fluxo oficial autorizado.
4. Testar `node integrations/mercadolivre/preview.js` com essas variáveis, sem publicar.
   O acesso ao catálogo ainda depende das permissões efetivas da aplicação.

O diagnóstico consulta highlights e os anúncios do catálogo. Exige preço BRL,
anúncio novo e ativo, estoque conhecido e foto HTTPS. Campos ausentes resultam em
exclusão; não são preenchidos com suposições. Uma mudança de esquema da API pode
exigir adaptação após a primeira resposta real.

O link gerado pelo painel de afiliados foi conferido no navegador. Não está comprovado
que copiar `matt_tool` e `matt_word` para outro produto preserve a comissão.
Por isso URLs comuns do catálogo ficam com `affiliateLink: null`. Não habilitar a
publicação até validar geração oficial dos links e acesso real ao catálogo.

Referências: https://developers.mercadoenvios.com/introduction/sign-to-meli-b7ee396fbf7b
e documentação de highlights do Mercado Livre. Não usa cookies de navegador.
