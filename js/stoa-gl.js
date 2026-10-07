/* Στοά — процедурный мраморный бюст на фоне размытой колоннады.
   Signed distance fields + raymarching: ни одной модели, всё вылеплено формулами.
   Проход 1: колоннада в низком разрешении → гауссово размытие (глубина резкости).
   Проход 2: бюст в полном разрешении поверх размытого фона. */
(function () {
  'use strict';

  const VERT = 'attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.0,1.0);}';

  const COMMON = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uLight;
uniform vec2 uHead;
uniform float uYaw;
uniform float uShift;
uniform vec4 uA;      // beardLen, beardOn, hairVol, bald
uniform vec4 uB;      // curl, age, full, drape
uniform vec3 uTint;
uniform vec3 uCamPos;
uniform vec3 uCamTgt;
uniform float uFocal;
uniform float uExpo;
uniform float uCut;
uniform float uBgRot;

const vec3 BUSTPOS = vec3(0.0, 2.35, 0.0);
const float BS = 0.62;
float gDet = 1.0;
vec3 gTex = vec3(0.0);

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5*(b - a)/k, 0.0, 1.0); return mix(b, a, h) - k*h*(1.0 - h); }
float smax(float a, float b, float k){ return -smin(-a, -b, k); }
float sdEll(vec3 p, vec3 r){ float k0 = length(p/r); float k1 = length(p/(r*r)); return k0*(k0 - 1.0)/k1; }
float sdCap(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0); return length(pa - ba*h) - r; }
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdCyl(vec3 p, float r, float h){ vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2){
  vec3 ba = b - a; float l2 = dot(ba, ba); float rr = r1 - r2; float a2 = l2 - rr*rr; float il2 = 1.0/l2;
  vec3 pa = p - a; float y = dot(pa, ba); float z = y - l2;
  vec3 xv = pa*l2 - ba*y; float x2 = dot(xv, xv); float y2 = y*y*l2; float z2 = z*z*l2;
  float k = sign(rr)*rr*rr*x2;
  if (sign(z)*a2*z2 > k) return sqrt(x2 + z2)*il2 - r2;
  if (sign(y)*a2*y2 < k) return sqrt(x2 + y2)*il2 - r1;
  return (sqrt(x2*a2*il2) + y*rr)*il2 - r1;
}

float hash3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x + p.y + p.z)); }
vec3 hash33(vec3 p){
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p)*43758.5453123);
}
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a*vnoise(p); p = p*2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
float fbm2(vec3 p){ return 0.65*vnoise(p) + 0.35*vnoise(p*2.1 + 5.3); }

