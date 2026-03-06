const container = document.getElementById('container');

// --- 1. Basic Three.js Setup ---
const scene = new THREE.Scene();

// const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1000);
// camera.position.z = 2;

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
const textureUrl = '/everEdge/assets/image/sample04.jpg'; // テクスチャ画像
const texture = new THREE.TextureLoader().load(
  textureUrl,
  (t) => {
    // 画像のアスペクト比
    // const aspect = t.image.width / t.image.height;

    // アスペクト比に合わせて平面をスケーリング
    mesh.scale.set(aspect, 1, 1); // 後の、meshオブジェクトから参照
  }
);
// テクスチャを繰り返さない設定に
texture.wrapS = THREE.ClampToEdgeWrapping;
texture.wrapT = THREE.ClampToEdgeWrapping;

// --- 3. ShaderMaterial Creation ---
// ジオメトリのセグメント数を多めにして、歪みを滑らかに
const geometry = new THREE.PlaneGeometry(2.5, 2.5, 100, 100);

const uniforms = {
  uTexture: { value: texture },
  uResolution: { value: new THREE.Vector2(container.clientWidth, container.clientHeight) }, // コンテナの解像度
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
    uniform vec2 uResolution;
    uniform vec2 uImageResolution;

    void main() {      
      // --- 1. cover補正 ---
      float screenAspect = uResolution.x / uResolution.y;
      float imageAspect = uImageResolution.x / uImageResolution.y;
          
      vec2 scale = vec2(
        max(screenAspect / imageAspect, 1.0),
        max(imageAspect / screenAspect, 1.0)
      );

      vec2 correctedUv = vec2(
        (vUv.x - 0.5) / scale.x + 0.5,
        (vUv.y - 0.5) / scale.y + 0.5
      );
          
      // --- 2. スライス計算 ---
      float numSlices = 61.0;
      float sliceId = floor(correctedUv.x * numSlices);
      float center = (numSlices - 1.0) / 2.0;
      float distFromCenter = sliceId - center;

      // --- 3. 線形オフセット係数 ---
      float k = 0.5 * -0.03 / scale.x;

      // --- 4. 物理的に正しいUV変換 ---
      // 中央基準に変換
      float u = correctedUv.x - 0.5;

      // 線形オフセット
      float uDistorted = u + k * distFromCenter;

      // スケール補正（微分値を1にする）
      float uCorrected = uDistorted / (0.33 + k);

      // 元の座標へ戻す
      float finalU = uCorrected + 0.5;

      vec2 finalUv = vec2(finalU, correctedUv.y);

      // --- 5. サンプリング ---
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
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

animate();

// --- 6. Resize Handling ---
function resizeToContainer() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return;

  camera.aspect = width / height;
  uniforms.uResolution.value.set(width, height);
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