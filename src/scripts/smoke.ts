/**
 * Smoke: a small Navier–Stokes fluid ("stable fluids") running on the GPU.
 * Velocity and dye live in half-float textures. Every frame: add curl, solve pressure,
 * then advect velocity and dye. The display pass blurs the dye softly and tints it red
 * over a warm-centre background glow.
 */

export interface SmokePreset {
  /** Simulation grid (velocity/pressure). */
  SIM: number;
  /** Dye texture resolution. Higher = crisper wisps, lower = softer. */
  DYE_DESKTOP: number;
  DYE_MOBILE: number;
  /** How fast smoke fades. Higher = fades sooner. */
  DENS_DISS: number;
  /** How fast motion calms down. Higher = settles sooner. */
  VEL_DISS: number;
  PRESSURE: number;
  ITERATIONS: number;
  /** Swirl strength. Above ~8 it starts to look like marble. */
  CURL: number;
  /** Puff size. */
  RADIUS: number;
  /** Push strength of strokes. */
  FORCE: number;
  /** Background: corner colour and centre glow colour (sampled from the hero mock). */
  BG: readonly [number, number, number];
  CENTER: readonly [number, number, number];
  /** Smoke colour and how quickly density saturates to it. */
  TINT: readonly [number, number, number];
  GAIN: number;
  /** Soft relief shading and a brighter core where smoke is dense. */
  SHADE: boolean;
  /** Blur radius of the display pass, in dye texels (1 = none). */
  BLUR: number;
  /** Smoke strength once the hero has scrolled away (0 = hidden, 1 = unchanged). */
  CONTENT: number;
  /** Dye added by the cursor: base + speed * gain, capped at max. */
  POINTER: { base: number; gain: number; max: number };
  /** Idle puffs from the sides. */
  AMBIENT: { amount: number; every: number };
  /** Dye amount of the intro sweep. */
  SWEEP: number;
  /** Scrolling pushes a puff from the edge it came from (0 = off). */
  SCROLL: number;
}

const BG = [0.012, 0.027, 0.047] as const;
const CENTER = [0.44, 0.19, 0.19] as const;

export const PRESETS = {
  /** The original look, closest to the reference video: visible, swirling, lively. */
  original: {
    SIM: 128, DYE_DESKTOP: 512, DYE_MOBILE: 320,
    DENS_DISS: 0.3, VEL_DISS: 0.22, PRESSURE: 0.8, ITERATIONS: 20, CURL: 5,
    RADIUS: 1.8, FORCE: 6000, BG, CENTER, TINT: [0.43, 0.115, 0.098], GAIN: 1.8,
    SHADE: true, BLUR: 1, CONTENT: 1,
    POINTER: { base: 0.12, gain: 8, max: 0.4 }, AMBIENT: { amount: 0.35, every: 3200 }, SWEEP: 0.55, SCROLL: 0.06,
  },
  /** A quieter variant: slow, soft, dims behind content. */
  calm: {
    SIM: 96, DYE_DESKTOP: 320, DYE_MOBILE: 224,
    DENS_DISS: 0.55, VEL_DISS: 1.1, PRESSURE: 0.8, ITERATIONS: 16, CURL: 1.2,
    RADIUS: 3.2, FORCE: 2600, BG, CENTER, TINT: [0.3, 0.08, 0.068], GAIN: 1.25,
    SHADE: false, BLUR: 2.5, CONTENT: 0.35,
    POINTER: { base: 0.05, gain: 4, max: 0.16 }, AMBIENT: { amount: 0.22, every: 5500 }, SWEEP: 0.3, SCROLL: 0,
  },
} satisfies Record<string, SmokePreset>;

/** Active preset. Heavy-text sections sit on solid panels, so the full smoke never competes with reading. */
export const SMOKE: SmokePreset = PRESETS.original;

export interface SmokeApi {
  /** Continuous stroke; each source keeps its own last point. x, y in 0..1 viewport space (y down). */
  stroke(key: string, x: number, y: number, amount: number): void;
  lift(key: string): void;
  /** Single push. dx, dy in viewport units per frame (y down). */
  puff(x: number, y: number, dx: number, dy: number, amount: number): void;
  /** Marks user activity (pauses the ambient puffs for a while). */
  touched(): void;
  /** The background glow leans slightly toward x, y. */
  lean(x: number, y: number): void;
  /** 0 at the top of the hero, 1 once past it: smoke steps back behind content. */
  depth(t: number): void;
  /** Skip simulating and drawing while something opaque covers the whole screen. */
  pause(paused: boolean): void;
}

