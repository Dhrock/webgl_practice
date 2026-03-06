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
const textureUrl = '/everEdge/assets/image/sample04.jpg'; // テクスチャ画像
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

// --- 3. Mouse Interaction Setup ---
const mouse = new THREE.Vector2(-1, 0); // 初期位置は画面外
const targetMouse = new THREE.Vector2(-1, 0);

container.addEventListener('mouseenter', () => {
  // マウスがオーバーライドしたら、offsetを有効にする
  targetMouse.set(1, 0);
});

container.addEventListener('mouseleave', () => {
  // マウスが離れたら初期位置に戻す
  targetMouse.set(-1, 0);
});

// --- 4. ShaderMaterial Creation ---
// ジオメトリのセグメント数を多めにして、歪みを滑らかに
const geometry = new THREE.PlaneGeometry(2.5, 2.5, 200, 200);

const uniforms = {
  uTexture: { value: texture },
  uTime: { value: 0.0 },
  uMouse: { value: mouse }
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
    uniform vec2 uMouse;

    void main() {
      // mouse.x が -1 → 1 に変化する全域をイージングの範囲として使用
      float mousePresence = smoothstep(-1.0, 1.0, uMouse.x);

      // 歪みなし：各スライスで均一なUV.xをそのまま使用
      float warpedX = vUv.x;

      vec2 warpedUv = vec2(warpedX, vUv.y);

      // --- ここから不均一スライスの計算 ---
      float numSlices = 61.0;

      // 歪んだUVでスライスIDを決定する
      float sliceId = floor(warpedX * numSlices);

      // 中央のスライスIDを基準にオフセットを計算
      float center = (numSlices - 1.0) / 2.0;
      float distFromCenter = sliceId - center;
      float offset = distFromCenter * -0.01 * mousePresence;

      // --- 色収差 (RGB Split) ---
      float r = texture2D(uTexture, warpedUv + vec2(offset, 0.0)).r;
      float g = texture2D(uTexture, warpedUv + vec2(offset, 0.0)).g;
      float b = texture2D(uTexture, warpedUv + vec2(offset, 0.0)).b;

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

  // マウス座標をスムーズに補間して更新
  mouse.x += (targetMouse.x - mouse.x) * 0.08;
  mouse.y += (targetMouse.y - mouse.y) * 0.08;

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