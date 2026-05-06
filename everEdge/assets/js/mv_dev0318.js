// ============================================================
// mv_dev0313.js
// テクスチャフェード切替 + PC/SP シェーダー切替 対応版
// ============================================================

const container = document.querySelector('.container');
const BREAKPOINT = 767;

// PCの設定
const PC_SLICE_NUM = 27;
const PC_EFFECT_RANGE = 8.0;

// SPの設定
const SP_SLICE_NUM = 14;
const SP_EFFECT_RANGE = 7.0;
const SP_POINT_MARGIN = (SP_EFFECT_RANGE * 2.0) / SP_SLICE_NUM;
const SP_POINT_START = -1.0 - SP_POINT_MARGIN;
const SP_POINT_END = 1.0 + SP_POINT_MARGIN;
const SP_POINT_LEAD_TIME = 0.4;  // SPの点Pをフェード開始より先行させる秒数

// フェード切替のパラメータ
const FADE_DURATION = 2.0;       // フェード秒数
const SLIDE_INTERVAL = 6.0;      // 自動切替間隔（秒）
const FADE_EASING = 0.025;        // フェード補間係数（毎フレーム）

function easeInOutCubic(t) {
  return t < 0.5 ? 4.0 * t * t * t : 1.0 - Math.pow(-2.0 * t + 2.0, 3.0) / 2.0;
}

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
let targetMouseX = container.clientWidth / 2; // マウスX位置の物理ピクセル単位での初期位置

