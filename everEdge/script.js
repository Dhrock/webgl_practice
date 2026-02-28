// // シーンを作成
// const scene = new THREE.Scene();

// // カメラを作成
// const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
// camera.position.z = 5;

// // レンダラーを作成
// const renderer = new THREE.WebGLRenderer({ antialias: true });
// const container = document.getElementById('container');
// container.appendChild(renderer.domElement);

// // ジオメトリとマテリアルを作成し、メッシュを生成
// const planeGeometry = new THREE.PlaneGeometry(4, 4, 1, 1);
// const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
// const plane = new THREE.Mesh(planeGeometry, material);
// scene.add(plane);

// --- 1. Basic Three.js Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

camera.position.z = 2;

const renderer = new THREE.WebGLRenderer({ antialias: true });
const container = document.getElementById('container');
container.appendChild(renderer.domElement);

// --- 2. Texture Loading ---
// 添付画像のURL（もし読み込めない場合は、適当な画像URLに変更してください）
const textureUrl = 'image/sample02.jpg'; // テクスチャ画像
const texture = new THREE.TextureLoader().load(
  textureUrl,
  // ロード完了時のコールバック（アスペクト比を調整するため）
  (t) => {
    const aspect = t.image.width / t.image.height;
    // アスペクト比に合わせて平面をスケーリング
    mesh.scale.set(aspect, 1, 1);
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
  uTime: { value: 0.0 }
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
    uniform float uTime;

    void main() {      
      // --- ここから不均一スライスの計算 ---
      float numSlices = 11.0; // 全体のスライス数

      // 歪んだUVでスライスIDを決定する
      float sliceId = floor(vUv.x * numSlices);
      
      // 中央のスライスIDを基準にオフセットを計算
      float center = (numSlices - 1.0) / 2.0;
      float distFromCenter = sliceId - center;
      float offset = sin(uTime * 0.3) * 0.4 * distFromCenter * -0.08;
      // float offset = 0.0;
      
      // --- 色収差 (RGB Split) ---
      float r = texture2D(uTexture, vUv + vec2(offset, 0.0)).r;
      float g = texture2D(uTexture, vUv + vec2(offset, 0.0)).g;
      float b = texture2D(uTexture, vUv + vec2(offset, 0.0)).b;
      
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
  uniforms.uTime.value = clock.getElapsedTime();
  renderer.render(scene, camera);
}

animate();

// --- 6. Resize Handling ---
function resizeToContainer() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);

  renderer.render(scene, camera);
}

resizeToContainer();

window.addEventListener('resize', resizeToContainer);
const resizeObserver = new ResizeObserver(resizeToContainer);
resizeObserver.observe(container);