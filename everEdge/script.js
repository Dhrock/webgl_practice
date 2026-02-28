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
const textureUrl = 'image/sample01.jpg'; // テクスチャ画像
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

window.addEventListener('mousemove', (event) => {
  // マウス座標を -1〜1 に正規化
  targetMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  targetMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

// --- 4. ShaderMaterial Creation ---
// ジオメトリのセグメント数を多めにして、歪みを滑らかに
const geometry = new THREE.PlaneGeometry(2, 2, 10, 10);

const uniforms = {
  uTexture: { value: texture },
  // uTime: { value: 0.0 },
  uMouse: { value: mouse } // マウス座標 (-1〜1)
};

const material = new THREE.ShaderMaterial({
  uniforms: uniforms,
  vertexShader: `
    varying vec2 vUv;
    uniform vec2 uMouse;
    // uniform float uTime;

    void main() {
      vUv = uv;
      
      // 頂点とマウス位置の距離 (0〜1空間)
      float dist = distance(vUv, (uMouse * 0.5 + 0.5)); 
      
      float strength = exp(-dist * dist * 3.0);
      
      vec3 pos = position;
      pos.z += strength * 0.15;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D uTexture;
    // uniform float uTime;
    uniform vec2 uMouse;

    void main() {
      // マウスのX座標（0〜1に正規化）
      float hoverX = uMouse.x * 0.5 + 0.5;
      
      // マウス座標からのオフセット
      float offset = vUv.x - hoverX;
      
      // UVの横方向を歪ませる（マウス位置を押し広げる）
      // ガウス関数 exp(-x^2 / 2σ^2)
      float strength = exp(-offset * offset * 25.0); // 25.0は山の鋭さ（太さの勾配を急に）
      
      vec2 distortedUv = vUv;
      // マウス位置を中心にUVを押し広げる (0.4は歪みの大きさ)
      distortedUv.x += offset * strength * 0.4; 
      
      // --- ここから不均一スライスの計算 ---
      float numSlices = 10.0; // 全体のスライス数
      // 歪んだUVでスライスIDを決定する
      float sliceId = floor(distortedUv.x * numSlices);
      
      
      // --- 色収差 (RGB Split) ---
      float r = texture2D(uTexture, distortedUv).r;
      float g = texture2D(uTexture, distortedUv).g;
      float b = texture2D(uTexture, distortedUv).b;
      
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
    
    // 時間の更新
    // uniforms.uTime.value = clock.getElapsedTime();
    
    // マウス座標を滑らかにターゲットへ近づける (Lerp)
    mouse.x += (targetMouse.x - mouse.x) * 0.1;
    mouse.y += (targetMouse.y - mouse.y) * 0.1;
    uniforms.uMouse.value.copy(mouse);
    
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