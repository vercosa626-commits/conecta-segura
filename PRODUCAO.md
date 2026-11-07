# Conecta Segura em produção no Netlify

Endereço escolhido: **https://conecta-segura.netlify.app**. Repositório: https://github.com/JOHNY-VIANA/conecta-segura, branch `main`.

## Causa do problema anterior

O GitHub Pages hospeda apenas arquivos estáticos. O `runtime-config.js` do Pages usa `static:true` e `apiBase:""`, com integrações desligadas. Não há processo Node, Worker/D1 ou API rodando naquele endereço. O servidor local usava SQLite e o Worker esperava um binding D1/DB. Nenhum deles é iniciado automaticamente pelo Pages.

No Netlify, `npm run build:netlify` gera `dist-netlify/` com `static:false` e API na própria origem. `netlify.toml` encaminha `/api/*` para `netlify/functions/api.mjs`. O build não incorpora credenciais. A Function lê a configuração do servidor a cada ambiente e compartilha autenticação, validação e integração Twilio com o backend existente.

## Persistência e proteção

O Netlify Database gerencia PostgreSQL persistente. `@netlify/database` obtém a conexão adequada ao ambiente através de `NETLIFY_DB_URL`. A conexão não depende do disco das Functions. A migração `netlify/database/migrations/0001_alerts.sql` é aplicada pela plataforma antes de publicar; nenhuma migração roda em requisições de usuários. `DATABASE_URL` é uma alternativa opcional para PostgreSQL externo.

Reservas de alerta usam uma transação, bloqueio por usuário no PostgreSQL e chave primária UUID. A reserva é confirmada **antes** de chamar qualquer provedor. Repetições retornam o pedido existente, inclusive entre instâncias distintas. Limites: um pedido por 30 segundos e dez por 24 horas por UID; no Netlify há ainda uma regra de 60 requisições à Function por minuto por domínio/IP. Não há reenvio automático após timeout, falha de armazenamento ou resultado incerto.

Criar e consultar alertas exige um Firebase ID token válido. Consultas só retornam pedidos do próprio UID. Telefones, consentimento, ocorrência e posição recente são validados no servidor. As respostas não incluem SID do provedor, UID, telefone ou credenciais. Origem igual à aplicação é permitida; origens adicionais exigem `ALLOWED_ORIGINS` exato, sem curinga. Uma origem de preview nunca habilita envio real (`CONTEXT` precisa ser `production` quando definido).

O banco mantém identificador, UID, horário, estado e nome/canal/status/SID. Não persiste corpo da mensagem, telefone ou coordenadas. A limpeza de registros antigos ocorre na próxima criação de alerta após 24 horas; não existe tarefa periódica nesta versão. Usuários permanecem no Firebase Authentication. **Contatos e preferências continuam no navegador por conta/demonstração, sem sincronização em nuvem.** Sincronização de contatos entre aparelhos não foi desenvolvida.

Ao trocar de origem, dados do navegador não são transferidos automaticamente. Em Contatos, exporte o arquivo no aplicativo antigo e importe no Netlify. A importação valida o formato, mantém no máximo cinco contatos e preserva contatos já cadastrados. O arquivo contém dados pessoais: guarde-o com cuidado e confira consentimento e números. O app não envia esse arquivo a um servidor.

## Variáveis e integrações pendentes

| Variável | Uso e configuração |
| --- | --- |
| `NETLIFY_DB_URL` | Gerenciada automaticamente pelo Netlify Database; não copiar para JavaScript ou GitHub. |
| `DATABASE_URL` | Opcional, apenas para substituir por PostgreSQL externo com TLS. |
| `FIREBASE_PUBLIC_CONFIG` | JSON público do app Firebase Web: `apiKey`, `projectId`, `authDomain`, `appId` e campos públicos opcionais. Sem isso, Google e telefone permanecem pendentes. |
| `GOOGLE_MAPS_BROWSER_KEY` | Chave pública de navegador, restrita a Maps JavaScript API e ao referenciador `https://conecta-segura.netlify.app/*`. Sem chave, o link Google Maps continua disponível. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Credenciais privadas da Twilio, somente no ambiente do servidor. |
| `TWILIO_SMS_FROM` | Remetente SMS habilitado para o país de destino. |
| `TWILIO_WHATSAPP_FROM` | Remetente WhatsApp Business, com prefixo `whatsapp:`. |
| `TWILIO_WHATSAPP_CONTENT_SID` | Template aprovado: `{{1}}` nome, `{{2}}` ocorrência, `{{3}}` mapa/localização indisponível. |
| `LIVE_ALERTS_ENABLED` | Manter `false`. Só ativar após validar os provedores e destinatários autorizados; a pessoa ainda precisa entrar e ativar envio real na interface. |
| `ALLOWED_ORIGINS` | Vazio para frontend/API no mesmo domínio. Se necessário, lista de origens HTTPS exatas, separadas por vírgula. Não incluir caminhos nem `*`. |
| `PAGES_API_BASE_URL` | Apenas para a publicação estática antiga, se um dia for conectada explicitamente a backend externo. Não é usada no build do Netlify. |

