/* ============================================
   Mo Brain 3D 🧠✨ - สมองโฮโลแกรม 3 มิติ (Three.js)
   สมองสร้างจากจุดแสง: 2 ซีก + รอยหยัก + สมองน้อย + ก้านสมอง + ระบบลิมบิกด้านใน
   ส่วนที่ทำงานจะสว่างขึ้น และมีกระแสประสาทวิ่งเมื่อโมคิด
   ============================================ */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ลำดับต้องตรงกับ uniform uAct ใน shader
const REGION_KEYS = ['frontal', 'temporal', 'limbic', 'parietal', 'occipital', 'cerebellum', 'brainstem'];

// รอยหยักของสมอง: ผลรวม sine ซ้อนกัน → ridge (1 = สันรอยหยัก, 0 = ร่อง)
function gyri(x, y, z) {
    const n = Math.sin(x * 6.1 + Math.sin(y * 4.3) * 1.7)
        + Math.sin(y * 5.7 + Math.sin(z * 3.9) * 1.9)
        + Math.sin(z * 6.7 + Math.sin(x * 4.1) * 1.5);
    return 1 - Math.abs(n / 3);
}

function randomDir() {
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    return [s * Math.cos(t), u, s * Math.sin(t)];
}

/**
 * สร้างจุดของสมอง → { positions, region, glow, rand, nodes }
 * แกน: x = ซ้าย-ขวา, y = บน-ล่าง, z = หน้า(+)-หลัง(-)
 */
function buildBrain() {
    const pos = [], region = [], glow = [], rand = [];
    const add = (x, y, z, r, g) => { pos.push(x, y, z); region.push(r); glow.push(g); rand.push(Math.random()); };

    // ---- เปลือกสมอง 2 ซีก ----
    for (let i = 0; i < 7000; i++) {
        const side = i % 2 ? 1 : -1;
        const [dx, dy, dz] = randomDir();
        let x = dx * 0.6, y = dy * 0.7, z = dz * 1.02;
        // สมองส่วนหน้าแคบลงนิด ด้านหลังกว้าง
        x *= 1 - 0.12 * Math.max(0, z);
        // ฐานสมองแบน + กลีบขมับยื่นลงด้านข้าง
        if (y < -0.32) y = -0.32 + (y + 0.32) * (Math.abs(dx) > 0.55 && dz > -0.4 && dz < 0.5 ? 0.85 : 0.35);
        const ridge = gyri(x * 1.6 + side, y * 1.6, z * 1.6);
        const k = 1 + 0.07 * (ridge * ridge - 0.4);
        x *= k; y *= k; z *= k;
        x = side * Math.max(0.025, x * side + 0.34); // แยกสองซีก มีร่องตรงกลาง
        const r = z > 0.32 ? 0 : (y < -0.12 && z > -0.62) ? 1 : z < -0.58 ? 4 : 3;
        add(x, y + 0.08, z, r, ridge);
    }

    // ---- สมองน้อย (ด้านหลังล่าง มีลายขวางละเอียด) ----
    for (let i = 0; i < 1700; i++) {
        const [dx, dy, dz] = randomDir();
        const x = dx * 0.52, y = dy * 0.24 - 0.5, z = dz * 0.32 - 0.72;
        const stripe = 0.5 + 0.5 * Math.sin(y * 70);
        add(x, y, z, 5, stripe);
    }

    // ---- ก้านสมอง ----
    for (let i = 0; i < 700; i++) {
        const t = Math.random();
        const a = Math.random() * Math.PI * 2;
        const r = 0.13 - t * 0.04;
        add(Math.cos(a) * r, -0.35 - t * 0.75, Math.sin(a) * r - 0.3 - t * 0.08, 6, 0.5);
    }

    // ---- ระบบลิมบิก (ด้านใน: อะมิกดะลา + ฮิปโปแคมปัส) ----
    for (let i = 0; i < 900; i++) {
        const side = i % 2 ? 1 : -1;
        const [dx, dy, dz] = randomDir();
        const rr = Math.cbrt(Math.random());
        add(side * 0.22 + dx * 0.13 * rr, -0.12 + dy * 0.1 * rr, 0.02 + dz * 0.32 * rr, 2, 0.7);
    }

    // ---- เซลล์ประสาทภายใน (โหนดของเครือข่าย) ----
    const nodes = [];
    while (nodes.length < 260) {
        const [dx, dy, dz] = randomDir();
        const rr = Math.cbrt(Math.random()) * 0.82;
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = side * (0.34 + dx * 0.5 * rr), y = dy * 0.58 * rr + 0.05, z = dz * 0.9 * rr;
        const r = z > 0.32 ? 0 : (y < -0.12 && z > -0.62) ? 1 : z < -0.58 ? 4 : Math.hypot(x, y + 0.12) < 0.3 ? 2 : 3;
        nodes.push({ p: new THREE.Vector3(x, y, z), r });
    }

    return { pos, region, glow, rand, nodes };
}