vec3 camRay(vec2 fc, vec2 res, out vec3 ro){
  vec2 uv = (2.0*fc - res)/res.y; uv.x -= uShift;
  ro = uCamPos;
  vec3 ww = normalize(uCamTgt - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  return normalize(uv.x*uu + uv.y*vv + uFocal*ww);
}

vec3 skyCol(vec3 rd, vec3 L){
  float y = max(rd.y, 0.0);
  vec3 c = mix(vec3(0.94, 0.91, 0.86), vec3(0.64, 0.71, 0.78), pow(y, 0.55));
  float s = max(dot(rd, L), 0.0);
  c += vec3(1.0, 0.88, 0.7)*(0.3*pow(s, 5.0) + 0.5*pow(s, 60.0));
  vec2 cuv = rd.xz/(rd.y + 0.18)*1.3 + vec2(uTime*0.006, 0.0);
  float cl = smoothstep(0.42, 0.78, fbm(vec3(cuv, 1.0)));
  c = mix(c, vec3(0.97, 0.95, 0.91), cl*0.55*smoothstep(0.0, 0.25, rd.y));
  return c*0.95;
}
`;

  /* ——— Фон: колоннада, плиты, обломки, небо, дымка ——— */
  const BG = COMMON + `
float columnBG(vec3 p, float h, float r){
  float rr = r - 0.06*clamp(p.y/h, 0.0, 1.0);
  float a = atan(p.z, p.x); float t = fract(a*20.0/6.2831853) - 0.5;
  float d = (length(p.xz) - rr + 0.035*(1.0 - 4.0*t*t))*0.9;
  d = max(d, abs(p.y - h*0.5) - h*0.5);
  d = min(d, sdEll(p - vec3(0.0, h, 0.0), vec3(r*1.3, 0.18, r*1.3)));
  d = min(d, sdBox(p - vec3(0.0, h + 0.2, 0.0), vec3(r*1.42, 0.11, r*1.42)));
  d = min(d, sdCyl(p - vec3(0.0, 0.1, 0.0), r*1.28, 0.1));
  return d;
}
vec2 mapBG(vec3 p){
  p.xz = rot(uBgRot)*p.xz;
  vec2 res = vec2(p.y, 1.0);
  float sp = 2.7;
  float k = clamp(floor((-1.0 - p.z)/sp + 0.5), 0.0, 16.0);
  float d = columnBG(vec3(p.x - 5.6, p.y - 0.6, p.z - (-1.0 - k*sp)), 7.2, 0.52);
  d = min(d, sdBox(p - vec3(5.6, 0.3, -21.0), vec3(1.15, 0.3, 21.0)));
  d = min(d, sdBox(p - vec3(5.6, 8.6, -21.0), vec3(0.85, 0.55, 21.0)));
  d = min(d, sdBox(p - vec3(5.6, 9.35, -21.0), vec3(1.05, 0.2, 21.0)));
  if (d < res.x) res = vec2(d, 2.0);
  float st = sdBox(p - vec3(8.8, 9.3, -21.0), vec3(3.4, 0.35, 21.0));
  st = min(st, sdBox(p - vec3(11.8, 5.0, -21.0), vec3(0.4, 5.0, 21.0)));
  if (st < res.x) res = vec2(st, 4.0);
  float sp2 = 3.2;
  float k2 = clamp(floor((-3.0 - p.z)/sp2 + 0.5), 0.0, 10.0);
  float hh = 3.0 + 4.0*fract(sin(k2*12.9898 + 4.1)*43758.5);
  float d2 = columnBG(vec3(p.x + 8.0, p.y, p.z - (-3.0 - k2*sp2)), hh, 0.56);
  if (d2 < res.x) res = vec2(d2, 2.0);
  float b = sdBox(p - vec3(-2.8, 0.35, -6.5), vec3(0.95, 0.35, 0.6)) - 0.04;
  b = min(b, sdBox(p - vec3(1.4, 0.25, -10.5), vec3(0.55, 0.25, 0.75)) - 0.04);
  b = min(b, sdCyl((p - vec3(-1.2, 0.48, -13.0)).yxz, 0.48, 0.55));
  b = min(b, sdBox(p - vec3(-6.0, 1.2, -16.0), vec3(1.4, 1.2, 0.9)) - 0.04);
  if (b < res.x) res = vec2(b, 3.0);
  float w = sdBox(p - vec3(-6.0, 4.0, -42.0), vec3(18.0, 4.0, 1.0));
  w = min(w, sdBox(p - vec3(-6.0, 9.0, -42.5), vec3(18.0, 1.0, 1.4)));
  if (w < res.x) res = vec2(w, 4.0);
  return res;
}
vec3 nBG(vec3 p){
  const vec2 k = vec2(1.0, -1.0); const float h = 0.004;
  return normalize(k.xyy*mapBG(p + k.xyy*h).x + k.yyx*mapBG(p + k.yyx*h).x + k.yxy*mapBG(p + k.yxy*h).x + k.xxx*mapBG(p + k.xxx*h).x);
}
float shBG(vec3 ro, vec3 rd){
  float res = 1.0, t = 0.05;
  for (int i = 0; i < 28; i++){
    float h = mapBG(ro + rd*t).x;
    res = min(res, 10.0*h/t);
    t += clamp(h, 0.06, 1.2);
    if (res < 0.01 || t > 30.0) break;
  }
  return clamp(res, 0.0, 1.0);
}
void main(){
  vec3 ro; vec3 rd = camRay(gl_FragCoord.xy, uRes, ro);
  vec3 L = normalize(uLight);
  vec3 col = skyCol(rd, L);
  float t = 0.6, m = 0.0;
  for (int i = 0; i < 110; i++){
    vec2 h = mapBG(ro + rd*t);
    if (h.x < 0.002*t){ m = h.y; break; }
    t += h.x;
    if (t > 110.0) break;
  }
  if (m > 0.5){
    vec3 p = ro + rd*t;
    vec3 n = nBG(p);
    vec3 alb;
    if (m < 1.5){
      vec2 g = fract(p.xz*vec2(0.55, 0.75));
      float j = smoothstep(0.0, 0.02, g.x)*smoothstep(0.0, 0.02, g.y);
      alb = vec3(0.6, 0.56, 0.5)*(0.8 + 0.35*fbm(p*0.9))*(0.75 + 0.25*j);
    } else if (m < 2.5){
      alb = vec3(0.7, 0.66, 0.6)*(0.8 + 0.3*fbm(p*vec3(2.0, 0.4, 2.0)));
    } else if (m < 3.5){
      alb = vec3(0.68, 0.64, 0.57)*(0.8 + 0.3*fbm(p*2.5));
    } else {
      alb = vec3(0.72, 0.68, 0.62);
    }
    float dif = max(dot(n, L), 0.0);
    float sh = dif > 0.0 ? shBG(p + n*0.02, L) : 0.0;
    float occ = 0.6 + 0.4*clamp(mapBG(p + n*0.4).x/0.4, 0.0, 1.0);
    vec3 lin = vec3(1.0, 0.88, 0.7)*2.6*dif*sh;
    lin += vec3(0.5, 0.56, 0.64)*(0.5 + 0.5*n.y)*occ*0.8;
    lin += vec3(0.5, 0.44, 0.36)*0.35*max(-n.y, 0.0);
    col = alb*lin;
    vec3 haze = mix(vec3(0.86, 0.84, 0.8), vec3(1.0, 0.9, 0.74), pow(max(dot(rd, L), 0.0), 4.0))*1.0;
    col = mix(col, haze, 1.0 - exp(-t*0.022));
  }
  gl_FragColor = vec4(sqrt(clamp(col*0.5, 0.0, 1.0)), 1.0);
}
`;

  const BLUR = `
precision mediump float;
uniform sampler2D uTex; uniform vec2 uDir; uniform vec2 uRes;
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 o1 = uDir*1.3846153846/uRes, o2 = uDir*3.2307692308/uRes;
  vec3 c = texture2D(uTex, uv).rgb*0.2270270270;
  c += (texture2D(uTex, uv + o1).rgb + texture2D(uTex, uv - o1).rgb)*0.3162162162;
  c += (texture2D(uTex, uv + o2).rgb + texture2D(uTex, uv - o2).rgb)*0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}
