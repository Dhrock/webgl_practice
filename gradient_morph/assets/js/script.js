(() => {
  const container = document.getElementById('container');

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const uniforms = {
    uTime:       { value: 0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uColor0:     { value: new THREE.Color('#1EAEA5') }, // teal
    uColor1:     { value: new THREE.Color('#1B6EB3') }, // deep blue
    uColor2:     { value: new THREE.Color('#F2C9BE') }, // soft pink
    uColor3:     { value: new THREE.Color('#FCE9DC') }, // cream
    uAccent:     { value: new THREE.Color('#FFEFE4') }, // highlight pink/white
    uGrain:      { value: 0.045 },
    uSpeed:      { value: 0.09 },
  };

  const vertexShader = /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;

  const fragmentShader = /* glsl */`
    precision highp float;

    varying vec2 vUv;
    uniform vec2  uResolution;
    uniform float uTime;
    uniform vec3  uColor0;
    uniform vec3  uColor1;
    uniform vec3  uColor2;
    uniform vec3  uColor3;
    uniform vec3  uAccent;
    uniform float uGrain;
    uniform float uSpeed;

    // --- simplex noise 2D (Ashima / Ian McEwan) ---
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                         -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                              + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m; m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.55;
      vec2 shift = vec2(100.0);
      mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
      for (int i = 0; i < 3; i++) {
        v += a * snoise(p);
        p = rot * p * 2.0 + shift;
        a *= 0.5;
      }
      return v;
    }

    // 4色パレットを t (0..1) で補間
    vec3 palette(float t) {
      t = clamp(t, 0.0, 1.0);
      vec3 c;
      if (t < 0.45) {
        c = mix(uColor0, uColor1, smoothstep(0.0, 0.45, t));
      } else if (t < 0.78) {
        c = mix(uColor1, uColor2, smoothstep(0.45, 0.78, t));
      } else {
        c = mix(uColor2, uColor3, smoothstep(0.78, 1.0, t));
      }
      return c;
    }

    // film grain
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 uv = vUv;
      // アスペクト補正した座標 (ノイズが縦横で潰れないように)
      float aspect = uResolution.x / uResolution.y;
      vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

      float t = uTime * uSpeed;

      // 緩い domain warping (大きく柔らかいうねり)
      vec2 q = vec2(
        fbm(p * 0.9 + vec2(0.0, 0.0) + t * 0.45),
        fbm(p * 0.9 + vec2(5.2, 1.3) + t * 0.4)
      );
      vec2 r = vec2(
        fbm(p * 1.0 + 0.9 * q + vec2(1.7, 9.2) + t * 0.35),
        fbm(p * 1.0 + 0.9 * q + vec2(8.3, 2.8) + t * 0.3)
      );

      // 縦方向のグラデを r で緩く歪ませる → 波打つ横帯を作る
      // reference: 上=teal, 中=blue, 下=pink/cream
      float y = 1.0 - uv.y + r.y * 0.28 + q.x * 0.08;
      y = clamp(y, 0.0, 1.0);

      vec3 col = palette(y);

      // 中央帯にソフトなハイライトブロブ (低頻度 / 大きく柔らかく)
      float blob = smoothstep(0.55, 1.0, fbm(p * 0.8 + r * 0.4 + t * 0.3) * 0.5 + 0.5);
      col = mix(col, uAccent, blob * 0.18);

      // フィルムグレイン (軽く)
      float g = hash(gl_FragCoord.xy + uTime * 37.0) - 0.5;
      col += g * uGrain;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(mesh);

  const clock = new THREE.Clock();

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    uniforms.uResolution.value.set(w, h);
  }
  window.addEventListener('resize', onResize);

  function tick() {
    uniforms.uTime.value = clock.getElapsedTime();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
})();