type GL = WebGLRenderingContext | WebGL2RenderingContext;
interface Fmt { internal: number; format: number }
interface FBO { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number; tx: number; ty: number; attach(id: number): number }
interface DoubleFBO { w: number; h: number; tx: number; ty: number; readonly read: FBO; readonly write: FBO; swap(): void }
interface Program { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }

const VERT = `precision highp float;
attribute vec2 aPosition;
varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
uniform vec2 texelSize;
void main(){
  vUv = aPosition*0.5+0.5;
  vL = vUv - vec2(texelSize.x,0.0); vR = vUv + vec2(texelSize.x,0.0);
  vT = vUv + vec2(0.0,texelSize.y); vB = vUv - vec2(0.0,texelSize.y);
  gl_Position = vec4(aPosition,0.0,1.0);
}`;

const HEAD = `precision highp float; precision highp sampler2D;
varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
`;

const FRAG = {
  clear: HEAD + `uniform sampler2D uTexture; uniform float value;
void main(){ gl_FragColor = value*texture2D(uTexture, vUv); }`,

  splat: HEAD + `uniform sampler2D uTarget; uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius;
void main(){ vec2 p = vUv - point; p.x *= aspectRatio; vec3 s = exp(-dot(p,p)/radius)*color; gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + s, 1.0); }`,

  advect: HEAD + `uniform sampler2D uVelocity; uniform sampler2D uSource; uniform vec2 texelSize; uniform vec2 dyeTexelSize; uniform float dt; uniform float dissipation;
vec4 bilerp(sampler2D sam, vec2 uv, vec2 ts){
  vec2 st = uv/ts - 0.5; vec2 i = floor(st); vec2 f = fract(st);
  vec4 a = texture2D(sam,(i+vec2(0.5,0.5))*ts); vec4 b = texture2D(sam,(i+vec2(1.5,0.5))*ts);
  vec4 c = texture2D(sam,(i+vec2(0.5,1.5))*ts); vec4 d = texture2D(sam,(i+vec2(1.5,1.5))*ts);
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
void main(){
#ifdef MANUAL_FILTERING
  vec2 coord = vUv - dt*bilerp(uVelocity, vUv, texelSize).xy*texelSize; vec4 r = bilerp(uSource, coord, dyeTexelSize);
#else
  vec2 coord = vUv - dt*texture2D(uVelocity, vUv).xy*texelSize; vec4 r = texture2D(uSource, coord);
#endif
  gl_FragColor = r/(1.0 + dissipation*dt);
}`,

  divergence: HEAD + `uniform sampler2D uVelocity;
void main(){
  float L = texture2D(uVelocity,vL).x; float R = texture2D(uVelocity,vR).x; float T = texture2D(uVelocity,vT).y; float B = texture2D(uVelocity,vB).y;
  vec2 C = texture2D(uVelocity,vUv).xy;
  if(vL.x<0.0){L=-C.x;} if(vR.x>1.0){R=-C.x;} if(vT.y>1.0){T=-C.y;} if(vB.y<0.0){B=-C.y;}
  gl_FragColor = vec4(0.5*(R-L+T-B),0.0,0.0,1.0);
}`,

  curl: HEAD + `uniform sampler2D uVelocity;
void main(){
  float L = texture2D(uVelocity,vL).y; float R = texture2D(uVelocity,vR).y; float T = texture2D(uVelocity,vT).x; float B = texture2D(uVelocity,vB).x;
  gl_FragColor = vec4(0.5*(R-L-T+B),0.0,0.0,1.0);
}`,

  vorticity: HEAD + `uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt;
void main(){
  float L = texture2D(uCurl,vL).x; float R = texture2D(uCurl,vR).x; float T = texture2D(uCurl,vT).x; float B = texture2D(uCurl,vB).x; float C = texture2D(uCurl,vUv).x;
  vec2 force = 0.5*vec2(abs(T)-abs(B), abs(R)-abs(L)); force /= length(force)+0.0001; force *= curl*C; force.y *= -1.0;
  vec2 v = texture2D(uVelocity,vUv).xy + force*dt; v = min(max(v,-1000.0),1000.0);
  gl_FragColor = vec4(v,0.0,1.0);
}`,

  pressure: HEAD + `uniform sampler2D uPressure; uniform sampler2D uDivergence;
void main(){
  float L = texture2D(uPressure,vL).x; float R = texture2D(uPressure,vR).x; float T = texture2D(uPressure,vT).x; float B = texture2D(uPressure,vB).x;
  gl_FragColor = vec4((L+R+B+T-texture2D(uDivergence,vUv).x)*0.25,0.0,0.0,1.0);
}`,

  gradient: HEAD + `uniform sampler2D uPressure; uniform sampler2D uVelocity;
void main(){
  float L = texture2D(uPressure,vL).x; float R = texture2D(uPressure,vR).x; float T = texture2D(uPressure,vT).x; float B = texture2D(uPressure,vB).x;
  vec2 v = texture2D(uVelocity,vUv).xy - vec2(R-L,T-B);
  gl_FragColor = vec4(v,0.0,1.0);
}`,

  display: HEAD + `uniform sampler2D uTexture; uniform vec2 texelSize; uniform vec3 uBg; uniform vec3 uCenter; uniform vec2 uGlowPos;
uniform vec3 uTint; uniform float uGain; uniform float uTime; uniform vec2 uRes; uniform float uStrength; uniform float uShade;
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
void main(){
  vec2 o = texelSize;
  float c = texture2D(uTexture,vUv).r;
  float dL = texture2D(uTexture,vUv-vec2(o.x,0.0)).r; float dR = texture2D(uTexture,vUv+vec2(o.x,0.0)).r;
  float dT = texture2D(uTexture,vUv+vec2(0.0,o.y)).r; float dB = texture2D(uTexture,vUv-vec2(0.0,o.y)).r;
  // Soft relief (original look) or a small blur (calm look)
  float d = mix(c*0.52 + (dL+dR+dT+dB)*0.12, c, uShade);
  vec3 n = normalize(vec3(dR-dL, dT-dB, length(o)*6.0));
  float shade = mix(1.0, clamp(dot(n, normalize(vec3(-0.35,0.55,1.0))) + 0.15, 0.78, 1.06), uShade);
  float a = 1.0 - exp(-max(d,0.0)*uGain);
  float asp = uRes.x/uRes.y;
  vec2 q = (vUv - uGlowPos)*vec2(asp,1.0);
  float g = exp(-(q.x*q.x*3.45 + q.y*q.y*6.7));
  vec3 base = mix(uBg, uCenter, g);
  float vig = smoothstep(1.55, 0.35, length((vUv-0.5)*vec2(asp,1.0)));
  vec3 col = base + uTint*a*shade*vig*uStrength;
  col += uTint*0.45*smoothstep(1.4,3.2,d)*vig*uStrength*uShade;
  col += (hash(vUv*uRes + fract(uTime)*91.0) - 0.5)*0.028;
  gl_FragColor = vec4(max(col,vec3(0.0)),1.0);
}`,
};