`;

  /* ——— Бюст ——— */
  const BUST = COMMON + `
uniform sampler2D uBg;

float ringlets(vec3 p, vec3 nrm){
  vec3 ip = floor(p), fp = fract(p);
  float best = 8.0; vec3 bv = vec3(0.0); vec3 bid = vec3(0.0);
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++){
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 v = g + hash33(ip + g)*0.8 + 0.1 - fp;
    float dd = dot(v, v);
    if (dd < best){ best = dd; bv = v; bid = ip + g; }
  }
  vec3 v = -bv;
  v -= nrm*dot(v, nrm);
  float r = length(v);
  vec3 up = abs(nrm.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 t1 = normalize(cross(nrm, up));
  vec3 t2 = cross(nrm, t1);
  float a = atan(dot(v, t2), dot(v, t1));
  float sz = 0.62 + 0.25*hash3(bid*1.7 + 0.5);
  float dome = 1.0 - smoothstep(0.0, sz, r);
  dome = dome*(2.0 - dome);
  float rs = 0.07 + 0.2*fract(a/6.2831853 + 0.5 + hash3(bid));
  float groove = 1.0 - smoothstep(0.0, 0.045, abs(r - rs));
  return dome*(1.0 - 0.24*groove*smoothstep(0.04, 0.12, r));
}

