/*
 * abertura.js — cartões de título do site, no estilo das letras da flor.
 * Dono: Hermes. Sem dependências. Expõe window.Abertura.
 *
 *  - Abertura (4 s, antes da flor): "Por Pedro Miguel" / "05/11/2026". Entra, fica e sai.
 *  - Encerramento (depois do poema): "Do Lírio para a Tulipa" / "Torço para uma futura vida".
 *    O preto cobre a tela devagar, o texto entra do mesmo jeito e **fica** (é o fim).
 *    Um lírio de letras nasce à esquerda e uma tulipa à direita (tulipa.js, mais rápido),
 *    vistos de cima e enquadrados só na flor, girando devagar (pedido do Pedro).
 *    No celular as duas flores ficam lado a lado em cima e o texto embaixo.
 *
 * Estilo: as letras nascem como símbolos de código que trocam até assentar (a mesma
 * "decodificação" da flor), a linha de baixo é digitada com o cursor em bloco rosa e,
 * na abertura, tudo volta a ser código e se apaga para a flor começar no preto.
 *
 * Uso:  await Abertura.tocar({ fonte, reduzido });        // resolve aos 4 s, camada removida
 *       await Abertura.encerrar({ fonte, reduzido });     // resolve quando o texto assentou; camada fica
 * QA:   Abertura.montar({ ...opcoes, modo: 'encerramento' }).desenharEm(t)
 */
