const GRAINIENT_PARAMS = {
  color1: '#ffffff',
  color2: '#046781',
  color3: '#ffbeb5',
  timeSpeed: 0.95,
  colorBalance: -0.03,
  warpStrength: 1.25,
  warpFrequency: 4.6,
  warpSpeed: 2,
  warpAmplitude: 50,
  blendAngle: 5,
  blendSoftness: 0.05,
  rotationAmount: 500,
  noiseScale: 1.75,
  grainAmount: 0.03,
  grainScale: 0.4,
  grainAnimated: false,
  contrast: 1.95,
  gamma: 1.7,
  saturation: 1,
  centerX: 0,
  centerY: 0,
  zoom: 0.75,
};

const vertexShader = `in vec3 position;

void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = `precision highp float;

uniform vec2 iResolution;
uniform float iTime;
uniform float uTimeSpeed;
uniform float uColorBalance;
uniform float uWarpStrength;
uniform float uWarpFrequency;
uniform float uWarpSpeed;
uniform float uWarpAmplitude;
uniform float uBlendAngle;
uniform float uBlendSoftness;
uniform float uRotationAmount;
uniform float uNoiseScale;
uniform float uGrainAmount;
uniform float uGrainScale;
uniform float uGrainAnimated;
uniform float uContrast;
uniform float uGamma;
uniform float uSaturation;
uniform vec2 uCenterOffset;
uniform float uZoom;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;

out vec4 fragColor;

#define S(a,b,t) smoothstep(a,b,t)

mat2 Rot(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(2127.1, 81.17)), dot(p, vec2(1269.5, 283.37)));
  return fract(sin(p) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float n = mix(
    mix(
      dot(-1.0 + 2.0 * hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
      dot(-1.0 + 2.0 * hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)),
      u.x
    ),
    mix(
      dot(-1.0 + 2.0 * hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
      dot(-1.0 + 2.0 * hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)),
      u.x
    ),
    u.y
  );
  return 0.5 + 0.5 * n;
}