float headSkin(vec3 p){
  vec3 s = vec3(abs(p.x), p.y, p.z);
  float full = uB.z;
  float d = sdEll(p - vec3(0.0, 0.10, -0.06), vec3(0.355, 0.40, 0.43));
  d = smin(d, sdEll(p - vec3(0.0, -0.07, 0.07), vec3(0.28 + 0.025*full, 0.40, 0.31)), 0.10);
  d = smax(d, -sdEll(s - vec3(0.37, 0.12, 0.13), vec3(0.05, 0.08, 0.08)), 0.05);
  d = smin(d, sdEll(s - vec3(0.175, -0.03, 0.215), vec3(0.10, 0.07, 0.10)), 0.07);
  d = smin(d, sdEll(s - vec3(0.15, -0.19, 0.17), vec3(0.09 + 0.045*full, 0.11, 0.105)), 0.08);
  d = smin(d, sdEll(p - vec3(0.0, -0.32, 0.13), vec3(0.19, 0.13, 0.18)), 0.09);
  d = smin(d, sdEll(s - vec3(0.185, -0.25, 0.02), vec3(0.09, 0.12, 0.12)), 0.08);
  d = smin(d, sdEll(p - vec3(0.0, -0.395, 0.268), vec3(0.075, 0.06, 0.06)), 0.06);
  d = smin(d, sdCap(s, vec3(0.03, 0.10, 0.345), vec3(0.17, 0.092, 0.292), 0.048), 0.05);
  d = smin(d, sdEll(p - vec3(0.0, 0.082, 0.362), vec3(0.04, 0.04, 0.03)), 0.04);
  d = smax(d, -sdEll(s - vec3(0.112, 0.032, 0.374), vec3(0.074, 0.04, 0.048)), 0.03);
  float eye = sdEll(s - vec3(0.112, 0.026, 0.298), vec3(0.058, 0.031, 0.05));
  eye = smax(eye, -(abs(length(s.xy - vec2(0.106, 0.022)) - 0.019) - 0.0028), 0.002);
  eye = smax(eye, -(length(s - vec3(0.106, 0.022, 0.356)) - 0.0075), 0.003);
  d = smin(d, eye, 0.008);
  d = smin(d, sdCap(s, vec3(0.058, 0.05, 0.34), vec3(0.17, 0.04, 0.305), 0.014), 0.016);
  d = smin(d, sdCap(s, vec3(0.072, 0.004, 0.337), vec3(0.158, 0.008, 0.313), 0.0065), 0.012);
  d = smin(d, sdCap(s, vec3(0.035, 0.113, 0.362), vec3(0.185, 0.104, 0.298), 0.015), 0.014);
  d = smin(d, sdRoundCone(p, vec3(0.0, 0.07, 0.352), vec3(0.0, -0.115, 0.442), 0.026, 0.044), 0.04);
  d = smin(d, sdEll(s - vec3(0.037, -0.123, 0.39), vec3(0.03, 0.026, 0.03)), 0.025);
  d = smax(d, -sdEll(s - vec3(0.024, -0.146, 0.405), vec3(0.012, 0.008, 0.02)), 0.01);
  d = smax(d, -sdCap(s, vec3(0.066, -0.13, 0.372), vec3(0.108, -0.255, 0.335), 0.007), 0.02);
  d = smin(d, sdEll(p - vec3(0.0, -0.207, 0.37), vec3(0.068, 0.016, 0.032)), 0.02);
  d = smin(d, sdEll(p - vec3(0.0, -0.245, 0.362), vec3(0.058, 0.018, 0.032)), 0.02);
  d = smax(d, -sdCap(p, vec3(-0.06, -0.226, 0.405), vec3(0.06, -0.226, 0.405), 0.007), 0.006);
  d = smin(d, sdEll(s - vec3(0.34, 0.0, -0.03), vec3(0.045, 0.11, 0.075)), 0.03);
  float fw = smoothstep(0.13, 0.17, p.y)*(1.0 - smoothstep(0.27, 0.32, p.y))*smoothstep(0.15, 0.3, p.z);
  d += gDet*uB.y*0.0035*sin(p.y*95.0 + sin(p.x*9.0))*fw;
  return d;
}

float hairD(vec3 p){
  float vol = uA.z, bald = uA.w;
  float e = 0.012 + 0.032*vol;
  float d = sdEll(p - vec3(0.0, 0.13 + 0.025*vol, -0.07), vec3(0.355 + e, 0.405 + e, 0.445 + e));
  float front = mix(0.2, 0.5, bald);
  float hl = mix(front, -0.34, 1.0 - smoothstep(-0.25, 0.22, p.z));
  hl -= 0.13*smoothstep(0.22, 0.34, abs(p.x))*smoothstep(-0.1, 0.2, p.z);
  d = smax(d, hl - p.y, 0.05);
  d = smax(d, p.y - mix(1.2, 0.1, smoothstep(0.3, 1.0, bald)), 0.14);
  float cf = smoothstep(0.5, 0.9, uB.x);
  float amp = mix(0.006, 0.05, cf);
  if (gDet < 0.5) return d - amp*0.5;
  if (d > 0.08) return d - amp;
  vec3 nrm = normalize(p - vec3(0.0, 0.1, -0.06));
  if (cf > 0.01) d -= amp*ringlets(p*9.5, nrm);
  float az = atan(p.x, p.z);
  d -= (1.0 - cf)*0.012*(1.0 - abs(sin(az*18.0 + 2.0*sin(p.y*9.0 + p.z*6.0))));
  return d;
}