export function createSmoke(canvas: HTMLCanvasElement): SmokeApi | null {
  const P = SMOKE;
  const opts: WebGLContextAttributes = { alpha: false, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
  let gl: GL | null = canvas.getContext('webgl2', opts);
  const isGL2 = gl !== null;
  if (!gl) gl = (canvas.getContext('webgl', opts) as WebGLRenderingContext | null);
  if (!gl) return null;
  const g: GL = gl;

  let halfType: number;
  let linear: boolean;
  if (isGL2) {
    g.getExtension('EXT_color_buffer_float');
    linear = true;
    halfType = (g as WebGL2RenderingContext).HALF_FLOAT;
  } else {
    const hf = g.getExtension('OES_texture_half_float');
    linear = Boolean(g.getExtension('OES_texture_half_float_linear'));
    if (!hf) return null;
    halfType = hf.HALF_FLOAT_OES;
  }

  function canRender(internal: number, format: number): boolean {
    const tex = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, tex);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    g.texImage2D(g.TEXTURE_2D, 0, internal, 4, 4, 0, format, halfType, null);
    const fb = g.createFramebuffer();
    g.bindFramebuffer(g.FRAMEBUFFER, fb);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
    const ok = g.checkFramebufferStatus(g.FRAMEBUFFER) === g.FRAMEBUFFER_COMPLETE;
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.deleteFramebuffer(fb);
    g.deleteTexture(tex);
    return ok;
  }
  function fmt(internal: number, format: number): Fmt | null {
    if (canRender(internal, format)) return { internal, format };
    if (isGL2) {
      const g2 = g as WebGL2RenderingContext;
      if (internal === g2.R16F) return fmt(g2.RG16F, g2.RG);
      if (internal === g2.RG16F) return fmt(g2.RGBA16F, g2.RGBA);
    }
    return null;
  }
  let fRGBA: Fmt | null, fRG: Fmt | null, fR: Fmt | null;
  if (isGL2) {
    const g2 = g as WebGL2RenderingContext;
    fRGBA = fmt(g2.RGBA16F, g2.RGBA);
    fRG = fmt(g2.RG16F, g2.RG);
    fR = fmt(g2.R16F, g2.RED);
  } else {
    fRGBA = fRG = fR = fmt(g.RGBA, g.RGBA);
  }
  if (!fRGBA || !fRG || !fR) return null;
  const RGBA = fRGBA, RG = fRG, R = fR;

  function shader(type: number, src: string, defs: string[] = []): WebGLShader {
    const s = g.createShader(type);
    if (!s) throw new Error('createShader failed');
    g.shaderSource(s, defs.map((k) => `#define ${k}\n`).join('') + src);
    g.compileShader(s);
    if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s) ?? 'shader error');
    return s;
  }
  const vs = shader(g.VERTEX_SHADER, VERT);
  function prog(src: string, defs: string[] = []): Program {
    const p = g.createProgram();
    if (!p) throw new Error('createProgram failed');
    g.attachShader(p, vs);
    g.attachShader(p, shader(g.FRAGMENT_SHADER, src, defs));
    g.bindAttribLocation(p, 0, 'aPosition');
    g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(p) ?? 'link error');
    const u: Record<string, WebGLUniformLocation | null> = {};
    const n = g.getProgramParameter(p, g.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const info = g.getActiveUniform(p, i);
      if (info) u[info.name] = g.getUniformLocation(p, info.name);
    }
    return { p, u };
  }
  const PR = {
    clear: prog(FRAG.clear),
    splat: prog(FRAG.splat),
    advect: prog(FRAG.advect, linear ? [] : ['MANUAL_FILTERING']),
    divergence: prog(FRAG.divergence),
    curl: prog(FRAG.curl),
    vorticity: prog(FRAG.vorticity),
    pressure: prog(FRAG.pressure),
    gradient: prog(FRAG.gradient),
    display: prog(FRAG.display),
  };

  g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
  g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), g.STATIC_DRAW);
  g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, g.createBuffer());
  g.bufferData(g.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), g.STATIC_DRAW);
  g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
  g.enableVertexAttribArray(0);

  function blit(t: FBO | null) {
    if (!t) {
      g.viewport(0, 0, g.drawingBufferWidth, g.drawingBufferHeight);
      g.bindFramebuffer(g.FRAMEBUFFER, null);
    } else {
      g.viewport(0, 0, t.w, t.h);
      g.bindFramebuffer(g.FRAMEBUFFER, t.fb);
    }
    g.drawElements(g.TRIANGLES, 6, g.UNSIGNED_SHORT, 0);
  }
  function fbo(w: number, h: number, f: Fmt, filter: number): FBO {
    g.activeTexture(g.TEXTURE0);
    const tex = g.createTexture();
    if (!tex) throw new Error('createTexture failed');
    g.bindTexture(g.TEXTURE_2D, tex);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, filter);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, filter);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    g.texImage2D(g.TEXTURE_2D, 0, f.internal, w, h, 0, f.format, halfType, null);
    const fb = g.createFramebuffer();
    if (!fb) throw new Error('createFramebuffer failed');
    g.bindFramebuffer(g.FRAMEBUFFER, fb);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
    g.viewport(0, 0, w, h);
    g.clearColor(0, 0, 0, 1);
    g.clear(g.COLOR_BUFFER_BIT);
    return {
      tex, fb, w, h, tx: 1 / w, ty: 1 / h,
      attach(id: number) { g.activeTexture(g.TEXTURE0 + id); g.bindTexture(g.TEXTURE_2D, tex); return id; },
    };
  }
  function dfbo(w: number, h: number, f: Fmt, filter: number): DoubleFBO {
    let a = fbo(w, h, f, filter);
    let b = fbo(w, h, f, filter);
    return {
      w, h, tx: 1 / w, ty: 1 / h,
      get read() { return a; },
      get write() { return b; },
      swap() { const t = a; a = b; b = t; },
    };
  }
  function res(r: number) {
    let ar = g.drawingBufferWidth / g.drawingBufferHeight;
    if (ar < 1) ar = 1 / ar;
    const lo = Math.round(r), hi = Math.round(r * ar);
    return g.drawingBufferWidth > g.drawingBufferHeight ? { w: hi, h: lo } : { w: lo, h: hi };
  }

  const dyeRes = window.innerWidth < 760 ? P.DYE_MOBILE : P.DYE_DESKTOP;
  let vel!: DoubleFBO, dye!: DoubleFBO, div!: FBO, curl!: FBO, pres!: DoubleFBO;
  function initFBOs() {
    const s = res(P.SIM), d = res(dyeRes), filt = linear ? g.LINEAR : g.NEAREST;
    g.disable(g.BLEND);
    dye = dfbo(d.w, d.h, RGBA, filt);
    vel = dfbo(s.w, s.h, RG, filt);
    div = fbo(s.w, s.h, R, g.NEAREST);
    curl = fbo(s.w, s.h, R, g.NEAREST);
    pres = dfbo(s.w, s.h, R, g.NEAREST);
  }
  function resize(): boolean {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; return true; }
    return false;
  }
  resize();
  initFBOs();

  const use = (pr: Program) => { g.useProgram(pr.p); return pr.u; };

  function step(dt: number) {
    g.disable(g.BLEND);
    let u = use(PR.curl);
    g.uniform2f(u.texelSize, vel.tx, vel.ty); g.uniform1i(u.uVelocity, vel.read.attach(0)); blit(curl);

    u = use(PR.vorticity);
    g.uniform2f(u.texelSize, vel.tx, vel.ty); g.uniform1i(u.uVelocity, vel.read.attach(0)); g.uniform1i(u.uCurl, curl.attach(1));
    g.uniform1f(u.curl, P.CURL); g.uniform1f(u.dt, dt); blit(vel.write); vel.swap();

    u = use(PR.divergence);
    g.uniform2f(u.texelSize, vel.tx, vel.ty); g.uniform1i(u.uVelocity, vel.read.attach(0)); blit(div);

    u = use(PR.clear);
    g.uniform1i(u.uTexture, pres.read.attach(0)); g.uniform1f(u.value, P.PRESSURE); blit(pres.write); pres.swap();

    u = use(PR.pressure);
    g.uniform2f(u.texelSize, vel.tx, vel.ty); g.uniform1i(u.uDivergence, div.attach(0));
    for (let i = 0; i < P.ITERATIONS; i++) { g.uniform1i(u.uPressure, pres.read.attach(1)); blit(pres.write); pres.swap(); }

    u = use(PR.gradient);
    g.uniform2f(u.texelSize, vel.tx, vel.ty); g.uniform1i(u.uPressure, pres.read.attach(0)); g.uniform1i(u.uVelocity, vel.read.attach(1));
    blit(vel.write); vel.swap();

    u = use(PR.advect);
    g.uniform2f(u.texelSize, vel.tx, vel.ty);
    if (!linear) g.uniform2f(u.dyeTexelSize, vel.tx, vel.ty);
    const v = vel.read.attach(0);
    g.uniform1i(u.uVelocity, v); g.uniform1i(u.uSource, v);
    g.uniform1f(u.dt, dt); g.uniform1f(u.dissipation, P.VEL_DISS); blit(vel.write); vel.swap();

    if (!linear) g.uniform2f(u.dyeTexelSize, dye.tx, dye.ty);
    g.uniform1i(u.uVelocity, vel.read.attach(0)); g.uniform1i(u.uSource, dye.read.attach(1));
    g.uniform1f(u.dissipation, P.DENS_DISS); blit(dye.write); dye.swap();
  }

  function radius() {
    let r = P.RADIUS / 100;
    const ar = canvas.width / canvas.height;
    if (ar > 1) r *= ar;
    return r;
  }
  function splat(x: number, y: number, dx: number, dy: number, amount: number) {
    const u = use(PR.splat);
    g.uniform1i(u.uTarget, vel.read.attach(0)); g.uniform1f(u.aspectRatio, canvas.width / canvas.height);
    g.uniform2f(u.point, x, y); g.uniform3f(u.color, dx, dy, 0); g.uniform1f(u.radius, radius());
    blit(vel.write); vel.swap();
    g.uniform1i(u.uTarget, dye.read.attach(0)); g.uniform3f(u.color, amount, amount, amount);
    blit(dye.write); dye.swap();
  }

  const t0 = performance.now();
  const glow = [0.5, 0.51], glowTarget = [0.5, 0.51];
  let strength = 1, strengthTarget = 1, paused = false;
  function render() {
    glow[0] += (glowTarget[0] - glow[0]) * 0.04;
    glow[1] += (glowTarget[1] - glow[1]) * 0.04;
    strength += (strengthTarget - strength) * 0.05;
    const u = use(PR.display);
    g.uniform2f(u.texelSize, dye.tx * P.BLUR, dye.ty * P.BLUR);
    g.uniform1f(u.uShade, P.SHADE ? 1 : 0);
    g.uniform1i(u.uTexture, dye.read.attach(0));
    g.uniform1f(u.uStrength, strength);
    g.uniform3f(u.uBg, P.BG[0], P.BG[1], P.BG[2]);
    g.uniform3f(u.uCenter, P.CENTER[0], P.CENTER[1], P.CENTER[2]);
    g.uniform2f(u.uGlowPos, glow[0], glow[1]);
    g.uniform3f(u.uTint, P.TINT[0], P.TINT[1], P.TINT[2]);
    g.uniform1f(u.uGain, P.GAIN);
    g.uniform1f(u.uTime, (performance.now() - t0) / 1000);
    g.uniform2f(u.uRes, g.drawingBufferWidth, g.drawingBufferHeight);
    blit(null);
  }

  // Input is queued and drained once per frame
  const queue: [number, number, number, number, number][] = [];
  let lastInput = 0;
  function push(x: number, y: number, dx: number, dy: number, amount: number) {
    const ar = canvas.width / canvas.height;
    if (ar < 1) dx *= ar;
    if (ar > 1) dy /= ar;
    queue.push([x, y, dx * P.FORCE, dy * P.FORCE, amount]);
    if (queue.length > 12) queue.shift();
  }
  const virt: Record<string, [number, number] | null> = {};

  const api: SmokeApi = {
    stroke(key, x, y, amount) {
      const ux = x, uy = 1 - y, pv = virt[key];
      if (pv) push(ux, uy, ux - pv[0], uy - pv[1], amount);
      virt[key] = [ux, uy];
    },
    lift(key) { virt[key] = null; },
    puff(x, y, dx, dy, amount) { push(x, 1 - y, dx, -dy, amount); },
    touched() { lastInput = performance.now(); },
    lean(x, y) { glowTarget[0] = 0.5 + (x - 0.5) * 0.08; glowTarget[1] = 0.51 - (y - 0.5) * 0.06; },
    depth(t) { strengthTarget = 1 - (1 - P.CONTENT) * Math.max(0, Math.min(1, t)); },
    pause(v) { paused = v; },
  };

  let last = performance.now();
  let nextAmbient = last + 2500;
  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, 0.016666);
    last = now;
    if (paused) { queue.length = 0; requestAnimationFrame(frame); return; }
    if (resize()) initFBOs();
    // Idle puffs from the sides while nobody is moving the cursor
    if (P.AMBIENT.amount > 0 && now > nextAmbient && now - lastInput > 2500 && strengthTarget > 0.9) {
      const fromLeft = Math.random() < 0.5, y = 0.25 + Math.random() * 0.55;
      push(fromLeft ? 0.02 : 0.98, 1 - y, (fromLeft ? 1 : -1) * 0.012, (Math.random() - 0.5) * 0.006, P.AMBIENT.amount);
      nextAmbient = now + P.AMBIENT.every + Math.random() * 1800;
    }
    for (const q of queue) splat(q[0], q[1], q[2], q[3], q[4]);
    queue.length = 0;
    step(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return api;
}
