// ============================================================
// mv_dev0313.js
// テクスチャフェード切替 + PC/SP シェーダー切替 対応版
// ============================================================

const container = document.querySelector('.container');
const BREAKPOINT = 767;
const SLICE_NUM = 27;
const FADE_DURATION = 1.5;       // フェード秒数
const SLIDE_INTERVAL = 5.0;      // 自動切替間隔（秒）
const FADE_EASING = 0.03;        // フェード補間係数（毎フレーム）

// ============================================================
// 1. Basic Three.js Setup
// ============================================================

const scene = new THREE.Scene();

// 固定正射影カメラ（-1〜1の正規化座標でcanvasを常に覆う）
// アスペクト比の補正はシェーダー側のcover計算で行う
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 2;

const renderer = new THREE.WebGLRenderer({ antialias: true });
container.appendChild(renderer.domElement);

// カメラ座標（-1〜1）にぴったり合わせた2×2サイズ
const geometry = new THREE.PlaneGeometry(2, 2, 100, 100);

// ============================================================
// 2. Shared Uniforms（PC / SP 共通）
// ============================================================

const sharedUniforms = {
  uTexture1: { value: null },
  uTexture2: { value: null },
  uMixFactor: { value: 0.0 },
  uContainerResolution: { value: new THREE.Vector2(container.clientWidth, container.clientHeight) },
  uImageResolution: { value: new THREE.Vector2(1, 1) },
};

// ============================================================
// 3. Vertex Shader（共通）
// ============================================================

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ============================================================
// 4. PC Material（スライス歪み + マウスインタラクション + テクスチャmix）
// ============================================================

const mouse = new THREE.Vector2(-1, 0);
const targetMouse = new THREE.Vector2(-1, 0);
let targetMouseX = container.clientWidth / 2;

const pcUniforms = {
  ...sharedUniforms,
  uMouse:      { value: mouse },
  uSliceWidth: { value: container.clientWidth / SLICE_NUM },
  uMouseX:     { value: targetMouseX },
};

const pcFragmentShader = `
  varying vec2 vUv;
  uniform sampler2D uTexture1;
  uniform sampler2D uTexture2;
  uniform float uMixFactor;
  uniform vec2 uMouse;
  uniform vec2 uContainerResolution;
  uniform vec2 uImageResolution;
  uniform float uSliceWidth;
  uniform float uMouseX;

  void main() {
    float mousePresence = clamp((uMouse.x + 1.0) * 0.5, 0.0, 1.0);

    // --- object-fit: cover 補正（x軸・y軸の両方） ---
    float screenAspect = uContainerResolution.x / uContainerResolution.y;
    float imageAspect = uImageResolution.x / uImageResolution.y;
    float r = screenAspect / imageAspect;
    float scaleU = r < 1.0 ? r : 1.0;
    float scaleV = r >= 1.0 ? 1.0 / r : 1.0;

    // cover補正済みUV
    float coverU = (vUv.x - 0.5) * scaleU + 0.5;
    float coverV = (vUv.y - 0.5) * scaleV + 0.5;

    // ---------- screen slices ----------
    float sliceWidth = uSliceWidth;
    float totalSlices = floor(uContainerResolution.x / sliceWidth);
    float sliceId = floor(gl_FragCoord.x / sliceWidth);
    float localX = fract(gl_FragCoord.x / sliceWidth);

    // マウス位置をスライス単位の連続値として算出
    float mousePos = uMouseX / sliceWidth;

    // 現在スライスの中心とマウス位置の連続的な距離（符号付き）
    float sliceCenter = sliceId + 0.5;
    float distFromMouse = sliceCenter - mousePos;

    float effectRange = 8.0;
    float normalized = clamp(distFromMouse / effectRange, -1.0, 1.0);
    float inRange = 1.0 - smoothstep(effectRange - 1.0, effectRange, abs(distFromMouse));

    // ---------- スライスのUV範囲を計算 ----------
    float distortionStrength = 0.1;
    float sliceCenterScreen = (sliceId + 0.5) * sliceWidth / uContainerResolution.x;
    float sliceCenterU = (sliceCenterScreen - 0.5) * scaleU + 0.5;

    float offset = -0.0 * distortionStrength * normalized;

    // ---------- compression ----------
    float compressionStrength = 0.5;
    float compression = 1.0 - compressionStrength * pow(1.0 - abs(normalized), 1.0);

    float localShiftScale = 5.0 * (1.0 - smoothstep(0.1, 1.0, abs(normalized) - 0.1));
    float localOffset = (localX - 0.5) * (sliceWidth / uContainerResolution.x) * compression * scaleU * localShiftScale;

    // ---------- final uv ----------
    float distortedU = sliceCenterU + offset + localOffset;
    float effectU = mix(coverU, distortedU, inRange);
    float finalU = mix(coverU, effectU, mousePresence);

    vec2 finalUv = vec2(finalU, coverV);
    finalUv = clamp(finalUv, 0.0, 1.0);

    // --- テクスチャフェードサンプリング ---
    vec4 color1 = texture2D(uTexture1, finalUv);
    vec4 color2 = texture2D(uTexture2, finalUv);
    gl_FragColor = mix(color1, color2, uMixFactor);
  }
`;

