/* GunWaree intro: a rainy, sunlit sky seen through wet glass, a glass title, and a warp into the site.

   How it is drawn
   1. Two 2D canvases hold surface maps (red/green = surface direction, blue = thickness, alpha = coverage):
      - the water map: every droplet on the glass
      - the title map: the word "GunWaree" as a bevelled glass relief, redrawn each frame with a slow wave
   2. One WebGL shader composes the frame: a blurred sky with falling rain, the title as white-tinted glass
      that bends the sky behind it, and droplets that act as tiny lenses (sharp, flipped view of the sky).
   Everything here is decorative; Enter is a normal link and works without it. */

(function () {
  'use strict';

  var GW = window.GW || {};
  var body = document.body;
  var root = document.documentElement;
  var video = document.querySelector('[data-rain-video]');
  var canvas = document.querySelector('[data-glass]');
  var slot = document.querySelector('[data-title-slot]');
  var enter = document.querySelector('[data-enter]');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  var WORD = 'GunWaree';
  var WARP_MS = 1700;
  var warp = { active: false, start: 0, value: 0 };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInCubic(t) { return t * t * t; }

  /* =========================================================
     1. Droplets on the glass
     ========================================================= */

  // One soft-edged hemisphere encoded as a normal map; every drop is this sprite, scaled
  function makeDropSprite(size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(size, size);
    var d = img.data;
    var r = size / 2;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var dx = (x + 0.5 - r) / r;
        var dy = (y + 0.5 - r) / r;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= 1) continue;
        var i = (y * size + x) * 4;
        d[i] = 128 + dx * 127;
        d[i + 1] = 128 + dy * 127;
        d[i + 2] = Math.sqrt(1 - dist * dist) * 255;
        d[i + 3] = Math.min(1, (1 - dist) * 2.4) * 255;   // soft rim lets neighbours bridge
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function Glass() {
    this.sprite = makeDropSprite(96);
    this.map = document.createElement('canvas');      // what the shader reads
    this.mist = document.createElement('canvas');     // tiny condensation drops
    this.mapCtx = this.map.getContext('2d');
    this.mistCtx = this.mist.getContext('2d');
    this.drops = [];
  }

  Glass.prototype.resize = function (w, h) {
    // Maps run below screen resolution; linear filtering keeps edges smooth
    this.w = w;
    this.h = h;
    this.s = w * h > 1400000 ? 0.5 : 0.75;
    this.map.width = this.mist.width = Math.round(w * this.s);
    this.map.height = this.mist.height = Math.round(h * this.s);
    var areaK = (w * h) / (1920 * 1080);
    this.maxBig = Math.round(clamp(56 * areaK, 20, 80));
    this.mistRate = clamp(2.2 * areaK, 0.8, 3.5);
    this.drops = this.drops.filter(function (d) { return d.x < w && d.y < h; });
    for (var i = 0, n = Math.round(1300 * areaK); i < n; i++) this.addMist();
  };

  Glass.prototype.addMist = function () {
    var r = rand(1.2, 3.6) * this.s;
    this.mistCtx.drawImage(this.sprite, rand(0, this.mist.width), rand(0, this.mist.height), r * 2, r * 2.15);
  };

  Glass.prototype.addDrop = function (x, y, r, sliding, vy) {
    this.drops.push({ x: x, y: y, r: r, vy: vy || 0, sliding: !!sliding, seed: rand(0, 100), trail: rand(10, 30), dead: false });
  };

  Glass.prototype.bigCount = function () {
    var n = 0;
    for (var i = 0; i < this.drops.length; i++) if (this.drops[i].r > 6) n++;
    return n;
  };

  // f = elapsed frames at 60 fps; speed multiplies everything during the warp
  Glass.prototype.step = function (f, speed) {
    var drops = this.drops;
    var s = this.s;
    var mist = this.mistCtx;

    if (this.bigCount() < this.maxBig && Math.random() < 0.08 * f) {
      this.addDrop(rand(0, this.w), rand(-0.05 * this.h, 0.92 * this.h), 7 + Math.pow(Math.random(), 2.2) * 20, false);
    }

    // Condensation comes and goes. Whole drops are removed rather than faded:
    // fading in 8-bit alpha never reaches zero and corrupts the stored surface directions.
    mist.globalCompositeOperation = 'destination-out';
    for (var e = 0; e < this.mistRate * 1.1 * f; e++) {
      mist.beginPath();
      mist.arc(rand(0, this.mist.width), rand(0, this.mist.height), rand(3, 7) * s, 0, Math.PI * 2);
      mist.fill();
    }
    mist.globalCompositeOperation = 'source-over';
    for (var m = 0; m < this.mistRate * f; m++) this.addMist();

    for (var i = 0; i < drops.length; i++) {
      var d = drops[i];
      if (d.dead) continue;

      if (!d.sliding) {
        if (d.r < 6) {
          d.r -= 0.0035 * f;
          if (d.r < 1.1) d.dead = true;
          continue;
        }
        if (Math.random() < 0.0011 * (d.r / 10) * f * speed) d.sliding = true;
        continue;
      }

      d.vy = Math.min(d.vy + 0.05 * f * (d.r / 16) * speed, d.r * 0.3 * speed);
      d.y += d.vy * f;
      d.x += Math.sin(d.y * 0.045 + d.seed) * 0.22 * f;

      // A sliding drop wipes the condensation under it
      mist.globalCompositeOperation = 'destination-out';
      mist.beginPath();
      mist.arc(d.x * s, d.y * s, d.r * s * 0.9, 0, Math.PI * 2);
      mist.fill();
      mist.globalCompositeOperation = 'source-over';

      // and leaves small drops behind
      d.trail -= d.vy * f;
      if (d.trail <= 0 && d.r > 5) {
        this.addDrop(d.x + rand(-1.5, 1.5), d.y - d.r * 0.9, d.r * rand(0.16, 0.3), false);
        d.r *= 0.985;
        d.trail = rand(12, 34);
      }

      if (d.r < 11 && d.y > 0 && Math.random() < 0.003 * f) { d.sliding = false; d.vy = 0; }

      for (var j = 0; j < drops.length; j++) {
        var o = drops[j];
        if (o === d || o.dead) continue;
        var dx = o.x - d.x;
        var dy = o.y - d.y;
        var reach = (d.r + o.r) * 0.62;
        if (dx * dx + dy * dy < reach * reach && o.r <= d.r) {
          d.r = Math.min(Math.sqrt(d.r * d.r + o.r * o.r * 0.8), 34);
          o.dead = true;
        }
      }

      if (d.y - d.r * 2 > this.h) d.dead = true;
    }

    if (drops.length > 600 || Math.random() < 0.05) {
      this.drops = drops.filter(function (x) { return !x.dead; });
    }
  };

  Glass.prototype.render = function () {
    var ctx = this.mapCtx;
    var s = this.s;
    ctx.clearRect(0, 0, this.map.width, this.map.height);
    ctx.drawImage(this.mist, 0, 0);
    for (var i = 0; i < this.drops.length; i++) {
      var d = this.drops[i];
      if (d.dead) continue;
      var k = 1.08 + Math.min(d.vy * 0.05, 0.4);   // moving drops stretch
      ctx.drawImage(this.sprite, (d.x - d.r) * s, (d.y - d.r * k) * s, d.r * 2 * s, d.r * 2 * k * s);
    }
  };

  /* =========================================================
     2. Glass title
     ========================================================= */

  // Separable box blur on a float array (three passes approximate a Gaussian)
  function boxBlur(src, w, h, r) {
    var tmp = new Float32Array(src.length);
    var out = new Float32Array(src);
    for (var pass = 0; pass < 3; pass++) {
      for (var y = 0; y < h; y++) {
        var acc = 0, row = y * w;
        for (var x = -r; x <= r; x++) acc += out[row + clamp(x, 0, w - 1)];
        for (x = 0; x < w; x++) {
          tmp[row + x] = acc / (2 * r + 1);
          acc += out[row + Math.min(x + r + 1, w - 1)] - out[row + Math.max(x - r, 0)];
        }
      }
      for (x = 0; x < w; x++) {
        acc = 0;
        for (y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x];
        for (y = 0; y < h; y++) {
          out[y * w + x] = acc / (2 * r + 1);
          acc += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x];
        }
      }
    }
    return out;
  }

  function GlassTitle() {
    this.map = document.createElement('canvas');
    this.ctx = this.map.getContext('2d');
    this.sprite = null;
    this.letters = [];       // x of each letter centre and the baseline, in CSS px
    this.level = 0;          // 0 = under the water line, 1 = fully risen
    this.wave = 1;           // wave strength
    this.nextDrip = 0;
  }

  GlassTitle.prototype.resize = function (mapW, mapH) {
    this.map.width = mapW;
    this.map.height = mapH;
  };

  // Bake the word into a bevelled relief at the size of the title slot
  GlassTitle.prototype.build = function (s) {
    var rect = slot.getBoundingClientRect();
    if (!rect.width) return;
    this.rect = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
    this.s = s;
    var W = Math.max(2, Math.round(rect.width * s));
    var H = Math.max(2, Math.round(rect.height * s));
    var k = W / 1000;   // same geometry as the SVG fallback: 1000 x 260 units

    var c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    var ctx = c.getContext('2d');
    ctx.font = '700 ' + (196 * k).toFixed(2) + 'px Anuphan, "IBM Plex Sans Thai", sans-serif';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (-5 * k).toFixed(2) + 'px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';
    ctx.fillText(WORD, W / 2, 182 * k);

    // Letter centres along the baseline, where drips form
    var total = ctx.measureText(WORD).width;
    var left = W / 2 - total / 2;
    this.letters = [];
    for (var i = 0; i < WORD.length; i++) {
      var a = ctx.measureText(WORD.slice(0, i)).width;
      var b = ctx.measureText(WORD.slice(0, i + 1)).width;
      this.letters.push({ x: rect.left + (left + (a + b) / 2) / s, w: (b - a) / s });
    }
    this.baseline = rect.top + (182 * k) / s;

    var px = ctx.getImageData(0, 0, W, H);
    var data = px.data;
    var n = W * H;
    var alpha = new Float32Array(n);
    for (var p = 0; p < n; p++) alpha[p] = data[p * 4 + 3] / 255;

    var height = boxBlur(alpha, W, H, Math.max(2, Math.round(6 * k)));
    var strength = 3.2;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var q = y * W + x;
        var o = q * 4;
        if (alpha[q] <= 0) { data[o + 3] = 0; continue; }
        var gx = height[y * W + Math.min(x + 1, W - 1)] - height[y * W + Math.max(x - 1, 0)];
        var gy = height[Math.min(y + 1, H - 1) * W + x] - height[Math.max(y - 1, 0) * W + x];
        // Surface tilts away from the thick middle of each stroke
        data[o] = clamp(128 - gx * strength * 127, 0, 255);
        data[o + 1] = clamp(128 - gy * strength * 127, 0, 255);
        data[o + 2] = height[q] * 255;
        data[o + 3] = alpha[q] * 255;
      }
    }
    ctx.putImageData(px, 0, 0);
    this.sprite = c;
  };

  // Draw the relief into the title map: slices shifted by a slow wave, clipped by a rising water line
  GlassTitle.prototype.render = function (t, warpValue) {
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.map.width, this.map.height);
    if (!this.sprite) return;
    var s = this.s;
    var W = this.sprite.width;
    var H = this.sprite.height;
    var X = this.rect.x * s;
    var Y = this.rect.y * s;

    // Warp: the word rushes toward the viewer
    var grow = 1 + warpValue * warpValue * 5;
    var cx = X + W / 2;
    var cy = Y + H * 0.55;

    ctx.save();
    if (this.level < 1) {
      var top = Y + H * (1.05 - this.level * 1.3);
      ctx.beginPath();
      ctx.moveTo(X - 40, Y + H * 2);
      for (var wx = -40; wx <= W + 40; wx += 20) {
        ctx.lineTo(X + wx, top + Math.sin(wx * 0.02 + t * 0.003) * 6 * s * (1 - this.level * 0.6));
      }
      ctx.lineTo(X + W + 40, Y + H * 2);
      ctx.closePath();
      ctx.clip();
    }

    if (warpValue > 0) {
      ctx.drawImage(this.sprite, cx - (W / 2) * grow, cy - H * 0.55 * grow, W * grow, H * grow);
      ctx.restore();
      return;
    }

    var amp = this.wave * s;
    var slice = 2;
    for (var y = 0; y < H; y += slice) {
      var dx = (Math.sin(y * 0.045 / s + t * 0.0019) * 2.2 + Math.sin(y * 0.11 / s - t * 0.0013) * 1.1) * amp;
      var dy = y * grow;
      ctx.drawImage(this.sprite, 0, y, W, slice,
        cx + (dx - W / 2) * grow, cy + dy - H * 0.55 * grow, W * grow, slice * grow + 0.5);
    }
    ctx.restore();
  };

  /* =========================================================
     3. WebGL compositor
     ========================================================= */

  var VERT = [
    'attribute vec2 a_pos;',
    'varying vec2 v_uv;',
    'void main() {',
    '  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);',
    '  gl_Position = vec4(a_pos, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision mediump float;',
    'varying vec2 v_uv;',
    'uniform sampler2D u_water;',
    'uniform sampler2D u_sharp;',
    'uniform sampler2D u_blur;',
    'uniform sampler2D u_title;',
    'uniform vec2 u_cover;',
    'uniform vec2 u_blurTexel;',
    'uniform float u_aspect;',
    'uniform float u_warp;',
    'uniform float u_time;',
    '',
    'vec2 bgUV(vec2 uv) { return (uv - 0.5) * u_cover + 0.5; }',
    'float hash(float n) { return fract(sin(n) * 43758.5453); }',
    '',
    'vec3 blurred(vec2 uv) {',
    '  vec2 t = u_blurTexel * 2.2;',
    '  vec3 c = texture2D(u_blur, uv).rgb * 0.28;',
    '  c += texture2D(u_blur, uv + vec2( t.x, 0.0)).rgb * 0.12;',
    '  c += texture2D(u_blur, uv + vec2(-t.x, 0.0)).rgb * 0.12;',
    '  c += texture2D(u_blur, uv + vec2(0.0,  t.y)).rgb * 0.12;',
    '  c += texture2D(u_blur, uv + vec2(0.0, -t.y)).rgb * 0.12;',
    '  c += texture2D(u_blur, uv + t).rgb * 0.06;',
    '  c += texture2D(u_blur, uv - t).rgb * 0.06;',
    '  c += texture2D(u_blur, uv + vec2(t.x, -t.y)).rgb * 0.06;',
    '  c += texture2D(u_blur, uv + vec2(-t.x, t.y)).rgb * 0.06;',
    '  return c;',
    '}',
    '',
    // Falling rain behind the glass: thin slanted streaks in columns, one layer per depth
    'float rain(vec2 uv, float cols, float rows, float speed, float len, float width) {',
    '  uv.x += uv.y * 0.07;',
    '  vec2 p = vec2(uv.x * cols * u_aspect, uv.y * rows);',
    '  float col = floor(p.x);',
    '  float h = hash(col);',
    '  float y = fract(p.y - u_time * speed * (0.75 + h * 0.5) + h * 13.0);',
    '  float x = fract(p.x) - 0.5 - (h - 0.5) * 0.6;',
    '  float s = smoothstep(0.0, len, y) * (1.0 - smoothstep(len, len * 1.08, y));',
    '  s *= 1.0 - smoothstep(0.0, width, abs(x));',
    '  return s * step(0.45, hash(col + 7.31));',
    '}',
    '',
    // Bright daytime grade: keeps the blue and the white clouds, just a touch cooler
    'vec3 grade(vec3 c) {',
    '  return c * vec3(0.97, 0.99, 1.02);',
    '}',
    '',
    'void main() {',
    '  vec2 uv = v_uv;',
    '  float w = u_warp;',
    '',
    // Warp: the view swirls slightly and rushes toward the centre
    '  vec2 c = vec2(0.5);',
    '  vec2 d = uv - c;',
    '  float r = length(d * vec2(u_aspect, 1.0));',
    '  float ang = w * w * 2.4 * (1.0 - clamp(r, 0.0, 1.0));',
    '  float ca = cos(ang); float sa = sin(ang);',
    '  d = vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y);',
    '  d *= 1.0 - w * 0.5 * (1.0 - r * 0.5);',
    '  uv = c + d;',
    '',
    // Sky: blurred, with a radial zoom blur while warping
    '  vec3 bg;',
    '  if (w > 0.001) {',
    '    vec3 acc = vec3(0.0);',
    '    for (int i = 0; i < 8; i++) {',
    '      float s = 1.0 - w * 0.11 * float(i);',
    '      acc += texture2D(u_blur, bgUV(c + d * s)).rgb;',
    '    }',
    '    bg = acc / 8.0;',
    '  } else {',
    '    bg = blurred(bgUV(uv));',
    '  }',
    '  float lum = dot(bg, vec3(0.299, 0.587, 0.114));',
    '  float streaks = rain(uv, 70.0, 1.6, 1.15, 0.42, 0.10) * 0.12',
    '               + rain(uv + 0.37, 34.0, 1.1, 0.85, 0.36, 0.14) * 0.16',
    '               + rain(uv + 0.71, 16.0, 0.7, 0.62, 0.28, 0.16) * 0.09;',
    // Rain reads as light streaks on blue sky and as soft grey streaks on white cloud
    '  vec3 rainCol = mix(vec3(0.97, 0.99, 1.0), vec3(0.50, 0.58, 0.66), smoothstep(0.55, 0.85, lum));',
    '  vec3 col = mix(grade(bg), rainCol, clamp(streaks * 1.6 * (1.0 + w * 1.5), 0.0, 0.6));',
    '',
    // Title: white-tinted glass that bends the sky behind it
    '  vec4 tt = texture2D(u_title, uv);',
    '  float tA = smoothstep(0.08, 0.6, tt.a);',
    '  vec2 tn = tt.rg * 2.0 - 1.0;',
    '  vec2 tOff = tn * vec2(1.0 / u_aspect, 1.0) * 0.06;',
    '  vec3 behind = mix(blurred(bgUV(uv + tOff)), texture2D(u_sharp, bgUV(uv + tOff * 0.6)).rgb, 0.3);',
    '  vec3 tLight = normalize(vec3(sin(u_time * 0.35) * 0.7, -0.65, 0.75));',
    '  vec3 TN = normalize(vec3(tn * 1.7, 0.55 + tt.b * 0.6));',
    '  float tSpec = pow(max(dot(TN, tLight), 0.0), 36.0);',
    '  float rim = pow(clamp(length(tn), 0.0, 1.0), 1.4);',
    // Body: the sky behind, slightly dimmed and cooled, lifted toward white. On cloud it reads a
    // shade darker than the cloud; on blue it reads lighter than the blue.
    '  vec3 glass = mix(grade(behind) * 0.86, vec3(0.90, 0.95, 1.0), 0.38);',
    // Thick glass edges bend light away and look darker and cooler
    '  glass = mix(glass, vec3(0.26, 0.38, 0.50), rim * 0.55);',
    '  glass *= 1.0 - clamp(tn.y, 0.0, 1.0) * 0.2;',       // lower bevels sit in shade
    '  glass += tSpec * 0.95;',
    '  col = mix(col, glass, tA * 0.92);',
    '',
    // Droplets: tiny lenses with a sharp, flipped view of the sky
    '  vec4 water = texture2D(u_water, uv);',
    '  vec2 n = water.rg * 2.0 - 1.0;',
    '  float cover = smoothstep(0.24, 0.5, water.a);',
    '  vec2 off = n * vec2(1.0 / u_aspect, 1.0) * 0.075;',
    '  float ab = 0.004 + w * 0.02;',
    '  vec3 drop;',
    '  drop.r = texture2D(u_sharp, bgUV(uv - off * (1.0 + ab))).r;',
    '  drop.g = texture2D(u_sharp, bgUV(uv - off)).g;',
    '  drop.b = texture2D(u_sharp, bgUV(uv - off * (1.0 - ab))).b;',
    '  float edge = pow(clamp(length(n), 0.0, 1.0), 3.0);',
    '  vec3 N = normalize(vec3(n * 1.3, max(water.b, 0.15)));',
    '  vec3 L = normalize(vec3(-0.45, -0.6, 0.75));',
    '  float spec = pow(max(dot(N, L), 0.0), 70.0) * 0.9;',
    '  drop = grade(drop) * mix(1.15, 0.55, edge) + spec;',
    '  col = mix(col, drop, cover);',
    '',
    // Vignette
    '  vec2 vq = (v_uv - 0.5) * vec2(u_aspect, 1.0);',
    '  col *= mix(0.84, 1.0, smoothstep(1.15, 0.35, length(vq)));',
    '',
    // End of warp: a bright cloud-white wash, which the next page fades out of
    '  col = mix(col, vec3(0.93, 0.95, 0.96), smoothstep(0.62, 1.0, w));',
    '',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  function Compositor(cv) {
    var gl = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, premultipliedAlpha: false });
    if (!gl) throw new Error('no webgl');
    this.gl = gl;

    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    // One triangle that covers the screen
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    this.u = {};
    var names = ['u_water', 'u_sharp', 'u_blur', 'u_title', 'u_cover', 'u_blurTexel', 'u_aspect', 'u_warp', 'u_time'];
    for (var i = 0; i < names.length; i++) this.u[names[i]] = gl.getUniformLocation(prog, names[i]);

    this.tex = [this.texture(0), this.texture(1), this.texture(2), this.texture(3)];
    gl.uniform1i(this.u.u_water, 0);
    gl.uniform1i(this.u.u_sharp, 1);
    gl.uniform1i(this.u.u_blur, 2);
    gl.uniform1i(this.u.u_title, 3);
  }

  Compositor.prototype.texture = function (unit) {
    var gl = this.gl;
    var t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    return t;
  };

  Compositor.prototype.upload = function (unit, source) {
    var gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[unit]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  };

  Compositor.prototype.draw = function (width, height, srcW, srcH, blurW, blurH, warpValue, time) {
    var gl = this.gl;
    gl.viewport(0, 0, width, height);
    var sa = width / height;
    var va = srcW / srcH;
    var zoom = 0.96;   // a touch of overscan hides the blur at the edges
    var cover = sa > va ? [zoom, (va / sa) * zoom] : [(sa / va) * zoom, zoom];
    gl.uniform2f(this.u.u_cover, cover[0], cover[1]);
    gl.uniform2f(this.u.u_blurTexel, 1 / blurW, 1 / blurH);
    gl.uniform1f(this.u.u_aspect, sa);
    gl.uniform1f(this.u.u_warp, warpValue);
    gl.uniform1f(this.u.u_time, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  /* =========================================================
     4. Wiring
     ========================================================= */

  var glass = null;
  var title = null;
  var comp = null;
  var blurCanvas = document.createElement('canvas');
  var blurCtx = blurCanvas.getContext('2d');
  var poster = new Image();
  var src = { el: null, w: 16, h: 9 };
  var videoDirty = false;
  var width = 0, height = 0, dpr = 1;
  var running = false;
  var rafId = 0;
  var last = 0;
  var introStart = 0;
  var stillTime = 0;

  function disableGL() {
    comp = null;
    body.classList.remove('gl-ready');
    body.classList.add('no-gl');
  }

  function setSource(el, w, h) {
    src.el = el;
    src.w = w;
    src.h = h;
    blurCanvas.width = 640;
    blurCanvas.height = Math.round(640 * h / w);
    if ('filter' in blurCtx) blurCtx.filter = 'blur(2px)';
    refreshBackground();
  }

  function refreshBackground() {
    if (!comp || !src.el) return;
    try {
      blurCtx.drawImage(src.el, 0, 0, blurCanvas.width, blurCanvas.height);
      comp.upload(1, src.el);
      comp.upload(2, blurCanvas);
    } catch (err) {
      // Opened from disk (file://): the browser will not hand the video to WebGL
      disableGL();
    }
  }

  function rebuildTitle() {
    if (title && glass) title.build(glass.s);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (glass) {
      glass.resize(width, height);
      title.resize(glass.map.width, glass.map.height);
      rebuildTitle();
    }
  }

  function drawFrame(t) {
    if (!comp) return;
    glass.render();
    title.render(t, warp.value);
    comp.upload(0, glass.map);
    comp.upload(3, title.map);
    comp.draw(canvas.width, canvas.height, src.w, src.h, blurCanvas.width, blurCanvas.height, warp.value, (t / 1000) % 1000);
  }

  function spawnTitleDrip(now) {
    if (!title.letters.length || now < title.nextDrip) return;
    var l = title.letters[Math.floor(Math.random() * title.letters.length)];
    glass.addDrop(l.x + rand(-0.25, 0.25) * l.w, title.baseline - 2, rand(4.5, 7.5), true, 0.4);
    title.nextDrip = now + rand(900, 2400);
  }

  function frame(now) {
    var dt = last ? Math.min(now - last, 50) : 16.7;
    last = now;
    var f = dt / 16.7;

    if (warp.active) {
      var p = clamp((now - warp.start) / WARP_MS, 0, 1);
      warp.value = easeInCubic(p);
      if (p >= 1) finishWarp();
    }

    if (title) {
      // The word rises out of the water over the first two seconds, waving hard, then settles
      if (title.level < 1) {
        if (!introStart) introStart = now;
        var k = clamp((now - introStart) / 2200, 0, 1);
        title.level = easeOutCubic(k);
      }
      title.wave = 1 + 5 * (1 - title.level) + warp.value * 4;
      if (title.level >= 1 && !warp.active) spawnTitleDrip(now);
    }

    if (glass) {
      glass.step(f, 1 + warp.value * 6);
      if (videoDirty && src.el === video) {
        refreshBackground();
        videoDirty = false;
      }
      drawFrame(now);
    }

    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || document.hidden || !glass) return;
    running = true;
    last = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  // Static, fully composed frame for reduced motion
  function renderStill() {
    stop();
    if (!glass) return;
    title.level = 1;
    title.wave = 0;
    for (var i = 0; i < 400; i++) glass.step(1, 1);
    stillTime = stillTime || 4000;
    drawFrame(stillTime);
  }

  function watchVideoFrames() {
    if (video.requestVideoFrameCallback) {
      var onFrame = function () {
        videoDirty = true;
        video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
    } else {
      setInterval(function () { if (!video.paused) videoDirty = true; }, 1000 / 30);
    }
  }

  function useVideo() {
    if (!video.videoWidth || src.el === video) return;
    setSource(video, video.videoWidth, video.videoHeight);
    if (reduceMotion.matches) renderStill();
  }

  /* ---------- Enter: warp, then go ---------- */

  // Navigation runs once, on a timer of its own, so a slow or paused animation loop can never
  // swallow the click (that was why Enter sometimes needed a second click).
  var navigating = false;
  var navTimer = 0;

  function go() {
    if (navigating) return;
    navigating = true;
    clearTimeout(navTimer);
    window.location.assign(enter.href);
  }

  function finishWarp() {
    warp.active = false;
    go();
  }

  enter.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (warp.active || navigating) return;
    try { sessionStorage.setItem('gw_warp', '1'); } catch (err) { /* storage blocked */ }
    root.classList.add('is-warping');

    if (reduceMotion.matches || !comp) {
      navTimer = setTimeout(go, reduceMotion.matches ? 120 : 420);
      return;
    }
    warp.active = true;
    warp.start = performance.now();
    navTimer = setTimeout(go, WARP_MS + 60);
    start();
  });

  // Back button restores the page from cache: undo the warp
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    warp.active = false;
    warp.value = 0;
    navigating = false;
    clearTimeout(navTimer);
    root.classList.remove('is-warping');
    if (reduceMotion.matches) renderStill(); else start();
  });

  /* ---------- Boot ---------- */

  try {
    comp = new Compositor(canvas);
    glass = new Glass();
    title = new GlassTitle();
  } catch (err) {
    comp = null;
    glass = null;
    disableGL();
  }

  resize();
  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      if (!running && glass) drawFrame(stillTime || performance.now());
    }, 120);
  });

  // The relief needs the real display font
  var fontReady = document.fonts && document.fonts.load ? document.fonts.load('700 100px Anuphan') : Promise.resolve();
  fontReady.then(rebuildTitle, rebuildTitle).then(function () {
    if (!running && glass) drawFrame(stillTime || performance.now());
  });

  poster.onload = function () {
    if (!src.el) setSource(poster, poster.naturalWidth, poster.naturalHeight);
    if (comp) {
      drawFrame(performance.now());
      body.classList.add('gl-ready');
    }
  };
  poster.src = 'assets/img/sky-blue-poster.jpg';

  video.defaultPlaybackRate = video.playbackRate = 0.85;
  watchVideoFrames();
  video.addEventListener('loadeddata', useVideo);
  if (video.readyState >= 2) useVideo();

  function applyMotionPreference() {
    if (reduceMotion.matches) {
      video.pause();
      renderStill();
    } else {
      video.play().catch(function () { /* autoplay blocked: the poster stays */ });
      start();
    }
  }

  applyMotionPreference();
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', applyMotionPreference);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stop();
      video.pause();
    } else if (!reduceMotion.matches) {
      video.play().catch(function () {});
      start();
    }
  });

  // Re-measure if the language switch changes the layout around the title
  document.addEventListener('gw:lang', function () {
    rebuildTitle();
    if (!running && glass) drawFrame(stillTime || performance.now());
  });

  GW.intro = { version: 2 };
})();
