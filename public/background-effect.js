(() => {
	const canvas = document.querySelector('[data-page-background]');
	if (!(canvas instanceof HTMLCanvasElement)) return;

	const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
	const gl =
		canvas.getContext('webgl', {
			alpha: true,
			antialias: false,
			depth: false,
			premultipliedAlpha: true,
			preserveDrawingBuffer: false,
		}) || canvas.getContext('experimental-webgl');

	if (!gl) return;

	const vertexSource = `
		attribute vec2 aPosition;
		varying vec2 vUv;

		void main() {
			vUv = aPosition * 0.5 + 0.5;
			gl_Position = vec4(aPosition, 0.0, 1.0);
		}
	`;

	const flowSource = `
		precision highp float;

		varying vec2 vUv;

		uniform sampler2D uFlow;
		uniform vec2 uMouse;
		uniform vec2 uVelocity;
		uniform float uAspect;
		uniform float uFalloff;
		uniform float uAlpha;
		uniform float uDissipation;
		uniform float uActive;

		void main() {
			vec4 flow = texture2D(uFlow, vUv);
			flow.rg = mix(vec2(0.5), flow.rg, uDissipation);
			flow.b *= uDissipation;

			if (uActive > 0.5) {
				vec2 cursor = vUv - uMouse;
				cursor.x *= uAspect;

				float falloff = smoothstep(uFalloff, 0.0, length(cursor)) * uAlpha;
				vec2 encodedVelocity = clamp(uVelocity * vec2(1.0, -1.0) * 0.5 + 0.5, 0.0, 1.0);
				float strength = min(1.0, length(uVelocity));
				vec3 stamp = vec3(encodedVelocity, strength);

				flow.rgb = mix(flow.rgb, stamp, falloff);
			}

			gl_FragColor = flow;
		}
	`;

	const renderSource = `
		precision highp float;

		varying vec2 vUv;

		uniform vec2 uResolution;
		uniform float uEffectiveTime;
		uniform float uBlurMix;
		uniform sampler2D uFlow;

		vec3 mod289(vec3 x) {
			return x - floor(x * (1.0 / 289.0)) * 289.0;
		}

		vec2 mod289(vec2 x) {
			return x - floor(x * (1.0 / 289.0)) * 289.0;
		}

		vec3 permute(vec3 x) {
			return mod289(((x * 34.0) + 1.0) * x);
		}

		float snoise(vec2 v) {
			const vec4 C = vec4(
				0.211324865405187,
				0.366025403784439,
				-0.577350269189626,
				0.024390243902439
			);

			vec2 i = floor(v + dot(v, C.yy));
			vec2 x0 = v - i + dot(i, C.xx);
			vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
			vec4 x12 = x0.xyxy + C.xxzz;
			x12.xy -= i1;
			i = mod289(i);

			vec3 p = permute(
				permute(i.y + vec3(0.0, i1.y, 1.0)) +
				i.x +
				vec3(0.0, i1.x, 1.0)
			);

			vec3 m = max(
				0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)),
				0.0
			);
			m = m * m;
			m = m * m;

			vec3 x = 2.0 * fract(p * C.www) - 1.0;
			vec3 h = abs(x) - 0.5;
			vec3 ox = floor(x + 0.5);
			vec3 a0 = x - ox;
			m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

			vec3 g;
			g.x = a0.x * x0.x + h.x * x0.y;
			g.yz = a0.yz * x12.xz + h.yz * x12.yw;
			return 130.0 * dot(m, g);
		}

		float grain(vec2 uv, float time) {
			vec2 seed = uv * (uResolution * 0.35) + time;
			return fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453);
		}

		void main() {
			vec2 uv = vUv;
			float t = uEffectiveTime;

			vec4 flow = texture2D(uFlow, uv);
			vec2 flowVector = (flow.rg * 2.0 - 1.0) * 0.5;
			float flowStrength = flow.b;

			vec2 offset = vec2(
				snoise(uv * 1.0 + t * 0.05),
				snoise(uv * 1.0 - t * 0.03 + 100.0)
			) * 0.4;

			vec2 offset2 = vec2(
				snoise(uv * 0.65 + t * 0.05),
				snoise(uv * 0.65 - t * 0.06 + 50.0)
			) * 0.16;

			vec2 distortedUv = uv + flowVector + offset + offset2;

			float shape1 = snoise(distortedUv * 1.2 + t * 0.12);
			float shape2 = snoise(distortedUv * 0.7 - t * 0.10 + vec2(50.0, 30.0));
			float wave = snoise(uv * 0.5 + t * 0.06) * 0.3;

			float combined = shape1 * 0.55 + shape2 * 0.45;
			combined += wave;

			float depth = snoise(distortedUv * 0.4 - t * 0.05);
			combined += depth * 0.4;

			combined = combined * 0.5 + 0.5;
			combined = smoothstep(0.3, 0.7, combined);

			float blur = snoise(distortedUv * 0.65 + t * 0.05) * 0.5 + 0.5;

			float finalShape = mix(combined, blur, uBlurMix);
			finalShape = smoothstep(0.2, 0.82, finalShape);

			vec3 topColor = vec3(1.0, 0.6, 0.4);
			vec3 midColor = vec3(1.0, 0.5, 0.41);
			vec3 bottomColor = vec3(1.0, 0.37, 0.38);
			vec3 highlightColor = vec3(1.0, 0.84, 0.64);

			float verticalBlend = smoothstep(0.0, 1.0, 1.0 - uv.y + flowVector.y * 0.18);
			vec3 base = mix(bottomColor, topColor, verticalBlend);
			base = mix(base, midColor, smoothstep(0.25, 0.75, finalShape));

			float luminous = smoothstep(0.35, 0.95, finalShape + flowStrength * 0.12);
			vec3 color = mix(base * 0.78, highlightColor, luminous * 0.42);

			float vignette = length(uv - 0.5);
			vignette = 1.0 - smoothstep(0.32, 1.08, vignette);
			color *= mix(0.76, 1.0, vignette);

			float grainValue = grain(uv, uEffectiveTime * 28.0);
			color += (grainValue - 0.5) * 0.03;
			color += flowStrength * 0.045;

			gl_FragColor = vec4(color, 1.0);
		}
	`;

	const compileShader = (type, source) => {
		const shader = gl.createShader(type);
		if (!shader) return null;
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			console.warn(gl.getShaderInfoLog(shader));
			gl.deleteShader(shader);
			return null;
		}
		return shader;
	};

	const createProgram = (vertex, fragment) => {
		const vertexShader = compileShader(gl.VERTEX_SHADER, vertex);
		const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragment);
		if (!vertexShader || !fragmentShader) return null;

		const program = gl.createProgram();
		if (!program) return null;

		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.warn(gl.getProgramInfoLog(program));
			gl.deleteProgram(program);
			return null;
		}

		return program;
	};

	const createTexture = (width, height, data = null) => {
		const texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			width,
			height,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			data
		);
		return texture;
	};

	const createFramebuffer = (texture) => {
		const framebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
		return framebuffer;
	};

	const fullScreenBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, fullScreenBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

	const flowProgram = createProgram(vertexSource, flowSource);
	const renderProgram = createProgram(vertexSource, renderSource);
	if (!flowProgram || !renderProgram) return;

	const lookups = new Map();
	const getUniform = (program, name) => {
		const key = `${name}:${program}`;
		if (!lookups.has(key)) {
			lookups.set(key, gl.getUniformLocation(program, name));
		}
		return lookups.get(key);
	};

	const bindPosition = (program) => {
		const location = gl.getAttribLocation(program, 'aPosition');
		gl.bindBuffer(gl.ARRAY_BUFFER, fullScreenBuffer);
		gl.enableVertexAttribArray(location);
		gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
	};

	const flowSize = 128;
	const initialFlow = new Uint8Array(flowSize * flowSize * 4);
	for (let index = 0; index < initialFlow.length; index += 4) {
		initialFlow[index] = 128;
		initialFlow[index + 1] = 128;
		initialFlow[index + 2] = 0;
		initialFlow[index + 3] = 255;
	}

	const flowFront = {
		texture: createTexture(flowSize, flowSize, initialFlow),
	};
	flowFront.framebuffer = createFramebuffer(flowFront.texture);

	const flowBack = {
		texture: createTexture(flowSize, flowSize, initialFlow),
	};
	flowBack.framebuffer = createFramebuffer(flowBack.texture);

	let width = 0;
	let height = 0;
	let dpr = 1;
	let currentTime = 0;
	let effectiveTime = 0;
	let blurMix = 0.1;
	let raf = 0;
	let lastRenderTime = 0;
	const frameInterval = 1000 / 30;
	const target = { x: 0.5, y: 0.5 };
	const pointer = { x: 0.5, y: 0.5 };
	const lastPointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
	const velocity = { x: 0, y: 0 };
	let lastFrame = performance.now();
	let hasPointer = false;
	let isVisible = document.visibilityState !== 'hidden';

	const swapFlow = () => {
		const texture = flowFront.texture;
		const framebuffer = flowFront.framebuffer;
		flowFront.texture = flowBack.texture;
		flowFront.framebuffer = flowBack.framebuffer;
		flowBack.texture = texture;
		flowBack.framebuffer = framebuffer;
	};

	const resize = () => {
		dpr = Math.min(window.devicePixelRatio || 1, 1.25);
		width = window.innerWidth;
		height = window.innerHeight;
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
		gl.viewport(0, 0, canvas.width, canvas.height);
	};

	const updatePointer = (clientX, clientY) => {
		target.x = clientX / Math.max(width, 1);
		target.y = 1 - clientY / Math.max(height, 1);

		const now = performance.now();
		const delta = Math.max(now - lastFrame, 16.0);
		velocity.x = (clientX - lastPointer.x) / delta * 0.85;
		velocity.y = (clientY - lastPointer.y) / delta * 0.85;
		lastPointer.x = clientX;
		lastPointer.y = clientY;
		hasPointer = true;
	};

	const renderFlow = () => {
		gl.useProgram(flowProgram);
		bindPosition(flowProgram);
		gl.bindFramebuffer(gl.FRAMEBUFFER, flowBack.framebuffer);
		gl.viewport(0, 0, flowSize, flowSize);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, flowFront.texture);
		gl.uniform1i(getUniform(flowProgram, 'uFlow'), 0);
		gl.uniform2f(getUniform(flowProgram, 'uMouse'), pointer.x, pointer.y);
		gl.uniform2f(getUniform(flowProgram, 'uVelocity'), velocity.x, velocity.y);
		gl.uniform1f(getUniform(flowProgram, 'uAspect'), width / Math.max(height, 1));
		gl.uniform1f(getUniform(flowProgram, 'uFalloff'), 0.16);
		gl.uniform1f(getUniform(flowProgram, 'uAlpha'), 0.34);
		gl.uniform1f(getUniform(flowProgram, 'uDissipation'), 0.985);
		gl.uniform1f(getUniform(flowProgram, 'uActive'), hasPointer ? 1 : 0);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		swapFlow();
	};

	const renderScene = () => {
		gl.useProgram(renderProgram);
		bindPosition(renderProgram);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, flowFront.texture);
		gl.uniform1i(getUniform(renderProgram, 'uFlow'), 0);
		gl.uniform2f(getUniform(renderProgram, 'uResolution'), width, height);
		gl.uniform1f(getUniform(renderProgram, 'uEffectiveTime'), effectiveTime);
		gl.uniform1f(getUniform(renderProgram, 'uBlurMix'), blurMix);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	};

	const frame = (time) => {
		if (!isVisible) return;

		if (!reducedMotionQuery.matches && time - lastRenderTime < frameInterval) {
			raf = window.requestAnimationFrame(frame);
			return;
		}
		lastRenderTime = time;

		const delta = Math.min((time - lastFrame) / 1000, 0.04);
		lastFrame = time;

		pointer.x += (target.x - pointer.x) * 0.14;
		pointer.y += (target.y - pointer.y) * 0.14;

		if (!hasPointer) {
			velocity.x *= 0.92;
			velocity.y *= 0.92;
		}

		currentTime += delta;
		const intensity = Math.min(8, 1 + Math.hypot(velocity.x, velocity.y) * 4.5);
		effectiveTime += delta * 0.42 * intensity;
		const nextBlurMix = Math.max(0.16, Math.min(0.46, 0.18 + (intensity - 1) * 0.035));
		blurMix += (nextBlurMix - blurMix) * 0.08;

		renderFlow();
		renderScene();

		if (!reducedMotionQuery.matches) {
			raf = window.requestAnimationFrame(frame);
		}
	};

	const start = () => {
		window.cancelAnimationFrame(raf);
		resize();
		lastFrame = performance.now();
		lastRenderTime = 0;
		frame(lastFrame);
	};

	window.addEventListener('resize', start);
	window.addEventListener(
		'pointermove',
		(event) => {
			updatePointer(event.clientX, event.clientY);
			if (reducedMotionQuery.matches) start();
		},
		{ passive: true }
	);
	window.addEventListener(
		'touchmove',
		(event) => {
			const touch = event.touches[0];
			if (!touch) return;
			updatePointer(touch.clientX, touch.clientY);
			if (reducedMotionQuery.matches) start();
		},
		{ passive: true }
	);
	window.addEventListener('pointerleave', () => {
		hasPointer = false;
	});
	document.addEventListener('mouseout', (event) => {
		if (!event.relatedTarget || event.relatedTarget.nodeName === 'HTML') {
			hasPointer = false;
		}
	});
	document.addEventListener('visibilitychange', () => {
		isVisible = document.visibilityState !== 'hidden';
		if (isVisible) start();
		else window.cancelAnimationFrame(raf);
	});
	reducedMotionQuery.addEventListener('change', start);

	start();
})();
