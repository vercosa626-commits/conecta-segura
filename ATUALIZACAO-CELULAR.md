# Atualização: Conecta Segura no celular

## O que mudou
- **Envio pelo celular (novo, sem servidor):** em Ajustes, desligue "Modo de demonstração" e confirme "Ativar envio pelo celular". A escolha fica salva no aparelho. O SOS (segurar 3 s, tocar para confirmar ou voz) faz a contagem de 5 s, tenta obter a localização e abre uma tela com **Preparar SMS** e **Preparar WhatsApp** para cada contato, com a mensagem pronta. Você toca em Enviar em cada conversa.
- Também na tela do SOS: compartilhar mensagem (menu do celular), copiar mensagem, tentar localização de novo, ligar **190** e **180**.
- Links de SMS corrigidos para iPhone e iPad (iPadOS 13+ se identifica como Mac).
- Testes novos: 41 passando.

## Publicar no Netlify (deploy automático)
1. Copie `src/app.js`, `tests/interface.test.mjs`, `worker/index.js` e este arquivo para o repositório.
2. `npm ci --ignore-scripts && npm test`
3. `git add . && git commit -m "Envio pelo celular (SMS/WhatsApp), localizacao no SOS e correcoes" && git push origin main`
4. O Netlify publica sozinho. No celular, abra o site, aguarde "Aplicativo preparado para abrir sem internet" e instale (Chrome Android: menu > Instalar aplicativo; iPhone Safari: Compartilhar > Adicionar à Tela de Início).

## Envio 100% automático (opcional, exige contas suas)
Navegador/PWA não consegue enviar SMS ou WhatsApp sozinho. O backend com Twilio já existe no código, mas precisa de:
- Firebase Authentication (Google e Phone) com o domínio conecta-segura.netlify.app autorizado.
- Twilio: Account SID, Auth Token, número SMS e, para WhatsApp, remetente aprovado + template (Content SID).
- Variáveis no Netlify (ver `.env.example` e `PRODUCAO.md`) e `LIVE_ALERTS_ENABLED=true` somente depois de testar com números autorizados.
Isso tem custo e aprovação do WhatsApp Business leva tempo.
