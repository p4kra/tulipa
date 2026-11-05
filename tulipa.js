/*
 * tulipa.js — uma tulipa 3D desenhada com letras num grid monoespaçado.
 * Dono: Hermes. Sem dependências. Expõe window.Tulipa.
 *
 * Como funciona (resumo):
 *  1. A planta é um conjunto de superfícies paramétricas (haste, 2 folhas, 6 tépalas).
 *     A abertura `o` (0 = botão fechado, 1 = aberta) muda a curvatura das tépalas.
 *  2. Cada superfície vira uma malha densa de pontos com normal; os pontos são girados
 *     (balanço + câmera levemente acima), projetados e gravados num z-buffer por célula.
 *  3. Cada célula vira um caractere: borda (/ \ | _ -) quando separa superfícies,
 *     senão uma letra escolhida pelo brilho (luz principal + luz de contorno que gira).
 *  4. "Desenho": uma frente de luz sobe pela ordem de cada ponto (haste → folhas → botão)
 *     soltando faíscas; logo atrás da frente as células "decodificam" (símbolos de código
 *     que se acomodam na letra certa). Depois a flor abre devagar e fica balançando.
 *  5. Efeitos depois de aberta: explosão de faíscas, pólen flutuando, estrelas cadentes,
 *     pétalas de letras que caem, rajadas de vento. Mouse/toque mudam a luz; clique sopra.
 *  Marcadores `// #fase:<nome>` indicam o trecho de cada fase (o painel de código usa).
 */
