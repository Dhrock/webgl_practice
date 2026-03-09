const containers = document.querySelectorAll('.container');

containers.forEach((container) => {
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
  const textureUrl = container.querySelector('img').src;
  const mouse = new THREE.Vector2(-1, 0);
  const targetMouse = new THREE.Vector2(-1, 0);

  const uniforms = {
    uTexture: { value: null },
    uTime: { value: 0.0 },
    uMouse: { value: mouse },
    uOriginLeft: { value: container.classList.contains('js-leftSprite') ? 1.0 : 0.0 }
  };

  const texture = new THREE.TextureLoader().load(
    textureUrl,
    (t) => {
      mesh.scale.set(aspect, 1, 1);
      uniforms.uTexture.value = t;
    }
  );
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  // --- 3. Mouse Interaction Setup ---
  container.addEventListener('mouseenter', () => {
    targetMouse.set(1, 0);
  });

  container.addEventListener('mouseleave', () => {
    targetMouse.set(-1, 0);
  });

  // --- 4. ShaderMaterial Creation ---
  const geometry = new THREE.PlaneGeometry(2.5, 2.5, 200, 200);

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
      uniform float uOriginLeft;

      void main() {
        float mousePresence = smoothstep(-1.0, 1.0, uMouse.x);
        float warpedX = vUv.x;
        vec2 warpedUv = vec2(warpedX, vUv.y);

        float numSlices = 31.0;
        float sliceId = floor(warpedX * numSlices);

        // js-leftSprite: 左端(0)基準、通常: 中央基準
        float distFromCenter = mix(
          sliceId - (numSlices - 1.0) / 2.0,
          sliceId,
          uOriginLeft
        );
        float offset = distFromCenter * -0.01 * mousePresence;

        float finalU = warpedUv.x + offset;

        vec2 finalUv = vec2(finalU, vUv.y);

        vec4 color = texture2D(uTexture, finalUv);

        gl_FragColor = vec4(color.rgb, 1.0);
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

    const newAspect = width / height;
    camera.left   = -frustumSize * newAspect / 2;
    camera.right  =  frustumSize * newAspect / 2;
    camera.top    =  frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.updateProjectionMatrix();

    mesh.scale.set(newAspect, 1, 1);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    if (window.devicePixelRatio === 2) {
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
});