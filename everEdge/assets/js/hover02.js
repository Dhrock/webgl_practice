const containers = document.querySelectorAll('.container');

containers.forEach((container) => {
  // --- 1. Basic Three.js Setup ---
  const scene = new THREE.Scene();

  const frustumSize = 2.49;
  const aspect = container.clientWidth / container.clientHeight;
  const camera = new THREE.OrthographicCamera(
    -frustumSize * aspect / 2, frustumSize * aspect / 2,
    frustumSize / 2, -frustumSize / 2,
    0.1, 1000
  );
  camera.position.z = 2;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  container.appendChild(renderer.domElement);

  // --- 2. Texture Loading ---
  const textureUrl = container.querySelector('img').src;

  const texture = new THREE.TextureLoader().load(
    textureUrl,
    (t) => {
      mesh.scale.set(aspect, 1, 1);
      uniforms.uTexture.value = t;

      // ミップマップ + アニソトロピックフィルタリングで解像度を維持
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      // アニソトロピックフィルタリング（斜め方向の解像度を改善）
      const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
      t.anisotropy = maxAnisotropy;
      t.needsUpdate = true;
    }
  );
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  // --- 3. Mouse Interaction Setup ---
  const mouse = new THREE.Vector2(-1, 0);
  const targetMouse = new THREE.Vector2(-1, 0);
  
  container.addEventListener('mouseenter', () => {
    targetMouse.set(1, 0);
  });

  container.addEventListener('mouseleave', () => {
    targetMouse.set(-1, 0);
  });

  // --- 4. ShaderMaterial Creation ---
  const geometry = new THREE.PlaneGeometry(2.5, 2.5, 100, 100);

  const slideWidth = 35.0; // スライス幅（ピクセル単位）

  const uniforms = {
    uTexture: { value: null },
    uContainerResolution: { value: new THREE.Vector2(container.clientWidth, container.clientHeight) },
    uImageResolution: { value: new THREE.Vector2(1, 1) },
    // uTime: { value: 0.0 },
    uMouse: { value: mouse },
    uSliceWidth: { value: slideWidth }
  };

  const material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 pos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D uTexture;
      // uniform float uTime;
      uniform vec2 uMouse;
      uniform vec2 uContainerResolution;
      uniform vec2 uImageResolution;
      uniform float uSliceWidth;

      void main() {
        float mousePresence = smoothstep(-1.0, 1.0, uMouse.x);
        
        // --- 1. cover補正 ---
        float screenAspect = uContainerResolution.x / uContainerResolution.y;
        float imageAspect = uImageResolution.x / uImageResolution.y;

        float ratio = screenAspect / imageAspect;

        vec2 scale = vec2(
          ratio >= 1.0 ? ratio : 1.0,
          ratio <  1.0 ? 1.0 / ratio : 1.0
        );
        
        // ---------- screen slices ----------

        float sliceWidth = uSliceWidth;
        float totalSlices = floor(uContainerResolution.x / sliceWidth);

        float sliceId = floor(gl_FragCoord.x / sliceWidth);

        float localX = fract(gl_FragCoord.x / sliceWidth);

        float centerSlice = (totalSlices - 1.0) * 0.5;

        float distFromCenter = sliceId - centerSlice;

        float normalized = distFromCenter / centerSlice;

        // ---------- スライスのUV範囲を計算 ----------

        float distortionStrength = 0.1;

        float sliceCenterScreen = (sliceId + 0.5) * sliceWidth / uContainerResolution.x;

        // cover補正を適用
        float sliceCenterU = (sliceCenterScreen - 0.5) / scale.x + 0.5;

        // 歪みオフセット: 中央から離れるほど外側にずらす（正の方向）
        float offset = distortionStrength * normalized;

        // ---------- compression ----------
        // 中央スライス以外は一定の圧縮率を適用
        float compressionStrength = 0.5;
        float isNotCenter = step(0.001, abs(normalized));
        float compression = 1.0 - isNotCenter * compressionStrength;

        // スライス内のローカル座標を-0.5~+0.5に変換し、圧縮を適用
        // (localX - 0.5)を、0.0 ~ 1.0に可変すると、スライドが左・中心・右に切り替わる
        float localShiftScale = 5.0; // 大きくするほどスライス内のずれが強くなる
        float localOffset = (localX - 0.5) * (sliceWidth / uContainerResolution.x) * compression * localShiftScale;

        // ---------- final uv ----------
        float distortedU = sliceCenterU + offset + localOffset;

        // mousePresenceで通常UVと歪みUVをmix
        float finalU = mix(vUv.x, distortedU, mousePresence);

        vec2 finalUv = vec2(finalU, vUv.y);

        // 範囲外をクランプ
        finalUv = clamp(finalUv, 0.0, 1.0);

        // --- サンプリング ---
        vec4 color = texture2D(uTexture, finalUv);
        // vec4 color = texture2D(uTexture, vUv);

        gl_FragColor = color;
      }
    `,
    transparent: true,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // --- 5. Animation Loop ---
  // const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    // uniforms.uTime.value = clock.getElapsedTime();

    mouse.x += (targetMouse.x - mouse.x) * 0.06;
    mouse.y += (targetMouse.y - mouse.y) * 0.06;

    renderer.render(scene, camera);
  }

  animate();

  // --- 6. Resize Handling ---
  function resizeToContainer() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;

    const newAspect = width / height;
    camera.left   = -frustumSize * newAspect / 2;
    camera.right  =  frustumSize * newAspect / 2;
    camera.top    =  frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.updateProjectionMatrix();

    // デバイスピクセル比を考慮してレンダラーサイズを調整
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    if (window.devicePixelRatio === 2) {
      uniforms.uContainerResolution.value.set(width * 2, height * 2);
      uniforms.uSliceWidth.value = slideWidth * 2; // デバイスピクセル比が2の場合はスライス幅も倍にする
    } else {
      uniforms.uContainerResolution.value.set(width, height);
      uniforms.uSliceWidth.value = slideWidth; // デバイスピクセル比が1の場合はスライス幅を元に戻す
    }

    renderer.setSize(width, height, false);
    renderer.render(scene, camera);
  }

  resizeToContainer();

  window.addEventListener('resize', resizeToContainer);

  const resizeObserver = new ResizeObserver(resizeToContainer);

  resizeObserver.observe(container);
});