// hero.js  — mobile-optimized & battery-friendly
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const hero = document.getElementById("hero");
const canvas = document.getElementById("hero-canvas");

let rszT;
window.addEventListener("resize", () => { clearTimeout(rszT); rszT = setTimeout(sizeHero, 80); });
window.addEventListener("orientationchange", () => setTimeout(sizeHero, 200));

let shouldRender = true;
let tabHidden = false;
let last = 0;
let ioSeen = false; // becomes true after IntersectionObserver fires at least once

// Tap / press detection
const MOVE_TOL_PX = 12; // tiny drift still counts as tap
let pDown = false;
let tapEligible = false;
let suppressClickOnce = false;
let startX = 0, startY = 0, startTime = 0;

// --- Mobile/perf guards
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// cap DPR on mobile to keep fragment load under control
const DPR = Math.min(isMobile ? 1.5 : 2, window.devicePixelRatio || 1);
// Input mode helpers
const isTouchLike = window.matchMedia("(pointer:coarse)").matches || navigator.maxTouchPoints > 0;

// Long-press state
const LONG_PRESS_MS = 350; // 300–450 feels good
let lpTimer = null;
let longPressFired = false;
let formingReleaseTimer = null;

// dial particle count to device; cut further if reduced motion
let particleCount = isMobile ? 2800 : 6000;
if (reduceMotion) particleCount = Math.floor(particleCount * 0.4);

const bounds = 180;
const speed = 0.25;
const arriveStrength = 0.08;

// dynamic text + shimmer control
let currentText = "ALIEN FORK";
const nextText = "FORK YOUR REALITY";
const neonGreen = getComputedStyle(document.documentElement).getPropertyValue('--accent')?.trim() || "#00FF00";
let shimmerUntil = 0;
let shimmerSecs = 1.0; // slightly shorter on mobile
let phases;

// one-way promotion state (desktop click or mobile short tap)
let hasClicked = false;
function applyTextAndColor() {
    setTextTargets();
    points.material.color = new THREE.Color(hasClicked ? neonGreen : 0xffffff);
    shimmerUntil = performance.now() + shimmerSecs * 1000;
}
function promoteOnce() {
    if (hasClicked) return;
    hasClicked = true;
    currentText = nextText;
    applyTextAndColor();
}

let scene, camera, renderer, points, positions, velocities, targets, forming = false;

init();
animate();