float beardD(vec3 p){
  float L = uA.x;
  float d = sdEll(p - vec3(0.0, -0.25 - 0.05*L, 0.1), vec3(0.3, 0.24 + 0.07*L, 0.275));
  d = smin(d, sdEll(p - vec3(0.0, -0.4 - 0.15*L, 0.22 - 0.02*L), vec3(0.15 + 0.02*L, 0.12 + 0.14*L, 0.13)), 0.1);
  float top = mix(0.03, -0.15, smoothstep(0.08, 0.36, p.z));
  d = smax(d, p.y - top, 0.04);
  d = smax(d, -(p.z + 0.02), 0.06);
  d = smax(d, -sdEll(p - vec3(0.0, -0.236, 0.4), vec3(0.046, 0.013, 0.06)), 0.016);
  vec3 s = vec3(abs(p.x), p.y, p.z);
  d = smin(d, sdCap(s, vec3(0.0, -0.178, 0.405), vec3(0.105, -0.235, 0.345), 0.027), 0.03);
  float cf = smoothstep(0.5, 0.9, uB.x);
  float amp = mix(0.006, 0.04, cf);
  if (gDet < 0.5) return d - amp*0.5;
  if (d > 0.08) return d - amp;
  vec3 nrm = normalize((p - vec3(0.0, -0.22, 0.0))*vec3(1.0, 0.35, 1.0));
  if (cf > 0.01) d -= amp*ringlets(p*vec3(11.0, 7.5, 11.0), nrm);
  d -= (1.0 - cf)*0.011*(1.0 - abs(sin(p.x*34.0 + 2.2*sin(p.y*7.0 + p.z*5.0))));
  return d;
}

float neckD(vec3 p){
  vec3 s = vec3(abs(p.x), p.y, p.z);
  float d = sdCap(p, vec3(0.0, -0.28, -0.07), vec3(0.0, -0.76, -0.04), 0.155);
  d = smin(d, sdCap(s, vec3(0.2, -0.22, -0.1), vec3(0.05, -0.76, 0.08), 0.045), 0.06);
  return d;
}

float bodyD(vec3 p){
  vec3 s = vec3(abs(p.x), p.y, p.z);
  float d = sdCap(s, vec3(0.0, -0.84, -0.08), vec3(0.56, -1.0, -0.06), 0.15);
  d = smin(d, sdCap(s, vec3(0.64, -1.06, -0.04), vec3(0.74, -2.1, 0.0), 0.18), 0.12);
  d = smin(d, sdEll(p - vec3(0.0, -1.2, -0.02), vec3(0.62, 0.40, 0.3)), 0.16);
  d = smin(d, sdEll(p - vec3(0.0, -1.8, -0.03), vec3(0.66, 0.62, 0.3)), 0.2);
  d = smin(d, sdEll(p - vec3(0.0, -2.7, -0.03), vec3(0.62, 0.9, 0.29)), 0.2);
  d = smin(d, sdEll(s - vec3(0.18, -1.17, 0.14), vec3(0.2, 0.15, 0.12)), 0.08);
  d = smin(d, sdCap(s, vec3(0.05, -0.86, 0.1), vec3(0.3, -0.9, 0.04), 0.025), 0.05);
  if (uCut > 0.5){
    d = smax(d, -(p.y + 1.43 - 0.55*p.x*p.x), 0.025);
    d = smax(d, -(p.z + 0.2), 0.05);
  } else {
    d = smax(d, -(p.y + 3.6), 0.05);
  }
  return d;
}

float clothD(vec3 p, float body){
  float nl = -0.83 - 0.2*exp(-p.x*p.x*12.0)*smoothstep(-0.05, 0.15, p.z);
  vec2 b = vec2(0.42, -1.0);
  vec2 rel = p.xy - b;
  float r = length(rel);
  float a = atan(rel.y, rel.x);
  float radial = (1.0 - abs(sin(a*7.0 + 1.5*sin(r*5.0) + p.z*2.0)))*smoothstep(0.06, 0.35, r);
  float diag = 1.0 - abs(sin((p.x*0.62 - p.y*0.78)*9.0 + 1.6*sin(p.y*5.0 + p.x*3.0)));
  float w = smoothstep(0.25, 0.75, r);
  float folds = mix(radial, diag, w);
  float roll = exp(-(p.y - nl)*(p.y - nl)*320.0);
  float d = body - (0.04 + 0.05*folds*(0.65 + 0.35*sin(r*9.0)) + 0.03*roll);
  d -= gDet*0.006*sin(p.x*26.0 + 3.0*sin(p.y*5.0))*(1.0 - smoothstep(-1.6, -1.1, p.y));
  d = smax(d, p.y - nl, 0.03);
  if (uCut > 0.5){
    d = smax(d, -(p.y + 1.43 - 0.55*p.x*p.x), 0.025);
    d = smax(d, -(p.z + 0.17), 0.04);
  } else {
    d = smax(d, -(p.y + 3.6), 0.05);
  }
  d += (1.0 - uB.w)*0.2;
  vec3 q = p - vec3(b, 0.205);
  q = vec3(q.x, q.z, q.y);
  float br = sdCyl(q, 0.068, 0.012) - 0.008;
  br = min(br, sdTorus(q - vec3(0.0, 0.02, 0.0), vec2(0.05, 0.009)));
  br = min(br, length(q - vec3(0.0, 0.02, 0.0)) - 0.022);
  br += (1.0 - uB.w)*0.2;
  return min(d, br);
}