const pcUniforms = {
  ...sharedUniforms,
  uMouse:      { value: mouse },
  uSliceWidth: { value: container.clientWidth / PC_SLICE_NUM },
  uEffectRange: { value: PC_EFFECT_RANGE },
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
  uniform float uEffectRange;
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

    float effectRange = uEffectRange;
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
// 5. SP Material（スライス歪み + 自動移動点P + テクスチャmix）
// ============================================================

const spUniforms = {
  ...sharedUniforms,
  uPointX:     { value: SP_POINT_START },
  uSliceWidth: { value: container.clientWidth / SP_SLICE_NUM },
  uEffectRange: { value: SP_EFFECT_RANGE },
};

const spFragmentShader = `
  varying vec2 vUv;
  uniform sampler2D uTexture1;
  uniform sampler2D uTexture2;
  uniform float uMixFactor;
  uniform vec2 uContainerResolution;
  uniform vec2 uImageResolution;
  uniform float uPointX;
  uniform float uSliceWidth;
  uniform float uEffectRange;

  void main() {
    // --- object-fit: cover 補正 ---
    float screenAspect = uContainerResolution.x / uContainerResolution.y;
    float imageAspect  = uImageResolution.x / uImageResolution.y;
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

    // 点Pを物理ピクセル座標へ変換。画面外の値も使って、フェード前後の歪みを消す。
    float pointX = (uPointX + 1.0) * 0.5 * uContainerResolution.x;
    float pointPos = pointX / sliceWidth;

    // 現在スライスの中心と点Pの連続的な距離（符号付き）
    float sliceCenter = sliceId + 0.5;
    float distFromPoint = sliceCenter - pointPos;

    float effectRange = uEffectRange;
    float normalized = clamp(distFromPoint / effectRange, -1.0, 1.0);
    float inRange = 1.0 - smoothstep(effectRange - 1.0, effectRange, abs(distFromPoint));

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
    float finalU = mix(coverU, distortedU, inRange);

    vec2 finalUv = vec2(finalU, coverV);
    finalUv = clamp(finalUv, 0.0, 1.0);

    // --- テクスチャフェードサンプリング ---
    vec4 color1 = texture2D(uTexture1, finalUv);
    vec4 color2 = texture2D(uTexture2, finalUv);
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
  isPointLeading: false,      // SPの点Pだけ先行移動中
  pointLeadStartedAt: 0,      // 点Pの先行開始時刻
  targetMixFactor: 0.0,       // uMixFactor の目標値
  autoTimer: null,            // 自動切替タイマー
};

// 初回ロード: 最初の画像を uTexture1 にセット（uTexture2 は同じ画像で初期化）
async function initTextures(device) {
  const urls = device === 'pc' ? pcImageUrls : spImageUrls;
  if (urls.length === 0) return;

  textureState.currentDevice = device;
  textureState.currentIndex = 0;
  textureState.isFading = false;
  textureState.isPointLeading = false;
  textureState.targetMixFactor = 0.0;

  const firstTexture = await loadTexture(urls[0]);

  // 画像解像度を共通uniformに反映
  sharedUniforms.uImageResolution.value.set(firstTexture.image.width, firstTexture.image.height);

  // 両スロットに同じテクスチャをセット（フェードなしで即表示）
  sharedUniforms.uTexture1.value = firstTexture;
  sharedUniforms.uTexture2.value = firstTexture;
  sharedUniforms.uMixFactor.value = 0.0;
  spUniforms.uPointX.value = SP_POINT_START;

  // 自動切替を開始
  startAutoSlide(device);
}

// 次のテクスチャへフェード遷移
async function fadeToNext() {
  if (textureState.isFading || textureState.isPointLeading) return;

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
  spUniforms.uPointX.value = SP_POINT_START;
  textureState.targetMixFactor = 1.0;
  textureState.currentIndex = nextIndex;

  if (device === 'sp') {
    textureState.isPointLeading = true;
    textureState.pointLeadStartedAt = performance.now();
  } else {
    textureState.isFading = true;
  }
}

// フェード完了時のスワップ処理
function onFadeComplete() {
  textureState.isFading = false;
  textureState.isPointLeading = false;

  // スワップ: uTexture1 を現在の uTexture2 に、uMixFactor を 0 に戻す
  const oldTexture1 = sharedUniforms.uTexture1.value;
  sharedUniforms.uTexture1.value = sharedUniforms.uTexture2.value;
  sharedUniforms.uMixFactor.value = 0.0;
  spUniforms.uPointX.value = SP_POINT_START;
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

  const spPointLeadRatio = SP_POINT_LEAD_TIME / (SP_POINT_LEAD_TIME + FADE_DURATION);

  // --- SP 点Pの先行移動 ---
  if (textureState.isPointLeading) {
    const elapsed = (performance.now() - textureState.pointLeadStartedAt) / 1000;
    const leadProgress = Math.min(elapsed / SP_POINT_LEAD_TIME, 1.0) * spPointLeadRatio;
    spUniforms.uPointX.value = SP_POINT_START + (SP_POINT_END - SP_POINT_START) * leadProgress;

    if (elapsed >= SP_POINT_LEAD_TIME) {
      textureState.isPointLeading = false;
      textureState.isFading = true;
      sharedUniforms.uMixFactor.value = 0.0;
    }
  }

  // --- テクスチャフェード補間 ---
  if (textureState.isFading) {
    const current = sharedUniforms.uMixFactor.value;
    const target = textureState.targetMixFactor;
    const newVal = current + (target - current) * FADE_EASING;

    // ほぼ到達したら完了処理
    if (Math.abs(newVal - target) < 0.005) {
      sharedUniforms.uMixFactor.value = target;
      if (currentMode === 'sp') {
        spUniforms.uPointX.value = SP_POINT_END;
      }
      onFadeComplete();
    } else {
      sharedUniforms.uMixFactor.value = newVal;
      if (currentMode === 'sp') {
        const pointProgress = Math.min(spPointLeadRatio + (1.0 - spPointLeadRatio) * newVal, 1.0);
        spUniforms.uPointX.value = SP_POINT_START + (SP_POINT_END - SP_POINT_START) * pointProgress;
      }
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

  const dpr = window.devicePixelRatio;
  renderer.setPixelRatio(dpr);

  // 物理ピクセルサイズでコンテナ解像度を更新（共通uniform）
  const physicalWidth = width * dpr;
  const physicalHeight = height * dpr;
  sharedUniforms.uContainerResolution.value.set(physicalWidth, physicalHeight);

  // デバイスごとのスライス幅を物理ピクセル単位で再計算
  pcUniforms.uSliceWidth.value = physicalWidth / PC_SLICE_NUM;
  spUniforms.uSliceWidth.value = physicalWidth / SP_SLICE_NUM;

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