function init() {
    // ✅ ensure hero has pixels before sizing renderer (iOS can report 0 early)
    setHeroPixelHeight();

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0b10, 0.002);

    const aspect0 = (hero.clientWidth && hero.clientHeight) ? (hero.clientWidth / hero.clientHeight) : 1;
    camera = new THREE.PerspectiveCamera(55, aspect0, 1, 2000);
    camera.position.set(0, 0, 420);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(DPR);
    const w0 = hero.clientWidth || window.innerWidth;
    const h0 = hero.clientHeight || Math.max(320, window.innerHeight - (document.querySelector('header')?.offsetHeight || 0));
    renderer.setSize(w0, h0, true);

    positions = new Float32Array(particleCount * 3);
    velocities = new Float32Array(particleCount * 3);
    targets = new Float32Array(particleCount * 3);
    phases = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3 + 0] = (Math.random() * 2 - 1) * bounds;
        positions[i3 + 1] = (Math.random() * 2 - 1) * bounds * 0.6;
        positions[i3 + 2] = (Math.random() * 2 - 1) * bounds;

        velocities[i3 + 0] = (Math.random() * 2 - 1) * speed;
        velocities[i3 + 1] = (Math.random() * 2 - 1) * speed;
        velocities[i3 + 2] = (Math.random() * 2 - 1) * speed;

        targets[i3 + 0] = positions[i3 + 0];
        targets[i3 + 1] = positions[i3 + 1];
        targets[i3 + 2] = 0;

        phases[i] = Math.random() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        size: isMobile ? 2.0 : 1.8, // slightly larger so fewer points still feel dense
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        color: 0xffffff
    });

    points = new THREE.Points(geometry, material);
    scene.add(points);

    setTextTargets(); // default text (white)

    ["contextmenu", "selectstart", "dragstart"].forEach(type => {
        hero.addEventListener(type, e => e.preventDefault());
    });

    // --- Desktop hover shows text; color depends on click history
    if (!isTouchLike) {
        hero.addEventListener("pointerenter", () => {
            forming = true;
            points.material.color = new THREE.Color(hasClicked ? neonGreen : 0xffffff);
        });
        hero.addEventListener("pointerleave", () => { forming = false; });
    }

    // --- TOUCH: long-press/scroll = show text, short tap = promote to green nextText
    hero.addEventListener("pointerdown", (ev) => {
        if (!isTouchLike) return;

        pDown = true;
        tapEligible = true;            // assume tap until proven otherwise
        suppressClickOnce = false;
        longPressFired = false;

        startX = ev.clientX;
        startY = ev.clientY;
        startTime = performance.now();

        if (lpTimer) clearTimeout(lpTimer);
        lpTimer = window.setTimeout(() => {
            if (!pDown) return;
            longPressFired = true;
            tapEligible = false;         // not a tap anymore
            suppressClickOnce = true;    // stop the trailing click
            forming = true;              // enter forming
            points.material.color = new THREE.Color(hasClicked ? neonGreen : 0xffffff);
            shimmerUntil = performance.now() + shimmerSecs * 1000;
        }, LONG_PRESS_MS);
    });

    hero.addEventListener("pointermove", (ev) => {
        if (!isTouchLike || !pDown) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const dist = Math.hypot(dx, dy);

        // Any real pan/scroll => treat as long-press behavior
        if (dist > MOVE_TOL_PX && !longPressFired) {
            longPressFired = true;
            tapEligible = false;
            suppressClickOnce = true;    // prevent click from toggling
            if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
            forming = true;
            points.material.color = new THREE.Color(hasClicked ? neonGreen : 0xffffff);
            shimmerUntil = performance.now() + shimmerSecs * 1000;
        }
    });

    function onPointerEnd(ev) {
        if (!isTouchLike) return;

        pDown = false;
        const elapsed = performance.now() - startTime;
        if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }

        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const dist = Math.hypot(dx, dy);
        const wasLongish = longPressFired || elapsed >= LONG_PRESS_MS || dist > MOVE_TOL_PX;

        if (wasLongish) {
            // keep text briefly then relax
            if (formingReleaseTimer) clearTimeout(formingReleaseTimer);
            formingReleaseTimer = setTimeout(() => { forming = false; }, 500);
        } else if (tapEligible) {
            // short tap => promote to nextText (one-way)
            promoteOnce();
            suppressClickOnce = true; // ignore trailing native click
        }

        tapEligible = false;
        longPressFired = false;
    }
    hero.addEventListener("pointerup", onPointerEnd, { passive: true });
    hero.addEventListener("pointercancel", onPointerEnd, { passive: true });
    hero.addEventListener("pointerleave", onPointerEnd, { passive: true });

    // Single click handler:
    // - On touch, ignore because we handled tap in pointerup (unless browser fires click only).
    // - On desktop, click promotes once.
    hero.addEventListener("click", () => {
        if (isTouchLike) {
            if (suppressClickOnce) { suppressClickOnce = false; return; }
            return; // touch handled in pointerup
        }
        // Desktop click => promote once
        promoteOnce();
    });

    // Resize handling — use dvh-friendly size
    const ro = new ResizeObserver(() => sizeHero());
    ro.observe(hero);
    window.addEventListener("orientationchange", () => setTimeout(sizeHero, 200)); // iOS URL bar settle

    // Pause rendering when hero not visible to save battery
    const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
            ioSeen = true;
            shouldRender = e.isIntersecting;
            if (!shouldRender) renderer.render(scene, camera);
        });
    }, { root: null, threshold: 0.01 });
    io.observe(hero); // start observing ✅

    // Pause when tab hidden
    document.addEventListener("visibilitychange", () => {
        tabHidden = document.hidden;
    });

    // Ensure initial sizing
    sizeHero();
}

