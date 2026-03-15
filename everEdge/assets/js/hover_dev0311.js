const containers = document.querySelectorAll('.container');

containers.forEach((container) => {
  const sliceNum = container.classList.contains('-minute-slice') ? 28 : 18; // スライス数（ピクセル単位での幅は、リサイズ時に計算）

  // --- 1. Basic Three.js Setup ---
  const scene = new THREE.Scene();

  // 固定正射影カメラ（-1〜1の正規化座標でcanvasを常に覆う）
  // アスペクト比の補正はシェーダー側のcover計算で行う
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  container.appendChild(renderer.domElement);

  // --- 2. Texture Loading ---
  const textureUrl = container.querySelector('img').src;

  const texture = new THREE.TextureLoader().load(
    textureUrl,
    (t) => {
      uniforms.uTexture.value = t;

      // 画像の実サイズをuniformに反映（object-fit: cover計算に使用）
      uniforms.uImageResolution.value.set(t.image.width, t.image.height);

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
  const geometry = new THREE.PlaneGeometry(2, 2, 100, 100); // カメラ座標（-1〜1）にぴったり合わせた2×2サイズ

  const slideWidth = container.clientWidth / sliceNum; // スライス幅（ピクセル単位）

  const uniforms = {
    uTexture: { value: null },
    uContainerResolution: { value: new THREE.Vector2(container.clientWidth, container.clientHeight) },
    uImageResolution: { value: new THREE.Vector2(1, 1) },
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
      uniform vec2 uMouse;
      uniform vec2 uContainerResolution;
      uniform vec2 uImageResolution;
      uniform float uSliceWidth;

      void main() {
        float mousePresence = clamp((uMouse.x + 1.0) * 0.5, 0.0, 1.0);
        
        // --- x軸のcover補正のみ ---
        float screenAspect = uContainerResolution.x / uContainerResolution.y;
        float imageAspect = uImageResolution.x / uImageResolution.y;
        float r = screenAspect / imageAspect;
        // r >= 1: コンテナが横長 → x全体を表示、yをトリミング
        // r <  1: コンテナが縦長 → y全体を表示、xをトリミング
        float scaleU = r < 1.0 ? r : 1.0;       // x UV圧縮率
        float scaleV = r >= 1.0 ? 1.0 / r : 1.0; // y UV圧縮率

        // y方向のcover補正
        float coverV = (vUv.y - 0.5) * scaleV + 0.5;
        
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
        float sliceCenterU = (sliceCenterScreen - 0.5) * scaleU + 0.5;

        // 歪みオフセット: 中央から離れるほど外側にずらす
        float offsetSign = -0.5;
        float offset = offsetSign * distortionStrength * normalized;

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

        // mousePresenceで通常UV（cover補正済み）と歪みUVをmix
        float coverU = (vUv.x - 0.5) * scaleU + 0.5;
        float finalU = mix(coverU, distortedU, mousePresence);

        // y方向はcover補正のみ（distortionなし）
        vec2 finalUv = vec2(finalU, coverV);

        // 範囲外をクランプ
        finalUv = clamp(finalUv, 0.0, 1.0);

        // --- サンプリング ---
        vec4 color = texture2D(uTexture, finalUv);

        gl_FragColor = color;
      }
    `,
    transparent: true,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // --- 5. Animation Loop ---
  function animate() {
    requestAnimationFrame(animate);

    mouse.x += (targetMouse.x - mouse.x) * 0.3;

    renderer.render(scene, camera);
  }

  animate();

  // --- 6. Resize Handling ---
  function resizeToContainer() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;

    // 固定カメラのため射影行列の更新不要（cover補正はシェーダーが担う）

    // デバイスピクセル比を考慮してレンダラーサイズを調整
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    if (window.devicePixelRatio === 2) {
      uniforms.uContainerResolution.value.set(width * 2, height * 2);
      uniforms.uSliceWidth.value = slideWidth * 2; // デバイスピクセル比が2の場合はスライス幅も倍にする
    } else {
      uniforms.uContainerResolution.value.set(width, height);
      uniforms.uSliceWidth.value = slideWidth; // デバイスピクセル比が1の場合はスライス幅を元に戻す
    }

    uniforms.uSliceWidth.value = width / sliceNum; // スライス幅をリサイズに応じて再計算

    renderer.setSize(width, height, false);
    renderer.render(scene, camera);
  }

  resizeToContainer();

  window.addEventListener('resize', resizeToContainer);

  const resizeObserver = new ResizeObserver(resizeToContainer);

  resizeObserver.observe(container);
});