void mainImage(out vec4 o, vec2 C) {
  float t = iTime * uTimeSpeed;
  vec2 uv = C / iResolution.xy;
  float ratio = iResolution.x / iResolution.y;
  vec2 tuv = uv - 0.5 + uCenterOffset;
  tuv /= max(uZoom, 0.001);

  float degree = noise(vec2(t * 0.1, tuv.x * tuv.y) * uNoiseScale);
  tuv.y *= 1.0 / ratio;
  tuv *= Rot(radians((degree - 0.5) * uRotationAmount + 180.0));
  tuv.y *= ratio;

  float frequency = uWarpFrequency;
  float ws = max(uWarpStrength, 0.001);
  float amplitude = uWarpAmplitude / ws;
  float warpTime = t * uWarpSpeed;
  tuv.x += sin(tuv.y * frequency + warpTime) / amplitude;
  tuv.y += sin(tuv.x * (frequency * 1.5) + warpTime) / (amplitude * 0.5);

  vec3 colLav = uColor1;
  vec3 colOrg = uColor2;
  vec3 colDark = uColor3;
  float b = uColorBalance;
  float s = max(uBlendSoftness, 0.0);
  mat2 blendRot = Rot(radians(uBlendAngle));
  float blendX = (tuv * blendRot).x;
  float edge0 = -0.3 - b - s;
  float edge1 = 0.2 - b + s;
  float v0 = 0.5 - b + s;
  float v1 = -0.3 - b - s;
  vec3 layer1 = mix(colDark, colOrg, S(edge0, edge1, blendX));
  vec3 layer2 = mix(colOrg, colLav, S(edge0, edge1, blendX));
  vec3 col = mix(layer1, layer2, S(v0, v1, tuv.y));

  vec2 grainUv = uv * max(uGrainScale, 0.001);
  if (uGrainAnimated > 0.5) {
    grainUv += vec2(iTime * 0.05);
  }
  float grain = fract(sin(dot(grainUv, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * uGrainAmount;

  col = (col - 0.5) * uContrast + 0.5;
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSaturation);
  col = pow(max(col, 0.0), vec3(1.0 / max(uGamma, 0.001)));
  col = clamp(col, 0.0, 1.0);
  o = vec4(col, 1.0);
}

void main() {
  vec4 o = vec4(0.0);
  mainImage(o, gl_FragCoord.xy);
  fragColor = o;
}
`;

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [1, 1, 1];
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
  ];
}

function showError(message) {
  const container = document.getElementById('container');
  container.textContent = message;
  container.classList.add('is-error');
}

function createUniforms(params) {
  return {
    iTime: { value: 0 },
    iResolution: { value: new THREE.Vector2(1, 1) },
    uTimeSpeed: { value: params.timeSpeed },
    uColorBalance: { value: params.colorBalance },
    uWarpStrength: { value: params.warpStrength },
    uWarpFrequency: { value: params.warpFrequency },
    uWarpSpeed: { value: params.warpSpeed },
    uWarpAmplitude: { value: params.warpAmplitude },
    uBlendAngle: { value: params.blendAngle },
    uBlendSoftness: { value: params.blendSoftness },
    uRotationAmount: { value: params.rotationAmount },
    uNoiseScale: { value: params.noiseScale },
    uGrainAmount: { value: params.grainAmount },
    uGrainScale: { value: params.grainScale },
    uGrainAnimated: { value: params.grainAnimated ? 1 : 0 },
    uContrast: { value: params.contrast },
    uGamma: { value: params.gamma },
    uSaturation: { value: params.saturation },
    uCenterOffset: { value: new THREE.Vector2(params.centerX, params.centerY) },
    uZoom: { value: params.zoom },
    uColor1: { value: new THREE.Vector3(...hexToRgb(params.color1)) },
    uColor2: { value: new THREE.Vector3(...hexToRgb(params.color2)) },
    uColor3: { value: new THREE.Vector3(...hexToRgb(params.color3)) },
  };
}

function setColorUniform(uniform, hex) {
  uniform.value.set(...hexToRgb(hex));
}

function setupGui(params, uniforms) {
  if (!window.dat || !window.dat.GUI) {
    console.warn('dat.GUI を読み込めませんでした。');
    return;
  }

  const gui = new window.dat.GUI({ name: 'GRAINIENT_PARAMS', width: 320 });

  const bindNumber = (folder, key, min, max, step, uniformName) => {
    folder
      .add(params, key, min, max, step)
      .onChange(value => {
        uniforms[uniformName].value = Number(value);
      });
  };

  const bindCenter = (folder, key, axis) => {
    folder
      .add(params, key, -1, 1, 0.001)
      .onChange(value => {
        uniforms.uCenterOffset.value[axis] = Number(value);
      });
  };

  const colors = gui.addFolder('Colors');
  colors
    .addColor(params, 'color1')
    .name('color1')
    .onChange(value => setColorUniform(uniforms.uColor1, value));
  colors
    .addColor(params, 'color2')
    .name('color2')
    .onChange(value => setColorUniform(uniforms.uColor2, value));
  colors
    .addColor(params, 'color3')
    .name('color3')
    .onChange(value => setColorUniform(uniforms.uColor3, value));
  colors.open();

  const animation = gui.addFolder('Animation');
  bindNumber(animation, 'timeSpeed', 0, 3, 0.01, 'uTimeSpeed');
  bindNumber(animation, 'warpSpeed', 0, 5, 0.01, 'uWarpSpeed');
  bindNumber(animation, 'rotationAmount', 0, 1000, 1, 'uRotationAmount');
  animation.open();

  const warp = gui.addFolder('Warp');
  bindNumber(warp, 'warpStrength', 0.001, 4, 0.001, 'uWarpStrength');
  bindNumber(warp, 'warpFrequency', 0, 12, 0.01, 'uWarpFrequency');
  bindNumber(warp, 'warpAmplitude', 1, 150, 0.1, 'uWarpAmplitude');
  bindNumber(warp, 'noiseScale', 0, 6, 0.01, 'uNoiseScale');
  warp.open();

  const blend = gui.addFolder('Blend');
  bindNumber(blend, 'colorBalance', -1, 1, 0.001, 'uColorBalance');
  bindNumber(blend, 'blendAngle', -180, 180, 1, 'uBlendAngle');
  bindNumber(blend, 'blendSoftness', 0, 0.5, 0.001, 'uBlendSoftness');
  blend.open();

  const grain = gui.addFolder('Grain');
  bindNumber(grain, 'grainAmount', 0, 0.2, 0.001, 'uGrainAmount');
  bindNumber(grain, 'grainScale', 0.001, 4, 0.001, 'uGrainScale');
  grain
    .add(params, 'grainAnimated')
    .name('grainAnimated')
    .onChange(value => {
      uniforms.uGrainAnimated.value = value ? 1 : 0;
    });

  const colorAdjust = gui.addFolder('Color Adjust');
  bindNumber(colorAdjust, 'contrast', 0, 4, 0.01, 'uContrast');
  bindNumber(colorAdjust, 'gamma', 0.1, 4, 0.01, 'uGamma');
  bindNumber(colorAdjust, 'saturation', 0, 2, 0.01, 'uSaturation');

  const camera = gui.addFolder('View');
  bindCenter(camera, 'centerX', 'x');
  bindCenter(camera, 'centerY', 'y');
  bindNumber(camera, 'zoom', 0.1, 2, 0.001, 'uZoom');
}

function init() {
  const container = document.getElementById('container');

  if (!window.THREE) {
    showError('Three.js を読み込めませんでした。ネットワークまたは CDN の読み込み状態を確認してください。');
    return;
  }

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });

  if (!gl) {
    showError('このブラウザでは WebGL2 が利用できません。');
    return;
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    context: gl,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const uniforms = createUniforms(GRAINIENT_PARAMS);
  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms,
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  setupGui(GRAINIENT_PARAMS, uniforms);

  function resize() {
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    renderer.setSize(width, height, false);
    material.uniforms.iResolution.value.set(
      renderer.domElement.width,
      renderer.domElement.height,
    );
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const start = performance.now();

  function render(now) {
    material.uniforms.iTime.value = (now - start) * 0.001;
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

window.addEventListener('DOMContentLoaded', init);
