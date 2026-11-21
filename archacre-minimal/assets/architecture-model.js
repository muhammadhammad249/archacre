(() => {
  const showcase = document.querySelector(".architecture-showcase");
  if (!showcase) return;

  const canvas = showcase.querySelector(".architecture-canvas");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const SUN = unit([-0.53, 0.88, 0.66]);
  const SHADOW_SIZE = 1024;
  const TAU = 2 * Math.PI;

  function unit(vector) {
    const length = Math.hypot(...vector);
    return vector.map(value => value / length);
  }

  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  function rotateX(vector, angle) {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const [x, y, z] = vector;
    return [x, y * cosine - z * sine, y * sine + z * cosine];
  }

  function orthographicView(direction, width, height, spin = 0, depthRange = 24) {
    const horizontal = unit([direction[2], 0, -direction[0]]);
    const right = rotateX(horizontal, -spin).map(value => value / width);
    const up = rotateX(cross(direction, horizontal), -spin).map(value => value / height);
    const depth = rotateX(direction, -spin).map(value => -value / depthRange);
    return new Float32Array([
      right[0], up[0], depth[0], 0,
      right[1], up[1], depth[1], 0,
      right[2], up[2], depth[2], 0,
      0, 0, 0, 1,
    ]);
  }

  function buildModel(length) {
    const vertices = [];
    const turns = (length / 13) * TAU;
    const segments = Math.ceil(length * 8);
    const enamel = [0.54, 0.115, 0.223, 0.48];
    const lining = [0.39, 0.080, 0.155, 0.32];
    const trim = [0.77, 0.299, 0.390, 0.77];
    const bevel = [0.65, 0.179, 0.298, 0.64];
    const brace = [0.61, 0.224, 0.322, 0.57];
    const ribbon = [
      [-0.43, -0.055], [-0.32, -0.145], [0.30, -0.145], [0.43, -0.056],
      [0.43, 0.056], [0.30, 0.145], [-0.32, 0.145], [-0.43, 0.055],
    ];
    const ribbonFaces = [bevel, enamel, bevel, trim, bevel, lining, bevel, trim];

    function offset(point, direction, amount) {
      return point.map((value, index) => value + direction[index] * amount);
    }

    function direction(from, to) {
      return to.map((value, index) => value - from[index]);
    }

    function face(points, material) {
      const [a, b, c] = points;
      const normal = unit(cross(direction(a, b), direction(a, c)));
      for (let index = 1; index < points.length - 1; index++) {
        for (const position of [a, points[index], points[index + 1]]) {
          vertices.push(...position, ...normal, ...material);
        }
      }
    }

    function frame(t, phase) {
      const theta = 0.55 + turns * t + phase;
      const radius = 2.08 + 0.24 * Math.sin(Math.PI * t);
      const radial = [0, Math.sin(theta), Math.cos(theta)];
      const tangent = [length, radius * turns * radial[2], -radius * turns * radial[1]];
      const edge = unit(cross(tangent, radial));
      return { center: offset([(t - 0.5) * length, 0, 0], radial, radius), radial, edge };
    }

    function profile(t, phase, contour) {
      const { center, radial, edge } = frame(t, phase);
      return contour.map(([r, e]) => offset(offset(center, radial, r), edge, e));
    }

    function loft(contour, phase, materials) {
      let section = profile(0, phase, contour);
      face([...section].reverse(), bevel);
      for (let step = 1; step <= segments; step++) {
        const next = profile(step / segments, phase, contour);
        for (let index = 0; index < contour.length; index++) {
          const edge = (index + 1) % contour.length;
          face([section[index], section[edge], next[edge], next[index]], materials[index % materials.length]);
        }
        section = next;
      }
      face(section, bevel);
    }

    // A folded steel ribbon and matching edge rail form each strand.
    const rail = [
      [0.448, -0.035], [0.492, -0.056], [0.533, -0.034],
      [0.533, 0.034], [0.492, 0.056], [0.448, 0.035],
    ];
    for (const phase of [0, Math.PI]) {
      loft(ribbon, phase, ribbonFaces);
      loft(rail, phase, [bevel, trim, trim]);
    }

    // Cross-members meet the ribbons at inset collars, leaving the center open.
    function strut(start, end, width, material) {
      const axis = unit(direction(start, end));
      const side = unit(cross(axis, [1, 0, 0]));
      const ring = Array.from({ length: 6 }, (_, index) => {
        const angle = TAU * index / 6;
        return [Math.cos(angle) * width, Math.sin(angle) * width * 0.85];
      });
      const section = point => ring.map(([across, rise]) => offset(offset(point, [1, 0, 0], across), side, rise));
      const a = section(start);
      const b = section(end);
      for (let index = 0; index < ring.length; index++) {
        const next = (index + 1) % ring.length;
        face([a[index], a[next], b[next], b[index]], material);
      }
      face([...a].reverse(), material);
      face(b, material);
    }

    const endInset = 0.62 / length;
    const tieCount = Math.round(length);
    for (let index = 0; index < tieCount; index++) {
      const t = endInset + index * (1 - 2 * endInset) / (tieCount - 1);
      const a = frame(t, 0);
      const b = frame(t, Math.PI);
      const left = offset(a.center, a.radial, -0.37);
      const right = offset(b.center, b.radial, -0.37);
      strut(left, right, 0.069, brace);
      strut(left, offset(left, a.radial, -0.26), 0.104, bevel);
      strut(right, offset(right, b.radial, -0.26), 0.104, bevel);
      for (const { center, radial } of [a, b]) {
        strut(offset(center, radial, 0.39), offset(center, radial, 0.51), 0.038, trim);
      }
    }

    return new Float32Array(vertices);
  }

  const shadowVertex = `#version 300 es
    layout(location=0) in vec3 position;
    uniform mat4 lightView;
    void main() { gl_Position = lightView * vec4(position, 1.0); }`;

  const modelVertex = `#version 300 es
    layout(location=0) in vec3 position;
    layout(location=1) in vec3 normal;
    layout(location=2) in vec4 material;
    uniform mat4 view;
    uniform mat4 lightView;
    out vec3 point;
    flat out vec3 surfaceNormal;
    flat out vec4 surface;
    out vec3 shadowPoint;
    void main() {
      vec4 vertex = vec4(position, 1.0);
      gl_Position = view * vertex;
      point = position;
      surfaceNormal = normal;
      surface = material;
      shadowPoint = (lightView * vertex).xyz * 0.5 + 0.5;
    }`;

  const modelFragment = `#version 300 es
    precision highp float;
    uniform vec3 sun;
    uniform vec3 camera;
    uniform highp sampler2DShadow shadowMap;
    in vec3 point;
    flat in vec3 surfaceNormal;
    flat in vec4 surface;
    in vec3 shadowPoint;
    out vec4 color;

    float noise(vec3 p) {
      return fract(sin(dot(p, vec3(12.9898, 78.233, 47.321))) * 43758.5453);
    }

    void main() {
      vec3 normal = normalize(surfaceNormal);
      float diffuse = max(dot(normal, sun), 0.0);
      float depth = shadowPoint.z - mix(0.00185, 0.00065, diffuse);
      vec3 shadow = vec3(shadowPoint.xy, depth);
      const float step = 1.6 / ${SHADOW_SIZE}.0;
      float light = 0.25 * (
        texture(shadowMap, shadow + vec3(-step, -step, 0.0)) +
        texture(shadowMap, shadow + vec3( step, -step, 0.0)) +
        texture(shadowMap, shadow + vec3(-step,  step, 0.0)) +
        texture(shadowMap, shadow + vec3( step,  step, 0.0))
      );

      float grain = noise(floor(point * 118.0)) - 0.5;
      float ambient = 0.62 + 0.1 * max(dot(normal, normalize(vec3(0.35, 0.24, -0.65))), 0.0);
      float highlight = pow(max(dot(normal, normalize(sun + camera)), 0.0), 16.0);
      float rim = pow(1.0 - abs(dot(normal, camera)), 3.0);
      vec3 shade = surface.rgb * (ambient + 0.57 * diffuse * mix(0.24, 1.0, light) + grain * 0.03);
      shade += vec3(0.44, 0.18, 0.23) * surface.a * (0.56 * highlight * light + 0.21 * rim);
      color = vec4(shade, 1.0);
    }`;

  function createProgram(gl, vertex, fragment) {
    const program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    return program;
  }

  function createRenderer(gl) {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    for (const [index, size, offset] of [[0, 3, 0], [1, 3, 12], [2, 4, 24]]) {
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(index, size, gl.FLOAT, false, 40, offset);
    }

    const shadowProgram = createProgram(gl, shadowVertex, "#version 300 es\nvoid main() {}");
    const shadowViewUniform = gl.getUniformLocation(shadowProgram, "lightView");
    const depth = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depth);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    for (const [property, value] of [
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE], [gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL],
    ]) gl.texParameteri(gl.TEXTURE_2D, property, value);

    const shadowFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("The model's shadow map is unavailable.");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.DEPTH_TEST);

    const program = createProgram(gl, modelVertex, modelFragment);
    gl.useProgram(program);
    gl.uniform3fv(gl.getUniformLocation(program, "sun"), SUN);
    gl.uniform1i(gl.getUniformLocation(program, "shadowMap"), 0);
    const viewUniform = gl.getUniformLocation(program, "view");
    const cameraUniform = gl.getUniformLocation(program, "camera");
    const lightViewUniform = gl.getUniformLocation(program, "lightView");

    let previousAspect;
    let vertexCount;
    let halfHeight;
    let halfWidth;
    let direction;

    // Extend the helix with more turns as the band widens.
    function fitModel(aspect) {
      halfHeight = Math.max(3.64, 9 / aspect);
      halfWidth = halfHeight * aspect;
      const length = 1.96 * halfWidth - 0.34;
      const yaw = Math.min(0.11, 0.62 / aspect);
      const pitch = 0.10;
      direction = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];

      const mesh = buildModel(length);
      vertexCount = mesh.length / 10;
      gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);

      const lightView = orthographicView(SUN, 3 + length * 0.50, 3 + length * 0.25, 0, Math.max(24, 3 + length * 0.26));
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(shadowProgram);
      gl.uniformMatrix4fv(shadowViewUniform, false, lightView);
      gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      gl.useProgram(program);
      gl.uniformMatrix4fv(lightViewUniform, false, lightView);
    }

    return elapsed => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
      const height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
      if (width !== canvas.width || height !== canvas.height) {
        canvas.width = width;
        canvas.height = height;
      }
      const aspect = width / height;
      if (aspect !== previousAspect) {
        fitModel(aspect);
        previousAspect = aspect;
      }
      const spin = (elapsed % 18500) / 18500 * TAU;
      const view = orthographicView(direction, halfWidth, halfHeight, spin);
      gl.viewport(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(viewUniform, false, view);
      gl.uniform3fv(cameraUniform, rotateX(direction, -spin));
      gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    };
  }

  let renderer;
  let attempted = false;
  let inView = false;
  let frameId = 0;
  let lastFrame;
  let elapsed = 0;

  function tick(time) {
    frameId = 0;
    if (lastFrame !== undefined) elapsed += Math.min(50, time - lastFrame);
    renderer(elapsed);
    lastFrame = time;
    frameId = requestAnimationFrame(tick);
  }

  function updateAnimation() {
    if (renderer && inView && !reducedMotion.matches && !document.hidden) {
      if (!frameId) frameId = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frameId);
      frameId = 0;
      lastFrame = undefined;
    }
  }

  function showModel() {
    if (attempted || !inView) return;
    attempted = true;
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
    if (!gl) return;
    try {
      renderer = createRenderer(gl);
      renderer(elapsed);
      showcase.classList.add("is-rendered");
    } catch (error) {
      renderer = undefined;
      console.warn("The architectural model could not be rendered.", error);
    }
  }

  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    renderer = undefined;
    showcase.classList.remove("is-rendered");
    updateAnimation();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    attempted = false;
    showModel();
    updateAnimation();
  });
  reducedMotion.addEventListener("change", updateAnimation);
  document.addEventListener("visibilitychange", updateAnimation);

  new ResizeObserver(() => {
    if (renderer && inView && !frameId) renderer(elapsed);
  }).observe(canvas);

  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) {
      if (!renderer) showModel();
      else if (!frameId) renderer(elapsed);
    }
    updateAnimation();
  }).observe(showcase);
})();
