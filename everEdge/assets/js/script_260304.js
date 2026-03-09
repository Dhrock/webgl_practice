const container = document.getElementById('container');

// --- 1. Basic Three.js Setup ---
const scene = new THREE.Scene();

const frustumSize = 2.5;
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
const textureUrl = container.querySelector('img').src; // テクスチャ画像
const texture = new THREE.TextureLoader().load(
  textureUrl,
  (t) => {
    // アスペクト比に合わせて平面をスケーリング
    mesh.scale.set(aspect, 1, 1); // 後の、meshオブジェクトから参照
  }
);
// テクスチャを繰り返さない設定に
texture.wrapS = THREE.ClampToEdgeWrapping;
texture.wrapT = THREE.ClampToEdgeWrapping;

// --- 3. ShaderMaterial Creation ---
// ジオメトリのセグメント数を多めにして、歪みを滑らかに
const geometry = new THREE.PlaneGeometry(2.5, 2.5, 200, 200);

const uniforms = {
  uTexture: { value: texture },
  uContainerResolution: { value: new THREE.Vector2(container.clientWidth, container.clientHeight) }, // コンテナの解像度
  uImageResolution: { value: new THREE.Vector2(1, 1) } // 画像解像度（ロード後に更新）
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
    uniform vec2 uContainerResolution;
    uniform vec2 uImageResolution;

    void main() {      
      // --- 1. cover補正 ---
      float screenAspect = uContainerResolution.x / uContainerResolution.y;
      float imageAspect = uImageResolution.x / uImageResolution.y;

      float ratio = screenAspect / imageAspect;

      // object-fit: cover と同じ挙動
      // ratio >= 1.0: 画面が横長 → X方向に拡大してクロップ
      // ratio <  1.0: 画像が横長 → Y方向に拡大してクロップ
      vec2 scale = vec2(
        ratio >= 1.0 ? ratio : 1.0,
        ratio <  1.0 ? 1.0 / ratio : 1.0
      );
      
      // ---------- screen slices ----------

      float sliceWidth = 20.0;
      float totalSlices = floor(uContainerResolution.x / sliceWidth);

      float sliceId = floor(gl_FragCoord.x / sliceWidth);

      // スライス内のローカル座標 (0.0 ~ 1.0)
      float localX = fract(gl_FragCoord.x / sliceWidth);

      float centerSlice = (totalSlices - 1.0) * 0.5;

      float distFromCenter = sliceId - centerSlice;

      // -1 ~ +1 に正規化
      float normalized = distFromCenter / centerSlice;

      // ---------- スライスのUV範囲を計算 ----------

      // distortion: 中央から離れるほど、スライスが参照するテクスチャ位置を外側にずらす
      // これにより画像の端が引き伸ばされる効果
      float distortionStrength = 0.1;

      // スライスの中心が参照すべきテクスチャU座標
      // スライス中心のscreen位置から算出
      float sliceCenterScreen = (sliceId + 0.5) * sliceWidth / uContainerResolution.x; // 0~1

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
      float localShiftScale = 5.0; // 大きくするほどスライス内のずれが強くなる
      float localOffset = (localX - 0.5) * (sliceWidth / uContainerResolution.x) * compression * localShiftScale;

      // ---------- final uv ----------
      float finalU = sliceCenterU + offset + localOffset;

      vec2 finalUv = vec2(finalU, vUv.y);

      // 範囲外をクランプ
      finalUv = clamp(finalUv, 0.0, 1.0);

      // --- サンプリング ---
      vec4 color = texture2D(uTexture, finalUv);
      // vec4 color = texture2D(uTexture, vUv);
      // vec4 color = texture2D(uTexture, correctedUv);

      gl_FragColor = color;
    }
  `,
  transparent: true,
  side: THREE.DoubleSide
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// --- 5. Animation Loop ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

animate();

// --- 6. 画面リサイズのハンドラー ---
function resizeToContainer() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return;

  camera.aspect = width / height;
  uniforms.uContainerResolution.value.set(width, height);
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  if(window.devicePixelRatio === 2) {
    renderer.setSize(width / 2, height / 2, false);
  } else {
    renderer.setSize(width, height, false);
  }

  renderer.render(scene, camera);
}

resizeToContainer();

window.addEventListener('resize', resizeToContainer);
const resizeObserver = new ResizeObserver(resizeToContainer);
resizeObserver.observe(container);