float socleD(vec3 p){
  vec3 q = p - vec3(0.0, -1.55, -0.03);
  float d = sdCyl(q, 0.13, 0.12);
  d = min(d, sdTorus(q - vec3(0.0, 0.10, 0.0), vec2(0.14, 0.03)));
  d = min(d, sdTorus(q - vec3(0.0, -0.09, 0.0), vec2(0.17, 0.035)));
  d = min(d, sdBox(q - vec3(0.0, -0.2, 0.0), vec3(0.24, 0.06, 0.24)) - 0.01);
  d = min(d, sdBox(q - vec3(0.0, -0.36, 0.0), vec3(0.42, 0.08, 0.42)) - 0.01);
  d = min(d, sdBox(q - vec3(0.0, -0.9, 0.0), vec3(0.36, 0.5, 0.36)));
  return d;
}

vec2 mapBust(vec3 pw){
  vec3 p = (pw - BUSTPOS)/BS;
  p.xz = rot(uYaw)*p.xz;
  vec3 pb = p; pb.xz = rot(uHead.x*0.2)*pb.xz;
  vec3 ph = p - vec3(0.0, -0.45, 0.0);
  ph.xz = rot(uHead.x)*ph.xz;
  ph.yz = rot(uHead.y)*ph.yz;
  ph += vec3(0.0, -0.45, 0.0);
  float skin = smin(headSkin(ph), neckD(ph), 0.06);
  vec3 pbo = pb - vec3(0.0, 0.08, 0.0);
  float bod = bodyD(pbo);
  skin = smin(skin, bod, 0.08);
  float hb = min(hairD(ph), beardD(ph) + (1.0 - uA.y)*0.12);
  float cl = clothD(pbo, bod);
  vec2 res = vec2(skin, 1.0); gTex = ph;
  if (hb < res.x){ res = vec2(hb, 2.0); gTex = ph; }
  if (cl < res.x){ res = vec2(cl, 3.0); gTex = pb; }
  if (uCut > 0.5){
    float so = socleD(pbo);
    if (so < res.x){ res = vec2(so, 4.0); gTex = pb; }
  }
  res.x *= BS;
  return res;
}

vec3 calcNormal(vec3 p){
  const float h = 0.0009;
  const vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy*mapBust(p + k.xyy*h).x + k.yyx*mapBust(p + k.yyx*h).x + k.yxy*mapBust(p + k.yxy*h).x + k.xxx*mapBust(p + k.xxx*h).x);
}

float softShadow(vec3 ro, vec3 rd){
  gDet = 0.0;
  float res = 1.0, t = 0.02;
  for (int i = 0; i < 40; i++){
    float h = mapBust(ro + rd*t).x;
    res = min(res, 7.0*h/t);
    t += clamp(h, 0.01, 0.25);
    if (res < 0.004 || t > 3.0) break;
  }
  gDet = 1.0;
  res = clamp(res, 0.0, 1.0);
  return res*res*(3.0 - 2.0*res);
}

float calcAO(vec3 p, vec3 n){
  gDet = 0.0;
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++){
    float h = 0.006 + 0.07*float(i)/4.0;
    float d = mapBust(p + h*n).x;
    occ += (h - d)*sca; sca *= 0.85;
  }
  gDet = 1.0;
  return clamp(1.0 - 3.2*occ, 0.0, 1.0);
}

vec2 sphHit(vec3 ro, vec3 rd, vec3 c, float r){
  vec3 oc = ro - c; float b = dot(oc, rd); float cc = dot(oc, oc) - r*r; float h = b*b - cc;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h); return vec2(-b - h, -b + h);
}