(function () {
  'use strict';

  // ——— Linha do tempo (segundos) ———
  const T_BASE = {
    ceu: [0, 1.4],        // estrelas aparecem
    desenho: [1.0, 6.6],  // frente de luz: ordem 0 → 1
    abertura: [6.9, 15.0] // botão → flor aberta
  };
  const RAMPA = ':-=+tfjzxrcvunoea8Q$#@';
  const ESTRELAS = '..+*';
  const CODIGO = '01{}[]<>()/=+;*#&%$!?';   // símbolos da decodificação
  const FASES = ['ceu', 'haste', 'folhas', 'botao', 'abertura', 'aberta'];

  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const suave = p => p * p * (3 - 2 * p);
  const suave5 = p => p * p * p * (p * (p * 6 - 15) + 10);
  const prog = (t, [a, b]) => clamp((t - a) / (b - a));
  const lerp = (a, b, p) => a + (b - a) * p;

  function rng(seed) { // mulberry32: faíscas e estrelas reprodutíveis
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash2 = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

  // ——— Materiais e cores ———
  // 0 pétala (face externa), 1 pétala (face interna), 2 verde, 3 faísca/brilho da frente,
  // 4 lírio branco, 5 lírio rosado (centro), 6 antera (laranja)
  const NIVEIS = 18;
  function paleta() {
    const p = [];
    for (let m = 0; m < 7; m++) {
      p[m] = [];
      for (let i = 0; i < NIVEIS; i++) {
        const l = i / (NIVEIS - 1);
        if (m === 0) p[m][i] = `hsl(354 90% ${(20 + 46 * l).toFixed(1)}%)`;
        else if (m === 1) p[m][i] = `hsl(349 86% ${(15 + 38 * l).toFixed(1)}%)`;
        else if (m === 2) p[m][i] = `hsl(128 60% ${(17 + 40 * l).toFixed(1)}%)`;
        else if (m === 3) p[m][i] = `hsl(40 100% ${(70 + 28 * l).toFixed(1)}%)`;
        else if (m === 4) p[m][i] = `hsl(330 22% ${(22 + 70 * l).toFixed(1)}%)`;
        else if (m === 5) p[m][i] = `hsl(336 72% ${(22 + 50 * l).toFixed(1)}%)`;
        else p[m][i] = `hsl(24 88% ${(22 + 42 * l).toFixed(1)}%)`;
      }
    }
    return p;
  }

  // ——— Geometria ———
  // Preenche `P` (nu×nv×3) com uma tira curva. A linha central parte de `base` na direção
  // radial φ, com ângulo θ(u) = a + b·u + c·u² em relação à vertical (integrado em passos),
  // e a seção transversal se enrola sobre um raio rc (pétala em concha).
  function tira(P, nu, nv, base, phi, L, a, b, c2, larg, rcFn) {
    const Rx = Math.cos(phi), Rz = Math.sin(phi), Tx = -Math.sin(phi), Tz = Math.cos(phi);
    let k = 0, cr = 0, cy = 0;
    const du = 1 / (nu - 1);
    for (let i = 0; i < nu; i++) {
      const u = i * du;
      const th = a + b * u + c2 * u * u;
      if (i > 0) { const tm = a + b * (u - du / 2) + c2 * (u - du / 2) * (u - du / 2); cr += Math.sin(tm) * du; cy += Math.cos(tm) * du; }
      const s = Math.sin(th), c = Math.cos(th);
      // posição da linha central
      const px = base[0] + Rx * L * cr, py = base[1] + L * cy, pz = base[2] + Rz * L * cr;
      // normal externa no plano radial: N = c·R − s·Y
      const Nx = c * Rx, Ny = -s, Nz = c * Rz;
      const w = larg(u);
      const rc = rcFn(u, cr * L);
      for (let j = 0; j < nv; j++) {
        const v = (j / (nv - 1)) * 2 - 1;
        const ang = clamp((v * w) / rc, -1.75, 1.75);
        const t = rc * Math.sin(ang);
        const n = -rc * (1 - Math.cos(ang)); // bordas se dobram para dentro
        P[k++] = px + Tx * t + Nx * n;
        P[k++] = py + Ny * n;
        P[k++] = pz + Tz * t + Nz * n;
      }
    }
  }

  function criar(canvas, opcoes = {}) {
    // transparente: fundo vazado (encerramento), para os efeitos se fundirem no preto sem borda
    const transparente = !!opcoes.transparente;
    const ctx = canvas.getContext('2d', { alpha: transparente });
    const fonte = opcoes.fonte || 'monospace';
    const reduzido = !!opcoes.reduzido;
    // espécie: 'tulipa' (padrão) ou 'lirio'; velocidade > 1 encurta a linha do tempo (encerramento)
    const lirio = opcoes.especie === 'lirio';
    const vel = Math.max(0.25, opcoes.velocidade || 1);
    const comCeu = opcoes.ceu !== false;
    // vista 'cima': câmera alta olhando a flor de cima, enquadrada só na flor (encerramento)
    const deCima = opcoes.vista === 'cima';
    const T = {};
    for (const k in T_BASE) T[k] = T_BASE[k].map(v => v / vel);
    const PET_A = lirio ? 4 : 0, PET_B = lirio ? 5 : 1;
    const interativo = opcoes.interativo !== false && !reduzido;
    const cores = paleta();
    let area = { x: 0, y: 0, w: 1, h: 1 };

    let W = 0, H = 0, dpr = 1, fpx = 10, cw = 6, ch = 11, cols = 0, rows = 0;
    let zb, idb, lumb, matb, hotb, idadeb, estrelas = [];
    let S = 400, ox = 0, oy = 0;
    const faiscas = [];
    const sorte = rng(20261105);
    let candidatos = [], ncand = 0;

    // Malhas (reaproveitadas a cada quadro)
    const MALHA = {
      haste: { nu: 150, nv: 14 },
      folha: { nu: 70, nv: 34 },
      petala: { nu: 56, nv: 70 }
    };
    const bufs = {
      folha: new Float32Array(MALHA.folha.nu * MALHA.folha.nv * 3),
      petala: new Float32Array(MALHA.petala.nu * MALHA.petala.nv * 3)
    };

    function medir() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth || window.innerWidth;
      H = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      // Grid denso como na referência: ~105 linhas na altura (limitado pela largura no celular).
      fpx = deCima ? clamp(Math.min(H * area.h, W * area.w) / (96 * 0.6), 4.5, 9)
        : clamp(Math.min((H * area.h) / (100 * 1.16), (W * area.w) / (70 * 0.6)), 5.5, 11);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${fpx}px ${fonte}`;
      cw = ctx.measureText('M').width || fpx * 0.6;
      ch = fpx * 1.16;
      cols = Math.ceil(W / cw) + 1;
      rows = Math.ceil(H / ch) + 1;
      const n = cols * rows;
      zb = new Float32Array(n); idb = new Int8Array(n); lumb = new Float32Array(n);
      matb = new Uint8Array(n); hotb = new Float32Array(n); idadeb = new Float32Array(n);
      // Escala: a planta ocupa ~1,62 unidades de altura (chão → topo da flor aberta),
      // centrada na área livre (o painel de código fica fora dela).
      const AW = W * area.w, AH = H * area.h;
      if (deCima) {
        // a flor aberta tem raio ~0,42 visto de cima: ocupa ~85 % do menor lado
        S = (Math.min(AW, AH) * 0.78) / 0.84;
        ox = W * area.x + AW / 2;
        oy = H * area.y + AH * 0.5 + YC * S;
      } else {
        S = Math.min((AH * 0.92) / 1.62, (AW * 0.92) / 0.72);
        ox = W * area.x + AW / 2;
        oy = H * area.y + AH * 0.5 + S * 0.8;
      }
      const r = rng(777);
      estrelas = [];
      const qtd = Math.round(cols * rows * 0.0065);
      for (let i = 0; i < qtd; i++) {
        estrelas.push({
          c: Math.floor(r() * cols), l: Math.floor(r() * rows),
          g: ESTRELAS[Math.floor(r() * ESTRELAS.length)],
          f: 0.4 + r() * 1.4, fase: r() * 6.28, a: 0.18 + r() * 0.5
        });
      }
    }

    // ——— Projeção ———
    const PITCH = deCima ? 1.3 : 0.36;
    let pitchS = Math.sin(PITCH), pitchC = Math.cos(PITCH);
    const YC = deCima ? 1.16 : 1.2, DCAM = 5.2;
    let balX = 0, balZ = 0, frente = 0;
    let keyL = norm3(-0.4, 0.8, 0.6), rimL = [1, 0, 0];
    // Interação: o ponteiro vira uma lanterna (luz principal) e o clique sopra a flor.
    const ponteiro = { x: 0, y: 0, ativo: 0, alvo: 0 };
    const sopro = { x: 0, v: 0 };   // mola amortecida somada ao balanço
    let pulso = 0;                   // brilho extra da luz de contorno (explosão de abertura)
    // Drama: a câmera gira em volta da planta (yaw), o coração bate nas pétalas e ondas de choque
    let yawS = 0, yawC = 1, batida = 0, flash = 0;
    const ondas = [];                // { vida, fim, forca, y }

    function plot(x, y, z, nx, ny, nz, mat, id, ord, fatorLuz) {
      if (ord > frente) return;
      // giro da câmera em torno da haste (pontos e normais)
      const xr = x * yawC + z * yawS; z = -x * yawS + z * yawC; x = xr;
      const nxr = nx * yawC + nz * yawS; nz = -nx * yawS + nz * yawC; nx = nxr;
      // balanço: a planta se curva a partir do chão (∝ y²)
      const yy = y * y;
      x += balX * yy; z += balZ * yy;
      // câmera levemente acima, girando em torno do centro da flor
      const yr = y - YC;
      const y2 = yr * pitchC - z * pitchS + YC;
      const z2 = yr * pitchS + z * pitchC;
      let ny2 = ny * pitchC - nz * pitchS, nz2 = ny * pitchS + nz * pitchC;
      let nx2 = nx;
      let costas = false;
      if (nz2 < 0) { nx2 = -nx2; ny2 = -ny2; nz2 = -nz2; costas = true; }
      const f = DCAM / (DCAM - z2);
      const sx = ox + x * S * f, sy = oy - y2 * S * f;
      const c = Math.floor(sx / cw), l = Math.floor(sy / ch);
      if (c < 0 || l < 0 || c >= cols || l >= rows) return;
      const k = l * cols + c;
      if (idb[k] !== 0 && zb[k] >= z2) return;
      zb[k] = z2; idb[k] = id;
      const dk = Math.max(0, nx2 * keyL[0] + ny2 * keyL[1] + nz2 * keyL[2]);
      const dr = Math.max(0, nx2 * rimL[0] + ny2 * rimL[1] + nz2 * rimL[2]);
      const fres = 1 - nz2;
      let lum = 0.16 + 0.72 * dk + (0.55 + pulso) * dr * dr * (0.35 + fres);
      lum *= fatorLuz;
      if (mat === 0 || mat === 4) lum += batida * (0.1 + 0.25 * fres); // o coração acende as pétalas pela borda
      let m = mat;
      if (mat === 0 && costas) { m = 1; lum *= 0.8; }
      lumb[k] = Math.pow(clamp(lum), 0.78);
      matb[k] = m;
      const idade = frente - ord;
      const quente = clamp(1 - idade / 0.035);
      hotb[k] = frente < 1.02 ? quente : 0;
      idadeb[k] = frente < 1.04 ? idade : 9;
      if (quente > 0.5 && frente < 1.0 && ncand < 400) candidatos[ncand++] = k;
    }

    // Malha → pontos com normal (diferenças centrais na grade)
    function emitir(P, nu, nv, mat, id, ordFn, luzFn) {
      for (let i = 0; i < nu; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(nu - 1, i + 1);
        const u = i / (nu - 1);
        for (let j = 0; j < nv; j++) {
          const j0 = Math.max(0, j - 1), j1 = Math.min(nv - 1, j + 1);
          const k = (i * nv + j) * 3;
          const a = (i1 * nv + j) * 3, b = (i0 * nv + j) * 3;
          const c = (i * nv + j1) * 3, d = (i * nv + j0) * 3;
          const ux = P[a] - P[b], uy = P[a + 1] - P[b + 1], uz = P[a + 2] - P[b + 2];
          const vx = P[c] - P[d], vy = P[c + 1] - P[d + 1], vz = P[c + 2] - P[d + 2];
          const [nx, ny, nz] = norm3(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
          plot(P[k], P[k + 1], P[k + 2], nx, ny, nz, typeof mat === 'function' ? mat(u) : mat, id, ordFn(u, j / (nv - 1)), luzFn(u));
        }
      }
    }

    // ——— A planta ———
    const TOPO = 1.0; // altura da base da flor
    const hasteX = y => 0.025 * Math.sin(y * Math.PI * 0.9);

    function desenharPlanta(o) {
      // #fase:haste
      // Haste: cilindro fino que a frente de luz desenha de baixo para cima
      const { nu, nv } = MALHA.haste;
      const R = 0.019;
      for (let i = 0; i < nu; i++) {
        const y = (i / (nu - 1)) * TOPO;
        if (deCima && y < TOPO - 0.22) continue; // de cima só aparece o topo da haste
        const cx = hasteX(y);
        for (let j = 0; j < nv; j++) {
          const a = (j / nv) * Math.PI * 2;
          const nx = Math.cos(a), nz = Math.sin(a);
          plot(cx + nx * R, y, nz * R, nx, 0, nz, 2, 1, (y / TOPO) * 0.56, 1);
        }
      }
      // Receptáculo: pequeno engrossamento no topo
      for (let i = 0; i < 18; i++) {
        const t = i / 17, y = TOPO - 0.03 + t * 0.045, r = 0.02 + 0.022 * Math.sin(t * Math.PI * 0.8);
        for (let j = 0; j < 26; j++) {
          const a = (j / 26) * Math.PI * 2;
          plot(hasteX(TOPO) + Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(a), 0.2, Math.sin(a), 2, 1, 0.555, 0.9);
        }
      }

      if (lirio) { desenharLirio(o); return; }
      if (deCima) { desenharPetalas(o); return; } // de cima: só a flor
      desenharFolhas();
      desenharPetalas(o);
    }

    function desenharFolhas() {
      // #fase:folhas
      // Folhas: largas, lanceoladas, saem da base e se curvam para fora
      const F = MALHA.folha;
      const folhas = [
        { phi: 0.75, L: 0.62, a: 0.12, b: 0.8, W: 0.13, base: 0.03, ord0: 0.06 },
        { phi: Math.PI - 0.55, L: 0.54, a: 0.18, b: 0.9, W: 0.12, base: 0.05, ord0: 0.12 }
      ];
      folhas.forEach((fo, n) => {
        tira(bufs.folha, F.nu, F.nv, [hasteX(fo.base), fo.base, 0], fo.phi, fo.L, fo.a, fo.b, 0,
          u => fo.W * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.8) * (1 - 0.25 * u),
          () => 0.14);
        emitir(bufs.folha, F.nu, F.nv, 2, 2 + n, u => fo.ord0 + u * 0.34, () => 1);
      });
    }

    function desenharPetalas(o) {
      // #fase:botao
      // Tépalas: 3 externas + 3 internas, fechadas num botão em forma de ovo
      const Pp = MALHA.petala;
      const base = [hasteX(TOPO), TOPO, 0];
      const oExt = suave(clamp(o * 1.08));
      const oInt = suave(clamp(o * 1.2 - 0.2));
      for (let n = 0; n < 6; n++) {
        const ext = n % 2 === 0;
        const p = ext ? oExt : oInt;
        const phi = (n / 6) * Math.PI * 2 + 0.25;
        const L = ext ? 0.5 : 0.46;
        const Wd = ext ? 0.16 : 0.145;
        const r0 = ext ? 0.03 : 0.022;
        // #fase:abertura
        // θ(u) = a + b·u + c·u²
        // botão: base bojuda que fecha nas pontas (ovo) → aberta: taça que abre e vira as pontas
        const a = ext ? lerp(0.95, 0.92, p) : lerp(0.85, 0.8, p);
        const b = ext ? lerp(-1.55, -2.05, p) : lerp(-1.5, -2.1, p);
        const c2 = ext ? lerp(0.05, 2.05, p) : lerp(0.05, 1.75, p);
        const b0 = [base[0] + Math.cos(phi) * r0, base[1] + 0.005, Math.sin(phi) * r0];
        tira(bufs.petala, Pp.nu, Pp.nv, b0, phi, L, a, b, c2,
          u => Wd * Math.pow(Math.sin(Math.PI * Math.pow(clamp(u, 0.001, 1), 0.85)), 0.62) * (1 - 0.12 * u) + 0.004,
          (u, radial) => lerp(Math.max(0.045, (r0 + radial) * 1.22), 0.3, p));
        emitir(bufs.petala, Pp.nu, Pp.nv, 0, 4 + n,
          u => 0.56 + u * 0.44,
          u => 0.6 + 0.4 * Math.min(1, u * 2.6));
      }
    }

    // Lírio: folhas estreitas ao longo da haste, 6 tépalas em trombeta que viram para trás,
    // 6 estames com anteras laranja e o pistilo no meio.
    function desenharLirio(o) {
      const F = MALHA.folha;
      for (let n = 0; n < (deCima ? 0 : 7); n++) {
        const yb = 0.12 + n * 0.1, phi = n * 2.4 + 0.3;
        tira(bufs.folha, F.nu, F.nv, [hasteX(yb), yb, 0], phi, 0.24 - n * 0.012, 0.55, 0.9, 0,
          u => 0.032 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 0.9), () => 0.08);
        emitir(bufs.folha, F.nu, F.nv, 2, 2 + (n % 2), u => 0.06 + yb * 0.45 + u * 0.08, () => 1);
      }
      // #fase:lirio
      const Pp = MALHA.petala;
      const base = [hasteX(TOPO), TOPO, 0];
      for (let n = 0; n < 6; n++) {
        const ext = n % 2 === 0;
        const p = suave(clamp(o * (ext ? 1.1 : 1.25) - (ext ? 0 : 0.2)));
        const phi = (n / 6) * Math.PI * 2 + 0.25;
        const L = ext ? 0.54 : 0.52;
        const r0 = 0.018;
        // botão: charuto fechado e comprido → trombeta que abre e enrola as pontas para trás
        const a = lerp(0.1, 0.12, p), b = lerp(-0.12, 0.25, p), c2 = lerp(0.0, 2.95, p);
        const b0 = [base[0] + Math.cos(phi) * r0, base[1] + 0.005, Math.sin(phi) * r0];
        tira(bufs.petala, Pp.nu, Pp.nv, b0, phi, L, a, b, c2,
          u => (ext ? 0.085 : 0.095) * Math.pow(Math.sin(Math.PI * Math.pow(clamp(u, 0.001, 1), 0.7)), 0.7) + 0.003,
          (u, radial) => lerp(Math.max(0.03, (r0 + radial) * 1.1), 0.16, p));
        emitir(bufs.petala, Pp.nu, Pp.nv, u => (u < 0.42 ? 5 : 4), 4 + n,
          u => 0.56 + u * 0.44, u => 0.7 + 0.3 * Math.min(1, u * 2));
      }
      // estames e pistilo: fios que crescem com a abertura, com a ponta grossa
      const cres = suave(clamp((o - 0.35) / 0.65));
      if (cres > 0) {
        for (let n = 0; n < 7; n++) {
          const centro = n === 6, phi = (n / 6) * Math.PI * 2 + 0.55;
          const L = (centro ? 0.44 : 0.4) * cres, ab = centro ? 0 : 0.2;
          for (let i = 0; i <= 26; i++) {
            const u = i / 26, curva = ab * u + 0.18 * u * u * (centro ? 0 : 1);
            const x = base[0] + Math.cos(phi) * Math.sin(curva) * L * u * 1.6;
            const z = Math.sin(phi) * Math.sin(curva) * L * u * 1.6;
            plot(x, base[1] + L * u, z, 0, 0.3, 1, centro ? 2 : 5, 10, 0.9 + u * 0.1, 0.9);
            if (i === 26) {
              for (let k = 0; k < 18; k++) { // antera / estigma
                const aa = (k / 18) * Math.PI * 2;
                plot(x + Math.cos(aa) * 0.014, base[1] + L + Math.sin(aa) * 0.01, z + 0.004,
                  Math.cos(aa), Math.sin(aa), 0.6, centro ? 2 : 6, 11, 1, 1);
              }
            }
          }
        }
      }
    }

    // ——— Quadro ———
    let relogio = 0, ultimo = 0, rodando = false, pausado = false, raf = 0, abriu = false;
    const aoAbrirFns = [], aoFaseFns = [];
    let fase = '', fpsMedio = 30, letras = 0;
    const cadentes = [], petalasCaindo = [], polen = [];
    let proxCadente = 9, proxPetala = 18.5, proxRajada = 21;
    let rajada = { ini: -99, dur: 2.4, dir: 1 };

    function faseDe(t) {
      if (reduzido) return 'aberta';
      if (t >= T.abertura[1]) return 'aberta';
      if (t >= T.abertura[0]) return 'abertura';
      if (frente > 0.56) return 'botao';
      if (frente > 0.2) return 'folhas';
      if (frente > 0.01) return 'haste';
      return 'ceu';
    }

    // explosão: anel de faíscas saindo do centro da flor
    function explodir(cx, cy, n, forca) {
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + sorte() * 0.3;
        const v = forca * (0.6 + sorte() * 0.8);
        faiscas.push({ x: cx, y: cy, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v * 0.6 - 2,
          vida: 0, fim: 0.7 + sorte() * 0.9, g: '*+.\'`'[Math.floor(sorte() * 5)] });
      }
    }

    // chão: um montinho de terra e grama em letras, que nasce do centro para os lados
    function desenharChao(t) {
      const abre = reduzido ? 1 : suave(prog(t, [1.0, 2.6]));
      if (abre <= 0) return;
      const yl = Math.floor((oy + S * 0.012) / ch);
      const c0 = ox / cw, meia = (S * 0.36 * abre) / cw;
      for (let c = Math.floor(c0 - meia); c <= Math.ceil(c0 + meia); c++) {
        const d = Math.abs(c - c0) / Math.max(1, meia);
        if (d > 1) continue;
        const h = hash2(c, 7);
        const g = d < 0.75 ? (h < 0.5 ? '"' : h < 0.8 ? ',' : '\'') : (h < 0.5 ? '.' : '_');
        ctx.fillStyle = `hsla(118 45% ${(22 + 18 * (1 - d)).toFixed(0)}% / ${(1 - d * 0.6).toFixed(2)})`;
        ctx.fillText(g, c * cw, yl * ch);
        if (d < 0.55) {
          ctx.fillStyle = `hsla(30 25% 22% / ${(0.8 - d).toFixed(2)})`;
          ctx.fillText(h < 0.5 ? '~' : '-', c * cw, (yl + 1) * ch);
        }
      }
    }

    function quadro(t, dt) {
      // abertura com um pequeno passo além do fim (a flor "respira" e assenta)
      const pa = prog(t, T.abertura);
      const o = reduzido ? 1 : suave(pa) + 0.06 * Math.sin(Math.PI * clamp((pa - 0.78) / 0.22)) * (pa < 1 ? 1 : 0)
        + (pa >= 1 ? 0.035 * Math.exp(-(t - T.abertura[1]) * 1.6) * Math.sin((t - T.abertura[1]) * 7) : 0);
      // câmera: a planta entra girada e vira para nós enquanto é desenhada; depois uma órbita lenta
      const yaw = reduzido ? 0 : lerp(-0.85, 0, suave(prog(t, [T.desenho[0], T.abertura[0] + 1.5])))
        + 0.13 * Math.sin(Math.max(0, t - T.abertura[0]) * 0.33) * clamp((t - T.abertura[0]) / 3);
      const yawF = deCima && !reduzido ? t * 0.22 : yaw; // de cima: a flor gira devagar como um disco
      yawS = Math.sin(yawF); yawC = Math.cos(yawF);
      // batimento duplo (tum-tum, ~76 bpm) a partir do botão; mais forte durante a abertura
      if (!reduzido && t > T.abertura[0] - 2) {
        const fb = ((t * 76) / 60) % 1;
        const tum = Math.exp(-((fb / 0.05) ** 2)) + 0.62 * Math.exp(-(((fb - 0.17) / 0.05) ** 2));
        batida = tum * (pa > 0 && pa < 1 ? 1 : 0.55);
      } else batida = 0;
      flash = Math.max(0, flash - dt * 1.6);
      frente = reduzido ? 2 : lerp(0, 1.04, suave(prog(t, T.desenho)));
      const tb = reduzido ? 0 : t;
      // rajada de vento: um empurrão suave de ~2,4 s, de tempos em tempos depois de aberta
      if (!reduzido && t > proxRajada) {
        rajada = { ini: t, dur: 2.4, dir: sorte() < 0.5 ? -1 : 1 };
        proxRajada = t + 10 + sorte() * 6;
      }
      const pr = prog(t, [rajada.ini, rajada.ini + rajada.dur]);
      const forcaRajada = pr > 0 && pr < 1 ? Math.sin(pr * Math.PI) : 0;
      const amp = reduzido ? 0 : (0.01 + 0.022 * o) * clamp((t - 2) / 4);
      // mola do sopro (clique/toque)
      if (dt > 0) { sopro.v += (-sopro.x * 9 - sopro.v * 2.2) * dt; sopro.x += sopro.v * dt; }
      balX = amp * Math.sin(tb * 0.62) + amp * 0.35 * Math.sin(tb * 1.37 + 1)
        + 0.05 * forcaRajada * rajada.dir + sopro.x;
      balZ = amp * 0.5 * Math.sin(tb * 0.47 + 2);
      pulso = Math.max(0, pulso - dt * 0.8);
      rimL = norm3(Math.cos(tb * 0.8), 0.35, Math.sin(tb * 0.8) * 0.6 - 0.2);
      // lanterna: com o ponteiro sobre a tela, a luz principal vem da direção dele
      ponteiro.ativo += (ponteiro.alvo - ponteiro.ativo) * Math.min(1, dt * 4);
      const lx = clamp((ponteiro.x - ox) / (S * 0.8), -1.2, 1.2);
      const ly = clamp((oy - TOPO * S - ponteiro.y) / (S * 0.8), -1, 1.2);
      keyL = norm3(lerp(-0.42 + 0.05 * Math.sin(tb * 0.3), lx, ponteiro.ativo),
        lerp(0.78, 0.35 + ly * 0.6, ponteiro.ativo), 0.62);

      idb.fill(0); hotb.fill(0); ncand = 0;
      desenharPlanta(o);

      const novaFase = faseDe(t);
      if (novaFase !== fase) {
        fase = novaFase;
        if (fase === 'botao' && !reduzido) ondas.push({ vida: 0, fim: 1.1, forca: 0.5, y: TOPO + 0.12 });
        if (fase === 'abertura' && !reduzido) { pulso = 0.5; ondas.push({ vida: 0, fim: 1.6, forca: 0.8, y: TOPO + 0.18 }); }
        if (fase === 'aberta' && !reduzido) {
          pulso = 1.2; flash = 1;
          ondas.push({ vida: 0, fim: 2.2, forca: 1.4, y: TOPO + 0.22 }, { vida: -0.25, fim: 2.2, forca: 1, y: TOPO + 0.22 });
          explodir(ox / cw, (oy - (TOPO + 0.22) * S) / ch, 160, 34);
          proxCadente = t + 0.6;
        }
        aoFaseFns.forEach(fn => { try { fn(fase); } catch (e) { console.error(e); } });
      }

      // células → caracteres
      if (transparente) ctx.clearRect(0, 0, W, H);
      else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
      // luz vermelha que a flor faz no escuro: cresce ao abrir e pulsa com o coração
      if (!reduzido || o > 0) {
        const gx = ox, gy = deCima ? oy - YC * S : oy - (TOPO + 0.2) * S;
        const gr = deCima ? Math.min(W, H) * (0.36 + 0.12 * o) : S * (0.55 + 0.25 * o);
        const ga = clamp((0.05 + 0.13 * o) * (1 + 0.9 * batida) + 0.25 * flash, 0, 0.5);
        const gl = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
        gl.addColorStop(0, lirio ? `rgba(225,175,200,${(ga * 0.8).toFixed(3)})` : `rgba(205,24,52,${ga.toFixed(3)})`);
        gl.addColorStop(0.45, lirio ? `rgba(150,90,120,${(ga * 0.35).toFixed(3)})` : `rgba(150,12,40,${(ga * 0.45).toFixed(3)})`);
        gl.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
      }
      ctx.textBaseline = 'top';
      ctx.font = `${fpx}px ${fonte}`;

      // #fase:ceu
      // estrelas: piscam devagar e se deslocam um pouco com o ponteiro (profundidade)
      const ceu = !comCeu ? 0 : reduzido ? 1 : suave(prog(t, T.ceu));
      const px = Math.round(((ponteiro.x - W / 2) / W) * -3 * ponteiro.ativo);
      const py = Math.round(((ponteiro.y - H / 2) / H) * -2 * ponteiro.ativo);
      for (const e of estrelas) {
        const c = e.c + px * e.f * 0.6, l = e.l + py * e.f * 0.6;
        const k = Math.round(l) * cols + Math.round(c);
        if (k >= 0 && k < idb.length && idb[k] !== 0) continue;
        const a = ceu * e.a * (reduzido ? 0.7 : 0.55 + 0.45 * Math.sin(tb * e.f + e.fase));
        if (a < 0.04) continue;
        ctx.fillStyle = `rgba(235,235,245,${a.toFixed(2)})`;
        ctx.fillText(e.g, Math.round(c) * cw, Math.round(l) * ch);
      }
      if (!reduzido) {
        // estrela cadente: cabeça '*' e rastro que apaga
        if (comCeu && t > proxCadente) {
          const dir = sorte() < 0.5 ? -1 : 1;
          cadentes.push({ x: (dir > 0 ? 0.05 + sorte() * 0.4 : 0.55 + sorte() * 0.4) * cols,
            y: sorte() * rows * 0.3, vx: dir * (40 + sorte() * 25), vy: 14 + sorte() * 8, vida: 0, fim: 0.9 });
          proxCadente = t + (fase === 'abertura' ? 2.2 + sorte() * 1.6 : 5 + sorte() * 5);
        }
        for (let i = cadentes.length - 1; i >= 0; i--) {
          const e = cadentes[i];
          e.vida += dt; e.x += e.vx * dt; e.y += e.vy * dt;
          if (e.vida > e.fim) { cadentes.splice(i, 1); continue; }
          const fade = 1 - e.vida / e.fim;
          for (let j = 0; j < 12; j++) {
            const q = j / 12;
            const cx = Math.round(e.x - e.vx * q * 0.12), cy = Math.round(e.y - e.vy * q * 0.12);
            ctx.fillStyle = `rgba(240,240,255,${(fade * (1 - q)).toFixed(2)})`;
            ctx.fillText(j === 0 ? '*' : (Math.abs(e.vy) * 2 > Math.abs(e.vx) ? (e.vx > 0 ? '\\' : '/') : '-'), cx * cw, cy * ch);
          }
        }
      }
      if (!deCima) desenharChao(t);

      letras = 0;
      const lotes = cores.map(m => m.map(() => []));
      for (let l = 0; l < rows; l++) {
        for (let c = 0; c < cols; c++) {
          const k = l * cols + c;
          const id = idb[k];
          if (id === 0) continue;
          // borda: vizinhos vazios ou de outra superfície que está atrás
          let ex = 0, ey = 0, nd = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const ll = l + dy;
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const cc = c + dx;
              let difere = true;
              if (ll >= 0 && cc >= 0 && ll < rows && cc < cols) {
                const q = ll * cols + cc;
                const iq = idb[q];
                difere = iq === 0 || (iq !== id && zb[q] < zb[k] - 0.012);
              }
              if (difere) { ex += dx; ey += dy; nd++; }
            }
          }
          let g, lum = lumb[k], m = matb[k];
          letras++;
          const idade = idadeb[k];
          if (idade < 0.09) {
            // decodificação: logo atrás da frente a célula ainda é um símbolo de código trocando
            g = CODIGO[Math.floor(hash2(c + Math.floor(t * 24), l) * CODIGO.length)];
            lum = Math.max(lum, 0.55);
          } else if (nd === 0 || (ex === 0 && ey === 0)) {
            const idx = clamp(lum * (RAMPA.length - 1) + (hash2(c, l) - 0.5) * 1.6, 0, RAMPA.length - 1);
            g = RAMPA[Math.round(idx)];
          } else {
            const ax = Math.abs(ex), ay = Math.abs(ey);
            if (ax > ay * 2.2) g = '|';
            else if (ay > ax * 2.2) g = ey < 0 ? '_' : '-';
            else g = ex * ey > 0 ? '/' : '\\';
            lum = Math.min(1, lum + 0.16);
          }
          const h = hotb[k];
          if (h > 0.25) { m = 3; lum = h; }
          lotes[m][Math.round(clamp(lum) * (NIVEIS - 1))].push(c, l, g);
        }
      }
      for (let m = 0; m < lotes.length; m++) {
        for (let i = 0; i < NIVEIS; i++) {
          const lt = lotes[m][i];
          if (!lt.length) continue;
          ctx.fillStyle = cores[m][i];
          for (let j = 0; j < lt.length; j += 3) ctx.fillText(lt[j + 2], lt[j] * cw, lt[j + 1] * ch);
        }
      }

      // faíscas: nascem na frente de luz e sobem apagando
      if (!reduzido) {
        if (ncand && dt > 0) {
          const nasc = Math.min(11, Math.round(dt * 130));
          for (let i = 0; i < nasc; i++) {
            const k = candidatos[Math.floor(sorte() * ncand)];
            faiscas.push({
              x: (k % cols) + 0.5, y: Math.floor(k / cols) + 0.5,
              vx: (sorte() - 0.5) * 11, vy: -3 - sorte() * 9,
              vida: 0, fim: 0.6 + sorte() * 1.3,
              g: '*+.\'`'[Math.floor(sorte() * 5)], quente: sorte() < 0.35
            });
          }
          // espiral: duas faíscas giram em volta da frente de luz, como uma solda
          const k0 = candidatos[0], fx = (k0 % cols) + 0.5, fy = Math.floor(k0 / cols) + 0.5;
          for (let j = 0; j < 2; j++) {
            const a = t * 9 + j * Math.PI;
            faiscas.push({ x: fx + Math.cos(a) * 4, y: fy + Math.sin(a) * 1.4, vx: -Math.sin(a) * 14, vy: Math.cos(a) * 4 - 3,
              vida: 0, fim: 0.45, g: '*', quente: true });
          }
        }
        // #fase:aberta
        // pólen: grãos dourados que flutuam em volta da flor e seguem o vento
        if (o > 0.5 && polen.length < 46 && sorte() < dt * 9) {
          const ang = sorte() * Math.PI * 2, rr = 0.15 + sorte() * 0.45;
          polen.push({ x: (ox + Math.cos(ang) * rr * S) / cw, y: (oy - (TOPO + 0.25 + Math.sin(ang) * rr * 0.5) * S) / ch,
            f: 0.5 + sorte(), fase: sorte() * 6.28, vida: 0, fim: 5 + sorte() * 5 });
        }
        for (let i = polen.length - 1; i >= 0; i--) {
          const q = polen[i];
          q.vida += dt;
          if (q.vida > q.fim) { polen.splice(i, 1); continue; }
          q.x += (Math.sin(tb * q.f + q.fase) * 0.9 + forcaRajada * rajada.dir * 9) * dt;
          q.y += (-0.7 + Math.cos(tb * q.f * 1.3 + q.fase) * 0.5) * dt;
          const a = Math.sin((q.vida / q.fim) * Math.PI) * (0.55 + 0.45 * Math.sin(tb * 5 * q.f + q.fase));
          ctx.fillStyle = `rgba(255,205,120,${(a * 0.85).toFixed(2)})`;
          ctx.fillText(q.f > 1.1 ? "'" : '.', Math.round(q.x) * cw, Math.round(q.y) * ch);
        }
        // pétala de letras que se solta e cai girando
        if (t > proxPetala) {
          const lado = sorte() < 0.5 ? -1 : 1;
          petalasCaindo.push({ x: (ox + lado * S * 0.2) / cw, y: (oy - (TOPO + 0.32) * S) / ch,
            vx: lado * 2, vy: 2.5, rot: sorte() * 6.28, vr: 1.6 + sorte(), vida: 0, fim: 9 });
          proxPetala = t + 11 + sorte() * 7;
        }
        for (let i = petalasCaindo.length - 1; i >= 0; i--) {
          const pe = petalasCaindo[i];
          pe.vida += dt;
          pe.vx += (Math.sin(pe.vida * 1.3) * 3 + forcaRajada * rajada.dir * 14 - pe.vx) * dt;
          pe.x += pe.vx * dt; pe.y += pe.vy * dt; pe.rot += pe.vr * dt;
          if (pe.vida > pe.fim || pe.y > rows) { petalasCaindo.splice(i, 1); continue; }
          const a = Math.min(1, pe.vida * 2) * Math.min(1, (pe.fim - pe.vida) / 1.5);
          const giro = Math.cos(pe.rot); // virar a pétala no ar = largura que muda
          const rx = 2.6 * Math.abs(giro) + 0.6, ry = 1.5;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) {
            const e = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
            if (e > 1) continue;
            const lum = clamp(0.35 + 0.5 * (1 - e) + 0.25 * giro * (dx / 3));
            ctx.fillStyle = cores[giro > 0 ? PET_A : PET_B][Math.round(lum * (NIVEIS - 1))].replace('hsl(', 'hsla(').replace(')', ` / ${a.toFixed(2)})`);
            ctx.fillText(e > 0.6 ? (dx * dy > 0 ? '\\' : dx * dy < 0 ? '/' : dy ? '-' : '|') : RAMPA[Math.round(lum * (RAMPA.length - 1))],
              Math.round(pe.x + dx) * cw, Math.round(pe.y + dy) * ch);
          }
        }
        // depois de aberta, um brilho raro em volta da flor
        if (o > 0.6 && sorte() < dt * 1.4) {
          const ang = sorte() * Math.PI * 2, rr = 0.25 + sorte() * 0.25;
          faiscas.push({
            x: (ox + Math.cos(ang) * rr * S) / cw, y: (oy - (TOPO + 0.2 + Math.sin(ang) * rr * 0.6) * S) / ch,
            vx: 0, vy: -0.6, vida: 0, fim: 1.2 + sorte(), g: '+'
          });
        }
        for (let i = faiscas.length - 1; i >= 0; i--) {
          const f = faiscas[i];
          f.vida += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.96;
          if (f.vida >= f.fim) { faiscas.splice(i, 1); continue; }
          const a = Math.sin((f.vida / f.fim) * Math.PI);
          ctx.fillStyle = f.quente ? `rgba(255,120,140,${(a * 0.95).toFixed(2)})` : `rgba(255,236,200,${(a * 0.9).toFixed(2)})`;
          ctx.fillText(f.g, Math.floor(f.x) * cw, Math.floor(f.y) * ch);
        }
        // ondas de choque: anéis de pontos que saem da flor (botão, início e fim da abertura)
        for (let i = ondas.length - 1; i >= 0; i--) {
          const w = ondas[i];
          w.vida += dt;
          if (w.vida > w.fim) { ondas.splice(i, 1); continue; }
          if (w.vida < 0) continue;
          const q = w.vida / w.fim, r = (0.12 + q * 1.5 * w.forca) * S;
          const a = (1 - q) * (1 - q) * Math.min(1, w.forca);
          const cx = ox, cy = oy - w.y * S, n = Math.min(220, Math.round(r / cw * 2.2));
          ctx.fillStyle = `rgba(255,150,165,${(a * 0.85).toFixed(2)})`;
          for (let j = 0; j < n; j++) {
            const ang = (j / n) * Math.PI * 2;
            const px = cx + Math.cos(ang) * r, py = cy + Math.sin(ang) * r * 0.42;
            ctx.fillText(hash2(j, Math.floor(q * 20)) < 0.25 ? '*' : '.', Math.floor(px / cw) * cw, Math.floor(py / ch) * ch);
          }
        }
      }

      if (!abriu && (reduzido || t >= T.abertura[1])) {
        abriu = true;
        aoAbrirFns.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
      }
    }

    function laco(agora) {
      raf = requestAnimationFrame(laco);
      if (pausado) { ultimo = agora; return; }
      const dt = Math.min(0.1, (agora - ultimo) / 1000);
      if (dt < 1 / 31) return; // ~30 quadros/s, como a referência
      ultimo = agora;
      relogio += dt;
      fpsMedio += (1 / dt - fpsMedio) * 0.1;
      quadro(relogio, dt);
    }

    if (interativo) {
      const pos = ev => {
        const r = canvas.getBoundingClientRect();
        ponteiro.x = ev.clientX - r.left; ponteiro.y = ev.clientY - r.top;
      };
      canvas.addEventListener('pointermove', ev => { pos(ev); if (ev.pointerType === 'mouse') ponteiro.alvo = 1; }, { passive: true });
      canvas.addEventListener('pointerleave', () => { ponteiro.alvo = 0; }, { passive: true });
      canvas.addEventListener('pointerdown', ev => {
        pos(ev);
        ponteiro.alvo = 1;
        // toque: faíscas no ponto e um sopro na direção oposta
        explodir(ponteiro.x / cw, ponteiro.y / ch, 22, 14);
        sopro.v += (ponteiro.x < ox ? 1 : -1) * 0.22;
        if (ev.pointerType !== 'mouse') setTimeout(() => { ponteiro.alvo = 0; }, 1800);
      }, { passive: true });
    }

    medir();
    const api = {
      iniciar() {
        if (reduzido) { quadro(99, 0); return api; }
        if (rodando) return api;
        rodando = true; ultimo = performance.now();
        raf = requestAnimationFrame(laco);
        return api;
      },
      pausar() { pausado = true; return api; },
      destruir() { cancelAnimationFrame(raf); rodando = false; faiscas.length = 0; aoFaseFns.length = 0; aoAbrirFns.length = 0; return api; },
      retomar() { pausado = false; ultimo = performance.now(); return api; },
      reiniciar() {
        relogio = 0; abriu = false; fase = ''; faiscas.length = 0; polen.length = 0; cadentes.length = 0; petalasCaindo.length = 0;
        proxCadente = 9; proxPetala = 18.5; proxRajada = 21; rajada.ini = -99;
        if (!rodando) api.iniciar(); return api;
      },
      redimensionar() { medir(); quadro(reduzido ? 99 : relogio, 0); return api; },
      aoAbrir(fn) { if (typeof fn === 'function') { if (abriu) fn(); else aoAbrirFns.push(fn); } return api; },
      // QA: desenha o instante exato t (s), sem laço. dt simula o passo para as faíscas.
      desenharEm(t, dt = 1 / 30) { cancelAnimationFrame(raf); rodando = false; relogio = t; quadro(t, dt); return api; },
      definirArea(a) { area = { x: 0, y: 0, w: 1, h: 1, ...a }; medir(); if (!rodando) quadro(reduzido ? 99 : relogio, 0); return api; },
      aoFase(fn) { if (typeof fn === 'function') { aoFaseFns.push(fn); if (fase) fn(fase); } return api; },
      get estatisticas() {
        return { fase, tempo: relogio, abertura: reduzido ? 1 : suave(prog(relogio, T.abertura)),
          balanco: (Math.atan(2 * balX * TOPO) * 180) / Math.PI, letras, fps: Math.round(fpsMedio), faiscas: faiscas.length };
      },
      // Retângulo (px CSS) que a planta ocupa já aberta, com folga: o que flutuar na tela não deve entrar aqui.
      get reserva() {
        const x0 = ox - S * 0.5, x1 = ox + S * 0.5, y0 = oy - S * 1.62, y1 = oy + S * 0.05;
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      },
      get tempo() { return relogio; }
    };
    return api;
  }

  window.Tulipa = { criar, LINHA_DO_TEMPO: T_BASE, FASES };
})();