const POINT_VERT = `
    attribute float aRegion;
    attribute float aGlow;
    attribute float aRand;
    uniform float uTime;
    uniform float uAct[7];
    uniform float uPixelRatio;
    uniform vec3 uMood;
    uniform float uSelected;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
        float act = uAct[int(aRegion + 0.5)];
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // คลื่นสแกนวิ่งจากล่างขึ้นบน + แสงกระพริบเฉพาะจุด
        float scan = smoothstep(0.08, 0.0, abs(fract(uTime * 0.18) * 2.6 - 1.3 - position.y));
        float twinkle = 0.75 + 0.25 * sin(uTime * (1.5 + aRand * 3.0) + aRand * 40.0);
        // สว่างเฉพาะสันรอยหยัก (pow) ร่องจะมืด → เห็นลายสมองชัด
        float ridge = smoothstep(0.86, 1.0, aGlow);
        if (aRegion > 1.5 && aRegion < 2.5) ridge = 0.35;   // ลิมบิกด้านใน: เรืองแสงนุ่มๆ
        if (aRegion > 5.5) ridge = 0.25;                     // ก้านสมอง
        float sel = abs(aRegion - uSelected) < 0.5 ? 1.0 : 0.0;
        float intensity = (0.17 + ridge * 0.55) * twinkle + act * (0.1 + ridge * 0.3) + scan * 0.2 + sel * (0.25 + ridge * 0.3);
        vec3 cyan = vec3(0.35, 0.92, 1.0);
        vec3 col = mix(cyan, vec3(1.0), clamp(act * 0.8 + scan * 0.6, 0.0, 1.0));
        // ระบบลิมบิกเปลี่ยนสีตามอารมณ์
        if (aRegion > 1.5 && aRegion < 2.5) col = mix(col, uMood, 0.55);
        vColor = col;
        vAlpha = clamp(intensity, 0.0, 1.0);
        gl_PointSize = (1.2 + ridge * 1.1 + act * 0.8 + scan * 0.6 + sel * 0.8) * uPixelRatio * (3.6 / -mv.z);
        gl_Position = projectionMatrix * mv;
    }
`;

const POINT_FRAG = `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor * vAlpha, a * vAlpha);
    }
`;

