// --- 1. Basic Three.js Setup ---
const scene = new THREE.Scene();
const container = document.getElementById('container');

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
// 添付画像のURL（もし読み込めない場合は、適当な画像URLに変更してください）
const textureUrl = 'image/sample04.jpg'; // テクスチャ画像
const texture = new THREE.TextureLoader().load(
  textureUrl,
  (t) => {
    // 画像解像度をuniformに設定
    uniforms.uImageResolution.value.set(t.image.width, t.image.height);
    const aspect_img = t.image.width / t.image.height;
    mesh.scale.set(aspect_img, 1, 1);
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
  // uTime: { value: 0.0 }
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
    uniform vec2 uResolution;      // コンテナサイズ
    uniform vec2 uImageResolution; // 画像サイズ

    void main() {      
      // --- 1. アスペクト比補正 (Object-fit: cover) ---
      float screenAspect = uResolution.x / uResolution.y;
      float imageAspect = uImageResolution.x / uImageResolution.y;
      
      // coverの場合: 短い辺に合わせてスケール → はみ出す側を切る
      vec2 scale = vec2(
        max(screenAspect / imageAspect, 1.0),
        max(imageAspect / screenAspect, 1.0)
      );

      // UV を scale で割って縮小し、中央揃え
      vec2 correctedUv = (vUv - 0.5) / scale + 0.5;
      
      // --- ここから不均一スライスの計算 ---
      float numSlices = 31.0; // 全体のスライス数

      // 歪んだUVでスライスIDを決定する
      float sliceId = floor(correctedUv.x * numSlices);
      
      // 中央のスライスIDを基準にオフセットを計算する
      float center = (numSlices - 1.0) / 2.0;
      float distFromCenter = sliceId - center;
      // offset も scale.x で割って、UV空間でのサイズを合わせる
      float offset = sin(1.5) * 0.4 * distFromCenter * -0.03 / scale.x;
      
      // --- 色収差 (RGB Split) ---
      float r = texture2D(uTexture, correctedUv + vec2(offset, 0.0)).r;
      float g = texture2D(uTexture, correctedUv + vec2(offset * 1.03, 0.0)).g;
      float b = texture2D(uTexture, correctedUv + vec2(offset * 1.05, 0.0)).b;
      
      gl_FragColor = vec4(r, g, b, 1.0);
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
  // uniforms.uTime.value = clock.getElapsedTime();
  renderer.render(scene, camera);
}

animate();

// --- 6. Resize Handling ---
function resizeToContainer() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return;

  const aspect = width / height;
  camera.left = -frustumSize * aspect / 2;
  camera.right = frustumSize * aspect / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();

  uniforms.uResolution.value.set(width, height);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);

  renderer.render(scene, camera);
}

resizeToContainer();

window.addEventListener('resize', resizeToContainer);
const resizeObserver = new ResizeObserver(resizeToContainer);
resizeObserver.observe(container);