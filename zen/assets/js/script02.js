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

  const vertexShader = /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
  `;

  const uniforms = {
    uTime:       { value: 0.0 },
    uResolution: { value: new THREE.Vector2(container.clientWidth, container.clientHeight) },
    uPoints:     { value: fieldPoints },
    uPointCount: { value: fieldPoints.length },
    uDeep:       { value: new THREE.Color('#3d5a85') },
    uMid:        { value: new THREE.Color('#8fb1d6') },
    uLight:      { value: new THREE.Color('#dde9f7') },
    uHighlight:  { value: new THREE.Color('#f4f8fd') },
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

      float ambient = fbm(uv * 1.3 + vec2(t * 0.04, -t * 0.025));
      float swell   = swells(uv, t);
      float base    = ambient * 0.6 + swell * 0.3;

      float g = smoothstep(-0.15, 0.95, base);
      vec3 color = mix(uDeep, uMid, g);
      color = mix(color, uLight, smoothstep(0.55, 1.0, g));

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

  // ---- resize -------------------------------------------------------------
  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    uniforms.uResolution.value.set(w, h);
  }
  window.addEventListener('resize', onResize);

  // ---- loop ---------------------------------------------------------------
  const clock = new THREE.Clock();

  function tick() {
    uniforms.uTime.value += Math.min(clock.getDelta(), 0.05);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
})();