vec3 stone(vec3 q, float occ, float m){
  vec3 base = uTint;
  base *= 0.82 + 0.36*fbm(q*2.6);
  base = mix(base, base*vec3(1.1, 0.98, 0.84), smoothstep(0.45, 0.78, fbm(q*1.4 + 7.0)));
  base *= m > 1.5 && m < 2.5 ? 1.0 : 0.9 + 0.2*fbm2(q*16.0 + 3.1);
  float streak = fbm(vec3(q.x*10.0, q.y*1.1, q.z*10.0) + 2.0);
  base *= 1.0 - 0.24*smoothstep(0.5, 0.8, streak);
  float lic = smoothstep(0.6, 0.7, fbm(q*4.5 + 11.0));
  base = mix(base, base*vec3(0.52, 0.53, 0.47), lic*0.55);
  base *= mix(m > 1.5 && m < 2.5 ? 0.45 : 0.32, 1.0, pow(occ, 1.25));
  if (m > 1.5 && m < 2.5) base *= 0.92;
  return base;
}

vec3 bumpN(vec3 n, vec3 q){
  const float e = 0.004;
  vec3 qq = q*22.0;
  float b0 = fbm2(qq);
  vec3 g = vec3(fbm2(qq + vec3(e*30.0, 0.0, 0.0)) - b0, fbm2(qq + vec3(0.0, e*30.0, 0.0)) - b0, fbm2(qq + vec3(0.0, 0.0, e*30.0)) - b0)/e;
  g -= n*dot(g, n);
  return normalize(n - 0.0035*g);
}