(function () {
  'use strict';

  const DURACAO = 4.0;
  const TEXTOS = {
    abertura: { titulo: 'Por Pedro Miguel', sub: '05/11/2026' },
    encerramento: { titulo: 'Do Lírio para a Tulipa', linhas: ['Do Lírio', 'para a Tulipa'], sub: 'Torço para uma futura vida' }
  };
  const CODIGO = '01{}[]<>()/=+;*#&%$!?';
  const COR_TEXTO = '#f2ebe6', COR_CODIGO = '#e0457b', COR_SUB = '#9a948f';

  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const hash = (i, k) => {
    let h = (i * 374761393 + k * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const simbolo = (i, t) => CODIGO[Math.floor(hash(i, Math.floor(t * 30)) * CODIGO.length)];

  // ——— Comandos flutuando nos cartões (pedido do Pedro: "Adicione os comandos na primeira parte
  // e na parte final"). Usa as mesmas classes de estilo dos fragmentos do site (.frag, .linha, .tk-*).
  // Abertura: digita o próprio código deste arquivo (a decodificação do nome).
  // Encerramento: digita o código do lírio e da tulipa (tulipa.js).
  const TOKEN_RE = /(\/\/.*$|\/\*.*?\*\/)|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|\b(function|return|const|let|if|else|for|new|typeof|true|false|null|this|Math|window|document)\b|\b(\d+(?:\.\d+)?)\b/g;
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function realce(txt) {
    let out = '', ult = 0, m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(txt)) !== null) {
      if (m.index > ult) out += esc(txt.slice(ult, m.index));
      const cls = m[1] !== undefined ? 'tk-cm' : m[2] !== undefined ? 'tk-st' : m[3] !== undefined ? 'tk-kw' : 'tk-nu';
      out += `<span class="${cls}">${esc(m[0])}</span>`;
      ult = TOKEN_RE.lastIndex;
      if (m[0] === '') TOKEN_RE.lastIndex++;
    }
    return out + esc(txt.slice(ult));
  }
  // os arquivos de código ficam ao lado deste script (vale também para páginas de teste em subpastas)
  const BASE = document.currentScript && document.currentScript.src ? new URL('.', document.currentScript.src) : new URL('.', location.href);
  const cacheCodigo = {};
  function carregarCodigo(arquivo) {
    if (!cacheCodigo[arquivo]) {
      cacheCodigo[arquivo] = fetch(new URL(arquivo, BASE), { cache: 'force-cache' }).then(r => (r.ok ? r.text() : ''))
        .then(txt => txt.split('\n').map((l, i) => ({ n: i + 1, t: l.replace(/\t/g, '  ').replace(/\s+$/, '') })))
        .catch(() => []);
    }
    return cacheCodigo[arquivo];
  }
  // trecho do arquivo entre duas âncoras de texto (linhas não vazias)
  function trecho(linhas, de, ate) {
    const i0 = Math.max(0, linhas.findIndex(l => l.t.includes(de)));
    let i1 = ate ? linhas.findIndex((l, i) => i > i0 && l.t.includes(ate)) : -1;
    if (i1 < 0) i1 = Math.min(linhas.length, i0 + 80);
    return linhas.slice(i0, i1).filter(l => l.t.trim());
  }

  function criarComandos(camada, obstaculos, { reduzido, fontes }) {
    const largo = window.innerWidth >= 900;
    const MAX = largo ? 5 : 3, MARGEM = 16;
    const vivos = [];
    let fonteLinhas = [], cursorLinha = 0, rodando = true, proximo = 0, raf = 0, ultimo = 0;
    const camadaCod = document.createElement('div');
    camadaCod.className = 'camada-codigo';
    camadaCod.setAttribute('aria-hidden', 'true');
    Object.assign(camadaCod.style, { position: 'absolute', zIndex: '1' });
    camada.appendChild(camadaCod);

    Promise.all(fontes.map(f => carregarCodigo(f.arquivo).then(l => trecho(l, f.de, f.ate))))
      .then(partes => { fonteLinhas = partes.flat(); if (reduzido) estaticos(); });

    const colide = (a, b, f) => !(a.x + a.w + f <= b.x || b.x + b.w + f <= a.x || a.y + a.h + f <= b.y || b.y + b.h + f <= a.y);
    function lugar(w, h) {
      const obs = obstaculos().concat(vivos.map(v => v.caixa));
      for (let k = 0; k < 40; k++) {
        const c = { x: MARGEM + Math.random() * Math.max(1, innerWidth - w - 2 * MARGEM),
          y: MARGEM + Math.random() * Math.max(1, innerHeight - h - 2 * MARGEM), w, h };
        if (!obs.some((o, i) => colide(c, o, i < obstaculos().length ? 20 : 12))) return c;
      }
      return null;
    }
    function proximasLinhas(n) {
      const out = [];
      for (let i = 0; i < n && fonteLinhas.length; i++) { out.push(fonteLinhas[cursorLinha % fonteLinhas.length]); cursorLinha++; }
      // tira a indentação comum para caber
      const ind = Math.min(...out.map(l => l.t.match(/^ */)[0].length));
      return out.map(l => ({ n: l.n, t: l.t.slice(ind).slice(0, largo ? 64 : 40) }));
    }
    function nascer(agora) {
      const linhas = proximasLinhas(2 + Math.floor(Math.random() * (largo ? 4 : 3)));
      if (!linhas.length) return;
      const el = document.createElement('div');
      el.className = `frag frag--op-${1 + Math.floor(Math.random() * 4)} frag--deriva-${[9, 11, 13][Math.floor(Math.random() * 3)]}`;
      const corpo = document.createElement('div');
      corpo.className = 'frag__corpo';
      el.appendChild(corpo);
      // mede pelo texto completo antes de digitar
      corpo.innerHTML = linhas.map(l => `<div class="linha"><span class="linha__num">${l.n}</span><span class="linha__cod">${esc(l.t)}</span></div>`).join('');
      el.style.visibility = 'hidden';
      camadaCod.appendChild(el);
      const r = el.getBoundingClientRect();
      const c = lugar(r.width, r.height);
      if (!c) { el.remove(); return; }
      el.style.left = c.x + 'px'; el.style.top = c.y + 'px'; el.style.visibility = '';
      const total = linhas.reduce((a, l) => a + l.t.length, 0);
      const v = { el, corpo, linhas, total, caixa: c, nasc: agora, digitado: 0,
        fimDigitar: agora + total / 260, fimParado: agora + total / 260 + 0.8 + Math.random() * 0.7 };
      v.fimApagar = v.fimParado + total / 520;
      vivos.push(v);
      requestAnimationFrame(() => el.classList.add('frag--visivel'));
      desenhar(v, 0);
    }
    function desenhar(v, k) {
      let resto = k, html = '', comCursor = false;
      for (const l of v.linhas) {
        const vis = Math.max(0, Math.min(l.t.length, resto));
        resto -= l.t.length;
        // um único cursor, no fim do que já foi digitado
        const cur = !comCursor && k > 0 && k < v.total && (resto < 0 || (resto === 0 && vis === l.t.length)) ? '<span class="cursor-bloco"></span>' : '';
        if (cur) comCursor = true;
        html += `<div class="linha"><span class="linha__num">${vis || cur ? l.n : ''}</span><span class="linha__cod">${realce(l.t.slice(0, vis))}${cur}</span></div>`;
      }
      v.corpo.innerHTML = html;
    }
    function estaticos() {
      for (let i = 0; i < 2; i++) { nascer(0); const v = vivos[vivos.length - 1]; if (v) { desenhar(v, v.total); v.fimApagar = Infinity; v.fimParado = Infinity; } }
    }
    function laco(ms) {
      raf = requestAnimationFrame(laco);
      const agora = ms / 1000;
      if (!rodando || reduzido || document.hidden) { ultimo = agora; return; }
      if (agora - ultimo < 1 / 40) return;
      ultimo = agora;
      if (fonteLinhas.length && vivos.length < MAX && agora >= proximo) { nascer(agora); proximo = agora + 0.25 + Math.random() * 0.6; }
      for (let i = vivos.length - 1; i >= 0; i--) {
        const v = vivos[i];
        let k;
        if (agora < v.fimDigitar) k = Math.floor(((agora - v.nasc) / (v.fimDigitar - v.nasc)) * v.total);
        else if (agora < v.fimParado) k = v.total;
        else if (agora < v.fimApagar) k = Math.floor((1 - (agora - v.fimParado) / (v.fimApagar - v.fimParado)) * v.total);
        else {
          if (!v.saindo) { v.saindo = agora; v.el.classList.add('frag--saindo'); }
          if (agora - v.saindo > 0.3) { v.el.remove(); vivos.splice(i, 1); }
          continue;
        }
        if (k !== v.digitado) { v.digitado = k; desenhar(v, k); }
      }
    }
    raf = requestAnimationFrame(laco);
    return { parar() { rodando = false; cancelAnimationFrame(raf); }, vivos };
  }

  function montar(opcoes = {}) {
    const fonte = opcoes.fonte || 'monospace';
    const reduzido = !!opcoes.reduzido;
    const modo = opcoes.modo === 'encerramento' ? 'encerramento' : 'abertura';
    const fica = modo === 'encerramento';
    const TITULO = opcoes.titulo || TEXTOS[modo].titulo;
    const SUB = opcoes.sub || TEXTOS[modo].sub;
    // No encerramento tudo começa depois que o preto cobriu a flor (0,9 s).
    const D = fica ? 0.9 : 0;
    // Linha de baixo digitada a ~18 caracteres/s (a data de 10 caracteres leva 0,6 s).
    const durSub = Math.max(0.6, SUB.length / 18);

    const camada = document.createElement('div');
    camada.setAttribute('role', 'img');
    camada.setAttribute('aria-label', `${TITULO}. ${SUB}`);
    // Encerramento com flores: no desktop [lírio | texto | tulipa]; no celular flores em cima.
    const largo = window.innerWidth >= 900;
    const comFlores = fica && opcoes.flores !== false && !!window.Tulipa;
    Object.assign(camada.style, {
      position: 'fixed', inset: '0', zIndex: '50', background: '#000',
      display: 'flex', flexDirection: comFlores && largo ? 'row' : 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: fonte, userSelect: 'none', webkitUserSelect: 'none', pointerEvents: 'none',
      fontVariantLigatures: 'none', textAlign: 'center', padding: '0 16px'
    });
    const bloco = document.createElement('div');
    Object.assign(bloco.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 1 auto' });

    // Largura útil do texto: tela toda, ou o meio entre as flores no desktop.
    const util = comFlores && largo ? '44vw' : '(100vw - 32px)';
    // Tamanho pelo número de caracteres: a linha mono (0,6 em por caractere) ocupa a largura útil.
    const emPor = n => n * 0.6 + 0.4;
    const LINHAS = (comFlores && TEXTOS[modo].linhas) || [TITULO];
    const maior = Math.max(...LINHAS.map(l => l.length));
    const titulo = document.createElement('div');
    Object.assign(titulo.style, {
      fontSize: `min(calc(${util} / ${emPor(maior).toFixed(2)}), 128px)`, lineHeight: '1.1',
      fontWeight: '400', whiteSpace: 'pre', color: COR_TEXTO, letterSpacing: '-0.01em'
    });
    const cel = [];
    LINHAS.forEach(linha => {
      const lt = document.createElement('div');
      [...linha].forEach(ch => {
        const s = document.createElement('span');
        s.textContent = ' ';
        lt.appendChild(s);
        cel.push({ el: s, ch });
      });
      titulo.appendChild(lt);
    });

    const sub = document.createElement('div');
    Object.assign(sub.style, {
      fontSize: `min(calc(${util} / ${Math.max(19, emPor(SUB.length) * 1.15).toFixed(2)}), 36px)`,
      lineHeight: '1.2', marginTop: '0.9em', color: COR_SUB, whiteSpace: 'pre', fontVariantNumeric: 'tabular-nums'
    });
    const subTexto = document.createElement('span');
    const cursor = document.createElement('span');
    Object.assign(cursor.style, { display: 'inline-block', width: '0.6em', height: '1.05em',
      verticalAlign: '-0.15em', background: COR_CODIGO, marginLeft: '0.05em' });
    sub.append(subTexto, cursor);
    bloco.append(titulo, sub);

    // Flores do encerramento: canvases próprios; as instâncias nascem quando a camada já está no DOM.
    const flores = [];
    const telas = [];
    if (comFlores) {
      const fazTela = rotulo => {
        const c = document.createElement('canvas');
        c.setAttribute('aria-hidden', 'true');
        // vista de cima: telas quadradas e vazadas; a máscara radial apaga as bordas, então
        // brilho, faíscas e pólen se dissolvem no preto em vez de cortar num quadrado
        const mascara = 'radial-gradient(closest-side, #000 70%, transparent 100%)';
        Object.assign(c.style, largo
          ? { width: 'min(26vw, 70vh)', height: 'min(26vw, 70vh)', flex: '0 0 auto', display: 'block' }
          : { width: '46vw', height: '46vw', flex: '0 0 auto', display: 'block' },
          { maskImage: mascara, webkitMaskImage: mascara });
        c.dataset.especie = rotulo;
        telas.push(c);
        return c;
      };
      const lirio = fazTela('lirio'), tulipa = fazTela('tulipa');
      if (largo) camada.append(lirio, bloco, tulipa);
      else {
        const linha = document.createElement('div');
        Object.assign(linha.style, { display: 'flex', gap: '2vw', justifyContent: 'center', marginBottom: '2vh' });
        linha.append(lirio, tulipa);
        camada.append(linha, bloco);
      }
    } else camada.append(bloco);

    function iniciarFlores() {
      if (flores.length || !comFlores) return;
      telas.forEach(c => {
        const f = window.Tulipa.criar(c, { fonte, reduzido, especie: c.dataset.especie, velocidade: 2.2,
          ceu: false, interativo: false, vista: 'cima', transparente: true });
        f.iniciar();
        flores.push(f);
      });
    }

    // Abertura (s): título decodifica 0,15–1,55 · data 1,45–2,05 · parado · saída 3,15–3,85 · fim 4,0
    // Encerramento: preto 0–0,9 · título 1,05–2,45 · frase 2,35–3,8 · cursor pisca e some aos ~6 s
    const subIni = D + 1.45, subFim = subIni + durSub;
    function desenharEm(t) {
      camada.style.opacity = fica
        ? String(reduzido ? 1 : clamp(t / D))
        : String(1 - clamp((t - 3.75) / 0.25));
      const n = cel.length;
      cel.forEach((c, i) => {
        if (c.ch === ' ') return;
        if (reduzido) { c.el.textContent = c.ch; c.el.style.color = COR_TEXTO; c.el.style.opacity = '1'; return; }
        const ini = D + 0.15 + (i / n) * 0.8;               // da esquerda para a direita
        const assenta = ini + 0.55;
        const sai = fica ? Infinity : 3.15 + ((n - 1 - i) / n) * 0.45; // da direita para a esquerda
        if (t < ini) { c.el.textContent = ' '; return; }
        if (t < assenta || t >= sai) {
          c.el.textContent = simbolo(i, t);
          c.el.style.color = COR_CODIGO;
          c.el.style.opacity = t >= sai ? String(clamp(1 - (t - sai) / 0.25)) : String(clamp((t - ini) / 0.12));
        } else {
          c.el.textContent = c.ch;
          c.el.style.color = COR_TEXTO;
          c.el.style.opacity = '1';
        }
      });

      if (reduzido) {
        subTexto.textContent = SUB; cursor.style.opacity = '0';
        return;
      }
      const k = Math.floor(clamp((t - subIni) / durSub) * SUB.length);
      const apaga = !fica && t >= 3.15 ? Math.floor(clamp((t - 3.15) / 0.4) * SUB.length) : 0;
      subTexto.textContent = SUB.slice(0, Math.max(0, k - apaga));
      const digitando = t >= subIni && t < subFim;
      const visivel = t >= subIni - 0.15 && t < (fica ? subFim + 2.2 : 3.65);
      cursor.style.opacity = visivel && (digitando || Math.floor(t * 2) % 2 === 0) ? '1' : '0';
    }

    const fim = fica ? subFim + 2.3 : DURACAO; // encerramento: depois que o cursor sumiu
    // Comandos: nunca sobre o texto nem sobre as flores
    const obstaculos = () => [titulo, sub, ...telas].map(e => {
      const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    const fontes = fica
      ? [{ arquivo: 'tulipa.js', de: 'function desenharLirio', ate: '// ——— Quadro' },
         { arquivo: 'tulipa.js', de: '// #fase:abertura', ate: 'function desenharLirio' }]
      : [{ arquivo: 'abertura.js', de: 'function desenharEm(t)', ate: 'const fim = fica' }];
    let comandos = null;
    const iniciarComandos = () => { if (!comandos && opcoes.comandos !== false) comandos = criarComandos(camada, obstaculos, { reduzido, fontes }); };
    return { camada, desenharEm, DURACAO: fim, iniciarFlores, flores, INICIO_FLORES: D, iniciarComandos };
  }

  function tocar(opcoes = {}) {
    return new Promise(resolve => {
      const a = montar(opcoes);
      const fica = opcoes.modo === 'encerramento';
      document.body.appendChild(a.camada);
      a.desenharEm(0);
      a.iniciarComandos();
      const t0 = performance.now();
      const passo = agora => {
        const t = (agora - t0) / 1000;
        if (t >= a.INICIO_FLORES) a.iniciarFlores();
        if (t >= a.DURACAO) {
          a.desenharEm(a.DURACAO);
          if (!fica) a.camada.remove();
          resolve(a.camada);
          return;
        }
        a.desenharEm(t);
        requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    });
  }

  const encerrar = (opcoes = {}) => tocar({ ...opcoes, modo: 'encerramento' });

  window.Abertura = { tocar, encerrar, montar, DURACAO };
})();