const pcMaterial = new THREE.ShaderMaterial({
  uniforms: pcUniforms,
  vertexShader: vertexShader,
  fragmentShader: pcFragmentShader,
  transparent: true,
  side: THREE.DoubleSide,
});

// ============================================================
// 5. SP Material（cover補正 + テクスチャmix のみ）
// ============================================================

const spUniforms = {
  ...sharedUniforms,
};

const spFragmentShader = `
  varying vec2 vUv;
  uniform sampler2D uTexture1;
  uniform sampler2D uTexture2;
  uniform float uMixFactor;
  uniform vec2 uContainerResolution;
  uniform vec2 uImageResolution;

  void main() {
    // --- object-fit: cover 補正 ---
    float screenAspect = uContainerResolution.x / uContainerResolution.y;
    float imageAspect  = uImageResolution.x / uImageResolution.y;
    float r = screenAspect / imageAspect;
    float scaleU = r < 1.0 ? r : 1.0;
    float scaleV = r >= 1.0 ? 1.0 / r : 1.0;

    vec2 coverUv = vec2(
      (vUv.x - 0.5) * scaleU + 0.5,
      (vUv.y - 0.5) * scaleV + 0.5
    );
    coverUv = clamp(coverUv, 0.0, 1.0);

    // --- テクスチャフェードサンプリング ---
    vec4 color1 = texture2D(uTexture1, coverUv);
    vec4 color2 = texture2D(uTexture2, coverUv);
    gl_FragColor = mix(color1, color2, uMixFactor);
  }
`;

const spMaterial = new THREE.ShaderMaterial({
  uniforms: spUniforms,
  vertexShader: vertexShader,
  fragmentShader: spFragmentShader,
  transparent: true,
  side: THREE.DoubleSide,
});

// ============================================================
// 6. Mesh（共通）
// ============================================================

const mesh = new THREE.Mesh(geometry, pcMaterial); // 初期はPC
scene.add(mesh);

// ============================================================
// 7. Texture Manager
//    - デバイスごとの画像URL配列を管理
//    - 2スロット方式でフェード切替
//    - 不要テクスチャを dispose して VRAM 節約
// ============================================================

const textureLoader = new THREE.TextureLoader();
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

// HTMLからデバイスごとの画像URLリストを構築
function getImageUrls(device) {
  const imgs = container.querySelectorAll(`.mv-img[data-device="${device}"]`);
  // data-index順にソート
  return Array.from(imgs)
    .sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index))
    .map(img => img.src);
}

const pcImageUrls = getImageUrls('pc');
const spImageUrls = getImageUrls('sp');

// テクスチャにフィルタリング設定を適用する共通関数
function configureTexture(t) {
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = maxAnisotropy;
  t.needsUpdate = true;
}

// テクスチャを非同期ロードしてPromiseを返す
function loadTexture(url) {
  return new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (t) => {
        configureTexture(t);
        resolve(t);
      },
      undefined,
      reject
    );
  });
}

// --- テクスチャ切替の状態管理 ---
const textureState = {
  currentDevice: null,        // 'pc' or 'sp'
  currentIndex: 0,            // 現在表示中の画像インデックス
  isFading: false,            // フェード中フラグ
  targetMixFactor: 0.0,       // uMixFactor の目標値
  autoTimer: null,            // 自動切替タイマー
};

// 初回ロード: 最初の画像を uTexture1 にセット（uTexture2 は同じ画像で初期化）
async function initTextures(device) {
  const urls = device === 'pc' ? pcImageUrls : spImageUrls;
  if (urls.length === 0) return;

  textureState.currentDevice = device;
  textureState.currentIndex = 0;

  const firstTexture = await loadTexture(urls[0]);

  // 画像解像度を共通uniformに反映
  sharedUniforms.uImageResolution.value.set(firstTexture.image.width, firstTexture.image.height);

  // 両スロットに同じテクスチャをセット（フェードなしで即表示）
  sharedUniforms.uTexture1.value = firstTexture;
  sharedUniforms.uTexture2.value = firstTexture;
  sharedUniforms.uMixFactor.value = 0.0;

  // 自動切替を開始
  startAutoSlide(device);
}

