(() => {
  'use strict';

  const canvas = document.getElementById('flor');
  const declaracao = document.getElementById('declaracao');
  if (!canvas) return;

  canvas.draggable = false;

  // Proteção leve: sem menu de contexto no canvas, sem arraste e sem seleção de texto (não bloqueia F12/teclado).
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  canvas.addEventListener('dragstart', (ev) => ev.preventDefault());
  document.addEventListener('selectstart', (ev) => {
    const alvo = ev.target;
    if (!alvo || !alvo.closest || !alvo.closest('input, textarea, [contenteditable="true"]')) {
      ev.preventDefault();
    }
  });

  const reduzido = /(?:^|[?&])reduzido=1(?:&|$)/.test(window.location.search || '');

  let instancia = null;
  let painel = null;
  let timerResize = 0;

  function obterAreaFlor() {
    if (window.innerWidth >= 900) {
      return { x: 0, y: 0, w: 1, h: 1 };
    }
    return { x: 0, y: 0.2, w: 1, h: 0.6 };
  }

  function aplicarAreaFlor() {
    if (instancia && typeof instancia.definirArea === 'function') {
      instancia.definirArea(obterAreaFlor());
    }
  }

  function carregarFonte() {
    if (document.fonts && typeof document.fonts.load === 'function') {
      return document.fonts.load('16px "JetBrains Mono"').catch(() => {});
    }
    return Promise.resolve();
  }

  function montar() {
    if (instancia && typeof instancia.destruir === 'function') {
      instancia.destruir();
      instancia = null;
    }
    if (!window.Tulipa || typeof window.Tulipa.criar !== 'function') return;

    instancia = window.Tulipa.criar(canvas, {
      fonte: '"JetBrains Mono", monospace',
      reduzido,
      interativo: true
    });
    window.__tulipa = instancia;

    aplicarAreaFlor();

    if (!painel && window.PainelCodigo && typeof window.PainelCodigo.criar === 'function') {
      painel = window.PainelCodigo.criar({ tulipa: instancia, reduzido });
      window.__painelCodigo = painel;
    } else if (painel && typeof painel.conectarTulipa === 'function') {
      painel.conectarTulipa(instancia, reduzido);
    }

    if (instancia && typeof instancia.iniciar === 'function') {
      instancia.iniciar();
    }
  }

  function agendarRedimensionamento() {
    if (!instancia) return;
    window.clearTimeout(timerResize);
    timerResize = window.setTimeout(() => {
      aplicarAreaFlor();
      if (typeof instancia.redimensionar === 'function') {
        instancia.redimensionar();
      }
      if (painel && typeof painel.redimensionar === 'function') {
        painel.redimensionar();
      }
    }, 100);
  }

  window.addEventListener('resize', agendarRedimensionamento, { passive: true });
  window.addEventListener('orientationchange', agendarRedimensionamento, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (!instancia) return;
    if (document.hidden) {
      if (typeof instancia.pausar === 'function') instancia.pausar();
      if (painel && typeof painel.pausar === 'function') painel.pausar();
    } else if (!window.__encerramentoConcluido) {
      if (typeof instancia.retomar === 'function') instancia.retomar();
      if (painel && typeof painel.retomar === 'function') painel.retomar();
    }
  });

  async function iniciarSite() {
    await carregarFonte();
    if (window.Abertura && typeof window.Abertura.tocar === 'function') {
      try {
        await window.Abertura.tocar({
          fonte: '"JetBrains Mono", monospace',
          reduzido
        });
      } catch {}
    }
    montar();
  }

  iniciarSite();
})();
