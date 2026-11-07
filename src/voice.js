// No microphone starts on page load. The UI must explicitly call start().
(function (root) {
  const COMMANDS = new Set(['conecta preciso de ajuda', 'conecta segura preciso de ajuda', 'conecta ativar emergencia', 'conecta segura ativar emergencia']);
  const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  root.ConectaVoice = {
    create({onCommand, onState = () => {}, isOnline = () => navigator.onLine, isVisible = () => !document.hidden} = {}) {
      const Native = root.SpeechRecognition || root.webkitSpeechRecognition;
      let localSupported = false;
      if (Native) try { localSupported = 'processLocally' in new Native() && typeof Native.available === 'function'; } catch {}
      let generation = 0, recognition = null, timeout = null;
      let state = {status: 'idle', mode: null, message: 'Microfone desligado.'};
      const update = (status, message, mode = state.mode) => { state = {status, message, mode}; onState({...state}); };
      function release() {
        clearTimeout(timeout); timeout = null;
        const old = recognition; recognition = null;
        if (old) { old.onstart = old.onresult = old.onerror = old.onend = null; try { old.abort(); } catch {} }
      }
      function stop(message = 'Microfone desligado.') {
        generation++; release(); update('idle', message, null);
      }
      function fail(message, session) {
        if (session !== generation) return false;
        generation++; release(); update('error', message, null); return false;
      }
      async function start(mode) {
        if (!['local', 'browser'].includes(mode)) return false;
        if (['checking', 'starting', 'listening', 'downloading'].includes(state.status)) return false;
        stop(); const session = generation;
        if (!Native) return fail('Este navegador não oferece comando de voz. Use o botão SOS.', session);
        if (!isVisible()) return fail('Mantenha o aplicativo aberto para ativar a voz.', session);
        if (mode === 'browser' && !isOnline()) return fail('Sem internet. Use a voz local, se disponível, ou o botão SOS.', session);
        update('checking', 'Verificando o reconhecimento de voz…', mode);
        try {
          if (mode === 'local') {
            if (!localSupported) return fail('Voz offline não suportada neste navegador. Use o botão SOS.', session);
            const available = await Native.available({langs: ['pt-BR'], processLocally: true});
            if (session !== generation) return false;
            if (available !== 'available') {
              update(available === 'downloadable' || available === 'downloading' ? 'needs-download' : 'error', available === 'unavailable' ? 'Português offline indisponível neste navegador.' : 'Prepare o português com internet antes de usar voz offline.', mode);
              return false;
            }
          }
          if (session !== generation || !isVisible()) return fail('Escuta cancelada. Mantenha o aplicativo aberto.', session);
          const engine = new Native(); recognition = engine;
          engine.lang = 'pt-BR'; engine.continuous = true; engine.interimResults = false; engine.maxAlternatives = 1;
          if (mode === 'local') engine.processLocally = true;
          else if ('processLocally' in engine) engine.processLocally = false;
          engine.onstart = () => {
            if (session !== generation) return;
            update('listening', 'Ouvindo: “Conecta, preciso de ajuda”.', mode);
            timeout = setTimeout(() => stop('Escuta encerrada após 10 minutos. Ative novamente se precisar.'), 10 * 60 * 1000);
          };
          engine.onresult = event => {
            if (session !== generation || !isVisible() || state.status !== 'listening') return;
            for (let i = event.resultIndex || 0; i < event.results.length; i++) {
              const result = event.results[i];
              if (!result.isFinal || !COMMANDS.has(normalize(result[0]?.transcript))) continue;
              const confidence = result[0]?.confidence;
              if (confidence > 0 && confidence < 0.6) continue;
              stop('Comando reconhecido. Microfone desligado.');
              onCommand?.(); return;
            }
          };
          engine.onerror = event => {
            const messages = {'not-allowed': 'Microfone não autorizado. Permita o acesso no navegador ou use o SOS.', 'service-not-allowed': 'Reconhecimento de voz bloqueado pelo navegador.', 'audio-capture': 'Microfone indisponível. Use o botão SOS.', network: 'Falha na conexão do reconhecimento. Use o botão SOS.', 'no-speech': 'Não foi detectada fala. Toque em ativar para tentar novamente.', 'language-not-supported': 'Português indisponível para este modo de voz.'};
            fail(messages[event.error] || 'Não foi possível ouvir o comando. Use o botão SOS.', session);
          };
          engine.onend = () => { if (session === generation) stop('Escuta encerrada pelo navegador. Ative novamente se precisar.'); };
          update('starting', 'Aguardando permissão do microfone…', mode);
          engine.start(); return true;
        } catch { return fail('Não foi possível iniciar a voz. Use o botão SOS.', session); }
      }
      async function download() {
        if (!Native || !localSupported || typeof Native.install !== 'function' || !isOnline()) { update('error', 'O preparo da voz offline exige internet e um navegador compatível.'); return false; }
        stop(); const session = generation; update('downloading', 'Preparando português para voz offline…', 'local');
        try {
          const installed = await Native.install({langs: ['pt-BR'], processLocally: true});
          if (session !== generation) return false;
          update(installed ? 'idle' : 'error', installed ? 'Português preparado. Toque em “Ouvir neste aparelho” para ativar.' : 'Não foi possível preparar português offline.', null);
          return installed;
        } catch { return fail('Não foi possível preparar português offline.', session); }
      }
      return {start, stop, download, supported: !!Native, localSupported, getState: () => ({...state})};
    }
  };
})(window);