// 次のテクスチャへフェード遷移
async function fadeToNext() {
  if (textureState.isFading) return;

  const device = textureState.currentDevice;
  const urls = device === 'pc' ? pcImageUrls : spImageUrls;
  if (urls.length <= 1) return; // 1枚以下なら切替不要

  const nextIndex = (textureState.currentIndex + 1) % urls.length;

  // 次のテクスチャをロード
  const nextTexture = await loadTexture(urls[nextIndex]);

  // uTexture2 に次のテクスチャをセット
  // （uTexture1 は現在表示中のテクスチャのまま）
  const oldTexture2 = sharedUniforms.uTexture2.value;
  sharedUniforms.uTexture2.value = nextTexture;
  sharedUniforms.uImageResolution.value.set(nextTexture.image.width, nextTexture.image.height);

  // フェード開始: uMixFactor を 0 → 1 に補間
  sharedUniforms.uMixFactor.value = 0.0;
  textureState.targetMixFactor = 1.0;
  textureState.isFading = true;
  textureState.currentIndex = nextIndex;
}

// フェード完了時のスワップ処理
function onFadeComplete() {
  textureState.isFading = false;

  // スワップ: uTexture1 を現在の uTexture2 に、uMixFactor を 0 に戻す
  const oldTexture1 = sharedUniforms.uTexture1.value;
  sharedUniforms.uTexture1.value = sharedUniforms.uTexture2.value;
  sharedUniforms.uMixFactor.value = 0.0;
  textureState.targetMixFactor = 0.0;

  // 古いテクスチャが新しいテクスチャと異なれば VRAM から解放
  if (oldTexture1 && oldTexture1 !== sharedUniforms.uTexture1.value) {
    oldTexture1.dispose();
  }
}

// 自動切替タイマー
function startAutoSlide(device) {
  stopAutoSlide();
  const urls = device === 'pc' ? pcImageUrls : spImageUrls;
  if (urls.length <= 1) return;

  textureState.autoTimer = setInterval(() => {
    fadeToNext();
  }, SLIDE_INTERVAL * 1000);
}

function stopAutoSlide() {
  if (textureState.autoTimer) {
    clearInterval(textureState.autoTimer);
    textureState.autoTimer = null;
  }
}

// ============================================================
// 8. Breakpoint Manager
//    - PC/SP 判定して material を差し替え
//    - デバイス切替時にテクスチャも入れ替え
// ============================================================

let currentMode = null; // 'pc' or 'sp'

function checkBreakpoint() {
  const isSP = window.innerWidth <= BREAKPOINT;
  const newMode = isSP ? 'sp' : 'pc';

  if (newMode === currentMode) return;
  currentMode = newMode;

  if (newMode === 'sp') {
    mesh.material = spMaterial;
    // SP ではマウスインタラクション不要
  } else {
    mesh.material = pcMaterial;
  }

  // デバイスに応じたテクスチャ群をロード
  initTextures(newMode);
}

// ============================================================
// 9. Mouse Interaction（PC のみ）
// ============================================================

container.addEventListener('mouseenter', () => {
  targetMouse.set(1, 0);
});

container.addEventListener('mouseleave', () => {
  targetMouse.set(-1, 0);
});

container.addEventListener('mousemove', (e) => {
  const rect = container.getBoundingClientRect();
  const x = e.clientX - rect.left;
  // デバイスピクセル比を掛けて物理ピクセルに変換
  targetMouseX = x * Math.min(window.devicePixelRatio, 2);
});

// ============================================================
// 10. Animation Loop
// ============================================================

function animate() {
  requestAnimationFrame(animate);

  // --- マウス補間（PC material の uniform を直接更新） ---
  mouse.x += (targetMouse.x - mouse.x) * 0.3;
  pcUniforms.uMouseX.value += (targetMouseX - pcUniforms.uMouseX.value) * 0.15;

  // --- テクスチャフェード補間 ---
  if (textureState.isFading) {
    const current = sharedUniforms.uMixFactor.value;
    const target = textureState.targetMixFactor;
    const newVal = current + (target - current) * FADE_EASING;

    // ほぼ到達したら完了処理
    if (Math.abs(newVal - target) < 0.005) {
      sharedUniforms.uMixFactor.value = target;
      onFadeComplete();
    } else {
      sharedUniforms.uMixFactor.value = newVal;
    }
  }

  renderer.render(scene, camera);
}

animate();

// ============================================================
// 11. Resize Handling
// ============================================================

function resizeToContainer() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return;

  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);

  // 物理ピクセルサイズでコンテナ解像度を更新（共通uniform）
  const physicalWidth = width * dpr;
  const physicalHeight = height * dpr;
  sharedUniforms.uContainerResolution.value.set(physicalWidth, physicalHeight);

  // PC固有: スライス幅を物理ピクセル単位で再計算
  pcUniforms.uSliceWidth.value = physicalWidth / SLICE_NUM;

  renderer.setSize(width, height, false);
  renderer.render(scene, camera);
}

resizeToContainer();

window.addEventListener('resize', () => {
  resizeToContainer();
  checkBreakpoint();
});

const resizeObserver = new ResizeObserver(() => {
  resizeToContainer();
});
resizeObserver.observe(container);

// ============================================================
// 12. Initial Boot
// ============================================================

checkBreakpoint();