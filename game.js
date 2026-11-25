
/* =========================================================================
   Magic Fever — minimal playable replica
   规则（来自录像逐帧拆解）：
     1) 施法沿「列」纵向命中该列最下方的一块
     2) 同色才可发射（不同色拒绝发射，不消耗）
     3) 命中后按 4-连通（横竖/L型，不含斜向）整块崩解
     4) 胜利 = 画布清空；失败 = 传送带 5 人全满 且 全场无合法落点
   ========================================================================= */
(function () {
  "use strict";

  window.addEventListener("error", function (e) {
    var el = document.getElementById("err");
    if (el) {
      el.style.display = "block";
      el.textContent = "ERR " + e.message + " @" + e.lineno + ":" + e.colno;
    }
    document.title = "ERR " + e.message;
  });

  // ---------- 设计坐标（与原录屏 448x960 一致） ----------
  const W = 448, H = 960;
  const BX = 38, BY = 161, BW = 373, BH = 368;
  const NX = 36, NY = 36;
  const CW = BW / NX, CH = BH / NY;
  const TILE_W = 10.16, TILE_H = 10.02;

  const PALETTE = {
    R: 0xC6383F, B: 0x3D8FE0, G: 0x81C94B, Y: 0xEFC53F, P: 0xE2449B
  };
  const COLORS = ["R", "B", "G", "Y", "P"];

  // Level 1：直接从录像 t=8.0s 的帧逐格提取的原始图案
  const MAP_SPIRAL = [
    "....................................",
    ".PPPPGGGGGBBBBBBBBBBBBGGGGGPPPPPPPP.",
    ".PPPGGGGBBBBBBBBBBBBBBBBBGGGPPPPPPP.",
    ".PPGGGBBBBBRRRRRRRRRRRBBBBGGGGPPPPP.",
    ".PGGG.BBBRRRRRRRRRRRRRRRBBBGGGPPPPP.",
    ".GGGBB...RRYYYYYYYYYYRRRRBBBBGGPPPP.",
    ".GGBB.YY.YYYYYYYYYYYYYYRRRRBBGGGPPP.",
    ".GBBB.YYYYYYPPPPPPPPYYYYRRRRBBGGGPP.",
    ".BBB...YYYPPPPPPPPPPPPYYYYRRBBBGGPP.",
    ".BB...YYYPPPPGGGGGGGPPPPYYRRRBBGGGP.",
    ".B...YYYPPPGGGGGGGGGGGPPPYYRRBBBGGP.",
    ".B..YYYPPPGGGBBBBBBGGGGPPYYYRRBBGGP.",
    "....YYPPPGGGBBBBBBBBBGGPPPYYRRBBGGG.",
    "...YYYPPGGGBBBRRRRRBBBGGPPYYRRRBBGG.",
    "...YYPPGGGBBBRRRRRRRBBGGPPYYYRRBBGG.",
    "...YYPPGGBBBRRRYYYRRBBGGGPPYYRRBBGG.",
    "..YYPPPGGBBRRYYYYYYYBBBGGPPYYRRBBGG.",
    "..YYPPGGGBBRRYYPYYYYBBGGPPPYYRRBBGG.",
    "..YYPPGGBBRRRYYPYYYYBBGGPPYYYRRBBGG.",
    "..YYPPGGBBRRYYPPYYYYBGGGPPYYRRBBBGG.",
    "..YYPPGGBBRRRYYPPGGGGGGPPPYYRRBBGGG.",
    "..YYPPGGBBBRRYYPPPGGGGPPPYYRRRBBGGP.",
    "..YYPPPGGBBRRYYYPPPPPPPPYYYRRBBBGGP.",
    "..YYYPPGGBBRRRYYYPPPPPYYYYRRRBBGGPP.",
    "...YYPPGGGBBRRRYYYYYYYYYYRRRBBGGGPP.",
    "...YYPPPGGBBBRRRRYYYYYYRRRRBBBGGPPP.",
    "...YYYPPGGGBBBRRRRRRRRRRRBBBBGGGPPY.",
    ".B..YYPPPGGGBBBBRRRRRRRRBBBBGGGPPPY.",
    ".B...YYPPPGGGBBBBBBBBBBBBBGGGGPPPYY.",
    ".BB..YYYPPPGGGGBBBBBBBBBGGGGGPPPYYY.",
    ".BB...YYYPPPPGGGGGGGGGGGGGGPPPPYYYY.",
    ".BBB...YYYPPPPPGGGGGGGGGGPPPPYYYYYY.",
    ".BBBB...YYYYPPPPPPPPPPPPPPPPYYYYYYY.",
    ".BBBBB...YYYYYPPPPPPPPPPPPYYYYYYYYY.",
    ".BBBBBB....YYYYYYYPPPYYYYYYYYYYYYYY.",
    "...................................."
  ];

  // Level 2：程序生成的甜甜圈（6 色不引入，仍用同 5 色，环带更碎）
  function makeDonut() {
    const g = [];
    const cx = 17.5, cy = 17.5;
    for (let j = 0; j < NY; j++) {
      let row = "";
      for (let i = 0; i < NX; i++) {
        const dx = i - cx, dy = j - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r > 15.2 || r < 4.6) { row += "."; continue; }
        const ang = Math.atan2(dy, dx);
        const band = Math.floor((r - 4.6) / 2.6);
        const sector = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 12 + band * 1.7);
        row += COLORS[((band + sector) % 5 + 5) % 5];
      }
      g.push(row);
    }
    return g;
  }

  // Level 2：五角星（原作 L2 为星形）—— 按到星边界的距离分成同心色层，背景留空
  function makeStar() {
    const g = [];
    const R = 17.5, r = 7.6, cx = 18, cy = 18 + (R - R * Math.cos(Math.PI / 5)) / 2;
    const pts = [];
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 5;
      const rr = (k % 2 === 0) ? R : r;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    function inside(x, y) {
      let c = false;
      for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
        const xi = pts[a][0], yi = pts[a][1], xj = pts[b][0], yj = pts[b][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
      }
      return c;
    }
    function edgeDist(x, y) {
      let m = 1e9;
      for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
        const ax = pts[b][0], ay = pts[b][1], dx = pts[a][0] - ax, dy = pts[a][1] - ay;
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
        m = Math.min(m, Math.hypot(x - ax - u * dx, y - ay - u * dy));
      }
      return m;
    }
    // 层色：外 → 内（每层约 1.7 格厚）
    const RING = ["Y", "R", "P", "B", "G"];
    for (let j = 0; j < NY; j++) {
      let row = "";
      for (let i = 0; i < NX; i++) {
        const x = i + 0.5, y = j + 0.5;
        if (i === 0 || j === 0 || i === NX - 1 || j === NY - 1 || !inside(x, y)) { row += "."; continue; }
        row += RING[Math.min(RING.length - 1, Math.floor(edgeDist(x, y) / 1.7))];
      }
      g.push(row);
    }
    return g;
  }

  const LEVELS = [
    { name: "Level 1", map: MAP_SPIRAL },
    { name: "Level 2", map: makeStar() },
    { name: "Level 3", map: makeDonut() }
  ];
  const META_TOTAL = 7;   // 通关面板 meta 进度条分母（原作录像 1/7）

  // ---------- 表现开关（新表现均可单独关闭；?classic=1 一键回退旧表现） ----------
  const CLASSIC = /[?&]classic=1/.test(location.search);
  const FX = {
    banner: !CLASSIC,     // 失败：Out of Space! 横幅 → Continue? 面板
    welldone: !CLASSIC,   // 通关：WELL DONE! + 彩纸 + 金币堆 + meta 进度条
    intro: !CLASSIC,      // 关间过场：淡黑 + Magic Fever 标题
    hatBall: !CLASSIC,    // 巫师帽尖小球
    ground: !CLASSIC      // 地面：3 列队伍 + 大号巫师 + 石砖草边（原作布局）
  };

  // ---------- 舞台缩放 ----------
  const stage = document.getElementById("stage");
  const NOSCALE = /[?&]noscale=1/.test(location.search);
  if (NOSCALE) document.body.classList.add('noscale');
  function fitStage() {
    if (NOSCALE) { stage.style.transform = 'none'; return; }
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.transform = "scale(" + s + ")";
  }
  window.addEventListener("resize", fitStage);
  fitStage();

  // ---------- three.js 基础 ----------
  const canvas = document.getElementById("gl");
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0xE9A96C, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0.1, 2000);
  camera.position.set(0, 0, 500);
  camera.lookAt(0, 0, 0);

  // 光照
  scene.add(new THREE.AmbientLight(0xffffff, 0.95));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.5);
  keyLight.position.set(-260, 420, 600);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xffd9a0, 0.22);
  rimLight.position.set(300, -200, 400);
  scene.add(rimLight);

  // 设计坐标 -> 世界坐标
  function wx(x) { return x - W / 2; }
  function wy(y) { return H / 2 - y; }

  // ---------- 背景纹理（墙体 / 沙地 / 木架 / 画布板） ----------
  function makeBackground() {
    const S = 2;
    const c = document.createElement("canvas");
    c.width = W * S; c.height = H * S;
    const g = c.getContext("2d");
    g.scale(S, S);

    // 沙地底色
    const bg = g.createLinearGradient(0, 140, 0, H);
    bg.addColorStop(0, "#EDB077");
    bg.addColorStop(0.55, "#E8A469");
    bg.addColorStop(1, "#D98A4C");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // 顶部石墙
    g.save();
    g.beginPath(); g.rect(0, 0, W, 152); g.clip();
    g.fillStyle = "#E2A468"; g.fillRect(0, 0, W, 152);
    let seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let row = 0; row < 4; row++) {
      const y = row * 40 - 6;
      let x = -20 + (row % 2) * 26;
      while (x < W + 20) {
        const w = 40 + rnd() * 34, h = 33 + rnd() * 6;
        const shade = 0.92 + rnd() * 0.14;
        g.fillStyle = "rgba(" + Math.round(214 * shade) + "," + Math.round(158 * shade) + "," + Math.round(104 * shade) + ",1)";
        roundRect(g, x, y, w, h, 9); g.fill();
        g.strokeStyle = "rgba(150,96,52,.35)"; g.lineWidth = 2; g.stroke();
        g.fillStyle = "rgba(255,225,190,.30)";
        roundRect(g, x + 4, y + 3, w - 8, 7, 4); g.fill();
        x += w + 5;
      }
    }
    g.restore();
    // 墙与沙地的交界阴影
    const sh = g.createLinearGradient(0, 148, 0, 186);
    sh.addColorStop(0, "rgba(120,70,35,.35)");
    sh.addColorStop(1, "rgba(120,70,35,0)");
    g.fillStyle = sh; g.fillRect(0, 148, W, 38);

    // 画布板（石板）
    const px = BX, py = BY, pw = BW, ph = BH;
    g.save();
    g.shadowColor = "rgba(80,45,20,.45)"; g.shadowBlur = 16; g.shadowOffsetY = 8;
    g.fillStyle = "#3B3F54";
    roundRect(g, px, py, pw, ph, 14); g.fill();
    g.restore();
    g.strokeStyle = "#4E5470"; g.lineWidth = 3;
    roundRect(g, px + 1.5, py + 1.5, pw - 3, ph - 3, 13); g.stroke();
    const inner = g.createLinearGradient(0, py, 0, py + ph);
    inner.addColorStop(0, "rgba(0,0,0,.20)");
    inner.addColorStop(0.5, "rgba(0,0,0,0)");
    inner.addColorStop(1, "rgba(0,0,0,.14)");
    g.fillStyle = inner;
    roundRect(g, px + 3, py + 3, pw - 6, ph - 6, 12); g.fill();

    // 网格点
    g.fillStyle = "rgba(255,255,255,.055)";
    for (let j = 0; j <= NY; j++) {
      for (let i = 0; i <= NX; i++) {
        const x = BX + i * CW, y = BY + j * CH;
        if (x < BX + 2 || x > BX + BW - 2 || y < BY + 2 || y > BY + BH - 2) continue;
        g.beginPath(); g.arc(x, y, 0.85, 0, 7); g.fill();
      }
    }

    // Conveyor housing; the moving rubber surface is rendered separately.
    const sy = 594, sh2 = 86;
    g.fillStyle = "#291c1a"; g.fillRect(0, sy, W, sh2);
    const rail = g.createLinearGradient(0, sy, 0, sy + 14);
    rail.addColorStop(0, "#bc9471"); rail.addColorStop(.4, "#76573f"); rail.addColorStop(1, "#3d2d26");
    g.fillStyle = rail; g.fillRect(0, sy - 3, W, 12); g.fillRect(0, sy + sh2 - 9, W, 12);
    for (let x = 14; x < W; x += 42) {
      g.fillStyle = "#d5b994"; g.beginPath(); g.arc(x, sy + 2, 2, 0, Math.PI * 2); g.fill();
    }

    const ledgeY = sy + sh2;
    if (FX.ground) {
      drawGroundFancy(g, ledgeY);
    } else {
    // 台面下方石材（浅色石阶）
    const st = g.createLinearGradient(0, ledgeY, 0, ledgeY + 54);
    st.addColorStop(0, "#E8CDA2");
    st.addColorStop(1, "#C79A66");
    g.fillStyle = st;
    g.fillRect(0, ledgeY, W, 54);
    g.fillStyle = "rgba(255,240,215,.55)";
    g.fillRect(0, ledgeY, W, 3);
    // 石块分隔
    g.strokeStyle = "rgba(130,92,54,.4)"; g.lineWidth = 2.5;
    let bx = 26;
    while (bx < W) {
      g.beginPath(); g.moveTo(bx, ledgeY); g.lineTo(bx, ledgeY + 54); g.stroke();
      bx += 84;
    }
    g.beginPath(); g.moveTo(0, ledgeY + 27); g.lineTo(W, ledgeY + 27); g.stroke();

    // 地面
    const gyTop = ledgeY + 54;
    const gg = g.createLinearGradient(0, gyTop, 0, H);
    gg.addColorStop(0, "#E39A5C");
    gg.addColorStop(0.45, "#DE8E4E");
    gg.addColorStop(1, "#C9763C");
    g.fillStyle = gg;
    g.fillRect(0, gyTop, W, H - gyTop);

    // 地面细颗粒
    g.save();
    g.globalAlpha = 0.05;
    for (let i = 0; i < 1400; i++) {
      const px = Math.random() * W, py = gyTop + Math.random() * (H - gyTop);
      g.fillStyle = Math.random() > 0.5 ? "#000" : "#fff";
      g.fillRect(px, py, 1.6, 1.6);
    }
    g.restore();

    // 地面中央的柔和暗场（让巫师有落点）
    const rad = g.createRadialGradient(W / 2, 880, 30, W / 2, 880, 250);
    rad.addColorStop(0, "rgba(110,50,15,.16)");
    rad.addColorStop(1, "rgba(110,50,15,0)");
    g.fillStyle = rad;
    g.fillRect(0, gyTop, W, H - gyTop);
    }

    // 顶部与地面的整体压暗（景深）
    const vig = g.createLinearGradient(0, 0, 0, H);
    vig.addColorStop(0, "rgba(90,50,20,.10)");
    vig.addColorStop(0.35, "rgba(90,50,20,0)");
    vig.addColorStop(1, "rgba(90,40,10,.16)");
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);

    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  // 原作地面：木架下一排圆角米色大石砖 → 一条草边 → 橙色夯土地面（带细颗粒与浅色碎石）
  function drawGroundFancy(g, ledgeY) {
    const LH = 50;
    // 石砖缝隙底色
    g.fillStyle = "#9C6B3E";
    g.fillRect(0, ledgeY, W, LH);
    let x = -34;
    let seed = 11;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    while (x < W + 10) {
      const bw = 92 + rnd() * 18;
      const sg = g.createLinearGradient(0, ledgeY, 0, ledgeY + LH);
      sg.addColorStop(0, "#F4DDB4");
      sg.addColorStop(0.55, "#E7C795");
      sg.addColorStop(1, "#CFA571");
      g.fillStyle = sg;
      roundRect(g, x + 2, ledgeY + 3, bw - 4, LH - 6, 10); g.fill();
      g.strokeStyle = "rgba(140,96,54,.45)"; g.lineWidth = 1.5; g.stroke();
      // 顶部高光 + 底部暗边
      g.fillStyle = "rgba(255,246,226,.65)";
      roundRect(g, x + 8, ledgeY + 6, bw - 16, 5, 3); g.fill();
      g.fillStyle = "rgba(150,100,55,.25)";
      roundRect(g, x + 6, ledgeY + LH - 12, bw - 12, 5, 3); g.fill();
      // 斑点
      for (let k = 0; k < 4; k++) {
        g.fillStyle = "rgba(170,120,70," + (0.12 + rnd() * 0.12) + ")";
        g.beginPath(); g.arc(x + 12 + rnd() * (bw - 24), ledgeY + 14 + rnd() * (LH - 26), 1.5 + rnd() * 2, 0, 7); g.fill();
      }
      x += bw;
    }

    // 地面
    const gyTop = ledgeY + LH;
    const gg = g.createLinearGradient(0, gyTop, 0, H);
    gg.addColorStop(0, "#C9783C");
    gg.addColorStop(0.08, "#E39A5A");
    gg.addColorStop(0.5, "#E0914F");
    gg.addColorStop(1, "#D07F40");
    g.fillStyle = gg;
    g.fillRect(0, gyTop, W, H - gyTop);
    // 石砖在地面上的投影
    const ls = g.createLinearGradient(0, gyTop, 0, gyTop + 26);
    ls.addColorStop(0, "rgba(110,50,15,.35)");
    ls.addColorStop(1, "rgba(110,50,15,0)");
    g.fillStyle = ls; g.fillRect(0, gyTop, W, 26);

    // 细颗粒 + 浅色碎石
    g.save();
    for (let i = 0; i < 1600; i++) {
      g.globalAlpha = 0.05;
      g.fillStyle = rnd() > 0.5 ? "#5a2a0a" : "#fff";
      g.fillRect(rnd() * W, gyTop + rnd() * (H - gyTop), 1.6, 1.6);
    }
    for (let i = 0; i < 26; i++) {
      const px = rnd() * W, py = gyTop + 20 + rnd() * (H - gyTop - 20);
      g.globalAlpha = 0.35;
      g.fillStyle = "#F2B27A";
      g.beginPath(); g.ellipse(px, py, 2.5 + rnd() * 3, 1.5 + rnd() * 1.5, 0, 0, 7); g.fill();
      g.globalAlpha = 0.25;
      g.fillStyle = "#9B5524";
      g.beginPath(); g.ellipse(px + 1, py + 2, 2.5, 1, 0, 0, 7); g.fill();
    }
    g.restore();

    // 草边：沿石砖底部一条深绿 + 亮绿草叶
    g.fillStyle = "#3F7A22";
    g.fillRect(0, gyTop - 2, W, 6);
    for (let i = 0; i < 90; i++) {
      const bx = i * (W / 88) + rnd() * 3;
      const h = 5 + rnd() * 7;
      g.fillStyle = rnd() > 0.5 ? "#5FA632" : "#4A8E27";
      g.beginPath();
      g.moveTo(bx - 3, gyTop + 3);
      g.quadraticCurveTo(bx + (rnd() - 0.5) * 4, gyTop + 3 - h * 0.6, bx + (rnd() - 0.5) * 3, gyTop + 3 - h);
      g.lineTo(bx + 3, gyTop + 3);
      g.closePath(); g.fill();
    }
    g.fillStyle = "rgba(160,220,110,.5)";
    g.fillRect(0, gyTop - 2, W, 1.5);
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  const bgPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshBasicMaterial({ map: makeBackground(), depthTest: false })
  );
  bgPlane.position.set(0, 0, -50);
  bgPlane.renderOrder = -100;
  scene.add(bgPlane);

  // ---------- 棋盘（单 draw call + 自定义 shader） ----------
  const boardUniforms = {
    uTime: { value: 0 }
  };

  const boardMat = new THREE.ShaderMaterial({
    uniforms: boardUniforms,
    vertexShader: `
      attribute vec2 aCenter;
      attribute vec3 aColor;
      attribute float aT0;
      attribute float aState;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vCol;
      varying float vIgnite;
      void main() {
        vUv = position.xy + 0.5;
        vCol = aColor;
        float s = 1.0;
        float lift = 0.0;
        float ign = 0.0;
        if (aState > 1.5) {
          s = 0.0;
        } else if (aState > 0.5) {
          float age = uTime - aT0;
          if (age < 0.0) {
            // 还没轮到它：原样显示，等着引信烧过来
            s = 1.0;
            lift = 0.0;
            ign = 0.0;
          } else {
            float t = clamp(age / 0.24, 0.0, 1.0);
            // 点火瞬间先"爆"一下再塌缩
            ign = 1.0 - smoothstep(0.0, 0.13, age);
            float e = t * t;
            s = (1.0 + 0.34 * ign) * (1.0 - e);
            lift = t * 15.0 + ign * 2.0;
          }
        }
        vIgnite = ign;
        vec2 local = vec2(position.x * ${TILE_W.toFixed(2)}, position.y * ${TILE_H.toFixed(2)}) * s;
        vec3 p = vec3(aCenter.x + local.x, aCenter.y + local.y + lift, 0.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vCol;
      varying float vIgnite;
      void main() {
        vec2 c = vUv - 0.5;
        float r = 0.17;
        vec2 q = abs(c) - vec2(0.5 - r);
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
        float alpha = smoothstep(0.03, -0.01, d);
        if (alpha < 0.5) discard;

        // 上方受光 / 下方背光（幅度收敛，避免"气泡感"）
        float lit = smoothstep(0.10, 0.95, vUv.y);
        vec3 col = vCol * mix(0.90, 1.06, lit);

        // 顶部亮边（模拟方块上沿的高光）
        float topEdge = smoothstep(0.72, 0.94, vUv.y) * smoothstep(0.0, 0.06, 0.02 - d);
        col += vec3(0.10) * topEdge;

        // 左下轻微暗边
        float botEdge = (1.0 - smoothstep(0.06, 0.30, vUv.y)) * smoothstep(0.0, 0.08, 0.02 - d);
        col *= 1.0 - 0.10 * botEdge;

        // 点燃瞬间的白热
        col = mix(col, vec3(1.0, 0.99, 0.92), vIgnite * 0.92);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    transparent: false
  });

  const grid = [];        // {color, alive}
  let boardMesh = null;
  let attrT0, attrState;
  let aliveCount = 0;

  function buildBoard(map) {
    const total = NX * NY;
    const positions = new Float32Array(total * 4 * 3);
    const centers = new Float32Array(total * 4 * 2);
    const colors = new Float32Array(total * 4 * 3);
    const t0s = new Float32Array(total * 4);
    const states = new Float32Array(total * 4);
    const index = [];

    const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    const tmp = new THREE.Color();

    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i;
        const ch = map[j] ? map[j][i] : ".";
        const colorKey = (ch && ch !== ".") ? ch : null;
        grid[k] = { color: colorKey, alive: !!colorKey };

        const cx = wx(BX + (i + 0.5) * CW);
        const cy = wy(BY + (j + 0.5) * CH);
        tmp.set(colorKey ? PALETTE[colorKey] : 0x000000);

        for (let v = 0; v < 4; v++) {
          const base = (k * 4 + v);
          positions[base * 3 + 0] = corners[v][0];
          positions[base * 3 + 1] = corners[v][1];
          positions[base * 3 + 2] = 0;
          centers[base * 2 + 0] = cx;
          centers[base * 2 + 1] = cy;
          colors[base * 3 + 0] = tmp.r;
          colors[base * 3 + 1] = tmp.g;
          colors[base * 3 + 2] = tmp.b;
          t0s[base] = 0;
          states[base] = colorKey ? 0 : 2;
        }
        index.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aCenter", new THREE.BufferAttribute(centers, 2));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aT0", new THREE.BufferAttribute(t0s, 1));
    geo.setAttribute("aState", new THREE.BufferAttribute(states, 1));
    geo.setIndex(index);

    attrT0 = geo.attributes.aT0;
    attrState = geo.attributes.aState;

    if (boardMesh) { scene.remove(boardMesh); boardMesh.geometry.dispose(); }
    boardMesh = new THREE.Mesh(geo, boardMat);
    boardMesh.position.z = 0;
    scene.add(boardMesh);

    aliveCount = grid.filter(function (c) { return c.alive; }).length;
  }

  // ---------- 列 / 连通块 ----------
  function bottomOfColumn(i) {
    for (let j = NY - 1; j >= 0; j--) {
      const k = j * NX + i;
      if (grid[k].alive) return k;
    }
    return -1;
  }

  function componentFrom(k0) {
    const color = grid[k0].color;
    const seen = new Set([k0]);
    const order = [k0];
    const q = [k0];
    let head = 0;
    while (head < q.length) {
      const k = q[head++];
      const i = k % NX, j = (k - i) / NX;
      const nb = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]];
      for (let n = 0; n < 4; n++) {
        const ni = nb[n][0], nj = nb[n][1];
        if (ni < 0 || ni >= NX || nj < 0 || nj >= NY) continue;
        const nk = nj * NX + ni;
        if (seen.has(nk)) continue;
        if (!grid[nk].alive || grid[nk].color !== color) continue;
        seen.add(nk);
        order.push(nk);
        q.push(nk);
      }
    }
    return order; // BFS 顺序，同时就是剥离波的顺序
  }

  // ---------- 粒子 ----------
  const MAXP = 900;
  const pPos = new Float32Array(MAXP * 3);
  const pCol = new Float32Array(MAXP * 3);
  const pVel = new Float32Array(MAXP * 2);
  const pLife = new Float32Array(MAXP);
  const pMax = new Float32Array(MAXP);
  let pHead = 0;

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));

  function makeDotTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.25, "rgba(255,255,255,.85)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const dotTex = makeDotTexture();

  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 13, map: dotTex, vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, sizeAttenuation: false
  }));
  points.position.z = 20;
  points.frustumCulled = false;
  scene.add(points);

  function spawnParticle(x, y, vx, vy, life, color) {
    const i = pHead;
    pHead = (pHead + 1) % MAXP;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = 0;
    pVel[i * 2] = vx; pVel[i * 2 + 1] = vy;
    pLife[i] = life; pMax[i] = life;
    const c = new THREE.Color(color);
    pCol[i * 3] = c.r; pCol[i * 3 + 1] = c.g; pCol[i * 3 + 2] = c.b;
  }

  function burstAt(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 130;
      spawnParticle(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6,
        Math.cos(a) * sp, Math.sin(a) * sp + 40, 0.35 + Math.random() * 0.45, color);
    }
  }

  // ---------- 光弹（飞行的小光点 + 拖尾） / 冲击闪光 ----------
  // 原作：巫师身上先炸开一团光，然后一颗细亮的光弹在 ~0.1 秒内飞上去，带一条短拖尾，
  // 命中处再闪一下。不是那种常驻的光柱。
  function makeStreakTexture() {
    const c = document.createElement("canvas");
    c.width = 32; c.height = 128;
    const g = c.getContext("2d");
    // 竖直方向：顶部（弹头）最亮，向下衰减成拖尾
    const v = g.createLinearGradient(0, 0, 0, 128);
    v.addColorStop(0.00, "rgba(255,255,255,0.00)");
    v.addColorStop(0.10, "rgba(255,255,255,0.55)");
    v.addColorStop(0.30, "rgba(255,255,255,1.00)");
    v.addColorStop(0.55, "rgba(255,255,255,0.55)");
    v.addColorStop(1.00, "rgba(255,255,255,0.00)");
    g.fillStyle = v;
    g.fillRect(0, 0, 32, 128);
    // 横向：中间实、两侧羽化
    const h = g.createLinearGradient(0, 0, 32, 0);
    h.addColorStop(0.00, "rgba(0,0,0,0)");
    h.addColorStop(0.35, "rgba(0,0,0,0.0)");
    h.addColorStop(0.50, "rgba(0,0,0,1)");
    h.addColorStop(1.00, "rgba(0,0,0,0)");
    g.globalCompositeOperation = "destination-in";
    g.fillStyle = h;
    g.fillRect(0, 0, 32, 128);
    return new THREE.CanvasTexture(c);
  }
  const streakTex = makeStreakTexture();

  const streaks = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: streakTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: false, color: 0xffffff, opacity: 0
      })
    );
    m.visible = false;
    m.position.z = 16;
    scene.add(m);
    streaks.push({ mesh: m, t: 0, phase: 0, from: 0, to: 0, x: 0, arrived: false });
  }

  const flashes = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, color: 0xffffff, opacity: 0
    }));
    s.position.z = 18;
    s.visible = false;
    scene.add(s);
    flashes.push({ sprite: s, life: 0, max: 0, from: 1, to: 2 });
  }

  // 一颗光弹：从 (x, yFrom) 飞到 (x, yTo)
  function fireStreak(x, yFrom, yTo, color, onHit) {
    const s = streaks.find(function (o) { return o.phase === 0; }) || streaks[0];
    s.x = x; s.from = yFrom; s.to = yTo;
    s.t = 0; s.phase = 1; s.arrived = false;
    s.onHit = onHit || null;
    s.mesh.material.color.set(color);
    s.mesh.material.opacity = 0;
    s.mesh.visible = true;
    s.mesh.scale.set(12, 1, 1);
    s.mesh.position.set(wx(x), wy(yFrom), 16);
  }

  function fireFlash(x, y, color, size) {
    const f = flashes.find(function (o) { return o.life <= 0; }) || flashes[0];
    f.sprite.position.set(wx(x), wy(y), 18);
    f.sprite.material.color.set(color);
    f.sprite.material.opacity = 1;
    f.sprite.visible = true;
    f.life = 0.36; f.max = 0.36;
    f.from = size * 0.5; f.to = size * 1.35;
    f.sprite.scale.set(f.from, f.from, 1);
  }

  // ---------- 巫师 ----------
  const WIZ_R = 14;
  const SLOT_Y = 626;
  const BELT_LEFT = -48, BELT_LENGTH = W + 96, BELT_SPEED = 48;
  let beltOffset = 0;
  function beltPosition(i, offset = beltOffset) {
    return BELT_LEFT + ((i * BELT_LENGTH / 5 + offset) % BELT_LENGTH + BELT_LENGTH) % BELT_LENGTH;
  }
  function makeBelt() {
    // 纹理周期 = 一整圈传送带，正好均分五块区域，每块跟着对应槽位一起走
    const TW = 1024, TH = 128;            // 2 的幂，保证 RepeatWrapping 兼容
    const UNIT = TW / 5;
    const c = document.createElement("canvas"); c.width = TW; c.height = TH;
    const g = c.getContext("2d");

    function band(x, light) {
      const fill = g.createLinearGradient(0, 0, 0, TH);
      if (light) {
        fill.addColorStop(0, "#4a3f52"); fill.addColorStop(.46, "#836574"); fill.addColorStop(1, "#463c4a");
      } else {
        fill.addColorStop(0, "#1c1820"); fill.addColorStop(.46, "#3c2e36"); fill.addColorStop(1, "#1a161c");
      }
      g.fillStyle = fill; g.fillRect(x, 0, UNIT, TH);
      g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(x, 0, UNIT, 2);
      g.fillStyle = "rgba(0,0,0,.30)"; g.fillRect(x, TH - 4, UNIT, 4);
    }
    function seam(x) {
      g.fillStyle = "#17151c"; g.fillRect(x - 2, 0, 4, TH);
      g.fillStyle = "rgba(214,176,140,.30)"; g.fillRect(x + 2, 0, 1, TH);
    }

    // 区域 i 的中心对准槽位 i；i=0 的色块跨过纹理接缝，左右各补一份
    for (let i = 0; i < 5; i++) {
      for (let s = -1; s <= 1; s++) band(i * UNIT - UNIT / 2 + s * TW, i % 2 === 0);
    }
    for (let i = 0; i < 5; i++) seam((i + 0.5) * UNIT);

    const tex = new THREE.CanvasTexture(c); tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = W / BELT_LENGTH;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, 64), new THREE.MeshBasicMaterial({map:tex,depthTest:false}));
    mesh.position.set(0, wy(SLOT_Y + 7), -25); mesh.renderOrder = -90; scene.add(mesh);
    return tex;
  }
  const beltTexture = makeBelt();
  function syncBeltTexture() {
    beltTexture.offset.x = (-BELT_LEFT - beltOffset) / BELT_LENGTH;
  }
  // 地面待上场巫师的站位：按人数动态排成多行（每行最多 GROUND_PER_ROW 个，居中），
  // 纵向压缩在 y=762..920 之间，避免人数多时重叠到同一个点
  const GROUND_PER_ROW = 5, GROUND_X0 = 224, GROUND_DX = 76, GROUND_Y0 = 762, GROUND_SPAN = 158;
  // 原作布局：3 列纵队，前排紧贴石砖下沿，往下逐排排开（超出屏幕的后排不可见）
  const LANES = 3, LANE_X = [92, 224, 356], LANE_Y0 = 782, LANE_DY = 100;
  // 巫师整体放大倍数（原作巫师约 70px 宽）；小径上略小以放进木窗
  const WS_GROUND = FX.ground ? 2.1 : 1, WS_SLOT = FX.ground ? 1.5 : 1;
  function laneSpot(lane, row) { return { x: LANE_X[lane], y: LANE_Y0 + row * LANE_DY }; }
  function groundSpot(idx, total) {
    if (FX.ground) return laneSpot(idx % LANES, Math.floor(idx / LANES));
    const rows = Math.max(1, Math.ceil(total / GROUND_PER_ROW));
    const dy = rows > 1 ? Math.min(64, GROUND_SPAN / (rows - 1)) : 0;
    const r = Math.floor(idx / GROUND_PER_ROW);
    const inRow = Math.min(GROUND_PER_ROW, total - r * GROUND_PER_ROW);
    const c = idx % GROUND_PER_ROW;
    return { x: GROUND_X0 + (c - (inRow - 1) / 2) * GROUND_DX, y: GROUND_Y0 + r * dy };
  }

  function makeNumberSprite(text) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    g.clearRect(0, 0, 128, 128);
    g.font = "900 86px 'Nunito','Segoe UI',sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 14;
    g.strokeStyle = "rgba(30,14,6,.9)";
    g.strokeText(text, 64, 70);
    g.fillStyle = "#ffffff";
    g.fillText(text, 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  function makeSoftShadow() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grd.addColorStop(0, "rgba(0,0,0,.42)");
    grd.addColorStop(0.6, "rgba(0,0,0,.18)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const shadowTex = makeSoftShadow();

  function makeWizard(colorKey, charges) {
    const col = PALETTE[colorKey];
    const outer = new THREE.Group();
    const grp = new THREE.Group();
    grp.scale.setScalar(WS_GROUND);
    outer.add(grp);
    const dark = new THREE.Color(col).multiplyScalar(0.48).getHex();
    const light = new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.45).getHex();

    // 身后柔光/投影（正视视角下充当轮廓）
    const shade = new THREE.Sprite(new THREE.SpriteMaterial({
      map: shadowTex, transparent: true, depthWrite: false, depthTest: true, opacity: 0.85
    }));
    shade.scale.set(WIZ_R * 3.4, WIZ_R * 3.4, 1);
    shade.position.set(0, -WIZ_R * 0.35, -8);
    grp.add(shade);

    // 身体
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(WIZ_R, 24, 18),
      new THREE.MeshLambertMaterial({ color: col })
    );
    body.scale.set(1.02, 0.96, 0.9);
    grp.add(body);

    // 描边（背面放大的暗色球）
    const outline = new THREE.Mesh(
      new THREE.SphereGeometry(WIZ_R * 1.06, 24, 18),
      new THREE.MeshBasicMaterial({ color: dark, side: THREE.BackSide })
    );
    outline.scale.set(1.02, 0.96, 0.9);
    outline.position.z = -1.2;
    grp.add(outline);

    // 帽子
    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(WIZ_R * 0.78, WIZ_R * 1.05, 20),
      new THREE.MeshLambertMaterial({ color: dark })
    );
    hat.position.set(0.8, WIZ_R * 0.95, 1.5);
    hat.rotation.z = 0.14;
    grp.add(hat);

    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(WIZ_R * 0.22, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0xFFF3CE })
    );
    tip.position.set(3.6, WIZ_R * 1.47, 1.5);
    tip.visible = FX.hatBall;
    grp.add(tip);

    // 眼睛
    const eyeGeo = new THREE.SphereGeometry(1.9, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x241c28 });
    const e1 = new THREE.Mesh(eyeGeo, eyeMat); e1.position.set(-4.4, 3.6, WIZ_R * 0.86); grp.add(e1);
    const e2 = new THREE.Mesh(eyeGeo, eyeMat); e2.position.set(3.2, 3.6, WIZ_R * 0.86); grp.add(e2);

    // 数字
    const numMat = new THREE.SpriteMaterial({
      map: makeNumberSprite(String(charges)), transparent: true, depthTest: false, depthWrite: false
    });
    const num = new THREE.Sprite(numMat);
    num.scale.set(19, 19, 1);
    num.position.set(0, -2.5, WIZ_R + 3);
    grp.add(num);

    outer.userData = { colorKey: colorKey, charges: charges, numSprite: num, numMat: numMat, body: body, inner: grp };
    return outer;
  }

  function setWizardNumber(w, n) {
    w.userData.numMat.map.dispose();
    w.userData.numMat.map = makeNumberSprite(String(n));
    w.userData.numMat.needsUpdate = true;
  }

  const wizards = [];   // {mesh, slot|null, state: 'ground'|'slot'|'leaving'|'gone', ...}

  function slotPos(i) { return { x: beltPosition(i), y: SLOT_Y }; }

  function columnUnderWizard(w) {
    const x = w.mesh.position.x + W / 2;
    if (x < BX || x >= BX + BW) return -1;
    return Math.floor((x - BX) / CW);
  }

  function advanceBelt(dt) {
    if (!state.running || state.over) return;
    beltOffset = (beltOffset + BELT_SPEED * dt) % BELT_LENGTH;
    syncBeltTexture();
    for (let i = 0; i < 5; i++) {
      const w = state.slots[i]; if (!w) continue;
      const x = wx(beltPosition(i));
      if (w.moving) w.target.x = x;
      else w.mesh.position.x = x;
    }
  }

  function placeInSlot(w, i, animate) {
    const p = slotPos(i);
    w.slot = i;
    w.state = "slot";
    if (animate) {
      w.from = { x: w.mesh.position.x, y: w.mesh.position.y };
      w.target = { x: wx(p.x), y: wy(p.y) - (FX.ground ? 8 : 0) };
      w.t = 0; w.dur = 0.34; w.moving = true;
    } else {
      w.mesh.position.set(wx(p.x), wy(p.y), 5);
      w.moving = false;
    }
  }

  function buildWizards(colorCharges) {
    // colorCharges: [[colorKey, charges], ...]
    for (let i = 0; i < wizards.length; i++) {
      const mesh = wizards[i].mesh;
      scene.remove(mesh);
      const geometries = new Set(), materials = new Set();
      mesh.traverse(function (node) {
        if (node.geometry) geometries.add(node.geometry);
        if (node.material) materials.add(node.material);
      });
      geometries.forEach(function (g) { g.dispose(); });
      materials.forEach(function (m) { if (m.map && m.map !== shadowTex) m.map.dispose(); m.dispose(); });
    }
    wizards.length = 0;

    colorCharges.forEach(function (pair, idx) {
      const mesh = makeWizard(pair[0], pair[1]);
      const spot = groundSpot(idx, colorCharges.length);
      mesh.position.set(wx(spot.x), wy(spot.y), 5);
      scene.add(mesh);
      wizards.push({
        mesh: mesh, slot: null, state: "ground", order: idx, moving: false, cooldown: 0,
        lane: idx % LANES,
        homeX: wx(spot.x), homeY: wy(spot.y)
      });
    });
  }

  // 地面巫师重新排队（有人上小径或复活退回地面后调用），平滑移到新站位，不留空洞
  // FX.ground：每个巫师留在自己的纵队里，只在本列内向前补位
  function relayoutGround(animate) {
    const ground = state.queue.filter(function (w) { return w.state === "ground" && w.slot === null; });
    const laneRow = [0, 0, 0];
    ground.forEach(function (w, idx) {
      const s = FX.ground ? laneSpot(w.lane, laneRow[w.lane]++) : groundSpot(idx, ground.length);
      w.order = idx;
      w.homeX = wx(s.x); w.homeY = wy(s.y);
      if (animate) {
        w.from = { x: w.mesh.position.x, y: w.mesh.position.y };
        w.target = { x: w.homeX, y: w.homeY };
        w.t = 0; w.dur = 0.3; w.moving = true;
      } else {
        w.mesh.position.set(w.homeX, w.homeY, 5);
        w.moving = false;
      }
    });
  }

  // ---------- 音效（合成，无外部资源） ----------
  let actx = null;
  function audio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    return actx;
  }
  function beep(freq0, freq1, dur, type, gain) {
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || "triangle";
    o.frequency.setValueAtTime(freq0, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq1), a.currentTime + dur);
    g.gain.setValueAtTime(0.0001, a.currentTime);
    g.gain.exponentialRampToValueAtTime(gain || 0.16, a.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + dur + 0.02);
  }
  const sfx = {
    fire: function () { beep(760, 240, 0.16, "sawtooth", 0.10); },
    pop: function (i) { beep(560 + (i % 7) * 55, 180, 0.10, "triangle", 0.06); },
    refuse: function () { beep(180, 120, 0.14, "square", 0.07); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, i) { schedule(i * 0.105, function () { beep(f, f, 0.16, "triangle", 0.12); }); }); },
    fail: function () { beep(320, 90, 0.5, "sawtooth", 0.12); }
  };

  // ---------- 游戏状态 ----------
  const state = {
    level: 0,
    slots: [null, null, null, null, null],
    queue: [],
    running: false,
    over: false,
    coins: 0,
    lastArrival: 0,
    downTime: 0
  };

  let AUTO = false;
  let simT = 0;
  let gameTime = 0;
  let resolveUntil = 0;
  let lastShot = '';
  const timers = [];
  let levelGeneration = 0;
  function schedule(delay, fn) {
    const owner = levelGeneration;
    timers.push({ at: simT + delay, fn: function () { if (owner === levelGeneration) fn(); } });
  }

  // 自动演示（?auto=1 时用于截图/联调验证）：每隔一段时间从地面挑一个巫师送上去
  let _lastAuto = -99;
  function autoTick(t) {
    if (t < 1.6) return;
    if (t - _lastAuto < 1.1) return;
    _lastAuto = t;
    const ground = wizards.filter(function (x) { return x.state === "ground" && x.slot === null; });
    const w = ground.find(function (x) { return legalColumnsForColor(x.mesh.userData.colorKey).length > 0; }) || ground[0];
    if (w) sendToSlot(w);
  }

  function shelfCount() {
    let n = 0;
    for (let i = 0; i < 5; i++) if (state.slots[i]) n++;
    return n;
  }

  function updateCounter() {
    const n = shelfCount();
    const el = document.getElementById("countTxt");
    el.textContent = n + "/5";
    el.className = n >= 5 ? "full" : "";
  }

  function legalColumnsForColor(colorKey) {
    const cols = [];
    for (let i = 0; i < NX; i++) {
      const k = bottomOfColumn(i);
      if (k >= 0 && grid[k].color === colorKey) cols.push(i);
    }
    return cols;
  }

  function anyLegalMove() {
    for (let i = 0; i < 5; i++) {
      const w = state.slots[i];
      if (!w) continue;
      if (legalColumnsForColor(w.mesh.userData.colorKey).length > 0) return true;
    }
    return false;
  }

  function startLevel(n) {
    // Cancel work owned by the previous board before replacing its buffers.
    levelGeneration++;
    timers.length = 0;
    resolveUntil = simT;
    beltOffset = 0; syncBeltTexture();
    acc = 0;
    shakeT = 0;
    camera.position.x = camera.position.y = 0;
    streaks.forEach(function (s) { s.phase = 0; s.onHit = null; s.mesh.visible = false; });
    flashes.forEach(function (f) { f.life = 0; f.sprite.visible = false; });
    pLife.fill(0); pCol.fill(0);
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    document.getElementById("intro").classList.remove("on");
    state.level = n;
    state.over = false;
    state.running = true;
    state.slots = [null, null, null, null, null];
    state.queue = [];
    hideOverlay();

    const lv = LEVELS[n % LEVELS.length];
    document.getElementById("levelTag").textContent = "Level " + (n + 1);
    buildBoard(lv.map);

    // 按颜色统计连通块数量 → 每个连通块需要一次施法
    const compCount = {};
    const seenAll = new Uint8Array(NX * NY);
    for (let k = 0; k < NX * NY; k++) {
      if (!grid[k].alive || seenAll[k]) continue;
      const comp = componentFrom(k);
      comp.forEach(function (c) { seenAll[c] = 1; });
      compCount[grid[k].color] = (compCount[grid[k].color] || 0) + 1;
    }

    // 每个颜色按 2 次一组拆成多个巫师（对应原游戏队伍里有重复颜色）
    const roster = [];
    COLORS.forEach(function (ck) {
      let left = compCount[ck] || 0;
      while (left > 0) {
        const take = Math.min(2, left);
        roster.push([ck, take]);
        left -= take;
      }
    });
    // 把「开局就能打」的颜色排在前面，避免第一个巫师被完全遮死
    roster.sort(function (a, b) {
      const ua = legalColumnsForColor(a[0]).length > 0 ? 1 : 0;
      const ub = legalColumnsForColor(b[0]).length > 0 ? 1 : 0;
      if (ua !== ub) return ub - ua;
      return b[1] - a[1];
    });
    buildWizards(roster);

    state.queue = wizards.slice();
    state.lastArrival = 0;
    updateCounter();
    hideHint(true);
    const lvAtStart = n;
    schedule(0.9, function () { if (state.level === lvAtStart && !state.over) showHint("点法师登上传送带，移动到同色像素下方时自动施法"); });
  }

  // ---------- 提示 ----------
  let hintTimer = null;
  function showHint(text) {
    const el = document.getElementById("hint");
    el.textContent = text;
    el.classList.add("show");
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { el.classList.remove("show"); }, 4200);
  }
  function hideHint() {
    document.getElementById("hint").classList.remove("show");
  }

  // ---------- 上场与自动发射 ----------
  // 玩家从小径下方选一个巫师送上去；上位后若存在可消除的方块，自动发射
  function sendToSlot(w) {
    if (state.over || !state.running) return false;
    if (w.slot !== null || w.state !== "ground") return false;
    let idx = -1;
    let leftmost = Infinity;
    for (let i = 0; i < 5; i++) if (!state.slots[i]) {
      const x = beltPosition(i);
      const priority = x >= 24 && x <= W - 24 ? x : x + BELT_LENGTH;
      if (priority < leftmost) { leftmost = priority; idx = i; }
    }
    if (idx < 0) { showHint("传送带已满，先等法师完成施法"); return false; }
    state.queue = state.queue.filter(function (x) { return x !== w; });
    state.slots[idx] = w;
    placeInSlot(w, idx, true);
    relayoutGround(true);
    updateCounter();
    return true;
  }

  function autoFire(w) {
    if (!w || w.state !== "slot" || w.moving) return false;
    if (w.mesh.userData.charges <= 0) return false;
    if (w.cooldown > 0) return false;
    const col = columnUnderWizard(w);
    if (col < 0) return false;
    const cell = bottomOfColumn(col);
    if (cell < 0 || grid[cell].color !== w.mesh.userData.colorKey) return false;
    w.cooldown = 0.85;
    fireAtColumn(w, col);
    return true;
  }

  // 每帧检查：还在槽位里、且现在有得打的巫师，自动开火
  function autoFireTick(dt) {
    for (let i = 0; i < wizards.length; i++) {
      const w = wizards[i];
      if (w.cooldown > 0) w.cooldown -= dt;
    }
    if (!state.running || state.over) return;
    for (let i = 0; i < 5; i++) {
      const w = state.slots[i];
      if (!w) continue;
      if (!w.warned && !w.moving && legalColumnsForColor(w.mesh.userData.colorKey).length === 0) {
        w.warned = true;
        showHint("这个颜色暂时被挡住了，法师会随传送带继续寻找");
      }
      autoFire(w);
    }
  }

  // ---------- 引信顺序 ----------
  // 引信顺序：从命中点开始，按 BFS 距离分层，每层用「离上一颗最近的」接上去，
  // 得到一条沿着色带爬过去的链（像鞭炮引线），而不是整块同时消失。
  function fuseOrderFrom(k0) {
    const dist = new Map();
    dist.set(k0, 0);
    const q = [k0];
    let head = 0;
    const byLevel = [[k0]];
    while (head < q.length) {
      const k = q[head++];
      const d = dist.get(k);
      const i = k % NX, j = (k - i) / NX;
      const nb = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]];
      for (let n = 0; n < 4; n++) {
        const ni = nb[n][0], nj = nb[n][1];
        if (ni < 0 || ni >= NX || nj < 0 || nj >= NY) continue;
        const nk = nj * NX + ni;
        if (dist.has(nk)) continue;
        if (!grid[nk].alive || grid[nk].color !== grid[k0].color) continue;
        dist.set(nk, d + 1);
        q.push(nk);
        if (!byLevel[d + 1]) byLevel[d + 1] = [];
        byLevel[d + 1].push(nk);
      }
    }
    // 贪心串成一条链
    const out = [k0];
    let last = k0;
    for (let d = 1; d < byLevel.length; d++) {
      const level = (byLevel[d] || []).slice();
      while (level.length) {
        let bi = 0, bd = 1e9;
        const li = last % NX, lj = (last - li) / NX;
        for (let n = 0; n < level.length; n++) {
          const k = level[n];
          const i = k % NX, j = (k - i) / NX;
          const dd = (i - li) * (i - li) + (j - lj) * (j - lj);
          if (dd < bd) { bd = dd; bi = n; }
        }
        last = level[bi];
        out.push(last);
        level.splice(bi, 1);
      }
    }
    return out;
  }

  // ---------- 发射 ----------
  function fireAtColumn(w, col) {
    if (!w || w.state !== "slot" || w.moving || w.mesh.userData.charges <= 0 || col !== columnUnderWizard(w)) return false;
    const k = bottomOfColumn(col);
    if (k < 0) return false;
    if (grid[k].color !== w.mesh.userData.colorKey) return false;

    const slot = w.slot;
    const targetX = w.mesh.position.x + W / 2;
    const sourceY = H / 2 - w.mesh.position.y - 12;
    const targetDesignY = BY + ((k - (k % NX)) / NX + 0.5) * CH;
    const colorKey = grid[k].color;
    const base = PALETTE[colorKey];

    const comp = componentFrom(k);
    const order = fuseOrderFrom(k);
    // 每格之间的间隔：让"烧过去"的过程看得见，但整段不超过 ~2.2 秒
    const step = Math.min(0.022, 2.2 / Math.max(1, order.length));
    const travel = 0.10;
    resolveUntil = Math.max(resolveUntil, simT + travel + order.length * step + 0.35);

    // 发射瞬间：巫师身上炸一团光
    sfx.fire();
    if (slot !== null) {
      fireFlash(targetX, sourceY, base, 40);
      burstAt(wx(targetX), wy(sourceY), base, 10);
    }

    // 发射瞬间就把这批格子标记为「已被吃掉」，避免 0.1 秒飞行期间被另一发重复命中
    order.forEach(function (cell) {
      grid[cell].alive = false;
      aliveCount--;
    });

    // 光弹飞行 → 命中后才开始燃
    fireStreak(targetX, sourceY, targetDesignY, 0xfff4d0, function () {
      fireFlash(targetX, targetDesignY, 0xffffff, 52);
      burstAt(wx(targetX), wy(targetDesignY), base, 16);
      shake(6, 0.26);
      sfx.pop(0);

      order.forEach(function (cell, idx) {
        const i = cell % NX, j = (cell - i) / NX;
        const cx = BX + (i + 0.5) * CW;
        const cy = BY + (j + 0.5) * CH;
        const delay = idx * step;
        const t0 = simT + delay;
        for (let v = 0; v < 4; v++) {
          attrT0.array[cell * 4 + v] = t0;
          attrState.array[cell * 4 + v] = 1;
        }

        schedule(delay, (function (cxRef, cyRef, n) {
          return function () {
            burstAt(wx(cxRef), wy(cyRef), base, 2);
            fireFlash(cxRef, cyRef, 0xffffff, 13);
            if (n % 3 === 0) sfx.pop(n);
          };
        })(cx, cy, idx));
      });
      attrT0.needsUpdate = true;
      attrState.needsUpdate = true;

      schedule(0.30 + order.length * step, function () {
        if (aliveCount <= 0) schedule(Math.max(0, resolveUntil - simT), function () { if (aliveCount <= 0) win(); });
      });
    });

    // 消耗
    w.mesh.userData.charges--;
    if (w.mesh.userData.charges <= 0) {
      if (slot !== null) state.slots[slot] = null;
      w.state = "leaving";
      w.leaveT = 0;
      updateCounter();
    } else {
      setWizardNumber(w.mesh, w.mesh.userData.charges);
      w.cooldown = travel + order.length * step * 0.9 + 0.25;
    }

    return true;
  }

  // ---------- 镜头抖动 ----------
  let shakeAmp = 0, shakeT = 0;
  function shake(amp, dur) { shakeAmp = amp; shakeT = dur; }

  // ---------- 胜负 ----------
  function hexCss(c) { return "#" + c.toString(16).padStart(6, "0"); }
  function darkCss(c) { return "#" + new THREE.Color(c).multiplyScalar(0.48).getHexString(); }

  function win() {
    if (state.over) return;
    state.over = true;
    state.running = false;
    sfx.win();
    const coins = 37 + Math.floor(Math.random() * 13);   // 录像观测 37/40/49
    state.coins += coins;
    const next = state.level + 1;
    let html = '<div class="welldone">WELL DONE!</div>';
    if (FX.welldone) {
      const CONF = ["#ff4d6d", "#ffd84a", "#4dd2ff", "#8cf04f", "#c77dff", "#ff9f40"];
      for (let i = 0; i < 46; i++) {
        html += '<div class="confetti" style="left:' + (Math.random() * 440).toFixed(0) + 'px;' +
          'background:' + CONF[i % CONF.length] + ';--dx:' + ((Math.random() - 0.5) * 160).toFixed(0) + 'px;' +
          '--rot:' + ((Math.random() - 0.5) * 1080).toFixed(0) + 'deg;' +
          'animation-duration:' + (1.8 + Math.random() * 1.6).toFixed(2) + 's;' +
          'animation-delay:' + (Math.random() * 0.6).toFixed(2) + 's"></div>';
      }
      // 金币堆：自下而上 4-3-2 叠放
      const rows = [[0, 4], [1, 3], [2, 2]];
      let pile = "";
      rows.forEach(function (r) {
        const n = r[1];
        for (let k = 0; k < n; k++) {
          const x = 75 - 32 + (k - (n - 1) / 2) * 34;
          const y = 70 - r[0] * 18;
          pile += '<div class="c" style="left:' + x.toFixed(0) + 'px;top:' + y + 'px"></div>';
        }
      });
      html += '<div class="pile">' + pile + '<div class="pile-num">' + coins + '</div></div>';
      const done = Math.min(META_TOTAL, next);
      html += '<div class="meta"><div class="bar"><div class="fill" style="width:' + (done / META_TOTAL * 100).toFixed(1) + '%"></div>' +
        '<span>' + done + '/' + META_TOTAL + '</span></div><div class="chest">?</div></div>';
    }
    html += '<div class="playbtn" id="nextBtn">Play <b>Level ' + (next + 1) + '</b></div>';
    showOverlay(html);
    document.getElementById("nextBtn").onclick = function () { goNextLevel(next); };
  }

  // 关间过场：淡黑 → Magic Fever 标题 → 新关卡
  function goNextLevel(n) {
    if (document.getElementById("intro").classList.contains("on")) return;
    if (!FX.intro) { startLevel(n); return; }
    const intro = document.getElementById("intro");
    intro.classList.add("on");
    schedule(0.4, function () {
      startLevel(n); state.running = false;
      intro.classList.add("on");
      schedule(1.3, function () { intro.classList.remove("on"); state.running = true; });
    });
  }

  function fail(stuck) {
    if (state.over) return;
    state.over = true;
    state.running = false;
    sfx.fail();
    if (FX.banner) {
      showOverlay('<div class="banner">' + (stuck ? 'Out of Wizards!' : 'Out of Space!') + '</div>');
      schedule(1.6, function () { if (state.over && !state.running) showContinue(stuck); });
    } else {
      showContinue(stuck);
    }
  }

  function showContinue(stuck) {
    let mini = "";
    for (let i = 0; i < 5; i++) {
      const w = state.slots[i];
      if (!w) { mini += '<div class="mw empty"></div>'; continue; }
      const c = PALETTE[w.mesh.userData.colorKey];
      mini += '<div class="mw" style="background:' + hexCss(c) + '"><i style="border-bottom-color:' + darkCss(c) + '"></i>' +
        w.mesh.userData.charges + '</div>';
    }
    showOverlay(
      '<div class="cont"><div class="tab">Continue?</div><div class="inner">' +
      '<div class="mshelf">' + mini + '<div class="mtag">' + shelfCount() + '/5</div></div>' +
      '<div class="say">' + (stuck ? 'No wizard can reach a block!' : 'Top 3 wizards step off the path!') + '</div>' +
      '<div class="playon" id="reviveBtn">' + (stuck ? 'Retry' : 'Play On<div class="free">FREE</div>') + '</div>' +
      '</div></div>' +
      '<div class="hold">Hold to see the area!</div>'
    );
    document.getElementById("reviveBtn").onclick = stuck ? function () { startLevel(state.level); } : revive;
  }

  // 复活：小径前 3 个巫师退回地面（保留剩余次数，排到队首），而不是直接销毁——
  // 原作复活后这些颜色仍然可用；直接销毁会让该色剩余连通块永远无人可打 → 卡死
  function revive() {
    hideOverlay();
    const back = [];
    for (let i = 0; i < 5 && back.length < 3; i++) {
      const w = state.slots[i];
      if (!w) continue;
      state.slots[i] = null;
      w.slot = null;
      w.state = "ground";
      w.warned = false;
      back.push(w);
    }
    state.queue = back.concat(state.queue);
    relayoutGround(true);
    updateCounter();
    state.over = false;
    state.running = true;
  }

  const overlayEl = document.getElementById("overlay");
  function showOverlay(html) {
    overlayEl.innerHTML = html;
    overlayEl.classList.remove("peek");
    overlayEl.classList.add("show");
  }
  function hideOverlay() {
    overlayEl.classList.remove("show", "peek", "instant");
    overlayEl.innerHTML = "";
  }
  // Hold to see the area!：在 Continue 面板按钮以外的地方按住 → 面板隐藏、看棋盘
  overlayEl.addEventListener("pointerdown", function (ev) {
    ev.stopPropagation();
    if (overlayEl.querySelector(".cont") && !ev.target.closest(".playon")) overlayEl.classList.add("peek");
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(function (n) {
    overlayEl.addEventListener(n, function () { overlayEl.classList.remove("peek"); });
  });

  // ---------- 输入 ----------
  function pointerToDesign(ev) {
    const r = stage.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    const y = ((ev.clientY - r.top) / r.height) * H;
    return { x: x, y: y };
  }

  stage.addEventListener("pointerdown", function (ev) {
    if (!state.running || state.over) return;
    const a = audio(); if (a && a.state === "suspended") a.resume();
    const p = pointerToDesign(ev);

    // 点地面上等待的巫师 → 送上小径，之后它会自动发射
    let best = null, bestD = 1e9;
    for (let i = 0; i < wizards.length; i++) {
      const w = wizards[i];
      if (w.state !== "ground" || w.slot !== null) continue;
      const sx = w.mesh.position.x + W / 2;
      const sy = H / 2 - w.mesh.position.y;
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < bestD) { bestD = d; best = w; }
    }
    if (best && bestD < WIZ_R * WS_GROUND + 14) {
      sendToSlot(best);
      return;
    }
  });

  // ---------- 主循环 ----------
  const clock = new THREE.Clock();
  let acc = 0;

  function step(dt, t) {
    simT = t;
    boardUniforms.uTime.value = t;

    // 粒子（加色混合：颜色乘生命系数，变黑即消失）
    const colArr = pGeo.attributes.color.array;
    for (let i = 0; i < MAXP; i++) {
      if (pLife[i] <= 0) {
        colArr[i * 3] = colArr[i * 3 + 1] = colArr[i * 3 + 2] = 0;
        continue;
      }
      pLife[i] -= dt;
      if (pLife[i] <= 0) {
        colArr[i * 3] = colArr[i * 3 + 1] = colArr[i * 3 + 2] = 0;
        continue;
      }
      pPos[i * 3] += pVel[i * 2] * dt;
      pPos[i * 3 + 1] += pVel[i * 2 + 1] * dt;
      pVel[i * 2 + 1] -= 340 * dt;
      pVel[i * 2] *= (1 - 1.6 * dt);
      const f = Math.max(0, pLife[i] / pMax[i]);
      const k = f * f;
      colArr[i * 3] = pBaseColor[i * 3] * k;
      colArr[i * 3 + 1] = pBaseColor[i * 3 + 1] * k;
      colArr[i * 3 + 2] = pBaseColor[i * 3 + 2] * k;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;

    // 光弹：0.10s 飞到命中点，然后拖尾在 0.16s 内消失
    for (let i = 0; i < streaks.length; i++) {
      const s = streaks[i];
      if (s.phase === 0) { if (s.mesh.visible) s.mesh.visible = false; continue; }
      s.t += dt;
      if (s.phase === 1) {
        const p = Math.min(1, s.t / 0.10);
        const headY = s.from + (s.to - s.from) * p;
        const len = Math.max(2, Math.abs(headY - s.from));
        s.mesh.scale.y = len;
        s.mesh.scale.x = 12 * (1 - 0.22 * p);
        s.mesh.position.set(wx(s.x), wy((s.from + headY) / 2), 16);
        s.mesh.material.opacity = 0.95;
        // 弹头亮点
        if (Math.random() < 0.7) {
          spawnParticle(wx(s.x) + (Math.random() - 0.5) * 6, wy(headY),
            (Math.random() - 0.5) * 40, 60 + Math.random() * 60, 0.18 + Math.random() * 0.12, 0xfff2c0);
        }
        if (p >= 1) {
          s.phase = 2; s.t = 0;
          if (s.onHit) { const f = s.onHit; s.onHit = null; f(); }
        }
      } else {
        // 拖尾淡出
        const f = Math.max(0, 1 - s.t / 0.16);
        s.mesh.material.opacity = f * 0.55;
        s.mesh.scale.y *= (1 - 2.2 * dt);
        s.mesh.position.y += (wy(s.from) - s.mesh.position.y) * Math.min(1, dt * 9);
        if (s.t >= 0.16) { s.phase = 0; s.mesh.visible = false; }
      }
    }

    // 闪光
    for (let i = 0; i < flashes.length; i++) {
      const f = flashes[i];
      if (f.life <= 0) { if (f.sprite.visible) f.sprite.visible = false; continue; }
      f.life -= dt;
      const p = 1 - Math.max(0, f.life / f.max);
      const sz = f.from + (f.to - f.from) * p;
      f.sprite.scale.set(sz, sz, 1);
      f.sprite.material.opacity = (1 - p) * 0.95;
      if (f.life <= 0) f.sprite.visible = false;
    }

    advanceBelt(dt);

    // 巫师入场 / 待机呼吸
    for (let i = 0; i < wizards.length; i++) {
      const w = wizards[i];
      const m = w.mesh;
      if (w.moving) {
        w.t += dt;
        const p = Math.min(1, w.t / w.dur);
        const e = 1 - Math.pow(1 - p, 3);
        m.position.x = w.from.x + (w.target.x - w.from.x) * e;
        m.position.y = w.from.y + (w.target.y - w.from.y) * e + Math.sin(p * Math.PI) * 14;
        if (p >= 1) w.moving = false;
      }
      if (w.state === "leaving") {
        w.leaveT += dt;
        const p = Math.min(1, w.leaveT / 0.42);
        m.scale.setScalar(1 - p);
        m.position.y -= dt * 40;
        if (p >= 1) { m.visible = false; w.state = "gone"; }
      } else if (w.state !== "gone") {
        m.scale.setScalar(m.scale.x + (1 - m.scale.x) * Math.min(1, dt * 12));
        const inner = m.userData.inner, ts = (w.slot !== null) ? WS_SLOT : WS_GROUND;
        inner.scale.setScalar(inner.scale.x + (ts - inner.scale.x) * Math.min(1, dt * 10));
        const bob = (w.slot === null) ? Math.sin(t * 2.4 + (w.order || 0)) * 1.6 : 0;
        if (!w.moving) {
          const baseY = (w.slot !== null) ? (H / 2 - SLOT_Y - (FX.ground ? 8 : 0)) : w.homeY;
          m.position.y = baseY + bob;
        }
      }
    }

    // 到达 / 判定
    autoFireTick(dt);

    if (state.running && !state.over) {
      acc += dt;
      if (acc > 0.25) {
        acc = 0;
        if (t < resolveUntil || wizards.some(function (w) { return w.moving; })) { /* wait for arrivals and visible elimination */ }
        else if (shelfCount() >= 5 && !anyLegalMove()) fail();
        // 兜底：地面已空、小径没满、但在场巫师都无处可打且棋盘未清空 → 真死局（复活也救不了），走重开
        else if (aliveCount > 0 && !anyLegalMove() && !wizards.some(function (w) { return w.state === "ground" || w.moving; })) fail(true);
      }
    }

    // 抖动
    if (shakeT > 0) {
      shakeT -= dt;
      const k = Math.max(0, shakeT) * shakeAmp * 3;
      camera.position.x = (Math.random() - 0.5) * k;
      camera.position.y = (Math.random() - 0.5) * k;
    } else {
      camera.position.x += (0 - camera.position.x) * Math.min(1, dt * 10);
      camera.position.y += (0 - camera.position.y) * Math.min(1, dt * 10);
    }

    if (AUTO) autoTick(t);

    // 定时器队列（替代 setTimeout，便于快进）；同帧到期的按到期时间先后执行
    const due = [];
    for (let i = timers.length - 1; i >= 0; i--) {
      if (t >= timers[i].at) due.push(timers.splice(i, 1)[0]);
    }
    due.sort(function (a, b) { return a.at - b.at; }).forEach(function (d) { d.fn(); });
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    gameTime += dt;
    step(dt, gameTime);
    renderer.render(scene, camera);
  }

  // 粒子基础色（供加色淡出使用）
  const pBaseColor = new Float32Array(MAXP * 3);
  const _origSpawn = spawnParticle;
  spawnParticle = function (x, y, vx, vy, life, color) {
    const i = pHead;
    _origSpawn(x, y, vx, vy, life, color);
    const c = new THREE.Color(color);
    pBaseColor[i * 3] = c.r; pBaseColor[i * 3 + 1] = c.g; pBaseColor[i * 3 + 2] = c.b;
  };

  document.getElementById("restartBtn").onclick = function () { startLevel(state.level); };

  // ---------- 启动 ----------
  AUTO = /[?&]auto=1/.test(location.search);
  const SIM = (function () {
    const m = location.search.match(/[?&]sim=([\d.]+)/);
    return m ? parseFloat(m[1]) : 0;
  })();

  const LV = /[?&]level=(\d+)/.exec(location.search);
  startLevel(LV ? Math.max(0, Math.min(LEVELS.length - 1, (+LV[1]) - 1)) : 0);

  if (SIM > 0) {
    // 确定性快进：按固定步长推进模拟，再渲染一帧（无头截图用，画面冻结在该时刻）
    const steps = Math.max(1, Math.round(SIM * 60));
    for (let i = 0; i < steps; i++) { gameTime = (i + 1) / 60; step(1 / 60, gameTime); }
    renderer.render(scene, camera);
  } else if (/[?&]probe=1/.test(location.search)) {
    // 扫描：找出"同时点燃的格子数"最多的时刻（用来截引信正在烧的那一帧）
    let maxN = 0, maxT = 0;
    for (let s = 0; s < 60 * 24; s++) {
      gameTime = (s + 1) / 60;
      step(1 / 60, gameTime);
      let n = 0;
      for (let k = 0; k < NX * NY; k++) {
        if (attrState.array[k * 4] > 0.5 && attrState.array[k * 4] < 1.5) {
          const age = gameTime - attrT0.array[k * 4];
          if (age >= 0 && age < 0.13) n++;
        }
      }
      if (n > maxN) { maxN = n; maxT = gameTime; }
    }
    renderer.render(scene, camera);
    let sc = 0, nanT = 0, sample0 = -1, sample1 = -1;
    for (let k = 0; k < NX * NY; k++) {
      const st = attrState.array[k * 4];
      if (st > 0.5 && st < 1.5) {
        sc++;
        const t0 = attrT0.array[k * 4];
        if (isNaN(t0)) nanT++;
        if (sample0 < 0) sample0 = t0;
        sample1 = t0;
      }
    }
    document.title = "probe maxIgnite=" + maxN + " at t=" + maxT.toFixed(2) + " alive=" + aliveCount
      + " state1=" + sc + " nanT0=" + nanT + " t0range=" + sample0.toFixed(2) + ".." + sample1.toFixed(2);
  } else {
    animate();
  }

  window.__mf = {
    state: state, grid: grid, startLevel: startLevel,
    beltPosition: beltPosition, columnUnderWizard: columnUnderWizard,
    step: step, fire: fireAtColumn, send: sendToSlot, wizards: wizards,
    win: win, fail: fail, revive: revive, FX: FX
  };

  // 调试：?tap=1 用合成指针事件验证点击选中链路
  if (/[?&]tap=1/.test(location.search)) {
    setTimeout(function () {
      const w = wizards.find(function (x) { return x.state === "ground" && x.slot === null; });
      if (!w) { document.title = "tap: no ground wizard"; return; }
      const r = stage.getBoundingClientRect();
      const dx = w.mesh.position.x + W / 2, dy = H / 2 - w.mesh.position.y;
      const cx = r.left + dx * (r.width / W);
      const cy = r.top + dy * (r.height / H);
      const before = aliveCount;
      stage.dispatchEvent(new PointerEvent("pointerdown", { clientX: cx, clientY: cy, bubbles: true }));
      const inSlot = (w.slot !== null) ? ("slot" + w.slot) : "ground";
      document.title = "tap@" + Math.round(dx) + "," + Math.round(dy)
        + " -> " + inSlot + " color=" + w.mesh.userData.colorKey
        + " shelf=" + shelfCount() + " aliveBefore=" + before;
    }, 1200);
  }

  // 调试：?panel=win / ?panel=fail（横幅→面板）/ ?panel=cont（直接 Continue 面板）
  function instantOverlay() { overlayEl.classList.add("instant"); }
  if (/[?&]panel=win/.test(location.search)) setTimeout(function () { win(); instantOverlay(); }, 300);
  if (/[?&]panel=fail/.test(location.search)) setTimeout(fail, 300);
  if (/[?&]panel=cont/.test(location.search)) setTimeout(function () {
    state.queue.slice(0, 5).forEach(sendToSlot);
    fail(); showContinue(); instantOverlay();
  }, 300);

  if (/[?&]dbg=1/.test(location.search)) {
    setTimeout(function () {
      var r = stage.getBoundingClientRect(), cb = canvas.getBoundingClientRect();
      document.title = "stage=" + Math.round(r.left) + "," + Math.round(r.top) + "," + Math.round(r.width) + "x" + Math.round(r.height)
        + " canvas=" + Math.round(cb.left) + "," + Math.round(cb.top) + "," + Math.round(cb.width) + "x" + Math.round(cb.height)
        + " buf=" + canvas.width + "x" + canvas.height + " dpr=" + DPR
        + " win=" + window.innerWidth + "x" + window.innerHeight
        + " alive=" + aliveCount + " shelf=" + shelfCount() + " slots=" + state.slots.filter(Boolean).length + " shot=" + lastShot + " AUTO=" + AUTO;
    }, 400);
  }
})();