// Convert phrases to multi-line on mobile
function multilineForMobile(text) {
    if (!isMobile) return text;
    if (/^ALIEN\s+FORK$/i.test(text)) return "ALIEN\nFORK";
    if (/^FORK\s+YOUR\s+REALITY$/i.test(text)) return "FORK\nYOUR\nREALITY";
    return text.replace(/\s+/g, "\n");
}

function setHeroPixelHeight() {
    const headerEl = document.querySelector('header');
    const headerH = headerEl ? headerEl.offsetHeight : 0;

    const vh = (window.visualViewport && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent))
        ? Math.round(window.visualViewport.height)
        : Math.round(window.innerHeight);

    const targetH = Math.max(320, vh - headerH);
    hero.style.height = targetH + 'px';
}

function sizeHero() {
    setHeroPixelHeight();

    let rect = hero.getBoundingClientRect();
    let w = Math.floor(rect.width);
    let h = Math.floor(rect.height);

    // ✅ fallback if Safari reports 0 during UI transitions
    if (w < 2 || h < 2) {
        w = hero.clientWidth || window.innerWidth;
        h = hero.clientHeight || Math.max(320, window.innerHeight - (document.querySelector('header')?.offsetHeight || 0));
    }

    renderer.setSize(w, h, true);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";

    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    setTextTargets();
}

function setTextTargets() {
    const phrase = multilineForMobile(currentText);

    const wCss = Math.floor(hero.clientWidth); // roomy but safe
    const hCss = Math.floor(hero.clientHeight); // nearly full height

    const area = wCss * hCss;
    const targetPts = Math.min(particleCount, Math.floor(area / 3)); // soft upper bound
    let gapCss = Math.sqrt(area / (targetPts * 1.25));               // 1.25 = density fudge

    // clamps (keep perf/stability across devices)
    gapCss = Math.max(2, Math.min(gapCss, isMobile ? 5 : 7));
    if (reduceMotion) gapCss *= 1.2;
    gapCss = Math.floor(gapCss);

    const pts = sampleTextToPoints(phrase, "900 180px Roboto", wCss, hCss, gapCss);
    const needed = particleCount;

    for (let i = 0; i < needed; i++) {
        const src = pts[i % pts.length];
        const i3 = i * 3;
        targets[i3 + 0] = src.x;
        targets[i3 + 1] = src.y;
        targets[i3 + 2] = (Math.random() * 2 - 1) * 6;
    }
}

// DPR-aware text sampling into points
function sampleTextToPoints(text, fontCSS, widthCss, heightCss, gapCss) {
    const dpr = Math.max(1, Math.min(DPR || window.devicePixelRatio || 1, 3));
    const off = document.createElement("canvas");
    off.width = Math.floor(widthCss * dpr);
    off.height = Math.floor(heightCss * dpr);
    const ctx = off.getContext("2d", { willReadFrequently: true });
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const lines = String(text).split(/\n/);
    const baseSize = parseInt((/(\d+)px/.exec(fontCSS)?.[1] ?? "180"), 10);

    function fitFontSize() {
        const lhFactor = 1.10;           // slightly tight so 3 lines fit
        const targetW = widthCss * 1.0;
        const targetH = heightCss * 1.0; // leave a little breathing room

        let lo = Math.max(42, Math.floor(baseSize * 0.25));
        let hi = Math.max(60, Math.floor(baseSize * 1.2));
        let best = lo;

        for (let it = 0; it < 14; it++) {
            const mid = Math.floor((lo + hi) / 2);
            ctx.font = fontCSS.replace(/\d+px/, mid + "px");
            const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width || 0), 1);
            const blockH = lines.length * mid * lhFactor;
            if (maxLineW <= targetW && blockH <= targetH) { best = mid; lo = mid + 1; }
            else { hi = mid - 1; }
        }
        return best;
    }

    const size = fitFontSize();
    const lh = size * 1.10;
    ctx.font = fontCSS.replace(/\d+px/, size + "px");

    const blockH = lines.length * lh;
    const cx = widthCss / 2;
    const cy = heightCss / 2;

    ctx.clearRect(0, 0, widthCss, heightCss);
    lines.forEach((line, idx) => {
        const y = cy - blockH / 2 + (idx + 0.5) * lh;
        ctx.fillText(line, cx, y);
    });

    const img = ctx.getImageData(0, 0, off.width, off.height).data;
    const step = Math.max(1, Math.floor(gapCss * dpr));
    const pts = [];

    for (let yDp = 0; yDp < off.height; yDp += step) {
        for (let xDp = 0; xDp < off.width; xDp += step) {
            const a = img[(yDp * off.width + xDp) * 4 + 3];
            if (a > 96) {
                const xCss = xDp / dpr, yCss = yDp / dpr;
                const wx = (xCss - widthCss / 2) * 0.5;
                const wy = (heightCss / 2 - yCss) * 0.5;
                pts.push({ x: wx, y: wy });
            }
        }
    }
    return pts.length ? pts : [{ x: 0, y: 0 }];
}

