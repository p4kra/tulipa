/*
 * codigo.js — fragmentos flutuantes de código que leem, digitam e apagam trechos reais do próprio
 * tulipa.js ao redor da flor (sem nunca entrar em t.reserva nem em reservaPoema), acompanhados de um
 * fragmento flutuante de estado/log e, após aoAbrir(), da digitação de "Para Isadora" e do poema.
 * Dono: Antigravity. Sem dependências. Expõe window.PainelCodigo.
 */
(() => {
  'use strict';

  const TOKEN_RE = /(\/\/.*$|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|\b(function|return|const|let|var|if|else|for|while|do|switch|case|break|continue|new|typeof|instanceof|in|of|try|catch|finally|throw|class|extends|super|import|export|from|default|async|await|yield|true|false|null|undefined|this|get|set|Math|window|document|performance|requestAnimationFrame|cancelAnimationFrame)\b|\b(0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/g;

  const FASES_ORDEM = ['ceu', 'haste', 'folhas', 'botao', 'abertura', 'aberta'];
  const MARGEM_TELA = 16;
  const FOLGA_RESERVA = 16;
  const FOLGA_POEMA = 24;
  const FOLGA_FRAGMENTO = 12;
  const MAX_NOS_DOM = 10;

  function parsearPoema(bruto) {
    const limpo = (bruto || '').replace(/\r\n/g, '\n').trim();
    if (!limpo) {
      return {
        titulo: 'Para Isadora',
        estrofes: [],
        textoCompleto: 'Para Isadora'
      };
    }
    const blocos = limpo.split(/\n\s*\n/);
    const titulo = (blocos[0] || 'Para Isadora').trim();
    const estrofes = blocos
      .slice(1)
      .map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean))
      .filter((e) => e.length > 0);
    return {
      titulo,
      estrofes,
      textoCompleto: limpo
    };
  }

  function obterJanelasFase() {
    const T = (window.Tulipa && window.Tulipa.LINHA_DO_TEMPO) || {};
    const ab0 = Array.isArray(T.abertura) ? T.abertura[0] : 6.9;
    const ab1 = Array.isArray(T.abertura) ? T.abertura[1] : 15.0;
    return {
      ceu: [0, 1.25],
      haste: [1.25, 2.5],
      folhas: [2.5, 3.9],
      botao: [3.9, ab0],
      abertura: [ab0, ab1],
      aberta: [ab1, Infinity]
    };
  }

  function escaparHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function realcarLinha(texto, forcarComentario = false) {
    if (!texto) return '';
    if (forcarComentario) {
      return `<span class="tk-cm">${escaparHtml(texto)}</span>`;
    }
    TOKEN_RE.lastIndex = 0;
    let saida = '';
    let ultimo = 0;
    let m;
    while ((m = TOKEN_RE.exec(texto)) !== null) {
      if (m.index > ultimo) {
        saida += escaparHtml(texto.slice(ultimo, m.index));
      }
      const trecho = escaparHtml(m[0]);
      if (m[1] !== undefined) {
        saida += `<span class="tk-cm">${trecho}</span>`;
      } else if (m[2] !== undefined) {
        saida += `<span class="tk-st">${trecho}</span>`;
      } else if (m[3] !== undefined) {
        saida += `<span class="tk-kw">${trecho}</span>`;
      } else if (m[4] !== undefined) {
        saida += `<span class="tk-nu">${trecho}</span>`;
      } else {
        saida += trecho;
      }
      ultimo = TOKEN_RE.lastIndex;
    }
    if (ultimo < texto.length) {
      saida += escaparHtml(texto.slice(ultimo));
    }
    return saida;
  }

  function formatarAbertura(valor0a1) {
    const pct = Math.max(0, Math.min(100, (Number(valor0a1) || 0) * 100));
    return pct.toFixed(1).replace('.', ',').padStart(5, '0') + '%';
  }

  function formatarBalanco(graus) {
    const g = Math.min(999.99, Math.abs(Number(graus) || 0));
    return g.toFixed(2).replace('.', ',').padStart(6, '0') + '°';
  }

  function formatarLetras(qtd) {
    const n = Math.max(0, Math.round(Number(qtd) || 0));
    return n.toLocaleString('pt-BR');
  }

  function formatarLogFase(fase, est) {
    const letrasFmt = formatarLetras(est.letras);
    switch (fase) {
      case 'ceu':
        return `> desenhando céu… ${letrasFmt} letras`;
      case 'haste':
        return `> desenhando haste… ${letrasFmt} letras`;
      case 'folhas': {
        const t = typeof est.tempo === 'number' ? est.tempo : 3.5;
        const qtdFolhas = t >= 3.15 ? 2 : 1;
        return `> folhas: ${qtdFolhas}/2`;
      }
      case 'botao':
        return `> botão fechado`;
      case 'abertura': {
        const pct = Math.max(0, Math.min(100, (Number(est.abertura) || 0) * 100))
          .toFixed(1)
          .replace('.', ',');
        return `> abrindo ${pct}%`;
      }
      case 'aberta':
      default: {
        const faiscas = Math.max(0, Math.round(Number(est.faiscas) || 0));
        return `> aberta. faíscas: ${faiscas}`;
      }
    }
  }

  function recuoInicial(texto) {
    const m = (texto || '').match(/^\s+/);
    return m ? m[0].length : 0;
  }

  function aplicarDedent(texto, dedent) {
    if (!texto) return '';
    let n = 0;
    while (n < dedent && n < texto.length && texto.charCodeAt(n) === 32) {
      n++;
    }
    return texto.slice(n);
  }

  function indiceComentarioLinha(texto) {
    let emAspas = '';
    for (let i = 0; i < texto.length - 1; i++) {
      const ch = texto[i];
      if (emAspas) {
        if (ch === '\\') { i++; continue; }
        if (ch === emAspas) emAspas = '';
      } else if (ch === '\'' || ch === '"' || ch === '`') {
        emAspas = ch;
      } else if (ch === '/' && texto[i + 1] === '/') {
        return i;
      }
    }
    return -1;
  }

  function quebrarEmSegmentos(textoDedent, maxCols) {
    const limite = Math.max(26, maxCols);
    if (textoDedent.length <= limite) {
      const html = realcarLinha(textoDedent, false);
      return [{ textoSeg: textoDedent, comentario: false, htmlCompleto: html }];
    }

    const recuoBase = Math.min(8, recuoInicial(textoDedent));
    const prefixoCont = ' '.repeat(recuoBase + 2);
    const idxCom = indiceComentarioLinha(textoDedent);
    const segmentos = [];
    let pos = 0;
    let primeira = true;

    while (pos < textoDedent.length) {
      const disp = primeira ? limite : Math.max(16, limite - prefixoCont.length);
      const restante = textoDedent.length - pos;
      if (restante <= disp) {
        const pref = primeira ? '' : prefixoCont;
        const com = !primeira && idxCom >= 0 && pos > idxCom;
        const textoSeg = pref + textoDedent.slice(pos);
        segmentos.push({
          textoSeg,
          comentario: com,
          htmlCompleto: realcarLinha(textoSeg, com)
        });
        break;
      }

      let corte = pos + disp;
      const minBusca = Math.max(pos + recuoBase + 8, corte - 16);
      for (let i = corte; i >= minBusca; i--) {
        const c = textoDedent[i - 1];
        if (c === ' ' || c === ',' || c === ';' || c === '(' || c === '+' || c === ':') {
          corte = i;
          break;
        }
      }

      const pref = primeira ? '' : prefixoCont;
      const com = !primeira && idxCom >= 0 && pos > idxCom;
      const textoSeg = pref + textoDedent.slice(pos, corte);
      segmentos.push({
        textoSeg,
        comentario: com,
        htmlCompleto: realcarLinha(textoSeg, com)
      });
      pos = corte;
      while (pos < textoDedent.length && textoDedent[pos] === ' ') {
        pos++;
      }
      primeira = false;
    }

    return segmentos;
  }

  function mapearTrechosDoCodigo(linhas) {
    const marcadores = [];
    for (let i = 0; i < linhas.length; i++) {
      const m = linhas[i].match(/^\s*\/\/\s*#fase\s*:\s*([a-z0-9_-]+)\s*$/i);
      if (m) {
        marcadores.push({ nome: m[1].toLowerCase(), linha: i });
      }
    }

    const trechos = {};
    for (let k = 0; k < marcadores.length; k++) {
      const atual = marcadores[k];
      trechos[atual.nome] = {
        inicio: atual.linha,
        dedent: 6
      };
    }

    FASES_ORDEM.forEach((fase, idx) => {
      if (trechos[fase]) return;
      const ini = Math.floor((idx / FASES_ORDEM.length) * Math.max(1, linhas.length - 20));
      trechos[fase] = {
        inicio: ini,
        dedent: 6
      };
    });

    return trechos;
  }

  function fasePorTempo(t) {
    const j = obterJanelasFase();
    if (t >= j.aberta[0]) return 'aberta';
    if (t >= j.abertura[0]) return 'abertura';
    if (t >= j.botao[0]) return 'botao';
    if (t >= j.folhas[0]) return 'folhas';
    if (t >= j.haste[0]) return 'haste';
    return 'ceu';
  }

  function estatisticasFallback(tulipa, reduzido) {
    const t = reduzido ? 20 : (tulipa && typeof tulipa.tempo === 'number' ? tulipa.tempo : 0);
    const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
    const pAb = clamp((t - 6.9) / (15.0 - 6.9));
    const abertura = reduzido ? 1 : pAb * pAb * (3 - 2 * pAb);
    const pDes = clamp((t - 1.0) / (6.6 - 1.0));
    const balanco = reduzido ? 0 : Math.abs(Math.sin(t * 0.9) * 1.8 * clamp((t - 2.0) / 4.0));
    const letras = reduzido ? 1652 : Math.round(96 + 1280 * pDes + 290 * abertura);
    return {
      fase: reduzido ? 'aberta' : fasePorTempo(t),
      tempo: t,
      abertura,
      balanco,
      letras,
      fps: 30,
      faiscas: reduzido ? 0 : 90
    };
  }

  function retangulosColidem(a, b, folga = 0) {
    return (
      a.x < b.x + b.w + folga &&
      a.x + a.w + folga > b.x &&
      a.y < b.y + b.h + folga &&
      a.y + a.h + folga > b.y
    );
  }

  function criar(opcoes = {}) {
    const camada = document.getElementById('camada-codigo');
    const declaracao = document.getElementById('declaracao');
    let reduzido = Boolean(opcoes.reduzido);
    let tulipa = opcoes.tulipa || null;

    let linhas = [];
    let cacheLinhas = [];
    let trechos = {};
    let faseAtual = 'ceu';
    let cursorLinha = 0;
    let pulsoFasePendente = false;

    let idSeq = 1;
    let semente = 1337;
    const fragmentos = [];
    const timersPendentes = new Set();

    let statusFrag = null;
    let stAbertura = null;
    let stBalanco = null;
    let stLetras = null;
    let stEstado = null;
    let stFps = null;
    let stLog = null;
    let zonaStatusIdx = 0;

    let poemaDados = parsearPoema('');
    let poemaCarregado = false;
    let poemaAtivo = false;
    let inicioPoemaRelogio = null;
    let inicioPoemaPerf = null;
    let instanteAoAbrirMs = null;
    let instantePrimeiroCharMs = null;
    let instanteUltimoCharMs = null;
    let relogioUltimoChar = null;
    let instanteInicioEncerramentoMs = null;
    let relogioInicioEncerramento = null;
    let encerramentoAgendado = false;
    let encerramentoDisparado = false;
    let encerramentoConcluido = false;
    let timerEncerramento = 0;
    let reservasPoema = [];
    let domPoema = null;
    let ultimoEstadoPoema = '';

    let timerLoop = 0;
    let timerStatus = 0;
    let timerTrocaStatus = 0;
    let timerPoema = 0;
    let pausado = false;
    let destruido = false;
    let emSaltoQa = false;
    let ultimoTempoConhecido = 0;

    function aleatorio() {
      semente = (semente * 1664525 + 1013904223) >>> 0;
      return semente / 4294967296;
    }

    function agendarTimeout(fn, ms) {
      const id = window.setTimeout(() => {
        timersPendentes.delete(id);
        if (!destruido) fn();
      }, ms);
      timersPendentes.add(id);
      return id;
    }

    function limparTimersPendentes() {
      timersPendentes.forEach((id) => window.clearTimeout(id));
      timersPendentes.clear();
    }

    function ehDesktop() {
      return window.innerWidth >= 900;
    }

    function limitesQuantidade() {
      if (poemaAtivo) {
        if (ehDesktop()) {
          return { min: 1, max: 2 };
        }
        return { min: 0, max: 0 };
      }
      if (ehDesktop()) {
        return { min: 3, max: 5 };
      }
      return { min: 2, max: 3 };
    }

    function calcularMaxCols() {
      if (poemaAtivo && ehDesktop()) return 36;
      return ehDesktop() ? 42 : 32;
    }

    function obterReservaAtual() {
      if (tulipa && tulipa.reserva && typeof tulipa.reserva === 'object') {
        const r = tulipa.reserva;
        if (Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h)) {
          return { x: r.x, y: r.y, w: r.w, h: r.h };
        }
      }
      const vw = window.innerWidth || 1440;
      const vh = window.innerHeight || 900;
      if (vw >= 900) {
        return { x: vw * 0.326, y: vh * 0.05, w: vw * 0.348, h: vh * 0.9 };
      }
      return { x: vw * 0.17, y: vh * 0.22, w: vw * 0.66, h: vh * 0.56 };
    }

    function prepararCacheLinhas() {
      const maxCols = calcularMaxCols();
      cacheLinhas = new Array(linhas.length);
      for (let i = 0; i < linhas.length; i++) {
        const bruto = linhas[i] || '';
        const texto = aplicarDedent(bruto, 6);
        const vazio = /^\s*$/.test(texto);
        const ehMarcador = /^\s*\/\/\s*#fase\s*:/i.test(texto);
        const segs = vazio ? [] : quebrarEmSegmentos(texto, maxCols);
        cacheLinhas[i] = {
          numero: i + 1,
          texto,
          vazio,
          ehMarcador,
          segs
        };
      }
    }

    function aplicarClassesPosicao(el, pctX, pctY) {
      const classes = Array.from(el.classList);
      for (let i = 0; i < classes.length; i++) {
        if (classes[i].startsWith('px-') || classes[i].startsWith('py-')) {
          el.classList.remove(classes[i]);
        }
      }
      const xClamped = Math.max(0, Math.min(95, Math.round(pctX)));
      const yClamped = Math.max(0, Math.min(95, Math.round(pctY)));
      el.classList.add(`px-${xClamped}`, `py-${yClamped}`);
    }

    function obterCaixaEfetiva(item) {
      if (!item) return null;
      const c = item.caixa;
      if (item.el && item.el.parentNode) {
        const b = item.el.getBoundingClientRect();
        if (b.width > 0 && b.height > 0) {
          const d = item.driftPx || 0;
          if (!c) {
            return { x: b.left, y: b.top - d, w: b.width, h: b.height + d };
          }
          const x0 = Math.min(c.x, b.left);
          const y0 = Math.min(c.y, b.top - d);
          const x1 = Math.max(c.x + c.w, b.right);
          const y1 = Math.max(c.y + c.h, b.bottom);
          return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        }
      }
      return c || null;
    }

    function violaReservaPoemaOuLado(caixa) {
      if (!poemaAtivo) return false;
      if (!ehDesktop()) {
        return true;
      }
      const res = obterReservaAtual();
      // No desktop, após aoAbrir, os fragmentos ficam só à direita da flor
      if (caixa.x < res.x + res.w + FOLGA_RESERVA) {
        return true;
      }
      for (let i = 0; i < reservasPoema.length; i++) {
        if (retangulosColidem(caixa, reservasPoema[i], 0)) {
          return true;
        }
      }
      return false;
    }

    function escolherPosicaoLivre(larg, alt, driftPx, ignorarId = -1, opcoesPos = {}) {
      if (poemaAtivo && !ehDesktop()) return null;

      const vw = window.innerWidth || 1440;
      const vh = window.innerHeight || 900;
      const res = obterReservaAtual();
      const caixaReserva = {
        x: res.x - FOLGA_RESERVA,
        y: res.y - FOLGA_RESERVA,
        w: res.w + FOLGA_RESERVA * 2,
        h: res.h + FOLGA_RESERVA * 2
      };

      const caixasOcupadas = [];
      if (statusFrag && statusFrag.id !== ignorarId) {
        const cs = obterCaixaEfetiva(statusFrag);
        if (cs) caixasOcupadas.push(cs);
      }
      for (let i = 0; i < fragmentos.length; i++) {
        const f = fragmentos[i];
        if (f.id === ignorarId) continue;
        const cf = obterCaixaEfetiva(f);
        if (cf) caixasOcupadas.push(cf);
      }

      const candidatos = [];
      const passoX = 2;
      const passoY = ehDesktop() ? 2 : 1;

      for (let py = 1; py <= 94; py += passoY) {
        const y = (py / 100) * vh;
        const topoVida = y - driftPx;
        const baseVida = y + alt;
        if (topoVida < MARGEM_TELA || baseVida > vh - MARGEM_TELA) continue;

        for (let px = 1; px <= 94; px += passoX) {
          const x = (px / 100) * vw;
          if (x < MARGEM_TELA || x + larg > vw - MARGEM_TELA) continue;

          const caixaCand = {
            x,
            y: topoVida,
            w: larg,
            h: alt + driftPx
          };

          if (retangulosColidem(caixaCand, caixaReserva, 0)) continue;
          if (violaReservaPoemaOuLado(caixaCand)) continue;

          let bateu = false;
          for (let i = 0; i < caixasOcupadas.length; i++) {
            if (retangulosColidem(caixaCand, caixasOcupadas[i], FOLGA_FRAGMENTO)) {
              bateu = true;
              break;
            }
          }
          if (bateu) continue;

          if (opcoesPos.exigirMudancaDe) {
            const ant = opcoesPos.exigirMudancaDe;
            const dist = Math.hypot(x - ant.x, topoVida - ant.y);
            if (dist < 48) continue;
          }

          let peso = 1;
          if (!ehDesktop()) {
            const naFaixaSup = baseVida <= caixaReserva.y;
            const naFaixaInf = topoVida >= caixaReserva.y + caixaReserva.h;
            if (naFaixaSup) {
              const distTopo = topoVida - MARGEM_TELA;
              const distBaseSup = caixaReserva.y - baseVida;
              if (distTopo <= 12 || distBaseSup <= 12) peso += 25;
              if (opcoesPos.preferirZona !== undefined && (opcoesPos.preferirZona % 2 === 0)) peso += 40;
            } else if (naFaixaInf) {
              const distTopoInf = topoVida - (caixaReserva.y + caixaReserva.h);
              const distBase = (vh - MARGEM_TELA) - baseVida;
              if (distTopoInf <= 12 || distBase <= 12) peso += 25;
              if (opcoesPos.preferirZona !== undefined && (opcoesPos.preferirZona % 2 === 1)) peso += 40;
            }
          } else if (opcoesPos.preferirZona !== undefined) {
            const z = opcoesPos.preferirZona % 4;
            const esq = x + larg * 0.5 < vw * 0.5;
            const sup = y + alt * 0.5 < vh * 0.5;
            if ((z === 0 && esq && sup) || (z === 1 && !esq && !sup) || (z === 2 && !esq && sup) || (z === 3 && esq && !sup)) {
              peso += 15;
            }
          }

          if (opcoesPos.evitarCantos) {
            const cantoX = x < 28 || x + larg > vw - 28;
            const cantoY = topoVida < 28 || baseVida > vh - 28;
            if (!cantoX && !cantoY) peso += 2;
          }

          candidatos.push({ px, py, caixa: caixaCand, peso });
        }
      }

      if (!candidatos.length) return null;

      let somaPesos = 0;
      for (let i = 0; i < candidatos.length; i++) {
        somaPesos += candidatos[i].peso;
      }
      let sorteio = aleatorio() * somaPesos;
      for (let i = 0; i < candidatos.length; i++) {
        sorteio -= candidatos[i].peso;
        if (sorteio <= 0) {
          return candidatos[i];
        }
      }
      return candidatos[candidatos.length - 1];
    }

    function criarFragStatus() {
      if (!camada || statusFrag) return;
      if (poemaAtivo && !ehDesktop()) return;

      const el = document.createElement('div');
      el.className = 'frag frag--op-4 frag-status';
      if (!reduzido) {
        el.classList.add('frag--deriva-status');
      }

      const corpo = document.createElement('div');
      corpo.className = 'frag__corpo';
      corpo.innerHTML = [
        '<div class="frag-status__metricas">',
        '<span>abertura <b data-st-abertura>000,0%</b></span>',
        '<span>balanço <b data-st-balanco>000,00°</b></span>',
        '<span>letras <b data-st-letras>0</b></span>',
        '</div>',
        '<div class="frag-status__cmd">',
        '<span class="frag-status__prompt">$ node tulipa.js</span>',
        '<span class="frag-status__exec"><i class="frag-status__ponto" aria-hidden="true">●</i> <span data-st-estado>executando</span> \u00b7 <span data-st-fps>30</span> fps</span>',
        '</div>',
        '<div class="frag-status__log" data-st-log>&gt; desenhando céu…</div>'
      ].join('');

      el.appendChild(corpo);
      camada.appendChild(el);

      stAbertura = el.querySelector('[data-st-abertura]');
      stBalanco = el.querySelector('[data-st-balanco]');
      stLetras = el.querySelector('[data-st-letras]');
      stEstado = el.querySelector('[data-st-estado]');
      stFps = el.querySelector('[data-st-fps]');
      stLog = el.querySelector('[data-st-log]');

      const driftPx = reduzido ? 0 : 11;
      statusFrag = {
        id: idSeq++,
        el,
        driftPx,
        caixa: null
      };

      posicionarStatusFrag(true);
    }

    function medirStatusFrag() {
      const el = statusFrag && statusFrag.el;
      const largDom = el ? Math.ceil(el.offsetWidth || 0) + 8 : 0;
      const altDom = el ? Math.ceil(el.offsetHeight || 0) + 4 : 0;
      return {
        larg: Math.max(ehDesktop() ? 350 : 324, largDom),
        alt: Math.max(ehDesktop() ? 62 : 56, altDom)
      };
    }

    function escolherDestinoStatusLivre(caixaAnterior = null) {
      if (!statusFrag) return null;
      if (poemaAtivo && !ehDesktop()) return null;
      const { larg, alt } = medirStatusFrag();
      const zonaAlvo = zonaStatusIdx++;
      let escolha = escolherPosicaoLivre(larg, alt, statusFrag.driftPx, statusFrag.id, {
        evitarCantos: true,
        preferirZona: zonaAlvo,
        exigirMudancaDe: caixaAnterior
      });

      while (!escolha && fragmentos.length > 0) {
        const maisAntigo = fragmentos.find((f) => f.estado === 'parado') || fragmentos[0];
        removerFragmento(maisAntigo);
        escolha = escolherPosicaoLivre(larg, alt, statusFrag.driftPx, statusFrag.id, {
          evitarCantos: true,
          preferirZona: zonaAlvo,
          exigirMudancaDe: caixaAnterior
        });
      }

      if (!escolha) {
        escolha = escolherPosicaoLivre(larg, alt, statusFrag.driftPx, statusFrag.id, {
          evitarCantos: true,
          preferirZona: zonaAlvo
        });
      }
      return escolha;
    }

    function posicionarStatusFrag(imediato = false, escolhaPreReservada = null) {
      if (!statusFrag || !statusFrag.el) return;
      const el = statusFrag.el;
      const escolha = escolhaPreReservada || escolherDestinoStatusLivre(statusFrag.caixa);

      if (escolha) {
        aplicarClassesPosicao(el, escolha.px, escolha.py);
        statusFrag.caixa = escolha.caixa;
      }

      if (!reduzido) {
        el.classList.remove('frag--deriva-status');
        void el.offsetWidth;
        el.classList.add('frag--deriva-status');
      }

      if (imediato || reduzido) {
        el.classList.remove('frag--saindo');
        el.classList.add('frag--visivel');
      } else {
        window.requestAnimationFrame(() => {
          if (!destruido && statusFrag && statusFrag.el === el) {
            el.classList.remove('frag--saindo');
            el.classList.add('frag--visivel');
          }
        });
      }
    }

    function saltarStatusFrag() {
      if (destruido || pausado || reduzido || !statusFrag) return;
      if (poemaAtivo && !ehDesktop()) return;
      const el = statusFrag.el;
      const caixaAntiga = statusFrag.caixa;
      el.classList.remove('frag--visivel');
      el.classList.add('frag--saindo');

      agendarTimeout(() => {
        if (destruido || !statusFrag) return;
        const destino = escolherDestinoStatusLivre(caixaAntiga);
        if (destino) {
          posicionarStatusFrag(false, destino);
        } else {
          el.classList.remove('frag--saindo');
          el.classList.add('frag--visivel');
        }
        agendarReposicaoFragmentos(90);
      }, 250);
    }

    function apagarFragmentoImediato(frag) {
      if (!frag || frag.estado === 'saindo') return;
      frag.estado = 'saindo';
      frag.el.classList.remove('frag--visivel');
      frag.el.classList.add('frag--saindo');
      agendarTimeout(() => {
        removerFragmento(frag);
      }, 250);
    }

    function formatarVersoParcialHtml(verso, n, clsCursor) {
      const vis = escaparHtml(verso.slice(0, n));
      const fantasma = escaparHtml(verso.slice(n));
      const cur = clsCursor ? `<span class="${clsCursor}"></span>` : '';
      return fantasma
        ? `${vis}${cur}<span class="verso-fantasma">${fantasma}</span>`
        : `${vis}${cur}`;
    }

    function formatarVersoFantasmaHtml(verso) {
      return `<span class="verso-fantasma">${escaparHtml(verso)}</span>`;
    }

    function garantirLinhasEstrofeCelular(domEstUnica, qtdVersos, classeFonte) {
      if (!domEstUnica) return;
      const divEst = domEstUnica.divEst;
      divEst.className = classeFonte ? `declaracao__estrofe ${classeFonte}` : 'declaracao__estrofe';
      while (domEstUnica.versosDom.length < qtdVersos) {
        const pVerso = document.createElement('p');
        pVerso.className = 'declaracao__verso';
        divEst.appendChild(pVerso);
        domEstUnica.versosDom.push(pVerso);
      }
      while (domEstUnica.versosDom.length > qtdVersos) {
        const rem = domEstUnica.versosDom.pop();
        if (rem && rem.parentNode) rem.parentNode.removeChild(rem);
      }
    }

    function construirDomPoema() {
      if (!declaracao) return;
      declaracao.hidden = false;
      declaracao.classList.toggle('declaracao--reduzido', reduzido);
      declaracao.classList.remove(
        'declaracao--compacta',
        'declaracao--desk-15',
        'declaracao--desk-14',
        'declaracao--desk-38ch',
        'declaracao--desk-34ch'
      );

      const vw = window.innerWidth || 1440;
      const vh = window.innerHeight || 900;
      const res = obterReservaAtual();

      declaracao.textContent = '';

      const pSr = document.createElement('p');
      pSr.className = 'visualmente-oculto';
      pSr.textContent = poemaDados.textoCompleto;
      declaracao.appendChild(pSr);

      const vis = document.createElement('div');
      vis.className = 'declaracao__visivel';
      if (!reduzido) {
        vis.setAttribute('aria-hidden', 'true');
      }

      const blocoTopo = document.createElement('div');
      blocoTopo.className = 'declaracao__bloco-topo';
      const hTitulo = document.createElement('h1');
      hTitulo.className = 'declaracao__titulo';
      hTitulo.textContent = poemaDados.titulo;
      blocoTopo.appendChild(hTitulo);

      const blocoBase = document.createElement('div');
      blocoBase.className = 'declaracao__bloco-base';

      const estrofesDom = [];
      const classesFonteCel = [];

      if (ehDesktop() || reduzido) {
        for (let e = 0; e < poemaDados.estrofes.length; e++) {
          const versos = poemaDados.estrofes[e];
          const divEst = document.createElement('div');
          divEst.className = 'declaracao__estrofe';
          const versosDom = [];
          for (let v = 0; v < versos.length; v++) {
            const pVerso = document.createElement('p');
            pVerso.className = 'declaracao__verso';
            pVerso.textContent = versos[v];
            divEst.appendChild(pVerso);
            versosDom.push(pVerso);
          }
          blocoBase.appendChild(divEst);
          estrofesDom.push({ divEst, versosDom });
        }
      } else {
        const divEst = document.createElement('div');
        divEst.className = 'declaracao__estrofe';
        blocoBase.appendChild(divEst);
        estrofesDom.push({ divEst, versosDom: [] });
      }

      vis.appendChild(blocoTopo);
      vis.appendChild(blocoBase);
      declaracao.appendChild(vis);

      if (ehDesktop()) {
        // Verifica se cabe entre 7% e 93% da altura e fora de t.reserva; se precisar, reduz fonte até 14 px
        const opcoesDesk = [
          [],
          ['declaracao--desk-15'],
          ['declaracao--desk-14'],
          ['declaracao--desk-14', 'declaracao--desk-38ch'],
          ['declaracao--desk-14', 'declaracao--desk-34ch']
        ];
        const cabeDesktop = () => {
          const b = declaracao.getBoundingClientRect();
          return b.top >= vh * 0.07 && b.bottom <= vh * 0.93 && b.right <= res.x - FOLGA_RESERVA;
        };
        for (let i = 0; i < opcoesDesk.length; i++) {
          declaracao.classList.remove(
            'declaracao--desk-15',
            'declaracao--desk-14',
            'declaracao--desk-38ch',
            'declaracao--desk-34ch'
          );
          for (let k = 0; k < opcoesDesk[i].length; k++) {
            declaracao.classList.add(opcoesDesk[i][k]);
          }
          if (cabeDesktop()) break;
        }
        const b = declaracao.getBoundingClientRect();
        reservasPoema = [{
          x: b.left - FOLGA_POEMA,
          y: b.top - FOLGA_POEMA,
          w: b.width + FOLGA_POEMA * 2,
          h: b.height + FOLGA_POEMA * 2
        }];
      } else {
        // No celular: mede cada estrofe individualmente para escolher 14px, 13px ou 12px só para aquela estrofe
        const domEstUnica = estrofesDom[0];
        const opcoesCls = ['', 'declaracao__estrofe--13', 'declaracao__estrofe--12'];
        const topoMin = res.y + res.h + FOLGA_RESERVA;
        const baseMax = vh - MARGEM_TELA;

        if (!reduzido && domEstUnica) {
          for (let e = 0; e < poemaDados.estrofes.length; e++) {
            const versos = poemaDados.estrofes[e];
            let escolhida = opcoesCls[opcoesCls.length - 1];
            for (let c = 0; c < opcoesCls.length; c++) {
              garantirLinhasEstrofeCelular(domEstUnica, versos.length, opcoesCls[c]);
              for (let v = 0; v < versos.length; v++) {
                domEstUnica.versosDom[v].textContent = versos[v];
              }
              const b = blocoBase.getBoundingClientRect();
              if (b.top >= topoMin && b.bottom <= baseMax) {
                escolhida = opcoesCls[c];
                break;
              }
            }
            classesFonteCel[e] = escolhida;
          }
        }

        reservasPoema = [
          { x: 0, y: 0, w: vw, h: res.y + FOLGA_POEMA },
          { x: 0, y: res.y + res.h - FOLGA_POEMA, w: vw, h: vh - (res.y + res.h) + FOLGA_POEMA }
        ];
      }

      if (!reduzido) {
        hTitulo.textContent = '';
        if (ehDesktop()) {
          for (let e = 0; e < estrofesDom.length; e++) {
            const versos = poemaDados.estrofes[e] || [];
            for (let v = 0; v < estrofesDom[e].versosDom.length; v++) {
              estrofesDom[e].versosDom[v].innerHTML = formatarVersoFantasmaHtml(versos[v] || '');
            }
          }
        } else if (estrofesDom[0]) {
          const primEst = poemaDados.estrofes[0] || [];
          garantirLinhasEstrofeCelular(estrofesDom[0], primEst.length, classesFonteCel[0] || '');
          for (let v = 0; v < primEst.length; v++) {
            estrofesDom[0].versosDom[v].innerHTML = formatarVersoFantasmaHtml(primEst[v]);
          }
        }
      }

      domPoema = {
        vis,
        hTitulo,
        estrofesDom,
        classesFonteCel
      };
      ultimoEstadoPoema = '';
    }

    function desocuparReservaPoema() {
      if (!poemaAtivo) return;
      if (!ehDesktop()) {
        // No celular, todos os fragmentos nas faixas e o fragmento de estado somem em 250 ms e param de nascer
        for (let i = fragmentos.length - 1; i >= 0; i--) {
          apagarFragmentoImediato(fragmentos[i]);
        }
        if (statusFrag && statusFrag.el) {
          const elSt = statusFrag.el;
          elSt.classList.remove('frag--visivel');
          elSt.classList.add('frag--saindo');
          agendarTimeout(() => {
            if (statusFrag && statusFrag.el && statusFrag.el.parentNode) {
              statusFrag.el.parentNode.removeChild(statusFrag.el);
            }
            statusFrag = null;
          }, 250);
        }
        return;
      }

      // No desktop: quem estiver dentro de reservaPoema ou à esquerda da flor é apagado na hora (250 ms)
      const sobreviventes = [];
      for (let i = 0; i < fragmentos.length; i++) {
        const f = fragmentos[i];
        const cf = obterCaixaEfetiva(f);
        if (!cf || violaReservaPoemaOuLado(cf)) {
          apagarFragmentoImediato(f);
        } else {
          sobreviventes.push(f);
        }
      }
      // Mantém no máximo 2 fragmentos de código à direita da flor
      while (sobreviventes.length > 2) {
        const exc = sobreviventes.shift();
        apagarFragmentoImediato(exc);
      }

      if (statusFrag) {
        const cs = obterCaixaEfetiva(statusFrag);
        if (!cs || violaReservaPoemaOuLado(cs)) {
          saltarStatusFrag();
        }
      }
    }

    function cancelarEncerramentoPendente() {
      if (encerramentoAgendado && !encerramentoDisparado) {
        window.clearTimeout(timerEncerramento);
        timerEncerramento = 0;
        encerramentoAgendado = false;
        instanteUltimoCharMs = null;
        relogioUltimoChar = null;
      }
    }

    function dispararEncerramento() {
      if (encerramentoDisparado || destruido) return;
      encerramentoDisparado = true;
      instanteInicioEncerramentoMs = performance.now();
      const est = obterEstatisticasAtuais();
      relogioInicioEncerramento = typeof est.tempo === 'number' ? Math.round(est.tempo * 1000) / 1000 : null;

      if (window.Abertura && typeof window.Abertura.encerrar === 'function') {
        window.Abertura.encerrar({
          fonte: '"JetBrains Mono", monospace',
          reduzido
        }).then(() => {
          if (destruido) return;
          encerramentoConcluido = true;
          window.__encerramentoConcluido = true;
          if (tulipa && typeof tulipa.pausar === 'function') {
            tulipa.pausar();
          }
          pausado = true;
          window.clearTimeout(timerLoop);
          limparTimersPendentes();
          window.clearInterval(timerStatus);
          window.clearInterval(timerTrocaStatus);
          window.clearInterval(timerPoema);
          timerStatus = 0;
          timerTrocaStatus = 0;
          timerPoema = 0;
        }).catch(() => {});
      }
    }

    function aoConcluirPoema() {
      if (!poemaDados.estrofes.length && !poemaCarregado) return;
      if (instanteUltimoCharMs === null) {
        instanteUltimoCharMs = performance.now();
        const est = obterEstatisticasAtuais();
        relogioUltimoChar = typeof est.tempo === 'number' ? Math.round(est.tempo * 1000) / 1000 : null;
      }
      if (encerramentoAgendado || encerramentoDisparado) return;
      encerramentoAgendado = true;
      window.clearTimeout(timerEncerramento);
      timerEncerramento = window.setTimeout(() => {
        dispararEncerramento();
      }, 6000);
    }

    function renderizarPoemaEm(dtSegundos) {
      if (!poemaAtivo || !domPoema || !declaracao) return;

      if (reduzido) {
        if (ultimoEstadoPoema !== 'reduzido') {
          ultimoEstadoPoema = 'reduzido';
          domPoema.hTitulo.textContent = poemaDados.titulo;
          for (let e = 0; e < poemaDados.estrofes.length; e++) {
            const est = poemaDados.estrofes[e];
            const domEst = domPoema.estrofesDom[e];
            if (!domEst) continue;
            for (let v = 0; v < est.length; v++) {
              if (domEst.versosDom[v]) {
                domEst.versosDom[v].textContent = est[v] || '';
              }
            }
          }
          domPoema.vis.removeAttribute('aria-hidden');
        }
        aoConcluirPoema();
        return;
      }

      const dt = Math.max(0, dtSegundos);
      const titulo = poemaDados.titulo;
      const estrofes = poemaDados.estrofes;

      if (ehDesktop()) {
        // Desktop: ~45 car/s, 350 ms fim de verso, 900 ms entre estrofes (1,5 s antes da última)
        const vel = 45;
        const pausaVerso = 0.35;
        const pausaEstrofe = 0.9;
        const pausaAntesUltima = 1.5;

        const durTitulo = titulo.length / vel;
        if (dt < durTitulo) {
          cancelarEncerramentoPendente();
          const n = Math.max(1, Math.floor(dt * vel));
          const chave = `D:T:${n}`;
          if (chave === ultimoEstadoPoema) return;
          ultimoEstadoPoema = chave;
          domPoema.hTitulo.innerHTML = `${escaparHtml(titulo.slice(0, n))}<span class="cursor-bloco"></span>`;
          for (let e = 0; e < domPoema.estrofesDom.length; e++) {
            const versos = estrofes[e] || [];
            for (let v = 0; v < domPoema.estrofesDom[e].versosDom.length; v++) {
              domPoema.estrofesDom[e].versosDom[v].innerHTML = formatarVersoFantasmaHtml(versos[v] || '');
            }
          }
          return;
        }

        let tAcum = durTitulo + (estrofes.length > 0 ? pausaVerso : 0);
        if (dt < tAcum) {
          cancelarEncerramentoPendente();
          const chave = 'D:T:fim';
          if (chave === ultimoEstadoPoema) return;
          ultimoEstadoPoema = chave;
          domPoema.hTitulo.textContent = titulo;
          for (let e = 0; e < domPoema.estrofesDom.length; e++) {
            const versos = estrofes[e] || [];
            for (let v = 0; v < domPoema.estrofesDom[e].versosDom.length; v++) {
              domPoema.estrofesDom[e].versosDom[v].innerHTML = formatarVersoFantasmaHtml(versos[v] || '');
            }
          }
          return;
        }

        for (let e = 0; e < estrofes.length; e++) {
          const versos = estrofes[e];
          for (let v = 0; v < versos.length; v++) {
            const verso = versos[v];
            const durVerso = verso.length / vel;
            const ehFimEstrofe = v === versos.length - 1;
            const pausaFim = ehFimEstrofe
              ? (e < estrofes.length - 1 ? (e === estrofes.length - 2 ? pausaAntesUltima : pausaEstrofe) : 0)
              : pausaVerso;

            if (dt < tAcum + durVerso) {
              cancelarEncerramentoPendente();
              const n = Math.max(1, Math.floor((dt - tAcum) * vel));
              const chave = `D:${e}:${v}:${n}`;
              if (chave === ultimoEstadoPoema) return;
              ultimoEstadoPoema = chave;
              domPoema.hTitulo.textContent = titulo;
              for (let ee = 0; ee < domPoema.estrofesDom.length; ee++) {
                const vs = estrofes[ee] || [];
                for (let vv = 0; vv < domPoema.estrofesDom[ee].versosDom.length; vv++) {
                  const elV = domPoema.estrofesDom[ee].versosDom[vv];
                  if (ee < e || (ee === e && vv < v)) {
                    elV.textContent = vs[vv];
                  } else if (ee === e && vv === v) {
                    elV.innerHTML = formatarVersoParcialHtml(verso, n, 'cursor-bloco');
                  } else {
                    elV.innerHTML = formatarVersoFantasmaHtml(vs[vv] || '');
                  }
                }
              }
              return;
            }

            tAcum += durVerso;

            if (dt < tAcum + pausaFim) {
              cancelarEncerramentoPendente();
              const chave = `D:${e}:${v}:pausa`;
              if (chave === ultimoEstadoPoema) return;
              ultimoEstadoPoema = chave;
              domPoema.hTitulo.textContent = titulo;
              for (let ee = 0; ee < domPoema.estrofesDom.length; ee++) {
                const vs = estrofes[ee] || [];
                for (let vv = 0; vv < domPoema.estrofesDom[ee].versosDom.length; vv++) {
                  const elV = domPoema.estrofesDom[ee].versosDom[vv];
                  if (ee < e || (ee === e && vv < v)) {
                    elV.textContent = vs[vv];
                  } else if (ee === e && vv === v) {
                    elV.innerHTML = formatarVersoParcialHtml(verso, verso.length, 'cursor-bloco cursor-bloco--piscando');
                  } else {
                    elV.innerHTML = formatarVersoFantasmaHtml(vs[vv] || '');
                  }
                }
              }
              return;
            }

            tAcum += pausaFim;
          }
        }

        if (ultimoEstadoPoema !== 'D:completo') {
          ultimoEstadoPoema = 'D:completo';
          domPoema.hTitulo.textContent = titulo;
          for (let ee = 0; ee < domPoema.estrofesDom.length; ee++) {
            const vs = estrofes[ee] || [];
            for (let vv = 0; vv < domPoema.estrofesDom[ee].versosDom.length; vv++) {
              domPoema.estrofesDom[ee].versosDom[vv].textContent = vs[vv] || '';
            }
          }
          domPoema.vis.removeAttribute('aria-hidden');
        }
        aoConcluirPoema();
        return;
      }

      // Celular: "Para Isadora" no topo; estrofes uma por vez embaixo
      const velCel = 45;
      const pausaVersoCel = 0.35;
      const velBackspaceCel = 420;
      const pausaEntreEstrofesCel = 0.2;
      const pausaAntesUltimaCel = 1.5;

      const domEstUnica = domPoema.estrofesDom[0];
      if (!domEstUnica) return;

      const durTitulo = titulo.length / velCel;
      if (dt < durTitulo) {
        cancelarEncerramentoPendente();
        const n = Math.max(1, Math.floor(dt * velCel));
        const chave = `M:T:${n}`;
        if (chave === ultimoEstadoPoema) return;
        ultimoEstadoPoema = chave;
        domPoema.hTitulo.innerHTML = `${escaparHtml(titulo.slice(0, n))}<span class="cursor-bloco"></span>`;
        const primEst = estrofes[0] || [];
        garantirLinhasEstrofeCelular(domEstUnica, primEst.length, domPoema.classesFonteCel[0] || '');
        for (let v = 0; v < primEst.length; v++) {
          domEstUnica.versosDom[v].innerHTML = formatarVersoFantasmaHtml(primEst[v]);
        }
        return;
      }

      let tAcum = durTitulo + (estrofes.length > 0 ? pausaVersoCel : 0);
      if (dt < tAcum) {
        cancelarEncerramentoPendente();
        const chave = 'M:T:fim';
        if (chave === ultimoEstadoPoema) return;
        ultimoEstadoPoema = chave;
        domPoema.hTitulo.textContent = titulo;
        const primEst = estrofes[0] || [];
        garantirLinhasEstrofeCelular(domEstUnica, primEst.length, domPoema.classesFonteCel[0] || '');
        for (let v = 0; v < primEst.length; v++) {
          domEstUnica.versosDom[v].innerHTML = formatarVersoFantasmaHtml(primEst[v]);
        }
        return;
      }

      if (!estrofes.length) {
        domPoema.hTitulo.textContent = titulo;
        aoConcluirPoema();
        return;
      }

      for (let e = 0; e < estrofes.length; e++) {
        const versos = estrofes[e];
        const ehUltima = e === estrofes.length - 1;
        const clsFonte = (domPoema.classesFonteCel && domPoema.classesFonteCel[e]) || '';

        for (let v = 0; v < versos.length; v++) {
          const verso = versos[v];
          const durVerso = verso.length / velCel;
          const pausaFim = v < versos.length - 1 ? pausaVersoCel : 0;

          if (dt < tAcum + durVerso) {
            cancelarEncerramentoPendente();
            const n = Math.max(1, Math.floor((dt - tAcum) * velCel));
            const chave = `M:${e}:${v}:${n}`;
            if (chave === ultimoEstadoPoema) return;
            ultimoEstadoPoema = chave;
            domPoema.hTitulo.textContent = titulo;
            garantirLinhasEstrofeCelular(domEstUnica, versos.length, clsFonte);
            for (let vv = 0; vv < versos.length; vv++) {
              const elV = domEstUnica.versosDom[vv];
              if (vv < v) {
                elV.textContent = versos[vv];
              } else if (vv === v) {
                elV.innerHTML = formatarVersoParcialHtml(verso, n, 'cursor-bloco');
              } else {
                elV.innerHTML = formatarVersoFantasmaHtml(versos[vv]);
              }
            }
            return;
          }

          tAcum += durVerso;

          if (dt < tAcum + pausaFim) {
            cancelarEncerramentoPendente();
            const chave = `M:${e}:${v}:pausa`;
            if (chave === ultimoEstadoPoema) return;
            ultimoEstadoPoema = chave;
            domPoema.hTitulo.textContent = titulo;
            garantirLinhasEstrofeCelular(domEstUnica, versos.length, clsFonte);
            for (let vv = 0; vv < versos.length; vv++) {
              const elV = domEstUnica.versosDom[vv];
              if (vv < v) {
                elV.textContent = versos[vv];
              } else if (vv === v) {
                elV.innerHTML = formatarVersoParcialHtml(verso, verso.length, 'cursor-bloco cursor-bloco--piscando');
              } else {
                elV.innerHTML = formatarVersoFantasmaHtml(versos[vv]);
              }
            }
            return;
          }

          tAcum += pausaFim;
        }

        if (ehUltima) {
          if (ultimoEstadoPoema !== 'M:completo') {
            ultimoEstadoPoema = 'M:completo';
            domPoema.hTitulo.textContent = titulo;
            garantirLinhasEstrofeCelular(domEstUnica, versos.length, clsFonte);
            for (let vv = 0; vv < versos.length; vv++) {
              domEstUnica.versosDom[vv].textContent = versos[vv] || '';
            }
            domPoema.vis.removeAttribute('aria-hidden');
          }
          aoConcluirPoema();
          return;
        }

        // Estrofe de 1 verso ("Notou alguma semelhança?") fica parada 3 s em vez de 5,5 s
        const holdEstrofeCel = versos.length === 1 ? 3.0 : 5.5;
        if (dt < tAcum + holdEstrofeCel) {
          cancelarEncerramentoPendente();
          const chave = `M:${e}:hold`;
          if (chave === ultimoEstadoPoema) return;
          ultimoEstadoPoema = chave;
          domPoema.hTitulo.textContent = titulo;
          garantirLinhasEstrofeCelular(domEstUnica, versos.length, clsFonte);
          for (let vv = 0; vv < versos.length; vv++) {
            const elV = domEstUnica.versosDom[vv];
            if (vv < versos.length - 1) {
              elV.textContent = versos[vv];
            } else {
              elV.innerHTML = formatarVersoParcialHtml(versos[vv], versos[vv].length, 'cursor-bloco cursor-bloco--piscando');
            }
          }
          return;
        }

        tAcum += holdEstrofeCel;

        // Apagada como backspace de trás para frente
        const totalCharsEst = versos.reduce((acc, s) => acc + s.length, 0);
        const durApaga = totalCharsEst / velBackspaceCel;
        if (dt < tAcum + durApaga) {
          cancelarEncerramentoPendente();
          let apagarRestante = Math.floor((dt - tAcum) * velBackspaceCel);
          let versoAtivo = versos.length - 1;
          let colAtiva = versos[versoAtivo].length;
          for (let vv = versos.length - 1; vv >= 0; vv--) {
            if (apagarRestante >= versos[vv].length) {
              apagarRestante -= versos[vv].length;
              versoAtivo = vv - 1;
              colAtiva = versoAtivo >= 0 ? versos[versoAtivo].length : 0;
            } else {
              versoAtivo = vv;
              colAtiva = versos[vv].length - apagarRestante;
              break;
            }
          }

          const chave = `M:${e}:del:${versoAtivo}:${colAtiva}`;
          if (chave === ultimoEstadoPoema) return;
          ultimoEstadoPoema = chave;
          domPoema.hTitulo.textContent = titulo;
          garantirLinhasEstrofeCelular(domEstUnica, versos.length, clsFonte);
          for (let vv = 0; vv < versos.length; vv++) {
            const elV = domEstUnica.versosDom[vv];
            if (vv < versoAtivo) {
              elV.textContent = versos[vv];
            } else if (vv === versoAtivo) {
              elV.innerHTML = formatarVersoParcialHtml(versos[vv], colAtiva, 'cursor-bloco');
            } else {
              elV.innerHTML = formatarVersoFantasmaHtml(versos[vv]);
            }
          }
          return;
        }

        tAcum += durApaga;

        // Pausa antes da próxima estrofe (1,5 s antes da última estrofe)
        const pausaPosApaga = e === estrofes.length - 2 ? pausaAntesUltimaCel : pausaEntreEstrofesCel;
        if (dt < tAcum + pausaPosApaga) {
          cancelarEncerramentoPendente();
          const chave = `M:${e}:entre`;
          if (chave === ultimoEstadoPoema) return;
          ultimoEstadoPoema = chave;
          domPoema.hTitulo.textContent = titulo;
          garantirLinhasEstrofeCelular(domEstUnica, 1, '');
          domEstUnica.versosDom[0].textContent = '';
          return;
        }

        tAcum += pausaPosApaga;
      }
    }

    function obterDtPoemaAtual() {
      if (reduzido) return 999;
      if (inicioPoemaPerf !== null && !emSaltoQa) {
        return Math.max(0, (performance.now() - inicioPoemaPerf) / 1000);
      }
      const est = obterEstatisticasAtuais();
      if (typeof est.tempo === 'number' && inicioPoemaRelogio !== null && est.tempo >= inicioPoemaRelogio) {
        return est.tempo - inicioPoemaRelogio;
      }
      return 0;
    }

    function iniciarPoema(tempoRelogioBase = null) {
      if (destruido || !declaracao) return;
      const est = obterEstatisticasAtuais();
      const T = (window.Tulipa && window.Tulipa.LINHA_DO_TEMPO) || {};
      const tAb0 = Array.isArray(T.abertura) ? T.abertura[0] : 6.9;
      if (!poemaAtivo) {
        poemaAtivo = true;
        instanteAoAbrirMs = performance.now();
        inicioPoemaRelogio = typeof tempoRelogioBase === 'number'
          ? tempoRelogioBase
          : Math.min(typeof est.tempo === 'number' && est.tempo > 0 ? est.tempo : tAb0, tAb0);
        inicioPoemaPerf = instanteAoAbrirMs - Math.max(0, ((est.tempo || tAb0) - inicioPoemaRelogio) * 1000);
        if (linhas.length) {
          prepararCacheLinhas();
        }
        construirDomPoema();
        desocuparReservaPoema();
      } else if (typeof tempoRelogioBase === 'number') {
        inicioPoemaRelogio = tempoRelogioBase;
        inicioPoemaPerf = performance.now() - Math.max(0, ((est.tempo || tAb0) - inicioPoemaRelogio) * 1000);
      }

      renderizarPoemaEm(obterDtPoemaAtual());
      if (instantePrimeiroCharMs === null && domPoema && domPoema.hTitulo && domPoema.hTitulo.textContent.length > 0) {
        instantePrimeiroCharMs = performance.now();
      }

      if (!timerPoema && !reduzido) {
        timerPoema = window.setInterval(() => {
          if (!pausado && !destruido && poemaAtivo) {
            renderizarPoemaEm(obterDtPoemaAtual());
          }
        }, 33);
      }
    }

    function extrairProximoBloco(forcarLinhaInicial = null, usarPulso = false) {
      if (!cacheLinhas.length) return null;
      if (typeof forcarLinhaInicial === 'number') {
        cursorLinha = ((forcarLinhaInicial % cacheLinhas.length) + cacheLinhas.length) % cacheLinhas.length;
      }

      const maxLinhasFonte = ehDesktop()
        ? 3 + Math.floor(aleatorio() * 3)
        : 2;
      const maxLinhasVisuais = ehDesktop() ? 5 : 2;
      const maxCols = calcularMaxCols();

      const selecionadas = [];
      let tentativas = 0;
      let aplicarPulsoPrimeira = Boolean(usarPulso || pulsoFasePendente);

      while (selecionadas.length < maxLinhasFonte && tentativas < cacheLinhas.length) {
        const info = cacheLinhas[cursorLinha];
        const bruta = linhas[cursorLinha] || '';
        cursorLinha = (cursorLinha + 1) % cacheLinhas.length;
        tentativas++;

        if (!info || info.vazio) continue;
        selecionadas.push({
          numero: info.numero,
          bruta,
          ehMarcador: info.ehMarcador
        });
      }

      if (!selecionadas.length) return null;

      let minRecuo = Infinity;
      for (let i = 0; i < selecionadas.length; i++) {
        minRecuo = Math.min(minRecuo, recuoInicial(selecionadas[i].bruta));
      }
      if (!Number.isFinite(minRecuo)) minRecuo = 0;

      const rows = [];
      for (let i = 0; i < selecionadas.length; i++) {
        if (rows.length >= maxLinhasVisuais) break;
        const item = selecionadas[i];
        let semRecuoComum = aplicarDedent(item.bruta, minRecuo);
        const recExtra = recuoInicial(semRecuoComum);
        if (recExtra > 4) {
          semRecuoComum = '    ' + semRecuoComum.slice(recExtra);
        }
        const segs = quebrarEmSegmentos(semRecuoComum, maxCols);
        for (let s = 0; s < segs.length; s++) {
          if (rows.length >= maxLinhasVisuais && s > 0) break;
          const seg = segs[s];
          rows.push({
            numTexto: s === 0 ? String(item.numero) : '',
            textoSeg: seg.textoSeg,
            comentario: seg.comentario,
            htmlCompleto: seg.htmlCompleto,
            ehPulso: aplicarPulsoPrimeira && rows.length === 0 && item.ehMarcador
          });
        }
        if (aplicarPulsoPrimeira && rows.length > 0) {
          pulsoFasePendente = false;
          aplicarPulsoPrimeira = false;
        }
      }

      return rows.length >= 2 ? rows : null;
    }

    function criarLinhaDom(rowSpec, htmlConteudo, comPulso) {
      const div = document.createElement('div');
      div.className = comPulso ? 'linha linha--pulso-fase' : 'linha';

      const num = document.createElement('span');
      num.className = 'linha__num';
      num.textContent = rowSpec.numTexto;

      const cod = document.createElement('span');
      cod.className = 'linha__cod';
      cod.innerHTML = htmlConteudo;

      div.appendChild(num);
      div.appendChild(cod);
      return { div, cod };
    }

    function nascerFragmento(opcoesNasc = {}) {
      if (destruido || !camada || !cacheLinhas.length) return false;
      if (poemaAtivo && !ehDesktop()) return false;

      const { max } = limitesQuantidade();
      const vivosAtuais = fragmentos.filter((f) => f.estado !== 'saindo').length;
      if (!opcoesNasc.ignorarLimite && (vivosAtuais >= max || camada.children.length >= MAX_NOS_DOM)) {
        return false;
      }

      const cursorBackup = cursorLinha;
      const pulsoBackup = pulsoFasePendente;
      const rows = extrairProximoBloco(opcoesNasc.linhaInicial, opcoesNasc.pulso);
      if (!rows) return false;

      const opVar = 1 + Math.floor(aleatorio() * 4);
      const derivaOpcoes = [
        { cls: 'frag--deriva-9', px: 9 },
        { cls: 'frag--deriva-11', px: 11 },
        { cls: 'frag--deriva-13', px: 13 }
      ];
      const deriva = reduzido
        ? { cls: '', px: 0 }
        : derivaOpcoes[Math.floor(aleatorio() * derivaOpcoes.length)];

      const el = document.createElement('div');
      el.className = `frag frag--op-${opVar}${deriva.cls ? ' ' + deriva.cls : ''}`;

      const corpo = document.createElement('div');
      corpo.className = 'frag__corpo';
      el.appendChild(corpo);

      let maiorLinha = 0;
      for (let i = 0; i < rows.length; i++) {
        maiorLinha = Math.max(maiorLinha, rows[i].textoSeg.length);
        const { div } = criarLinhaDom(rows[i], rows[i].htmlCompleto, false);
        corpo.appendChild(div);
      }
      camada.appendChild(el);

      const cwEst = ehDesktop() ? 7.8 : 7.1;
      const lhEst = ehDesktop() ? 18 : 16;
      const largEst = Math.ceil(38 + maiorLinha * cwEst + 16);
      const altEst = Math.ceil(rows.length * lhEst + 10);

      const larg = Math.max(largEst, Math.ceil(el.offsetWidth || 220) + 8);
      const alt = Math.max(altEst, Math.ceil(el.offsetHeight || 48) + 4);
      const escolha = escolherPosicaoLivre(larg, alt, deriva.px, -1);

      if (!escolha) {
        camada.removeChild(el);
        cursorLinha = cursorBackup;
        pulsoFasePendente = pulsoBackup;
        return false;
      }

      aplicarClassesPosicao(el, escolha.px, escolha.py);

      const frag = {
        id: idSeq++,
        el,
        corpo,
        rows,
        domRows: [],
        estado: opcoesNasc.estadoInicial || 'digitando',
        rowIdx: 0,
        colIdx: 0,
        holdAte: 0,
        caixa: escolha.caixa,
        driftPx: deriva.px
      };

      corpo.textContent = '';

      if (frag.estado === 'parado' || reduzido) {
        for (let i = 0; i < rows.length; i++) {
          const ehUlt = i === rows.length - 1;
          const html = ehUlt && !reduzido
            ? `${rows[i].htmlCompleto}<span class="cursor-bloco cursor-bloco--piscando"></span>`
            : rows[i].htmlCompleto;
          const item = criarLinhaDom(rows[i], html, false);
          corpo.appendChild(item.div);
          frag.domRows.push(item);
        }
        frag.rowIdx = rows.length - 1;
        frag.colIdx = rows[frag.rowIdx].textoSeg.length;
        frag.holdAte = performance.now() + 1200 + aleatorio() * 800;
      } else {
        const prim = rows[0];
        const minVis = Math.min(prim.textoSeg.length, recuoInicial(prim.textoSeg) + 3);
        const colIni = opcoesNasc.progressoInicial
          ? Math.max(minVis, Math.floor(prim.textoSeg.length * opcoesNasc.progressoInicial))
          : minVis;
        frag.rowIdx = 0;
        frag.colIdx = colIni;
        const parcial = prim.textoSeg.slice(0, frag.colIdx);
        const item = criarLinhaDom(
          prim,
          `${realcarLinha(parcial, prim.comentario)}<span class="cursor-bloco"></span>`,
          prim.ehPulso
        );
        corpo.appendChild(item.div);
        frag.domRows.push(item);

        if (prim.ehPulso) {
          agendarTimeout(() => {
            item.div.classList.remove('linha--pulso-fase');
          }, 180);
        }
      }

      fragmentos.push(frag);

      if (opcoesNasc.imediato || reduzido) {
        el.classList.add('frag--visivel');
      } else {
        window.requestAnimationFrame(() => {
          if (!destruido && el.parentNode) {
            el.classList.add('frag--visivel');
          }
        });
      }

      return true;
    }

    function removerFragmento(frag) {
      const idx = fragmentos.indexOf(frag);
      if (idx >= 0) {
        fragmentos.splice(idx, 1);
      }
      if (frag.el && frag.el.parentNode) {
        frag.el.parentNode.removeChild(frag.el);
      }
    }

    function agendarReposicaoFragmentos(atrasoForcado = null) {
      if (destruido || pausado || reduzido || !cacheLinhas.length) return;
      if (poemaAtivo && !ehDesktop()) return;

      const { min, max } = limitesQuantidade();
      const vivos = fragmentos.filter((f) => f.estado !== 'saindo').length;
      if (vivos >= max) return;

      const atraso = typeof atrasoForcado === 'number'
        ? atrasoForcado
        : (vivos < min ? 80 : Math.round(300 + aleatorio() * 600));

      agendarTimeout(() => {
        if (destruido || pausado || reduzido) return;
        if (poemaAtivo && !ehDesktop()) return;
        const { min: minAgora, max: maxAgora } = limitesQuantidade();
        const agoraVivos = fragmentos.filter((f) => f.estado !== 'saindo').length;
        if (agoraVivos < maxAgora) {
          const nasceu = nascerFragmento();
          if (!nasceu) {
            agendarReposicaoFragmentos(260);
          } else if (fragmentos.filter((f) => f.estado !== 'saindo').length < minAgora) {
            agendarReposicaoFragmentos(220);
          }
        }
      }, atraso);
    }

    function passoAnimacaoFragmentos() {
      if (destruido || pausado || reduzido) return;

      const agora = performance.now();
      const intervaloMs = 40;
      const charsDigitaBase = 10;
      const charsApagaBase = 16;

      for (let i = fragmentos.length - 1; i >= 0; i--) {
        const f = fragmentos[i];

        if (f.estado === 'digitando') {
          let orc = charsDigitaBase + ((f.id + f.colIdx) % 3);
          while (orc > 0 && f.estado === 'digitando') {
            const rowSpec = f.rows[f.rowIdx];
            const domRow = f.domRows[f.rowIdx];
            const falta = rowSpec.textoSeg.length - f.colIdx;

            if (falta <= orc) {
              orc -= Math.max(1, falta);
              f.colIdx = rowSpec.textoSeg.length;

              if (f.rowIdx + 1 < f.rows.length) {
                domRow.cod.innerHTML = rowSpec.htmlCompleto;
                f.rowIdx += 1;
                const proxSpec = f.rows[f.rowIdx];
                f.colIdx = Math.min(proxSpec.textoSeg.length, recuoInicial(proxSpec.textoSeg) + 3);
                const parcial = proxSpec.textoSeg.slice(0, f.colIdx);
                const novoItem = criarLinhaDom(
                  proxSpec,
                  `${realcarLinha(parcial, proxSpec.comentario)}<span class="cursor-bloco"></span>`,
                  false
                );
                f.corpo.appendChild(novoItem.div);
                f.domRows.push(novoItem);
              } else {
                domRow.cod.innerHTML = `${rowSpec.htmlCompleto}<span class="cursor-bloco cursor-bloco--piscando"></span>`;
                f.estado = 'parado';
                f.holdAte = agora + 1200 + aleatorio() * 800;
              }
            } else {
              f.colIdx += orc;
              orc = 0;
              const parcial = rowSpec.textoSeg.slice(0, f.colIdx);
              domRow.cod.innerHTML = `${realcarLinha(parcial, rowSpec.comentario)}<span class="cursor-bloco"></span>`;
            }
          }
        } else if (f.estado === 'parado') {
          if (agora >= f.holdAte) {
            f.estado = 'apagando';
          }
        } else if (f.estado === 'apagando') {
          let orc = charsApagaBase + ((f.id + f.colIdx) % 3);
          while (orc > 0 && f.estado === 'apagando') {
            const rowSpec = f.rows[f.rowIdx];
            const domRow = f.domRows[f.rowIdx];
            const pisoVisivel = recuoInicial(rowSpec.textoSeg) + 1;

            if (f.colIdx - orc <= pisoVisivel) {
              orc -= Math.max(1, f.colIdx - pisoVisivel);
              if (f.rowIdx > 0) {
                if (domRow.div.parentNode) {
                  domRow.div.parentNode.removeChild(domRow.div);
                }
                f.domRows.pop();
                f.rowIdx -= 1;
                const antSpec = f.rows[f.rowIdx];
                f.colIdx = antSpec.textoSeg.length;
                const antDom = f.domRows[f.rowIdx];
                antDom.cod.innerHTML = `${antSpec.htmlCompleto}<span class="cursor-bloco"></span>`;
              } else {
                f.colIdx = Math.min(rowSpec.textoSeg.length, pisoVisivel);
                f.estado = 'saindo';
                f.el.classList.remove('frag--visivel');
                f.el.classList.add('frag--saindo');
                agendarTimeout(() => {
                  removerFragmento(f);
                  agendarReposicaoFragmentos();
                }, 250);
              }
            } else {
              f.colIdx -= orc;
              orc = 0;
              const parcial = rowSpec.textoSeg.slice(0, f.colIdx);
              domRow.cod.innerHTML = `${realcarLinha(parcial, rowSpec.comentario)}<span class="cursor-bloco"></span>`;
            }
          }
        }
      }

      if (!poemaAtivo || ehDesktop()) {
        const { min } = limitesQuantidade();
        const vivos = fragmentos.filter((f) => f.estado !== 'saindo').length;
        if (vivos < min) {
          agendarReposicaoFragmentos(60);
        }
      }

      timerLoop = window.setTimeout(passoAnimacaoFragmentos, intervaloMs);
    }

    function limparFragmentosCodigo() {
      while (fragmentos.length) {
        removerFragmento(fragmentos[fragmentos.length - 1]);
      }
    }

    function mostrarEstaticoReduzido() {
      if (!cacheLinhas.length) return;
      window.clearTimeout(timerLoop);
      limparTimersPendentes();
      limparFragmentosCodigo();

      iniciarPoema(0);

      if (ehDesktop()) {
        criarFragStatus();
        posicionarStatusFrag(true);
        const tr = trechos.aberta || { inicio: 0 };
        cursorLinha = tr.inicio;
        pulsoFasePendente = false;
        for (let i = 0; i < 2; i++) {
          nascerFragmento({ estadoInicial: 'parado', imediato: true, ignorarLimite: true });
        }
      }
      faseAtual = 'aberta';
      atualizarBarraStatus();
    }

    function popularCenaParaFase(chaveFase, imediato = false) {
      if (!cacheLinhas.length) return;
      window.clearTimeout(timerLoop);
      limparTimersPendentes();
      limparFragmentosCodigo();

      if (!poemaAtivo || ehDesktop()) {
        criarFragStatus();
        posicionarStatusFrag(imediato);
      }

      const tr = trechos[chaveFase] || { inicio: 0 };
      faseAtual = chaveFase;
      cursorLinha = tr.inicio;
      pulsoFasePendente = true;

      if (!poemaAtivo || ehDesktop()) {
        const { min, max } = limitesQuantidade();
        nascerFragmento({ pulso: true, imediato, progressoInicial: imediato ? 0.55 : 0.15 });
        if (max >= 2) {
          nascerFragmento({ estadoInicial: 'parado', imediato: true });
        }
        if (min >= 3) {
          nascerFragmento({ imediato, progressoInicial: 0.4 });
        }
        if (max >= 4) {
          agendarReposicaoFragmentos(360);
        }
      }

      if (!pausado && !reduzido) {
        timerLoop = window.setTimeout(passoAnimacaoFragmentos, 40);
      }
    }

    function irParaFase(nomeFase, opcoesSalto = {}) {
      if (!nomeFase) return;
      const chave = String(nomeFase).toLowerCase();
      if (!cacheLinhas.length) {
        faseAtual = chave;
        return;
      }
      if (reduzido) {
        mostrarEstaticoReduzido();
        return;
      }

      if (opcoesSalto.forcar || (fragmentos.length === 0 && (!poemaAtivo || ehDesktop()))) {
        popularCenaParaFase(chave, Boolean(opcoesSalto.forcar));
        return;
      }

      if (chave === faseAtual) return;
      faseAtual = chave;

      if (poemaAtivo && !ehDesktop()) return;

      const tr = trechos[chave] || { inicio: 0 };
      cursorLinha = tr.inicio;
      pulsoFasePendente = true;

      const { max } = limitesQuantidade();
      const vivos = fragmentos.filter((f) => f.estado !== 'saindo');
      if (vivos.length < max) {
        nascerFragmento({ pulso: true });
      } else if (max > 0) {
        const parado = vivos.find((f) => f.estado === 'parado');
        if (parado) {
          parado.holdAte = 0;
        }
        agendarTimeout(() => {
          if (!destruido && !pausado && !reduzido) {
            nascerFragmento({ pulso: true });
          }
        }, 160);
      }
    }

    function obterEstatisticasAtuais() {
      if (tulipa && tulipa.estatisticas && typeof tulipa.estatisticas === 'object') {
        return tulipa.estatisticas;
      }
      return estatisticasFallback(tulipa, reduzido);
    }

    function atualizarBarraStatus() {
      if (destruido) return;
      const est = obterEstatisticasAtuais();
      const faseEst = est.fase ? String(est.fase).toLowerCase() : (faseAtual || 'ceu');
      const tempoEst = typeof est.tempo === 'number' ? est.tempo : 0;

      const T = (window.Tulipa && window.Tulipa.LINHA_DO_TEMPO) || {};
      const tAb0 = Array.isArray(T.abertura) ? T.abertura[0] : 6.9;
      if ((reduzido || faseEst === 'abertura' || faseEst === 'aberta' || tempoEst >= tAb0) && !poemaAtivo) {
        iniciarPoema(tAb0);
      }

      if (!statusFrag && camada && (!poemaAtivo || ehDesktop())) {
        criarFragStatus();
      }

      const saltoTempo = Math.abs(tempoEst - ultimoTempoConhecido) > 0.85;
      ultimoTempoConhecido = tempoEst;

      if (!reduzido && cacheLinhas.length) {
        if (saltoTempo) {
          irParaFase(faseEst, { forcar: true });
          if (poemaAtivo) {
            renderizarPoemaEm(obterDtPoemaAtual());
          }
        } else if (faseEst && faseEst !== faseAtual) {
          irParaFase(faseEst);
        }
      }

      if (stAbertura) stAbertura.textContent = formatarAbertura(reduzido ? 1 : est.abertura);
      if (stBalanco) stBalanco.textContent = formatarBalanco(reduzido ? 0 : est.balanco);
      if (stLetras) stLetras.textContent = formatarLetras(est.letras);
      if (stEstado) stEstado.textContent = (reduzido || faseEst === 'aberta') ? 'aberta' : 'executando';
      if (stFps) {
        const fpsVal = reduzido ? 30 : Math.round(Number(est.fps) || 30);
        stFps.textContent = String(fpsVal).padStart(2, '0');
      }
      if (stLog) {
        stLog.textContent = formatarLogFase(reduzido ? 'aberta' : faseEst, est);
      }
    }

    function conectarTulipa(novaTulipa, novoReduzido) {
      tulipa = novaTulipa;
      reduzido = Boolean(novoReduzido);
      ultimoTempoConhecido = 0;

      if (tulipa && typeof tulipa.aoFase === 'function') {
        tulipa.aoFase((nome) => {
          if (emSaltoQa) return;
          const chave = String(nome || '').toLowerCase();
          if ((chave === 'abertura' || chave === 'aberta') && !poemaAtivo) {
            iniciarPoema();
          }
          irParaFase(nome);
          atualizarBarraStatus();
        });
      }

      if (tulipa && typeof tulipa.desenharEm === 'function' && !tulipa.__painelEnvolvido) {
        const originalDesenharEm = tulipa.desenharEm.bind(tulipa);
        tulipa.desenharEm = function (t, dt) {
          emSaltoQa = true;
          const ret = originalDesenharEm(t, dt);
          emSaltoQa = false;
          ultimoTempoConhecido = -999;
          const T = (window.Tulipa && window.Tulipa.LINHA_DO_TEMPO) || {};
          const tAb0 = Array.isArray(T.abertura) ? T.abertura[0] : 6.9;
          if (t >= tAb0) {
            iniciarPoema(tAb0);
            renderizarPoemaEm(t - tAb0);
          } else if (poemaAtivo && !reduzido) {
            poemaAtivo = false;
            reservasPoema = [];
            if (declaracao) {
              declaracao.hidden = true;
              declaracao.textContent = '';
            }
            domPoema = null;
          }
          atualizarBarraStatus();
          return ret;
        };
        tulipa.__painelEnvolvido = true;
      }

      if (cacheLinhas.length) {
        if (reduzido) {
          mostrarEstaticoReduzido();
        } else {
          const est = obterEstatisticasAtuais();
          irParaFase(est.fase || 'ceu', { forcar: true });
        }
      }
      atualizarBarraStatus();
    }

    criarFragStatus();
    if (tulipa) {
      conectarTulipa(tulipa, reduzido);
    }

    fetch('poema.txt', { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((textoPoema) => {
        if (destruido) return;
        poemaCarregado = true;
        if (!textoPoema) return;
        poemaDados = parsearPoema(textoPoema);
        if (poemaAtivo) {
          construirDomPoema();
          desocuparReservaPoema();
          renderizarPoemaEm(obterDtPoemaAtual());
        }
      })
      .catch(() => {
        poemaCarregado = true;
      });

    fetch('tulipa.js', { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((codigoFonte) => {
        if (destruido || !codigoFonte) return;
        linhas = codigoFonte.replace(/\r\n/g, '\n').split('\n');
        if (linhas.length && linhas[linhas.length - 1] === '') {
          linhas.pop();
        }
        trechos = mapearTrechosDoCodigo(linhas);
        prepararCacheLinhas();

        if (reduzido) {
          mostrarEstaticoReduzido();
        } else {
          const est = obterEstatisticasAtuais();
          popularCenaParaFase(est.fase || 'ceu', false);
        }
        atualizarBarraStatus();
      })
      .catch(() => {});

    timerStatus = window.setInterval(() => {
      if (!pausado && !reduzido) {
        atualizarBarraStatus();
      }
    }, 100);

    timerTrocaStatus = window.setInterval(() => {
      if (!pausado && !reduzido) {
        saltarStatusFrag();
      }
    }, 5800);

    return {
      conectarTulipa,
      irParaFase,
      atualizarBarraStatus,
      iniciarPoema,
      get reservaPoema() {
        return reservasPoema;
      },
      get temposPoema() {
        return {
          aoAbrirMs: instanteAoAbrirMs,
          primeiroCharMs: instantePrimeiroCharMs,
          deltaMs: (instanteAoAbrirMs !== null && instantePrimeiroCharMs !== null)
            ? Math.round((instantePrimeiroCharMs - instanteAoAbrirMs) * 100) / 100
            : null,
          aoAbrirRelogio: inicioPoemaRelogio,
          ultimoCharMs: instanteUltimoCharMs,
          ultimoCharRelogio: relogioUltimoChar,
          inicioEncerramentoMs: instanteInicioEncerramentoMs,
          inicioEncerramentoRelogio: relogioInicioEncerramento,
          deltaEncerramentoMs: (instanteUltimoCharMs !== null && instanteInicioEncerramentoMs !== null)
            ? Math.round((instanteInicioEncerramentoMs - instanteUltimoCharMs) * 100) / 100
            : null,
          deltaEncerramentoS: (instanteUltimoCharMs !== null && instanteInicioEncerramentoMs !== null)
            ? Math.round(((instanteInicioEncerramentoMs - instanteUltimoCharMs) / 1000) * 1000) / 1000
            : null,
          encerramentoDisparado,
          encerramentoConcluido
        };
      },
      pausar() {
        pausado = true;
        window.clearTimeout(timerLoop);
        limparTimersPendentes();
      },
      retomar() {
        if (!pausado || encerramentoConcluido) return;
        pausado = false;
        if (!reduzido && cacheLinhas.length) {
          window.clearTimeout(timerLoop);
          timerLoop = window.setTimeout(passoAnimacaoFragmentos, 40);
        }
      },
      redimensionar() {
        if (!cacheLinhas.length) return;
        prepararCacheLinhas();
        if (poemaAtivo) {
          construirDomPoema();
          desocuparReservaPoema();
          renderizarPoemaEm(obterDtPoemaAtual());
        }
        if (encerramentoConcluido) return;
        if (reduzido) {
          mostrarEstaticoReduzido();
        } else if (!poemaAtivo || ehDesktop()) {
          const est = obterEstatisticasAtuais();
          popularCenaParaFase(est.fase || faseAtual || 'ceu', true);
        }
      },
      destruir() {
        destruido = true;
        window.clearTimeout(timerLoop);
        window.clearTimeout(timerEncerramento);
        window.clearInterval(timerStatus);
        window.clearInterval(timerTrocaStatus);
        window.clearInterval(timerPoema);
        limparTimersPendentes();
        limparFragmentosCodigo();
        if (statusFrag && statusFrag.el && statusFrag.el.parentNode) {
          statusFrag.el.parentNode.removeChild(statusFrag.el);
        }
        statusFrag = null;
      }
    };
  }

  window.PainelCodigo = { criar };
})();
