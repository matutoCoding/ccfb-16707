// ============================================================================
// 三维梁架预览：由项目构件生成。
// 每根构件使用同一套绘制器产出的 beauty/metal/rough/bump 四张贴图：
//   metalnessMap 区分金与地仗；roughnessMap 区分金箔种类；bumpMap 表现沥粉凸起。
// 环境反射 + 时辰日照 + 门窗面光，使金箔在不同视角呈现不同反光。
// ============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import type { Member, Project, Settings, PatternInstance } from '../types';
import { renderPassCanvas, effectiveLayout } from '../caihua/draftPaint';
import { hash53 } from '../caihua/rules';
import { X_AXES, BAY_WIDTHS } from '../lib/seed';

RectAreaLightUniformsLib.init();

interface TexPack {
  map: THREE.CanvasTexture;
  metal: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  material: THREE.MeshStandardMaterial;
  key: string;
}

const M_PER_MM = 0.001;

export class HallScene {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private pmrem: THREE.PMREMGenerator;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;
  private rectFront: THREE.RectAreaLight;
  private rectBack: THREE.RectAreaLight;
  private lanternL: THREE.PointLight;
  private lanternR: THREE.PointLight;
  private hallGroup: THREE.Group | null = null;
  private roofGroup: THREE.Group | null = null;
  private texCache = new Map<string, TexPack>();
  private clickables: THREE.Object3D[] = [];
  private raf = 0;
  private autoRotate = false;
  private resizeObs: ResizeObserver;
  private onSelect?: (id: string) => void;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private downXY: [number, number] | null = null;
  hour = 10.2;

