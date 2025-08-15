
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const hero = document.getElementById('hero');
const canvas = document.getElementById('hero-canvas');

let scene, camera, renderer, points, positions, velocities, targets, forming = false;
let particleCount = 6000;       // adjust if you need more/less
const bounds = 180;             // random float bounds
const speed = 0.25;             // wander speed
const arriveStrength = 0.08;    // how aggressively particles seek letters
const textString = "ALIEN FORK";
const fontFamily = "900 180px Roboto"; // heavy weight for better sampling

init();
animate();

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, hero.clientWidth / hero.clientHeight, 1, 2000);
    camera.position.set(0, 0, 420);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(hero.clientWidth, hero.clientHeight);

    // Foggy background vibe (subtle)
    scene.fog = new THREE.FogExp2(0x0b0b10, 0.002);

    // Particles geometry
    positions = new Float32Array(particleCount * 3);
    velocities = new Float32Array(particleCount * 3);
    targets = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3 + 0] = (Math.random() * 2 - 1) * bounds;
        positions[i3 + 1] = (Math.random() * 2 - 1) * bounds * 0.6;
        positions[i3 + 2] = (Math.random() * 2 - 1) * bounds;

        velocities[i3 + 0] = (Math.random() * 2 - 1) * speed;
        velocities[i3 + 1] = (Math.random() * 2 - 1) * speed;
        velocities[i3 + 2] = (Math.random() * 2 - 1) * speed;

        targets[i3 + 0] = positions[i3 + 0]; // start with current as target
        targets[i3 + 1] = positions[i3 + 1];
        targets[i3 + 2] = 0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        size: 1.8,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
    });

    points = new THREE.Points(geometry, material);
    scene.add(points);

    // Precompute text target points
    setTextTargets();

    // Interaction
    hero.addEventListener('pointerenter', () => forming = true);
    hero.addEventListener('pointerleave', () => forming = false);

    // Resize
    new ResizeObserver(onResize).observe(hero);
}

function onResize() {
    const w = hero.clientWidth, h = hero.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    // Re-generate targets so the text scales to the new size
    setTextTargets();
}

function setTextTargets() {
    const w = Math.floor(hero.clientWidth * 0.9);
    const h = Math.floor(Math.max(260, hero.clientHeight * 0.45));
    const gap = Math.max(3, Math.floor(w / 260)); // sampling density relative to width

    const pts = sampleTextToPoints(textString, fontFamily, w, h, gap);
    const needed = particleCount;

    // Map 2D text points into 3D target array centered at (0,0,0)
    // If fewer text points than particles, re-use randomly; if more, subsample
    for (let i = 0; i < needed; i++) {
        const src = pts[i % pts.length];
        const i3 = i * 3;
        targets[i3 + 0] = src.x;
        targets[i3 + 1] = src.y;
        targets[i3 + 2] = (Math.random() * 2 - 1) * 6; // tiny depth jitter
    }
}

function sampleTextToPoints(text, fontCSS, width, height, gap) {
    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    const ctx = off.getContext('2d');

    // Background transparent, draw bright text
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.font = fontCSS;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Fit text: adjust font size to width
    const baseSize = /(\d+)px/.exec(fontCSS)?.[1] ?? 180;
    const scale = Math.min(1, (width * 0.9) / ctx.measureText(text).width);
    const newSize = Math.max(90, Math.floor(baseSize * scale));
    ctx.font = fontCSS.replace(/\d+px/, newSize + "px");

    ctx.fillText(text, width / 2, height / 2);

    const data = ctx.getImageData(0, 0, width, height).data;
    const points = [];
    for (let y = 0; y < height; y += gap) {
        for (let x = 0; x < width; x += gap) {
            const idx = (y * width + x) * 4 + 3; // alpha channel
            if (data[idx] > 128) {
                // Convert canvas coords to world coords centered around 0
                const wx = (x - width / 2) * 0.5;       // 0.5 = scale factor; tweak for size
                const wy = (height / 2 - y) * 0.5;
                points.push({ x: wx, y: wy });
            }
        }
    }
    // Avoid empty edge-case
    return points.length ? points : [{ x: 0, y: 0 }];
}

function animate() {
    requestAnimationFrame(animate);

    const pos = points.geometry.attributes.position.array;
    const tgs = targets;
    const vels = velocities;

    if (forming) {
        // Seek targets
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            pos[i3 + 0] += (tgs[i3 + 0] - pos[i3 + 0]) * arriveStrength;
            pos[i3 + 1] += (tgs[i3 + 1] - pos[i3 + 1]) * arriveStrength;
            pos[i3 + 2] += (tgs[i3 + 2] - pos[i3 + 2]) * arriveStrength;
            // Small jitter to keep it alive
            pos[i3 + 0] += (Math.random() - 0.5) * 0.06;
            pos[i3 + 1] += (Math.random() - 0.5) * 0.06;
            pos[i3 + 2] += (Math.random() - 0.5) * 0.02;
        }
    } else {
        // Wander & bounce in bounds
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            vels[i3 + 0] += (Math.random() - 0.5) * 0.01;
            vels[i3 + 1] += (Math.random() - 0.5) * 0.01;
            vels[i3 + 2] += (Math.random() - 0.5) * 0.005;

            pos[i3 + 0] += vels[i3 + 0];
            pos[i3 + 1] += vels[i3 + 1];
            pos[i3 + 2] += vels[i3 + 2];

            // Soft bounds
            for (let k = 0; k < 3; k++) {
                const limit = k === 1 ? bounds * 0.6 : bounds;
                if (pos[i3 + k] > limit || pos[i3 + k] < -limit) {
                    vels[i3 + k] *= -0.98;
                }
            }
        }
    }

    points.geometry.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
}