function animate(now = 0) {
    requestAnimationFrame(animate);
    // ✅ before IO fires, always render; after it fires, obey shouldRender
    if ((ioSeen && !shouldRender) || tabHidden) return;

    // Simple frame throttle to ~45fps on mobile, ~60 on desktop
    const minDelta = (reduceMotion || isMobile) ? 1000 / 45 : 1000 / 60;
    if (now - last < minDelta) return;
    last = now;

    const pos = points.geometry.attributes.position.array;
    const tgs = targets;
    const vels = velocities;

    const shimmerActive = now < shimmerUntil;
    const shimmerT = shimmerActive ? 1 - (shimmerUntil - now) / (shimmerSecs * 1000) : 1;
    const ease = shimmerActive ? easeOutExpo(1 - shimmerT) : 0;

    if (shimmerActive) {
        const pulse = 1 + Math.sin(now * 0.02) * 0.35 * (1 - shimmerT);
        points.material.size = (isMobile ? 2.0 : 1.8) * pulse;
        points.material.opacity = 0.95 * (0.85 + 0.15 * Math.sin(now * 0.04));
    } else {
        points.material.size = isMobile ? 2.0 : 1.8;
        points.material.opacity = 0.95;
    }

    if (forming) {
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            pos[i3 + 0] += (tgs[i3 + 0] - pos[i3 + 0]) * arriveStrength;
            pos[i3 + 1] += (tgs[i3 + 1] - pos[i3 + 1]) * arriveStrength;
            pos[i3 + 2] += (tgs[i3 + 2] - pos[i3 + 2]) * arriveStrength;
            pos[i3 + 0] += (Math.random() - 0.5) * 0.06;
            pos[i3 + 1] += (Math.random() - 0.5) * 0.06;
            pos[i3 + 2] += (Math.random() - 0.5) * 0.02;

            if (shimmerActive) {
                const ph = phases[i];
                pos[i3 + 0] += Math.sin(now * 0.02 + ph) * 0.35 * ease;
                pos[i3 + 1] += Math.cos(now * 0.025 + ph * 1.3) * 0.35 * ease;
                pos[i3 + 2] += Math.sin(now * 0.018 + ph * 0.7) * 0.2 * ease;
            }
        }
    } else {
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            vels[i3 + 0] += (Math.random() - 0.5) * 0.01;
            vels[i3 + 1] += (Math.random() - 0.5) * 0.01;
            vels[i3 + 2] += (Math.random() - 0.5) * 0.005;
            pos[i3 + 0] += vels[i3 + 0];
            pos[i3 + 1] += vels[i3 + 1];
            pos[i3 + 2] += vels[i3 + 2];

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

function easeOutExpo(x) {
    return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}
