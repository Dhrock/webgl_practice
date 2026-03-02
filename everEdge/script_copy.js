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
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1000);

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

// --- 3. Mouse Interaction Setup ---
const mouse = new THREE.Vector2(-1, 0); // 初期位置は画面外
const targetMouse = new THREE.Vector2(-1, 0);

container.addEventListener('mousemove', (event) => {
  // マウス座標を -1〜1 に正規化
  targetMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  targetMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

container.addEventListener('mouseleave', () => {
  // マウスが離れたら初期位置に戻す
  targetMouse.set(-1, 0);
});

// --- 4. ShaderMaterial Creation ---
// ジオメトリのセグメント数を多めにして、歪みを滑らかに
const geometry = new THREE.PlaneGeometry(2.5, 2.5, 100, 100);

const uniforms = {
  uTexture: { value: texture },
  uTime: { value: 0.0 },
  uMouse: { value: mouse } // マウス座標 (-1〜1)
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
      // --- デフォルトの歪み: 中央のスライスが広く、端が狭い ---
      // UV.xを中央に引き寄せる（S字カーブ）
      float defaultWarpedX = 0.5 + (vUv.x - 0.5) * (1.0 - 0.3 * (1.0 - 4.0 * (vUv.x - 0.5) * (vUv.x - 0.5)));

      // --- マウスホバー時の歪み ---
      float mouseU = uMouse.x * 0.5 + 0.5;

      // マウスが画面内にいるかどうかの判定（-1付近＝画面外）
      float mousePresence = smoothstep(-0.9, -0.5, uMouse.x);

      float distToMouse = vUv.x - mouseU;
      float spread = 0.25;
      float strength = 0.4;
      // ガウス的な重みで、マウス付近を引き伸ばす
      float weight = exp(-distToMouse * distToMouse / (2.0 * spread * spread));
      // 歪んだUV.x: マウス付近は間隔が広がり、それ以外は縮む
      float mouseWarpedX = vUv.x - distToMouse * strength * weight;

      // マウスがいないときはデフォルト歪み、いるときはマウス歪みにブレンド
      float warpedX = mix(defaultWarpedX, mouseWarpedX, mousePresence);
      warpedX = clamp(warpedX, 0.0, 1.0);

      vec2 warpedUv = vec2(warpedX, vUv.y);

      // --- ここから不均一スライスの計算 ---
      float numSlices = 11.0;

      // 歪んだUVでスライスIDを決定する
      float sliceId = floor(warpedX * numSlices);

      // 中央のスライスIDを基準にオフセットを計算
      float center = (numSlices - 1.0) / 2.0;
      float distFromCenter = sliceId - center;
      float offset = distFromCenter * -0.04 * mousePresence;

      // --- 色収差 (RGB Split) ---
      float r = texture2D(uTexture, warpedUv + vec2(offset, 0.0)).r;
      float g = texture2D(uTexture, warpedUv + vec2(offset * 1.2, 0.0)).g;
      float b = texture2D(uTexture, warpedUv + vec2(offset * 1.3, 0.0)).b;

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
  renderer.setSize(width, height, false);

  renderer.render(scene, camera);
}

resizeToContainer();

window.addEventListener('resize', resizeToContainer);
const resizeObserver = new ResizeObserver(resizeToContainer);
resizeObserver.observe(container);