export class Brain3D {
    constructor(container) {
        this.container = container;
        this.clock = new THREE.Clock();
        this.activation = Object.fromEntries(REGION_KEYS.map(k => [k, 0.15]));
        this.sparks = [];

        const w = container.clientWidth || 320;
        const h = container.clientHeight || 300;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(w, h);
        this.renderer.setClearColor(0x03112a, 1);
        container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x03112a, 0.12);
        this.camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 50);
        this.camera.position.set(2.75, 0.55, 2.2);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.enablePan = false;
        this.controls.enableZoom = false;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.9;
        this.controls.target.set(0, -0.3, 0);

        this.brain = new THREE.Group();
        this.scene.add(this.brain);
        this.buildPoints();
        this.buildNetwork();
        this.buildHologramBase();
        this.buildDust();

        // เรืองแสงแบบหนัง
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.4, 0.12);
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(container);
        this.running = false;
    }

    buildPoints() {
        const { pos, region, glow, rand, nodes } = buildBrain();
        this.nodes = nodes;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('aRegion', new THREE.Float32BufferAttribute(region, 1));
        geo.setAttribute('aGlow', new THREE.Float32BufferAttribute(glow, 1));
        geo.setAttribute('aRand', new THREE.Float32BufferAttribute(rand, 1));
        this.pointMat = new THREE.ShaderMaterial({
            vertexShader: POINT_VERT,
            fragmentShader: POINT_FRAG,
            uniforms: {
                uTime: { value: 0 },
                uAct: { value: REGION_KEYS.map(() => 0.15) },
                uPixelRatio: { value: this.renderer.getPixelRatio() },
                uMood: { value: new THREE.Color(0x5ff2ff) },
                uSelected: { value: -1 },
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this.brainPoints = new THREE.Points(geo, this.pointMat);
        this.brain.add(this.brainPoints);
    }

    /**
     * คลิก (ไม่ใช่ลากหมุน) บนสมอง → หาจุดที่ใกล้ที่สุด → ส่วนของสมองนั้น
     */
    enablePicking(onPick) {
        const el = this.renderer.domElement;
        const raycaster = new THREE.Raycaster();
        raycaster.params.Points.threshold = 0.06;
        let down = null;
        el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
        el.addEventListener('pointerup', e => {
            if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
            const rect = el.getBoundingClientRect();
            const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
            raycaster.setFromCamera(ndc, this.camera);
            const hit = raycaster.intersectObject(this.brainPoints)[0];
            if (!hit) return;
            const r = this.brainPoints.geometry.attributes.aRegion.array[hit.index];
            onPick(REGION_KEYS[Math.round(r)]);
        });
    }

    select(region) {
        this.pointMat.uniforms.uSelected.value = REGION_KEYS.indexOf(region);
        this.pulse(region, 14);
    }

    /** เส้นใยประสาทเชื่อมเซลล์ที่อยู่ใกล้กัน */
    buildNetwork() {
        const segs = [];
        this.links = [];
        this.nodes.forEach((a, i) => this.nodes.forEach((b, j) => {
            if (j > i && a.p.distanceTo(b.p) < 0.24) {
                segs.push(a.p.x, a.p.y, a.p.z, b.p.x, b.p.y, b.p.z);
                this.links.push([i, j]);
            }
        }));
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
        this.netMat = new THREE.LineBasicMaterial({ color: 0x5ff2ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false });
        this.brain.add(new THREE.LineSegments(geo, this.netMat));

        // กระแสประสาท (จุดสว่างวิ่งตามเส้น)
        this.sparkGeo = new THREE.BufferGeometry();
        this.sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(120 * 3), 3));
        this.sparkGeo.setDrawRange(0, 0);
        const sparkMat = new THREE.PointsMaterial({
            color: 0xffffff, size: 0.07, transparent: true, opacity: 1,
            blending: THREE.AdditiveBlending, depthWrite: false, map: this.dotTexture(),
        });
        this.brain.add(new THREE.Points(this.sparkGeo, sparkMat));
    }

    /** ฐานโฮโลแกรม: วงแหวนหมุน + แผ่นแสง + ลำแสงฉายขึ้น */
    buildHologramBase() {
        const base = new THREE.Group();
        base.position.y = -1.32;
        const ringMat = (opacity) => new THREE.MeshBasicMaterial({ color: 0x5ff2ff, transparent: true, opacity, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });

        this.rings = [];
        [[0.95, 0.965, 0.45, 64], [0.7, 0.715, 0.35, 48], [1.12, 1.128, 0.25, 96]].forEach(([r1, r2, op, seg], idx) => {
            const geo = new THREE.RingGeometry(r1, r2, seg, 1, 0, Math.PI * (idx === 1 ? 1.4 : 2));
            const ring = new THREE.Mesh(geo, ringMat(op));
            ring.rotation.x = -Math.PI / 2;
            base.add(ring);
            this.rings.push(ring);
        });
        // จุดไฟรอบฐาน
        const dots = new THREE.Group();
        for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2;
            const d = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), ringMat(0.9));
            d.position.set(Math.cos(a) * 0.84, 0, Math.sin(a) * 0.84);
            d.rotation.x = -Math.PI / 2;
            dots.add(d);
        }
        base.add(dots);
        this.baseDots = dots;
        // แผ่นแสงกลางฐาน
        const glow = new THREE.Mesh(new THREE.CircleGeometry(1.1, 64), new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
            fragmentShader: 'varying vec2 vUv; void main(){ float d = distance(vUv, vec2(0.5)); gl_FragColor = vec4(0.37,0.95,1.0, smoothstep(0.5,0.0,d)*0.1); }',
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        glow.rotation.x = -Math.PI / 2;
        base.add(glow);
        // ลำแสงฉายขึ้น (จางขึ้นด้านบน)
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.0, 1.4, 48, 1, true), new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 } },
            vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
            fragmentShader: 'uniform float uTime; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 2.0) * 0.045 * (0.85 + 0.15*sin(uTime*3.0 + vUv.x*40.0)); gl_FragColor = vec4(0.37,0.95,1.0,a); }',
            transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        beam.position.y = 0.7;
        this.beam = beam;
        base.add(beam);
        this.scene.add(base);
    }

    /** ฝุ่นแสงลอยขึ้นรอบๆ */
    buildDust() {
        const n = 220;
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 1.6;
            arr.set([Math.cos(a) * r, -1.3 + Math.random() * 2.6, Math.sin(a) * r], i * 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        this.dust = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0x8ff6ff, size: 0.025, transparent: true, opacity: 0.55,
            blending: THREE.AdditiveBlending, depthWrite: false, map: this.dotTexture(),
        }));
        this.scene.add(this.dust);
    }

    dotTexture() {
        if (this._dot) return this._dot;
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.3, 'rgba(160,245,255,0.7)');
        grad.addColorStop(1, 'rgba(95,242,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        this._dot = new THREE.CanvasTexture(c);
        return this._dot;
    }

    // =============================================
    //  เชื่อมกับสมองของโม
    // =============================================

    setActivation(activation) {
        this.activation = activation;
    }

    setMoodColor(hex) {
        this.pointMat.uniforms.uMood.value.set(hex);
    }

    /** กระแสประสาทวิ่งในส่วนที่ทำงาน */
    pulse(region, count = 6) {
        const r = REGION_KEYS.indexOf(region);
        const candidates = this.links.filter(([i]) => r < 0 || this.nodes[i].r === r);
        const pool = candidates.length ? candidates : this.links;
        for (let k = 0; k < count && this.sparks.length < 120; k++) {
            const [i, j] = pool[Math.floor(Math.random() * pool.length)];
            this.sparks.push({ a: this.nodes[i].p, b: this.nodes[j].p, t: 0, speed: 1.2 + Math.random() * 1.5, hops: 2 + Math.floor(Math.random() * 3), j });
        }
    }

    updateSparks(dt) {
        const out = this.sparkGeo.attributes.position.array;
        let n = 0;
        this.sparks = this.sparks.filter(s => {
            s.t += dt * s.speed;
            if (s.t >= 1) {
                // วิ่งต่อไปเซลล์ถัดไป (กระแสประสาทส่งต่อ)
                if (--s.hops <= 0) return false;
                const next = this.links.filter(([i, j]) => i === s.j || j === s.j);
                if (!next.length) return false;
                const [i, j] = next[Math.floor(Math.random() * next.length)];
                const to = i === s.j ? j : i;
                s.a = this.nodes[s.j].p; s.b = this.nodes[to].p; s.j = to; s.t = 0;
            }
            const p = s.a.clone().lerp(s.b, s.t);
            out[n * 3] = p.x; out[n * 3 + 1] = p.y; out[n * 3 + 2] = p.z;
            n++;
            return true;
        });
        this.sparkGeo.attributes.position.needsUpdate = true;
        this.sparkGeo.setDrawRange(0, n);
    }

    // =============================================
    //  วนแสดงผล
    // =============================================

    start() {
        if (this.running) return;
        this.running = true;
        this.clock.getDelta();
        const loop = () => {
            if (!this.running) return;
            this.frame();
            this.raf = requestAnimationFrame(loop);
        };
        loop();
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.raf);
    }

    frame() {
        const dt = Math.min(0.05, this.clock.getDelta());
        const t = this.clock.elapsedTime;
        const u = this.pointMat.uniforms;
        u.uTime.value = t;
        u.uAct.value = REGION_KEYS.map(k => Math.min(1, this.activation[k] || 0));
        this.rings[0].rotation.z += dt * 0.25;
        this.rings[1].rotation.z -= dt * 0.6;
        this.rings[2].rotation.z += dt * 0.1;
        this.baseDots.rotation.y -= dt * 0.15;
        this.beam.material.uniforms.uTime.value = t;
        // ลอยขึ้นลงเบาๆ + กระพริบแบบโฮโลแกรม
        this.brain.position.y = Math.sin(t * 0.8) * 0.03;
        this.netMat.opacity = 0.04 + 0.015 * Math.sin(t * 2.0) + (Math.random() < 0.01 ? 0.05 : 0);
        const d = this.dust.geometry.attributes.position.array;
        for (let i = 1; i < d.length; i += 3) {
            d[i] += dt * 0.08;
            if (d[i] > 1.3) d[i] = -1.3;
        }
        this.dust.geometry.attributes.position.needsUpdate = true;
        // กระแสประสาทเล็กๆ เกิดเองตลอดเวลา (สมองไม่เคยหยุดทำงาน)
        if (Math.random() < 0.06) this.pulse(REGION_KEYS[Math.floor(Math.random() * REGION_KEYS.length)], 1);
        this.updateSparks(dt);
        if (this.zoomGoal) {
            const off = this.camera.position.clone().sub(this.controls.target);
            const d = off.length() + (this.zoomGoal - off.length()) * Math.min(1, dt * 8);
            this.camera.position.copy(this.controls.target).add(off.setLength(d));
            if (Math.abs(d - this.zoomGoal) < 0.01) this.zoomGoal = null;
        }
        if (this.memPoints) this.memPoints.material.size = 0.06 + 0.015 * Math.sin(t * 3);
        this.controls.update();
        if (this.onFrame) this.onFrame(dt);
        this.composer.render();
    }

    // =============================================
    //  หน้าสมองเต็มจอ: ซูม + ความทรงจำเป็นดวงไฟในสมอง
    // =============================================

    /** เปิดซูม (หมุนลูกกลิ้ง / บีบนิ้ว) — แตะหรือลากแล้วหยุดหมุนเอง 6 วิ */
    enableZoom(min = 1.4, max = 6) {
        const c = this.controls;
        c.enableZoom = true;
        c.minDistance = min;
        c.maxDistance = max;
        c.zoomSpeed = 0.8;
        c.addEventListener('start', () => { c.autoRotate = false; this.zoomGoal = null; clearTimeout(this.idleTimer); });
        c.addEventListener('end', () => { this.idleTimer = setTimeout(() => { c.autoRotate = true; }, 6000); });
    }

    distance() {
        return this.camera.position.distanceTo(this.controls.target);
    }

    /** ซูมเข้า (f < 1) / ออก (f > 1) แบบนุ่มๆ (ค่อยๆ เลื่อนใน frame) */
    zoomBy(f) {
        const c = this.controls;
        this.zoomGoal = THREE.MathUtils.clamp((this.zoomGoal || this.distance()) * f, c.minDistance, c.maxDistance);
    }

    resetView() {
        this.camera.position.set(2.75, 0.55, 2.2);
        this.controls.target.set(0, -0.3, 0);
        this.controls.autoRotate = true;
        this.zoomGoal = null;
    }

    /** วางความทรงจำเป็นดวงไฟชมพูในส่วนของสมองที่เก็บมัน — list: [{ region }] */
    setMemories(list) {
        if (this.memPoints) {
            this.brain.remove(this.memPoints);
            this.memPoints.geometry.dispose();
        }
        this.memPos = list.map((m, i) => {
            const r = REGION_KEYS.indexOf(m.region);
            const pool = this.nodes.filter(n => n.r === r);
            const n = (pool.length ? pool : this.nodes)[(i * 7919) % (pool.length || this.nodes.length)];
            return n.p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06));
        });
        const geo = new THREE.BufferGeometry().setFromPoints(this.memPos);
        this.memPoints = new THREE.Points(geo, new THREE.PointsMaterial({
            size: 0.06, map: this.dotTexture(), color: 0xff7eb6, transparent: true,
            depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        this.brain.add(this.memPoints);
    }

    /** ตำแหน่งบนจอของความทรงจำแต่ละดวง → [{ x, y, front }] (px ใน container) */
    projectMemories() {
        if (!this.memPos) return [];
        const w = this.container.clientWidth, h = this.container.clientHeight;
        const cam = this.camera.position;
        const center = this.brain.localToWorld(new THREE.Vector3(0, 0, 0));
        return this.memPos.map(p => {
            const world = this.brain.localToWorld(p.clone());
            const front = world.clone().sub(center).normalize().dot(cam.clone().sub(center).normalize());
            const v = world.project(this.camera);
            return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, front, near: cam.distanceTo(world) };
        });
    }

    resize() {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        if (!w || !h) return;
        this.camera.aspect = w / h;
        this.camera.fov = w < h ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(19)) * Math.min(1.6, h / w * 0.85))) : 38;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.composer.setSize(w, h);
    }
}
