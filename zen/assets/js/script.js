(() => {
  const container = document.getElementById('container');

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  // Invisible force points (xy = position, z = strength/radius)
  const fieldPoints = [
    new THREE.Vector3(-0.55, -0.18, 0.085),
    new THREE.Vector3(-0.18,  0.32, 0.055),
    new THREE.Vector3( 0.05, -0.35, 0.070),
    new THREE.Vector3( 0.38,  0.12, 0.045),
    new THREE.Vector3( 0.62, -0.28, 0.060),
  ];

  // ---- fluid simulation render targets (ping-pong) ------------------------
  // RG = velocity, B = dye (disturbance), A = unused
  const simScale = 0.5;
  function makeRT(w, h) {
    return new THREE.WebGLRenderTarget(
      Math.max(2, Math.floor(w * simScale)),
      Math.max(2, Math.floor(h * simScale)),
      {
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer: false,
        stencilBuffer: false,
      }
    );
  }
  let rtA = makeRT(container.clientWidth, container.clientHeight);
  let rtB = makeRT(container.clientWidth, container.clientHeight);
  renderer.setRenderTarget(rtA); renderer.clear();
  renderer.setRenderTarget(rtB); renderer.clear();
  renderer.setRenderTarget(null);

  const vertexShader = /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
  `;

  // ---- sim shader: advection + diffusion + mouse impulse ------------------
  const simUniforms = {
    uPrev:        { value: null },
    uTexel:       { value: new THREE.Vector2() },
    uDt:          { value: 1 / 60 },
    uMousePrev:   { value: new THREE.Vector2(0, 0) },
    uMouseCurr:   { value: new THREE.Vector2(0, 0) },
    uMouseVel:    { value: new THREE.Vector2(0, 0) },
    uMouseActive: { value: 0 },
    uAspect:      { value: 1 },
  };

  const simFragment = /* glsl */`
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uPrev;
    uniform vec2  uTexel;
    uniform float uDt;
    uniform vec2  uMousePrev;
    uniform vec2  uMouseCurr;
    uniform vec2  uMouseVel;
    uniform float uMouseActive;
    uniform float uAspect;

    float segDist(vec2 p, vec2 a, vec2 b) {
      vec2 pa = p - a;
      vec2 ba = b - a;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
      return length(pa - ba * h);
    }

    void main() {
      // --- semi-Lagrangian advection: sample upstream ---
      vec4 here = texture2D(uPrev, vUv);
      vec2 coord = vUv - here.xy * uDt * 0.9;
      vec4 adv = texture2D(uPrev, coord);
      vec2 vel = adv.xy;
      float dye = adv.z;

      // --- light diffusion (neighbor averaging) ---
      vec4 n  = texture2D(uPrev, vUv + vec2( 0.0,  uTexel.y));
      vec4 s  = texture2D(uPrev, vUv + vec2( 0.0, -uTexel.y));
      vec4 e  = texture2D(uPrev, vUv + vec2( uTexel.x, 0.0));
      vec4 w  = texture2D(uPrev, vUv + vec2(-uTexel.x, 0.0));
      vec2 avgVel = (n.xy + s.xy + e.xy + w.xy) * 0.25;
      float avgDye = (n.z + s.z + e.z + w.z) * 0.25;
      vel = mix(vel, avgVel, 0.10);
      dye = mix(dye, avgDye, 0.06);

      // --- mouse impulse distributed along the segment of last motion ---
      vec2 p = (vUv - 0.5);
      p.x *= uAspect;
      float d = segDist(p, uMousePrev, uMouseCurr);
      float radius = 0.06;
      float infl = exp(-(d * d) / (radius * radius)) * uMouseActive;
      vel += uMouseVel * infl * 0.9;
      dye += infl * 1.1;

      // --- decay (so waves dissipate like real water) ---
      vel *= 0.985;
      dye *= 0.992;

      gl_FragColor = vec4(vel, dye, 1.0);
    }
  `;

  const simMaterial = new THREE.ShaderMaterial({
    vertexShader, fragmentShader: simFragment, uniforms: simUniforms,
  });
  const simScene = new THREE.Scene();
  simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMaterial));

  // ---- display shader: color-only visualization --------------------------
  const uniforms = {
    uTime:       { value: 0.0 },
    uResolution: { value: new THREE.Vector2(container.clientWidth, container.clientHeight) },
    uPoints:     { value: fieldPoints },
    uPointCount: { value: fieldPoints.length },
    uDeep:       { value: new THREE.Color('#51ccb1') },
    uMid:        { value: new THREE.Color('#8fb1d6') },
    uLight:      { value: new THREE.Color('#dde9f7') },
    uHighlight:  { value: new THREE.Color('#f4f8fd') },
    uSim:        { value: null },
  };

  const displayFragment = /* glsl */`
    precision highp float;
    varying vec2 vUv;
    uniform float uTime;
    uniform vec2  uResolution;
    uniform vec3  uPoints[5];
    uniform int   uPointCount;
    uniform vec3  uDeep;
    uniform vec3  uMid;
    uniform vec3  uLight;
    uniform vec3  uHighlight;
    uniform sampler2D uSim;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
      for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = rot * p * 2.03;
        a *= 0.5;
      }
      return v;
    }

    // ambient swells from invisible field points (slow, very soft)
    float swells(vec2 p, float t) {
      float h = 0.0;
      for (int i = 0; i < 5; i++) {
        if (i >= uPointCount) break;
        vec3 r = uPoints[i];
        vec2 q = p - r.xy;
        q.x *= 1.1; q.y *= 0.85;
        float dist = length(q);
        float phase = dist * 14.0 - t * 0.35 - float(i) * 1.7;
        float falloff = smoothstep(0.0, 0.9, 1.0 - dist * 1.1);
        h += sin(phase) * falloff * 0.4;
      }
      return h;
    }

    void main() {
      vec2 uv = vUv - 0.5;
      uv.x *= uResolution.x / uResolution.y;
      float t = uTime;

      // Fluid simulation state at this pixel
      vec4 sim = texture2D(uSim, vUv);
      vec2 fluidVel = sim.xy;
      float dye = sim.z;

      // Background sample coord is warped by the fluid so the whole field
      // drifts with the current, like a photograph of water
      vec2 p = uv + fluidVel * 0.25;
      float ambient = fbm(p * 1.3 + vec2(t * 0.04, -t * 0.025));
      float ripple  = swells(p, t);
      float base    = ambient * 0.6 + ripple * 0.3;

      // Drive a smooth scalar for color — no contour lines
      float g = smoothstep(-0.15, 0.95, base + dye * 0.9);
      vec3 color = mix(uDeep, uMid, g);
      color = mix(color, uLight, smoothstep(0.55, 1.0, g));

      // Speed lights up the surface like a sheen / foam
      float speed = length(fluidVel);
      float sheen = smoothstep(0.05, 0.55, speed) + dye * 0.35;
      color = mix(color, uHighlight, clamp(sheen, 0.0, 0.75));

      // Tiny directional tint from flow direction
      float dir = (fluidVel.x - fluidVel.y) * 1.2;
      color += vec3(-0.025, 0.0, 0.035) * dir;

      // Vignette
      float vig = smoothstep(1.15, 0.2, length(uv));
      color *= mix(0.84, 1.0, vig);

      // Cool pastel bias
      color = mix(color, color * vec3(0.92, 0.99, 1.08), 0.35);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader: displayFragment, uniforms,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  // ---- interaction --------------------------------------------------------
  const mousePrev = new THREE.Vector2(0, 0);
  const mouseCurr = new THREE.Vector2(0, 0);
  let mouseInside = 0;
  let lastMoveTime = 0;

  function setMouseFromEvent(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const aspect = rect.width / rect.height;
    mouseCurr.set((x - 0.5) * aspect, -(y - 0.5));
    mouseInside = 1;
    lastMoveTime = performance.now();
  }
  renderer.domElement.addEventListener('pointermove', setMouseFromEvent);
  renderer.domElement.addEventListener('pointerleave', () => { mouseInside = 0; });
  renderer.domElement.addEventListener('pointerdown', setMouseFromEvent);

  // ---- resize -------------------------------------------------------------
  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    uniforms.uResolution.value.set(w, h);
    rtA.dispose(); rtB.dispose();
    rtA = makeRT(w, h);
    rtB = makeRT(w, h);
    renderer.setRenderTarget(rtA); renderer.clear();
    renderer.setRenderTarget(rtB); renderer.clear();
    renderer.setRenderTarget(null);
  }
  window.addEventListener('resize', onResize);

  // ---- loop ---------------------------------------------------------------
  const clock = new THREE.Clock();

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    uniforms.uTime.value += dt;

    // Impulse is only injected while the pointer is actually moving
    const stopped = (performance.now() - lastMoveTime) > 70;
    const active = (stopped || !mouseInside) ? 0 : 1;

    const mvx = mouseCurr.x - mousePrev.x;
    const mvy = mouseCurr.y - mousePrev.y;

    simUniforms.uPrev.value = rtA.texture;
    simUniforms.uTexel.value.set(1 / rtA.width, 1 / rtA.height);
    simUniforms.uDt.value = dt;
    simUniforms.uMousePrev.value.copy(mousePrev);
    simUniforms.uMouseCurr.value.copy(mouseCurr);
    simUniforms.uMouseVel.value.set(mvx, mvy);
    simUniforms.uMouseActive.value = active;
    simUniforms.uAspect.value = container.clientWidth / container.clientHeight;

    renderer.setRenderTarget(rtB);
    renderer.render(simScene, camera);
    renderer.setRenderTarget(null);

    // ping-pong swap
    const tmp = rtA; rtA = rtB; rtB = tmp;

    uniforms.uSim.value = rtA.texture;
    renderer.render(scene, camera);

    mousePrev.copy(mouseCurr);
    requestAnimationFrame(tick);
  }
  tick();
})();