Configure valores em **Netlify → Project configuration → Environment variables**. Os segredos são lidos pelas Functions e não devem aparecer em commits, arquivos do diretório publicável ou logs. No plano Free, se a interface não permitir restringir o escopo a Functions, o build continua seguro porque não serializa essas variáveis. Variáveis de envio e credenciais reais devem ficar no contexto de produção, não em previews.

### Firebase / Google / telefone

Em Firebase Authentication, habilite Google e Phone e adicione **`conecta-segura.netlify.app`** aos domínios autorizados. Não adicione `/` ou caminho. O domínio padrão do Firebase (`PROJETO.firebaseapp.com`) e seu retorno `/__/auth/handler` continuam sendo usados pelo SDK e permitidos pela CSP; confira o cliente OAuth criado pelo Firebase no Google Cloud se ele tiver sido personalizado. Um domínio de autenticação personalizado exige revisar CSP e URLs de retorno deliberadamente. Use números de teste do Firebase para validar OTP, reCAPTCHA, países permitidos e cotas sem SMS real.

### Mensagens e webhooks

Sem as credenciais, os envios automáticos ficam desativados. O backend não transforma uma abertura de SMS/WhatsApp em confirmação de entrega. A interface distingue preparado manualmente, simulado, aceito/na fila, enviado sem confirmação, entregue, lido, falhou e resultado incerto.

Esta implementação consulta os status na API da Twilio, através de uma rota autenticada. **Não existe webhook de recebimento/status da Twilio nesta versão**, e nenhum callback fictício deve ser cadastrado. Um webhook futuro precisará de validação da assinatura Twilio e da URL HTTPS real. Não há automação de WhatsApp pessoal.

## Verificar o backend

- `GET /api/config`: configuração pública filtrada, com `backend:true`. `storage:true` só aparece após uma consulta bem-sucedida ao banco. `live:false` indica que mensagens continuam desabilitadas.
- `GET /api/health`: consulta a tabela real do PostgreSQL; HTTP 200 com `storage:"ready"` quando disponível, ou 503 sem detalhes privados em caso de falha. Uma página HTML carregando não substitui esse teste.
- `POST /api/alerts`: permanece em 503 com envio desligado. Com configuração completa, exige token, origem autorizada, consentimento, payload válido, limites e reserva persistente.
- `GET /api/alerts/:id`: consulta autenticada dos resultados, restrita ao proprietário.

Respostas da API usam `private, no-store` e `Netlify-CDN-Cache-Control: no-store`. O service worker armazena somente os recursos estáticos de uma lista fechada; nunca API, tokens ou respostas privadas. Manifesto e service worker funcionam na raiz do Netlify. Uma visita conectada com confirmação de preparação ainda é necessária antes de abrir offline.

## Executar e testar

```sh
npm ci --ignore-scripts
npm test
npm run build:netlify
```

Para o servidor Node/SQLite local, continuam válidos `npm run build` e `npm start`. `npm run build:pages` continua gerando a demonstração estática antiga. O adaptador PostgreSQL é usado nas Functions; nenhum SQLite local é enviado como banco de produção.

Os testes usam SQLite em memória e provedores simulados. Os casos Netlify verificam runtime na raiz, configuração pública, falha de persistência, autorização, CORS, idempotência entre handlers, limites, rollback e liberação de conexão. Nenhum teste envia alertas reais. Login real, OTP, entrega dos provedores, precisão do GPS e instalação em aparelho físico só podem ser confirmados com as integrações/aparelhos apropriados.

## Atualizar e reverter

Faça alterações, execute `npm test`, commit e push para `main`. O Netlify baixa o repositório por chave de leitura e recebe pushes por webhook. O build executa testes antes de empacotar Functions e aplicar migrações. A publicação do GitHub Pages é mantida como demonstração/contingência e não substitui a produção no Netlify.

Para reverter apenas código, abra **Deploys** no Netlify e publique novamente um deploy anterior bem-sucedido; isso não deve apagar o banco. Para manter GitHub e produção alinhados, use `git revert HASH_DO_COMMIT` e envie o novo commit. Não use force push. Migrações devem ser compatíveis com a versão anterior. A migração inicial só cria tabela/índice; não há remoção de dados ou colunas. Uma restauração de backup do banco é uma operação separada e deve ser avaliada antes de execução.

O projeto está no plano Free, sujeito a cotas e eventual suspensão ao atingir limites, sem compra de domínio, upgrade ou recarga paga. Essa hospedagem não oferece garantia de disponibilidade de serviço de emergência.