void main(){
  vec3 ro; vec3 rd = camRay(gl_FragCoord.xy, uRes, ro);
  vec2 suv = gl_FragCoord.xy/uRes;
  vec3 bgc = texture2D(uBg, suv).rgb;
  vec3 col = bgc*bgc*2.0;
  vec3 L = normalize(uLight);

  vec2 ts = sphHit(ro, rd, BUSTPOS + vec3(0.0, -1.2*BS, 0.0), 2.55*BS);
  if (ts.y > 0.0){
    float t = max(ts.x, 0.02); float m = -1.0;
    for (int i = 0; i < 170; i++){
      vec2 h = mapBust(ro + rd*t);
      if (h.x < 0.00025*t){ m = h.y; break; }
      t += h.x*0.72;
      if (t > ts.y) break;
    }
    if (m > 0.5){
      vec3 p = ro + rd*t;
      vec3 n = calcNormal(p);
      mapBust(p);
      vec3 q = gTex;
      float occ = calcAO(p, n);
      if (m < 1.5 || m > 2.5) n = bumpN(n, q);
      vec3 alb = stone(q, occ, m);
      float dif = clamp(dot(n, L), 0.0, 1.0);
      float sh = dif > 0.001 ? softShadow(p + n*0.0015, L) : 0.0;
      float fre = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 2.5);
      float sky = 0.55 + 0.45*n.y;
      vec3 lin = vec3(1.0, 0.9, 0.76)*2.2*dif*sh;
      lin += vec3(0.58, 0.64, 0.72)*0.7*sky*occ;
      lin += vec3(0.55, 0.48, 0.4)*0.25*clamp(-n.y, 0.0, 1.0)*occ;
      lin += vec3(0.95, 0.92, 0.86)*0.55*fre*occ;
      col = alb*lin;
      vec3 hv = normalize(L - rd);
      col += 0.05*pow(clamp(dot(n, hv), 0.0, 1.0), 16.0)*dif*sh;
    }
  }

  col *= uExpo;
  col = (col*(2.51*col + 0.03))/(col*(2.43*col + 0.59) + 0.14);
  col = pow(clamp(col, 0.0, 1.0), vec3(0.4545));
  col = mix(col, col*col*(3.0 - 2.0*col), 0.35);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 0.78);
  col = mix(col*vec3(0.94, 0.98, 1.03), col*vec3(1.03, 1.0, 0.95), smoothstep(0.2, 0.8, lum));
  col *= 0.55 + 0.45*pow(16.0*suv.x*suv.y*(1.0 - suv.x)*(1.0 - suv.y), 0.18);
  col += (hash3(vec3(gl_FragCoord.xy, floor(uTime*24.0))) - 0.5)*0.03;
  gl_FragColor = vec4(col, 1.0);
}
`;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('Shader: ' + log);
    }
    return sh;
  }
  function program(gl, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(p));
    return p;
  }

  const NAMES = ['uRes', 'uTime', 'uLight', 'uHead', 'uYaw', 'uShift', 'uA', 'uB', 'uTint', 'uCamPos', 'uCamTgt', 'uFocal', 'uExpo', 'uCut', 'uBgRot', 'uBg', 'uTex', 'uDir'];

  // Параметры бюста: каждый мыслитель — набор чисел, которые лепят лицо
  const DEFAULT_BUST = { beardLen: 0.42, beardOn: 1, hairVol: 1, bald: 0, curl: 1, age: 0.3, full: 0.3, drape: 1, tint: [0.4, 0.385, 0.36] };
  const BUST_KEYS = ['beardLen', 'beardOn', 'hairVol', 'bald', 'curl', 'age', 'full', 'drape'];

  function lerpBust(a, b, t) {
    const o = {};
    for (const k of BUST_KEYS) o[k] = a[k] + (b[k] - a[k]) * t;
    o.tint = a.tint.map((v, i) => v + (b.tint[i] - v) * t);
    return o;
  }

  class StoaRenderer {
    constructor(canvas, opts) {
      opts = opts || {};
      this.canvas = canvas;
      this.bgScale = opts.bgScale || 3;
      const gl = canvas.getContext('webgl', {
        antialias: false, alpha: false, depth: false, stencil: false,
        preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance'
      });
      if (!gl) throw new Error('WebGL недоступен');
      this.gl = gl;
      this.progs = { bg: program(gl, BG), blur: program(gl, BLUR), bust: program(gl, BUST) };
      this.u = {};
      for (const k in this.progs) {
        this.u[k] = {};
        for (const n of NAMES) this.u[k][n] = gl.getUniformLocation(this.progs[k], n);
      }
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.targets = [this._target(), this._target()];
      this.bw = 0; this.bh = 0;
    }

    _target() {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fb };
    }

    resize(w, h) {
      w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w; this.canvas.height = h;
      }
      const bw = Math.max(2, Math.round(w / this.bgScale)), bh = Math.max(2, Math.round(h / this.bgScale));
      if (bw !== this.bw || bh !== this.bh) {
        const gl = this.gl;
        for (const t of this.targets) {
          gl.bindTexture(gl.TEXTURE_2D, t.tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, bw, bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }
        this.bw = bw; this.bh = bh;
      }
    }

    _common(u, s, w, h) {
      const gl = this.gl, b = s.bust || DEFAULT_BUST;
      gl.uniform2f(u.uRes, w, h);
      gl.uniform1f(u.uTime, s.time || 0);
      gl.uniform3fv(u.uLight, s.light || [-0.6, 0.65, 0.5]);
      gl.uniform2fv(u.uHead, s.head || [0, 0]);
      gl.uniform1f(u.uYaw, s.yaw || 0);
      gl.uniform1f(u.uShift, s.shift || 0);
      gl.uniform4f(u.uA, b.beardLen, b.beardOn, b.hairVol, b.bald);
      gl.uniform4f(u.uB, b.curl, b.age, b.full, b.drape);
      gl.uniform3fv(u.uTint, b.tint);
      gl.uniform3fv(u.uCamPos, s.camPos || [0, 2.2, 2.0]);
      gl.uniform3fv(u.uCamTgt, s.camTgt || [0, 2.05, 0]);
      gl.uniform1f(u.uFocal, s.focal || 2.1);
      gl.uniform1f(u.uExpo, s.expo == null ? 0.62 : s.expo);
      gl.uniform1f(u.uCut, s.cut ? 1 : 0);
      gl.uniform1f(u.uBgRot, s.bgRot || 0);
    }

    draw(s) {
      const gl = this.gl, W = this.canvas.width, H = this.canvas.height;
      const A = this.targets[0], B = this.targets[1];
      gl.bindFramebuffer(gl.FRAMEBUFFER, A.fb);
      gl.viewport(0, 0, this.bw, this.bh);
      gl.useProgram(this.progs.bg);
      this._common(this.u.bg, s, this.bw, this.bh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.useProgram(this.progs.blur);
      const ub = this.u.blur;
      gl.uniform2f(ub.uRes, this.bw, this.bh);
      gl.uniform1i(ub.uTex, 0);
      gl.activeTexture(gl.TEXTURE0);
      const spread = s.blur == null ? 1.4 : s.blur;
      for (let k = 1; k <= 2; k++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, B.fb);
        gl.bindTexture(gl.TEXTURE_2D, A.tex);
        gl.uniform2f(ub.uDir, spread * k, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, A.fb);
        gl.bindTexture(gl.TEXTURE_2D, B.tex);
        gl.uniform2f(ub.uDir, 0, spread * k);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(this.progs.bust);
      this._common(this.u.bust, s, W, H);
      gl.bindTexture(gl.TEXTURE_2D, A.tex);
      gl.uniform1i(this.u.bust.uBg, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  window.StoaGL = { StoaRenderer, lerpBust, DEFAULT_BUST };
})();