  constructor(container: HTMLElement, onSelect?: (id: string) => void) {
    this.container = container;
    this.onSelect = onSelect;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    (globalThis as unknown as { __hall?: HallScene }).__hall = this;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#cdd8e2');
    this.scene.fog = new THREE.Fog('#cdd8e2', 30, 70);

    this.camera = new THREE.PerspectiveCamera(46, container.clientWidth / container.clientHeight, 0.1, 200);
    this.camera.position.set(15.5, 7.6, 18.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 3.3, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 45;
    this.controls.autoRotateSpeed = 0.7;

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.buildGoldEnvironment();
    // 自定义环境本身偏暗，保持 1:1；金箔再用 envMapIntensity 加强
    this.scene.environmentIntensity = 1;

    // 光照
    this.hemi = new THREE.HemisphereLight('#cfe2ff', '#6b5638', 0.55);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight('#ffffff', 0.12);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight('#fff2d8', 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -16;
    this.sun.shadow.camera.right = 16;
    this.sun.shadow.camera.top = 12;
    this.sun.shadow.camera.bottom = -12;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 60;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // 门窗柔光（强度克制，避免正面过曝洗白青绿）
    this.rectFront = new THREE.RectAreaLight('#ffe6bd', 2.4, 16, 4);
    this.rectFront.position.set(0, 2.6, 4.4);
    this.rectFront.lookAt(0, 2.4, 0);
    this.scene.add(this.rectFront);
    this.rectBack = new THREE.RectAreaLight('#dceaff', 1.1, 16, 4);
    this.rectBack.position.set(0, 2.6, -4.4);
    this.rectBack.lookAt(0, 2.4, 0);
    this.scene.add(this.rectBack);

    this.lanternL = new THREE.PointLight('#ffb45e', 0, 12, 1.8);
    this.lanternL.position.set(-4, 3.4, 0);
    this.scene.add(this.lanternL);
    this.lanternR = new THREE.PointLight('#ffb45e', 0, 12, 1.8);
    this.lanternR.position.set(4, 3.4, 0);
    this.scene.add(this.lanternR);

    this.buildGround();
    this.setTime(this.hour);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);

    this.renderer.domElement.addEventListener('pointerdown', this.onDown);
    this.renderer.domElement.addEventListener('pointerup', this.onUp);

    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.controls.autoRotate = this.autoRotate;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  /**
   * 暗穹顶 + 几块 HDR 反光板：低漫反射不洗白青绿地子，
   * 亮灯板在金箔上形成随视角移动的高光。
   */
  private buildGoldEnvironment(): THREE.Texture {
    const envScene = new THREE.Scene();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(50, 24, 16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#46536a'), side: THREE.BackSide }),
    );
    envScene.add(dome);
    const card = (hex: string, power: number, x: number, y: number, z: number, w: number, h: number) => {
      const col = new THREE.Color(hex).multiplyScalar(power);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }),
      );
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      envScene.add(m);
    };
    card('#fff0cf', 3.2, 9, 11, 7, 16, 9);
    card('#cfe0ff', 1.5, -10, 7, -5, 14, 8);
    card('#ffd98a', 2.4, 1, 13, -11, 18, 6);
    card('#ffffff', 1.1, 0, 4, 14, 12, 5);
    const tex = this.pmrem.fromScene(envScene, 0.08).texture;
    envScene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    return tex;
  }

  // --------------------------------------------------------------------------
  private buildGround() {
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(25, 0.5, 10.5),
      new THREE.MeshStandardMaterial({ color: '#9a9384', roughness: 0.92 }),
    );
    platform.position.y = -0.25;
    platform.receiveShadow = true;
    this.scene.add(platform);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24.6, 10.1),
      new THREE.MeshStandardMaterial({ color: '#7d7464', roughness: 0.85 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  // --------------------------------------------------------------------------
  setAutoRotate(v: boolean) {
    this.autoRotate = v;
  }

  resetView() {
    this.camera.position.set(15.5, 7.6, 18.5);
    this.controls.target.set(0, 3.3, 0);
    this.controls.update();
  }

  setRoofVisible(v: boolean) {
    if (this.roofGroup) this.roofGroup.visible = v;
  }

  focusMember(id: string) {
    const obj = this.clickables.find((o) => o.userData.id === id);
    if (!obj) return;
    const p = new THREE.Vector3();
    obj.getWorldPosition(p);
    this.controls.target.copy(p);
    const dir = new THREE.Vector3(1.6, 0.9, 2.2);
    this.camera.position.copy(p).add(dir);
    this.controls.update();
  }

  // --------------------------------------------------------------------------
  setTime(hour: number) {
    this.hour = hour;
    // 6 日出，18 日落
    const dayT = (hour - 6) / 12; // 0..1
    const elev = Math.sin(THREE.MathUtils.clamp(dayT, 0, 1) * Math.PI);
    const isDay = hour >= 6 && hour <= 18;
    const elevation = elev * 1.05; // 最大约 60°
    const az = (dayT - 0.5) * 2.6; // 弧度，东->西
    const R = 26;
    const ce = Math.cos(elevation);
    this.sun.position.set(Math.sin(az) * R * ce, Math.max(2, Math.sin(elevation) * R), Math.cos(az) * R * ce + 6);
    this.sun.target.position.set(0, 2, 0);

    const day = THREE.MathUtils.clamp(elev * 1.6, 0, 1);
    this.sun.intensity = isDay ? 1.55 * day + 0.08 : 0.08;
    this.sun.color.setHSL(0.11 - 0.05 * (1 - day), 0.7, 0.55 + 0.2 * day);
    this.hemi.intensity = 0.12 + 0.3 * day;
    this.ambient.intensity = 0.06 + 0.1 * day;

    // 天光背景与雾随时辰
    const sky = new THREE.Color('#0e1726').lerp(new THREE.Color('#cdd8e2'), day);
    (this.scene.background as THREE.Color).copy(sky);
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(sky);

    // 门窗光：白天偏暖天光，夜间仅余微弱环境
    this.rectFront.intensity = 0.2 + 1.3 * day;
    this.rectBack.intensity = 0.1 + 0.6 * day;
    this.rectFront.color.set('#ffe6bd');
    this.lanternL.intensity = 20 * (1 - day);
    this.lanternR.intensity = 20 * (1 - day);
  }

  // --------------------------------------------------------------------------
  private materialKey(m: Member, s: Settings): string {
    return hash53(
      JSON.stringify({
        g: [m.lengthMm, m.heightMm, m.section, m.curved],
        d: m.draft,
        pal: s.palette,
        foil: s.foils.map((f) => [f.id, f.color, f.roughness, f.envIntensity]),
      }),
    );
  }

  private createTexPack(m: Member, s: Settings, lib: PatternInstance[]): TexPack {
    const key = this.materialKey(m, s);
    const cached = this.texCache.get(key);
    if (cached) return cached;

    const beauty = renderPassCanvas(m, s, lib, 'beauty', 2048);
    const metalC = renderPassCanvas(m, s, lib, 'metal', 1024);
    const roughC = renderPassCanvas(m, s, lib, 'rough', 1024);
    const bumpC = renderPassCanvas(m, s, lib, 'bump', 1024);

    const mk = (c: HTMLCanvasElement, srgb = false) => {
      const t = new THREE.CanvasTexture(c);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      return t;
    };

    let map = mk(beauty, true);
    let metal = mk(metalC);
    let rough = mk(roughC);
    let bump = mk(bumpC);

    // 圆檩：把顺长 x 方向的谱子旋转贴到圆柱 v 向，并在周向留出非彩绘弧
    if (m.section.shape === 'round') {
      const circMm = Math.PI * (m.section.diameterMm ?? m.heightMm);
      const arcMm = effectiveLayout(m, s).faceHeightMm;
      const composeWrap = (src: HTMLCanvasElement, bg: string): HTMLCanvasElement => {
        const ppm = src.width / Math.max(1, m.lengthMm);
        const circPx = Math.max(64, Math.round(circMm * ppm));
        const wrap = document.createElement('canvas');
        wrap.width = circPx;
        wrap.height = src.width; // 长度方向
        const wctx = wrap.getContext('2d')!;
        wctx.fillStyle = bg;
        wctx.fillRect(0, 0, wrap.width, wrap.height);
        const arcPx = src.height;
        const dx = (circPx - arcPx) / 2;
        wctx.translate(dx + arcPx, 0);
        wctx.rotate(Math.PI / 2);
        wctx.drawImage(src, 0, 0);
        return wrap;
      };
      const wMap = composeWrap(beauty, '#6e2a1d');
      const wMetal = composeWrap(metalC, '#000');
      const wRough = composeWrap(roughC, 'rgb(224,224,224)');
      const wBump = composeWrap(bumpC, 'rgb(128,128,128)');
      map.dispose(); metal.dispose(); rough.dispose(); bump.dispose();
      map = mk(wMap, true);
      metal = mk(wMetal);
      rough = mk(wRough);
      bump = mk(wBump);
      // 彩绘弧默认朝向室内下侧，按观感微调
      map.offset.y = 0.0;
    }

    const foil = s.foils.find((f) => f.id === m.draft.foil) ?? s.foils[0];
    const material = new THREE.MeshStandardMaterial({
      map,
      metalnessMap: metal,
      roughnessMap: rough,
      bumpMap: bump,
      bumpScale: m.draft.lifen ? 1.6 : 0,
      metalness: 1,
      roughness: 1,
      envMapIntensity: foil.envIntensity ?? 1.3,
    });

    const pack: TexPack = { map, metal, rough, bump, material, key };
    this.texCache.set(key, pack);
    return pack;
  }

  // --------------------------------------------------------------------------
  setProject(project: Project, s: Settings, lib: PatternInstance[]) {
    // 清旧组
    if (this.hallGroup) {
      this.scene.remove(this.hallGroup);
      this.hallGroup.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((mm) => {
            // 共享材质在 cache prune 中统一释放
            if (!(mm as THREE.MeshStandardMaterial).userData?.cached) mm.dispose();
          });
        }
      });
    }
    this.clickables = [];
    const group = new THREE.Group();
    this.hallGroup = group;
    this.scene.add(group);

    const usedKeys = new Set<string>();
    const plainWood = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.7, envMapIntensity: 0.35 });
    const darkWood = new THREE.MeshStandardMaterial({ color: '#3d2716', roughness: 0.75, envMapIntensity: 0.3 });

    for (const m of project.members) {
      if (!(m.lengthMm > 0)) continue;
      const pack = this.createTexPack(m, s, lib);
      usedKeys.add(pack.key);
      pack.material.userData.cached = true;

      let mesh: THREE.Mesh;
      if (m.section.shape === 'round') {
        const d = (m.section.diameterMm ?? m.heightMm) * M_PER_MM;
        const len = m.lengthMm * M_PER_MM;
        const geo = new THREE.CylinderGeometry(d / 2, d / 2, len, 40, 1, false);
        mesh = new THREE.Mesh(geo, pack.material);
        mesh.rotation.z = Math.PI / 2; // Y 轴 -> X 轴
        if ((m.pose?.rotY ?? 0) !== 0) mesh.rotation.y = THREE.MathUtils.degToRad(m.pose!.rotY ?? 0);
      } else {
        const L = m.lengthMm * M_PER_MM;
        const H = m.heightMm * M_PER_MM;
        const W = (m.section.widthMm || 300) * M_PER_MM;
        const geo = new THREE.BoxGeometry(L, H, W);
        // 材质序：+x,-x,+y,-y,+z,-z；两个大面 ±z 上谱
        const mats = [plainWood, plainWood, darkWood, darkWood, pack.material, pack.material];
        mesh = new THREE.Mesh(geo, mats);
        mesh.rotation.y = THREE.MathUtils.degToRad(m.pose?.rotY ?? 0);
      }

      mesh.position.set((m.pose?.x ?? 0) * M_PER_MM, (m.pose?.y ?? 3000) * M_PER_MM, (m.pose?.z ?? 0) * M_PER_MM);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.id = m.id;
      group.add(mesh);
      this.clickables.push(mesh);
    }

    this.buildStructure(project, group, plainWood);
    this.buildDoorsWindows(project, group);
    this.buildRoof(project);

    // 清理本项目不再使用的贴图缓存
    for (const [k, pack] of this.texCache) {
      if (!usedKeys.has(k)) {
        pack.map.dispose();
        pack.metal.dispose();
        pack.rough.dispose();
        pack.bump.dispose();
        pack.material.dispose();
        this.texCache.delete(k);
      }
    }
  }

  // 柱、柱础（测试殿有 hall 描述时）
  private buildStructure(project: Project, group: THREE.Group, colMat: THREE.Material) {
    const hall = project.hall;
    const colH = (hall?.columnHeightMm ?? 4800) * M_PER_MM;
    const colD = (hall?.columnDiameterMm ?? 420) * M_PER_MM;
    const xs = hall?.bayWidthsMm ? axesFromWidths(hall.bayWidthsMm) : X_AXES.map((x) => x * M_PER_MM);
    const zs = [3.6, 1.8, -1.8, -3.6];
    const colGeo = new THREE.CylinderGeometry(colD / 2, colD / 2 * 1.04, colH, 28);
    const baseGeo = new THREE.CylinderGeometry(colD * 0.85, colD * 0.95, 0.35, 28);
    const baseMat = new THREE.MeshStandardMaterial({ color: '#8b8577', roughness: 0.95 });
    const redCol = new THREE.MeshStandardMaterial({ color: '#7e2417', roughness: 0.55, envMapIntensity: 0.4 });
    for (const x of xs) {
      for (const z of zs) {
        const c = new THREE.Mesh(colGeo, redCol);
        c.position.set(x, colH / 2, z);
        c.castShadow = true;
        c.receiveShadow = true;
        group.add(c);
        const b = new THREE.Mesh(baseGeo, baseMat);
        b.position.set(x, 0.175, z);
        b.receiveShadow = true;
        group.add(b);
      }
    }
    // 左右山面/进深方向的穿插辅助梁已在 members 中
    void colMat;
  }

  // 门窗：明间隔扇门 + 次梢间槛窗，发光面示意透入的光
  private buildDoorsWindows(project: Project, group: THREE.Group) {
    const widths = project.hall?.bayWidthsMm ?? BAY_WIDTHS;
    const xs = axesFromWidths(widths);
    const centers = widths.map((w, i) => (xs[i] + xs[i + 1]) / 2);
    const frameMat = new THREE.MeshStandardMaterial({ color: '#4a2c17', roughness: 0.7 });
    const latticeMat = new THREE.LineBasicMaterial({ color: '#3a2412' });
    const glowMat = new THREE.MeshBasicMaterial({ color: '#ffe9c4', transparent: true, opacity: 0.5 });

    for (const z of [3.62, -3.62]) {
      centers.forEach((cx, i) => {
        const isDoor = i === 2;
        const w = widths[i] * M_PER_MM * 0.78;
        const h = isDoor ? 3.5 : 2.1;
        const y = isDoor ? 1.95 : 2.2;
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glowMat);
        panel.position.set(cx, y, z);
        if (z < 0) panel.rotation.y = Math.PI;
        group.add(panel);
        // 外框
        const t = 0.09;
        const pieces: [number, number, number, number][] = [
          [w + t, t, cx, y + h / 2],
          [w + t, t, cx, y - h / 2],
          [t, h, cx - w / 2, y],
          [t, h, cx + w / 2, y],
        ];
        for (const [bw, bh, px, py] of pieces) {
          const box = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.08), frameMat);
          box.position.set(px, py, z);
          group.add(box);
        }
        // 棂格
        const pts: number[] = [];
        const nV = 5;
        for (let k = 1; k < nV; k++) {
          const x = cx - w / 2 + (w * k) / nV;
          pts.push(x, y - h / 2, z, x, y + h / 2, z);
        }
        const nH = isDoor ? 6 : 4;
        for (let k = 1; k < nH; k++) {
          const yy = y - h / 2 + (h * k) / nH;
          pts.push(cx - w / 2, yy, z, cx + w / 2, yy, z);
        }
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        group.add(new THREE.LineSegments(lg, latticeMat));
      });
    }
  }

  // 简易双坡屋顶（默认隐藏，“揭顶”看梁架）
  private buildRoof(project: Project) {
    if (this.roofGroup) {
      this.scene.remove(this.roofGroup);
      this.roofGroup.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
    }
    const g = new THREE.Group();
    this.roofGroup = g;
    const W = 24;
    const halfD = 5.2;
    const eaveY = 5.5;
    const ridgeY = 7.6;
    const mat = new THREE.MeshStandardMaterial({ color: '#4a4f55', roughness: 0.9, side: THREE.DoubleSide });
    const slopeLen = Math.hypot(halfD, ridgeY - eaveY);
    const angle = Math.atan2(ridgeY - eaveY, halfD);
    for (const sign of [1, -1]) {
      const plane = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, slopeLen), mat);
      plane.position.set(0, (eaveY + ridgeY) / 2, (sign * halfD) / 2);
      plane.rotation.x = sign * angle;
      plane.castShadow = true;
      plane.receiveShadow = true;
      g.add(plane);
    }
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, W, 16), new THREE.MeshStandardMaterial({ color: '#2f343a', roughness: 0.8 }));
    ridge.rotation.z = Math.PI / 2;
    ridge.position.set(0, ridgeY + 0.08, 0);
    g.add(ridge);
    g.visible = false;
    this.scene.add(g);
    void project;
  }

  // --------------------------------------------------------------------------
  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private onDown = (e: PointerEvent) => {
    this.downXY = [e.clientX, e.clientY];
  };
  private onUp = (e: PointerEvent) => {
    if (!this.downXY) return;
    const dx = e.clientX - this.downXY[0];
    const dy = e.clientY - this.downXY[1];
    this.downXY = null;
    if (Math.hypot(dx, dy) > 6) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.clickables, false);
    const id = hits[0]?.object.userData.id as string | undefined;
    if (id) this.onSelect?.(id);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.onDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onUp);
    this.controls.dispose();
    for (const p of this.texCache.values()) {
      p.map.dispose();
      p.metal.dispose();
      p.rough.dispose();
      p.bump.dispose();
      p.material.dispose();
    }
    this.texCache.clear();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function axesFromWidths(widths: number[]): number[] {
  const total = widths.reduce((a, b) => a + b, 0);
  let acc = -total / 2;
  const xs = [acc * M_PER_MM];
  for (const w of widths) {
    acc += w;
    xs.push(acc * M_PER_MM);
  }
  return xs;
}
