import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  NgZone,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as CANNON from 'cannon-es';
import { SoundService } from '../../services/sound.service';

interface DieInstance {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  outlineMesh: THREE.Mesh;
  outlineMat: THREE.MeshBasicMaterial;
  isRolling: boolean;
  settled: boolean;
  isSelected: boolean;
  offsetX: number;
  offsetZ: number;
  offsetY?: number;
  initialRotY?: number;
  followSpeed: number;
}

export interface DieOverlay {
  index: number;
  x: number;
  y: number;
  isSelected: boolean;
  isEligible: boolean;
  visible: boolean;
}

export interface FloatingScorePopup {
  id: number;
  text: string;
  x: number;
  y: number;
  isBig?: boolean;
}

@Component({
  selector: 'app-dice-board-3d',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="dice-canvas-wrapper"
      #canvasContainer
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointerleave)="onPointerUp($event)"
    >
      <canvas #canvas3d></canvas>

      <!-- Popups de Pontos Flutuantes Saindo dos Dados (+100, +50, +1000) -->
      <div
        *ngFor="let pop of floatingScorePopups"
        class="floating-score-badge font-pixel"
        [class.big-score]="pop.isBig"
        [style.left.px]="pop.x"
        [style.top.px]="pop.y"
      >
        {{ pop.text }}
      </div>

      <!-- Instruções Flutuantes -->
      <div class="tabletop-guide font-pixel ready-banner" *ngIf="isFloating && !isHolding">
        <i class="fas fa-hand-fist me-2 fa-bounce"></i> CLIQUE E SEGURE OS DADOS PARA CHACOALHAR E LANÇAR!
      </div>
      
      <div class="tabletop-guide font-pixel holding-banner" *ngIf="isHolding">
        <i class="fas fa-arrows-up-down-left-right me-2"></i> BALANCE O MOUSE E SOLTE PARA ARREMESSAR!
      </div>

      <div class="tabletop-guide font-pixel rolling-banner" *ngIf="isRollingAny">
        <i class="fas fa-dice fa-spin me-2"></i> DADOS ROLANDO NA MESA...
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        position: relative;
      }
      .dice-canvas-wrapper {
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
        border-radius: 14px;
        border: 2px solid #092e21;
        box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.75);
        cursor: grab;
        touch-action: none;

        &:active {
          cursor: grabbing;
        }

        canvas {
          width: 100%;
          height: 100%;
          display: block;
          image-rendering: -moz-crisp-edges;
          image-rendering: -webkit-crisp-edges;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
        }
      }

      /* Números Flutuantes Saindo dos Dados */
      .floating-score-badge {
        position: absolute;
        transform: translate(-50%, -50%);
        pointer-events: none;
        user-select: none;
        z-index: 35;
        font-size: 1.65rem;
        font-weight: 900;
        color: #ffb703;
        background: rgba(8, 12, 16, 0.92);
        border: 2px solid #ffb703;
        border-radius: 8px;
        padding: 2px 10px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.8), 0 0 10px rgba(255, 183, 3, 0.5);
        text-shadow: 2px 2px 0 #000;
        white-space: nowrap;
        animation: scoreFloatUp 1.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;

        &.big-score {
          font-size: 2.15rem;
          color: #ffd166;
          border-color: #ffd166;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.9), 0 0 16px rgba(255, 209, 102, 0.6);
        }
      }

      @keyframes scoreFloatUp {
        0% {
          opacity: 0;
          transform: translate(-50%, 0px) scale(0.6);
        }
        20% {
          opacity: 1;
          transform: translate(-50%, -24px) scale(1.22);
        }
        40% {
          transform: translate(-50%, -36px) scale(1.0);
        }
        75% {
          opacity: 1;
          transform: translate(-50%, -54px) scale(1.0);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -80px) scale(0.9);
        }
      }

      .tabletop-guide {
        position: absolute;
        top: 15px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 1.05rem;
        padding: 8px 24px;
        border-radius: 8px;
        border: 3px solid #000;
        box-shadow: 4px 4px 0px #000;
        pointer-events: none;
        user-select: none;
        white-space: nowrap;
        font-weight: 800;
        z-index: 25;
      }

      .ready-banner {
        background: #ffb703;
        color: #000;
        animation: pulseReady 1.5s infinite ease-in-out;
      }

      .holding-banner {
        background: #2ec4b6;
        color: #000;
        transform: translateX(-50%) scale(1.06);
      }

      .rolling-banner {
        background: #fe4a49;
        color: #fff;
      }

      @keyframes pulseReady {
        0%, 100% { transform: translateX(-50%) scale(1); }
        50% { transform: translateX(-50%) scale(1.04); }
      }
    `,
  ],
})
export class DiceBoard3dComponent implements OnInit, OnDestroy {
  @ViewChild('canvasContainer', { static: true }) containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('canvas3d', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() selectedIndices: number[] = [];
  @Input() eligibleIndices: number[] = [];

  @Input()
  set pixelFilterEnabled(enabled: boolean) {
    this._pixelFilterEnabled = enabled;
    this.applyRenderResolution();
  }
  get pixelFilterEnabled(): boolean {
    return this._pixelFilterEnabled;
  }
  private _pixelFilterEnabled = false;

  @Output() diceClicked = new EventEmitter<number>();
  @Output() rollStarted = new EventEmitter<void>(); // Notifica início do arremesso
  @Output() rollFinished = new EventEmitter<number[]>(); // Emite os números físicos reais que caíram

  // Overlays 2D de Auras e Números Flutuantes
  public diceOverlays: DieOverlay[] = [];
  public floatingScorePopups: FloatingScorePopup[] = [];

  // Three.js
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private animFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastFrameTime = performance.now();

  // Cannon-es Physics World
  private world!: CANNON.World;
  private dicePhysMat!: CANNON.Material;
  private tablePhysMat!: CANNON.Material;
  private wallPhysMat!: CANNON.Material;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2(-1000, -1000);
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -3.2);
  private planeIntersect = new THREE.Vector3();

  // Dimensões do dado e limites da mesa
  // Para cubo de 1.30, distância de 1.82 permite agrupamento "juntinho" orgânico sem se tocarem
  private readonly dieSize = 1.30;
  private readonly minDistance = 1.82;
  private readonly tableBounds = {
    halfX: 8.8,
    halfZ: 5.8,
    floorY: 0.65,
  };

  private diceMaterials: THREE.Material[][] = [];
  public diceList: DieInstance[] = [];

  // Estados Tabletop
  public isFloating = false;
  public isHolding = false;
  public isRollingAny = false;

  private groupCenter = new THREE.Vector3(0, 3.2, 0.4);
  private dragHistory: { x: number; z: number; time: number }[] = [];
  private lastSoundTime = 0;
  private throwTimestamp = 0;
  private settleTimeoutId: number | null = null;

  // Detecção de "Sacudir" estilo Tabletop Simulator (inversões rápidas de sentido do mouse)
  private shakeEnergy = 0;
  private lastMoveX = 0;
  private lastMoveZ = 0;
  private lastMoveTime = 0;
  private lastSignX = 0;
  private lastSignZ = 0;
  private reversalCount = 0;
  private lastReversalTime = 0;
  private lastShakeSoundTime = 0;

  // Normais das 6 faces no espaço local do dado (BoxGeometry)
  // 0:+X (1), 1:-X (6), 2:+Y (2), 3:-Y (5), 4:+Z (3), 5:-Z (4)
  private readonly faceNormals = [
    { value: 1, normal: new THREE.Vector3(1, 0, 0) },
    { value: 6, normal: new THREE.Vector3(-1, 0, 0) },
    { value: 2, normal: new THREE.Vector3(0, 1, 0) },
    { value: 5, normal: new THREE.Vector3(0, -1, 0) },
    { value: 3, normal: new THREE.Vector3(0, 0, 1) },
    { value: 4, normal: new THREE.Vector3(0, 0, -1) },
  ];

  constructor(
    private ngZone: NgZone,
    private soundService: SoundService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.createDiceMaterials();
    this.initPhysics();
    this.initThree();
    this.setupResizeObserver();
  }

  ngOnDestroy() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
    if (this.settleTimeoutId) {
      clearTimeout(this.settleTimeoutId);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
  }

  /* ================= CANNON-ES RIGID BODY WORLD ================= */

  private initPhysics() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -42, 0),
    });
    this.world.allowSleep = true;

    this.tablePhysMat = new CANNON.Material('table');
    this.dicePhysMat = new CANNON.Material('dice');
    this.wallPhysMat = new CANNON.Material('wall');

    // 1. DADO <-> DADO: colisão física de sólidos reais
    const diceDiceContact = new CANNON.ContactMaterial(this.dicePhysMat, this.dicePhysMat, {
      friction: 0.35,
      restitution: 0.3,
    });
    this.world.addContactMaterial(diceDiceContact);

    // 2. DADO <-> FELTRO
    const diceTableContact = new CANNON.ContactMaterial(this.dicePhysMat, this.tablePhysMat, {
      friction: 0.65,
      restitution: 0.22,
    });
    this.world.addContactMaterial(diceTableContact);

    // 3. DADO <-> PAREDES
    const diceWallContact = new CANNON.ContactMaterial(this.dicePhysMat, this.wallPhysMat, {
      friction: 0.2,
      restitution: 0.4,
    });
    this.world.addContactMaterial(diceWallContact);

    // Chão Físico
    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.tablePhysMat,
      shape: new CANNON.Plane(),
    });
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    groundBody.position.set(0, 0, 0);
    this.world.addBody(groundBody);

    // Paredes
    const wallThick = 1.0;
    const wallHeight = 5.0;

    const topWall = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.wallPhysMat,
      shape: new CANNON.Box(new CANNON.Vec3(this.tableBounds.halfX, wallHeight, wallThick)),
    });
    topWall.position.set(0, wallHeight / 2, -this.tableBounds.halfZ - wallThick);
    this.world.addBody(topWall);

    const btmWall = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.wallPhysMat,
      shape: new CANNON.Box(new CANNON.Vec3(this.tableBounds.halfX, wallHeight, wallThick)),
    });
    btmWall.position.set(0, wallHeight / 2, this.tableBounds.halfZ + wallThick);
    this.world.addBody(btmWall);

    const leftWall = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.wallPhysMat,
      shape: new CANNON.Box(new CANNON.Vec3(wallThick, wallHeight, this.tableBounds.halfZ)),
    });
    leftWall.position.set(-this.tableBounds.halfX - wallThick, wallHeight / 2, 0);
    this.world.addBody(leftWall);

    const rightWall = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.wallPhysMat,
      shape: new CANNON.Box(new CANNON.Vec3(wallThick, wallHeight, this.tableBounds.halfZ)),
    });
    rightWall.position.set(this.tableBounds.halfX + wallThick, wallHeight / 2, 0);
    this.world.addBody(rightWall);
  }

  /* ================= ESTILIZAÇÃO CASINO: DADOS VERMELHOS E MESA DE FELTRO ================= */
 
  private createDiceMaterials() {
    const faceOrder = [1, 6, 2, 5, 3, 4];
    const materials: THREE.MeshStandardMaterial[] = [];

    faceOrder.forEach((val) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d')!;

      // 1. Vermelho Casino Profundo com gradiente radial e vinheta carmesim nas bordas
      const bgGrad = ctx.createRadialGradient(256, 256, 40, 256, 256, 350);
      bgGrad.addColorStop(0, '#d91a2a'); // Vermelho vivo no centro
      bgGrad.addColorStop(0.7, '#ba1120'); // Vermelho casino rico
      bgGrad.addColorStop(1, '#870714');   // Carmesim escuro nas bordas arredondadas
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 512, 512);

      // 2. Micro-brilho translúcido na borda
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 14;
      ctx.strokeRect(14, 14, 484, 484);

      // 3. Desenho das Bolinhas Brancas (Pips)
      const drawPip = (x: number, y: number, isAceCenter = false) => {
        const radius = isAceCenter ? 48 : 38;

        ctx.save();
        // Sombra de profundidade/encaixe (furo da bolinha no acrílico)
        ctx.beginPath();
        ctx.arc(x, y + 2.5, radius + 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(50, 0, 8, 0.4)';
        ctx.fill();

        // Corpo da bolinha branca com leve gradiente 3D
        const pipGrad = ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.25, radius * 0.1, x, y, radius);
        pipGrad.addColorStop(0, '#ffffff');
        pipGrad.addColorStop(0.85, '#f8fafc');
        pipGrad.addColorStop(1, '#e2e8f0');

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = pipGrad;
        ctx.fill();

        // Borda finíssima de contorno suave
        ctx.strokeStyle = 'rgba(120, 0, 15, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
      };

      const c = 256;
      const l = 136;
      const r = 376;

      switch (val) {
        case 1:
          drawPip(c, c, true);
          break;
        case 2:
          drawPip(l, l);
          drawPip(r, r);
          break;
        case 3:
          drawPip(l, l);
          drawPip(c, c);
          drawPip(r, r);
          break;
        case 4:
          drawPip(l, l);
          drawPip(r, l);
          drawPip(l, r);
          drawPip(r, r);
          break;
        case 5:
          drawPip(l, l);
          drawPip(r, l);
          drawPip(c, c);
          drawPip(l, r);
          drawPip(r, r);
          break;
        case 6:
          drawPip(l, 116);
          drawPip(r, 116);
          drawPip(l, c);
          drawPip(r, c);
          drawPip(l, 396);
          drawPip(r, 396);
          break;
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = 8;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      materials.push(
        new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.12, // Acabamento acrílico lustroso bem iluminado
          metalness: 0.04,
        })
      );
    });

    this.diceMaterials.push(materials);
  }

  private initThree() {
    const container = this.containerRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;
    const width = container.clientWidth || 700;
    const height = container.clientHeight || 500;

    this.scene = new THREE.Scene();
    // Fundo esmeralda combinando com o feltro: ZERO bordas pretas!
    this.scene.background = new THREE.Color(0x0e382b);

    // Câmera 100% Chapada (Top-Down Perfeito, sem distorção angular)
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(0, 18, 0.001);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // Sem antialiasing suave para garantir pixels sharp e nítidos
      powerPreference: 'high-performance',
    });
    this.applyRenderResolution();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Iluminação Aconchegante e Quente Original (com leve toque adicional de claridade)
    const ambientLight = new THREE.AmbientLight(0xffecd2, 3); // Levemente acima de 1.15 original
    this.scene.add(ambientLight);

    const mainSpot = new THREE.SpotLight(0xffdfb0, 4.2); // Foco suave âmbar de abajur
    mainSpot.position.set(0, 24, 0);
    mainSpot.angle = Math.PI / 2.2;
    mainSpot.penumbra = 0.65;
    mainSpot.castShadow = true;
    mainSpot.shadow.mapSize.width = 1024;
    mainSpot.shadow.mapSize.height = 1024;
    this.scene.add(mainSpot);

    // Luzes de preenchimento quentes (dourado e mel)
    const warmRim = new THREE.PointLight(0xffb366, 1.6, 35);
    warmRim.position.set(0, 9, 8);
    this.scene.add(warmRim);

    const warmFill = new THREE.PointLight(0xffd499, 1.2, 35);
    warmFill.position.set(0, 9, -8);
    this.scene.add(warmFill);

    this.buildModernTable();

    this.ngZone.runOutsideAngular(() => {
      this.animate();
    });
  }

  public applyRenderResolution() {
    if (!this.renderer || !this.containerRef) return;
    const container = this.containerRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;
    const width = container.clientWidth || 700;
    const height = container.clientHeight || 500;

    if (this._pixelFilterEnabled) {
      // Escala nítida e equilibrada de pixel art (sharp sem exagero e sem blur)
      const pScale = 0.30;
      this.renderer.setSize(Math.round(width * pScale), Math.round(height * pScale), false);
      this.renderer.setPixelRatio(1);
      canvas.style.imageRendering = 'pixelated';
    } else {
      this.renderer.setSize(width, height, true);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      canvas.style.imageRendering = 'auto';
    }
  }

  private buildModernTable() {
    // 1. Feltro Verde Esmeralda de Alto Padrão com Quadriculado em Losangos (Diamond Pattern)
    const feltCanvas = document.createElement('canvas');
    feltCanvas.width = 512;
    feltCanvas.height = 512;
    const ctx = feltCanvas.getContext('2d')!;

    // Fundo base esmeralda rico de cassino original
    ctx.fillStyle = '#0e382b';
    ctx.fillRect(0, 0, 512, 512);

    // Quadriculado sutil em formato de losangos (Sem linhas feias / limpo e aveludado)
    const tileSize = 64;
    for (let y = 0; y < 512; y += tileSize) {
      for (let x = 0; x < 512; x += tileSize) {
        const isEven = ((x / tileSize) + (y / tileSize)) % 2 === 0;
        if (isEven) {
          ctx.fillStyle = '#09291f'; // Tom aveludado mais profundo original
          ctx.beginPath();
          ctx.moveTo(x + tileSize / 2, y);
          ctx.lineTo(x + tileSize, y + tileSize / 2);
          ctx.lineTo(x + tileSize / 2, y + tileSize);
          ctx.lineTo(x, y + tileSize / 2);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Micro-trama suave de tecido de feltro
    const imgData = ctx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 6;
      data[i] = Math.min(255, Math.max(0, data[i] + noise * 0.7));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise * 0.8));
    }
    ctx.putImageData(imgData, 0, 0);

    const feltTexture = new THREE.CanvasTexture(feltCanvas);
    feltTexture.wrapS = THREE.RepeatWrapping;
    feltTexture.wrapT = THREE.RepeatWrapping;
    feltTexture.repeat.set(24, 24);
    feltTexture.anisotropy = 8;
    feltTexture.magFilter = THREE.NearestFilter;
    feltTexture.minFilter = THREE.NearestFilter;

    // Chão gigante de feltro: 120x120 unidades! Preenche 100% da tela em qualquer monitor/resolução (SEM BORDAS PRETAS!)
    const feltGeo = new THREE.PlaneGeometry(120, 120);
    const feltMat = new THREE.MeshStandardMaterial({
      map: feltTexture,
      roughness: 0.78,
      metalness: 0.0,
    });
    const feltMesh = new THREE.Mesh(feltGeo, feltMat);
    feltMesh.rotation.x = -Math.PI / 2;
    feltMesh.receiveShadow = true;
    this.scene.add(feltMesh);
  }

  private setupResizeObserver() {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const aspect = width / height;
          this.camera.aspect = aspect;

          // Ajuste de distância da câmera: Preenche a tela inteira sem sobras pretas
          const targetHalfZ = this.tableBounds.halfZ + 0.6;
          const targetHalfX = this.tableBounds.halfX + 0.6;
          const vFovRad = THREE.MathUtils.degToRad(this.camera.fov);
          const distForHeight = targetHalfZ / Math.tan(vFovRad / 2);
          const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);
          const distForWidth = targetHalfX / Math.tan(hFovRad / 2);

          const idealDist = Math.max(distForHeight, distForWidth, 15.5);
          this.camera.position.set(0, idealDist, 0.001);

          this.camera.updateProjectionMatrix();
          this.applyRenderResolution();
        }
      }
    });
    this.resizeObserver.observe(this.containerRef.nativeElement);
  }

  /* ================= DADOS FLUTUANTES COM ESPAÇAMENTO E REPULSÃO SEGURA ================= */

  /**
   * CRIA OS DADOS FLUTUANDO NO AR COM ESPAÇAMENTO GENEROSO (NUNCA ENTRAM UM NO OUTRO)
   */
  public spawnFloatingDice(count: number) {
    this.clearDice();
    const halfSize = this.dieSize / 2;

    this.groupCenter.set(0, 3.2, 0.4);
    this.isFloating = true;
    this.isHolding = false;
    this.isRollingAny = false;

    // Layout orgânico de "punhado de dados" (cluster natural juntinho, e.g. 3 atrás e 2 na frente)
    const clusterPresets: Record<number, { x: number; z: number; y: number; rotY: number }[]> = {
      5: [
        { x: -1.65, z: -0.85, y: 0.12, rotY: -0.12 }, // Trás esquerda
        { x: 0.0,   z: -1.05, y: 0.18, rotY: 0.02 },  // Trás centro
        { x: 1.65,  z: -0.85, y: 0.12, rotY: 0.12 },  // Trás direita
        { x: -0.85, z: 0.72,  y: -0.1, rotY: -0.06 }, // Frente esquerda
        { x: 0.85,  z: 0.72,  y: -0.1, rotY: 0.06 },  // Frente direita
      ],
      4: [
        { x: -1.02, z: -0.95, y: 0.1,  rotY: -0.08 },
        { x: 1.02,  z: -0.95, y: 0.1,  rotY: 0.08 },
        { x: -1.02, z: 0.9,   y: -0.1, rotY: -0.05 },
        { x: 1.02,  z: 0.9,   y: -0.1, rotY: 0.05 },
      ],
      3: [
        { x: 0.0,   z: -1.05, y: 0.15, rotY: 0.0 },
        { x: -1.05, z: 0.85,  y: -0.1, rotY: -0.08 },
        { x: 1.05,  z: 0.85,  y: -0.1, rotY: 0.08 },
      ],
      2: [
        { x: -1.0, z: 0.0, y: 0.0, rotY: -0.08 },
        { x: 1.0,  z: 0.0, y: 0.0, rotY: 0.08 },
      ],
      1: [
        { x: 0.0, z: 0.0, y: 0.0, rotY: 0.0 },
      ],
    };

    const formation = clusterPresets[count] || clusterPresets[5];

    for (let i = 0; i < count; i++) {
      const p = formation[i] || { x: (i - 2) * 1.8, z: 0, y: 0, rotY: 0 };
      const dieGeo = new RoundedBoxGeometry(this.dieSize, this.dieSize, this.dieSize, 3, 0.16);
      const vertexCount = dieGeo.getAttribute('position').count;
      const faceVertCount = Math.floor(vertexCount / 6);
      dieGeo.clearGroups();
      for (let f = 0; f < 6; f++) {
        dieGeo.addGroup(f * faceVertCount, faceVertCount, f);
      }

      const mesh = new THREE.Mesh(dieGeo, this.diceMaterials[0]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      mesh.position.set(
        this.groupCenter.x + p.x,
        this.groupCenter.y + p.y,
        this.groupCenter.z + p.z
      );

      // Leve inclinação natural voltada para o jogador
      mesh.rotation.set(Math.PI * 0.12, p.rotY, 0);
      this.scene.add(mesh);

      // Contorno 3D Cel-Shaded Estilizado (Inverted Hull Silhouette)
      // Inicialmente nos dados voando e rolando: contorninho preto sutil de gibi com boa opacidade
      const outlineGeo = new RoundedBoxGeometry(this.dieSize + 0.10, this.dieSize + 0.10, this.dieSize + 0.10, 2, 0.18);
      const outlineMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.70,
      });
      const outlineMesh = new THREE.Mesh(outlineGeo, outlineMat);
      mesh.add(outlineMesh);

      // Cannon Body
      const body = new CANNON.Body({
        mass: 0,
        type: CANNON.Body.STATIC,
        material: this.dicePhysMat,
        shape: new CANNON.Box(new CANNON.Vec3(halfSize, halfSize, halfSize)),
        linearDamping: 0.38,
        angularDamping: 0.48,
      });
      body.collisionResponse = false;
      body.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
      body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);

      body.addEventListener('collide', (e: { contact: CANNON.ContactEquation }) => {
        const now = performance.now();
        if (now - this.lastSoundTime > 120) {
          const impactV = e.contact ? e.contact.getImpactVelocityAlongNormal() : 2;
          if (Math.abs(impactV) > 1.2) {
            this.soundService.playDiceBounce(Math.min(Math.abs(impactV) / 8, 0.4));
            this.lastSoundTime = now;
          }
        }
      });

      this.world.addBody(body);

      this.diceList.push({
        mesh,
        body,
        outlineMesh,
        outlineMat,
        isRolling: false,
        settled: false,
        isSelected: false,
        offsetX: p.x,
        offsetZ: p.z,
        offsetY: p.y,
        initialRotY: p.rotY,
        followSpeed: 0.11 + (i % 3) * 0.02,
      });
    }
  }

  /**
   * Arremessa os dados: FÍSICA PURA DO CANNON-ES DETERMINA O RESULTADO REAL
   */
  public throwAll(vx = 0, vz = -14) {
    if (!this.isFloating && !this.isHolding && this.isRollingAny) return;

    this.isFloating = false;
    this.isHolding = false;
    this.isRollingAny = true;
    this.throwTimestamp = performance.now();

    this.rollStarted.emit();
    this.soundService.playDiceThrow();

    // Limita a velocidade máxima para não atravessar as paredes, preservando a direção 360° exata
    const flickMag = Math.hypot(vx, vz);
    const maxSpeed = 18;
    let clampedVx = vx;
    let clampedVz = vz;
    if (flickMag > maxSpeed) {
      clampedVx = (vx / flickMag) * maxSpeed;
      clampedVz = (vz / flickMag) * maxSpeed;
    }

    this.diceList.forEach((die, idx) => {
      die.isRolling = true;
      die.settled = false;
      die.isSelected = false;

      // Contorno preto sutil de gibi durante a rolagem (sem branco)
      die.outlineMat.color.setHex(0x000000);
      die.outlineMat.opacity = 0.70;
      die.outlineMesh.scale.setScalar(1.02);

      // Ativa Corpo Dinâmico com Física Real
      die.body.type = CANNON.Body.DYNAMIC;
      die.body.collisionResponse = true;
      die.body.mass = 1.35;
      die.body.linearDamping = 0.38;
      die.body.angularDamping = 0.48;
      die.body.updateMassProperties();
      die.body.wakeUp();

      // Dispersão e Impulsos Caóticos Reais na direção exata do arremesso
      const spreadX = clampedVx + (Math.random() - 0.5) * 4.5;
      const spreadZ = clampedVz + (Math.random() - 0.5) * 4.5;
      const jumpY = 3.0 + Math.random() * 2.5;

      die.body.velocity.set(spreadX, jumpY, spreadZ);
      die.body.angularVelocity.set(
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 22
      );
    });
  }

  /**
   * Lê qual face física real do dado parou voltada para o topo (+Y)
   * NENHUM TELEPORTE / ZERO PISCADA! O resultado é 100% o que caiu na mesa.
   */
  private getPhysicalTopFace(mesh: THREE.Mesh): number {
    let bestValue = 1;
    let maxDot = -Infinity;

    for (const f of this.faceNormals) {
      const worldNormal = f.normal.clone().applyQuaternion(mesh.quaternion);
      if (worldNormal.y > maxDot) {
        maxDot = worldNormal.y;
        bestValue = f.value;
      }
    }

    return bestValue;
  }

  public updateSelectionVisuals(selectedIndices: number[], eligibleIndices?: number[]) {
    this.selectedIndices = selectedIndices;
    if (eligibleIndices) this.eligibleIndices = eligibleIndices;

    this.diceList.forEach((die, idx) => {
      const isSelected = selectedIndices.includes(idx);
      const isEligible = this.eligibleIndices.includes(idx);

      die.isSelected = isSelected;

      // O contorno branco é o highlight APENAS para os que pontuaram:
      if (isSelected) {
        die.outlineMat.color.setHex(0xffffff); // Branco puro brilhante
        die.outlineMat.opacity = 1.0;
        die.outlineMesh.scale.setScalar(1.09);
      } else if (isEligible) {
        die.outlineMat.color.setHex(0xffffff); // Branco puro de highlight
        die.outlineMat.opacity = 1.0;
        die.outlineMesh.scale.setScalar(1.08);
      } else {
        // Dados que NÃO pontuaram: contorninho preto bem de leve com bastante opacidade
        die.outlineMat.color.setHex(0x000000);
        die.outlineMat.opacity = 0.70;
        die.outlineMesh.scale.setScalar(1.02);
      }
    });

    this.updateDiceOverlays();
  }

  public updateDiceOverlays() {
    if (!this.containerRef || this.diceList.length === 0) {
      this.diceOverlays = [];
      return;
    }
    const container = this.containerRef.nativeElement;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    const projVec = new THREE.Vector3();
    this.diceOverlays = this.diceList.map((die, idx) => {
      projVec.set(die.mesh.position.x, die.mesh.position.y + 0.1, die.mesh.position.z);
      projVec.project(this.camera);

      const x = ((projVec.x + 1) * width) / 2;
      const y = ((-projVec.y + 1) * height) / 2;

      return {
        index: idx,
        x,
        y,
        isSelected: this.selectedIndices.includes(idx),
        isEligible: this.eligibleIndices.includes(idx),
        visible: !this.isRollingAny && !this.isFloating,
      };
    });
    this.cdr.markForCheck();
  }

  /**
   * Dispara um popup de pontuação flutuante subindo diretamente do dado especificado
   */
  public spawnScorePopup(dieIndex: number, text: string, isBig = false) {
    const die = this.diceList[dieIndex];
    if (!die || !this.containerRef) return;

    const container = this.containerRef.nativeElement;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    const projVec = new THREE.Vector3(die.mesh.position.x, die.mesh.position.y + 1.2, die.mesh.position.z);
    projVec.project(this.camera);

    const x = ((projVec.x + 1) * width) / 2;
    const y = ((-projVec.y + 1) * height) / 2;

    const id = performance.now() + Math.random();
    this.floatingScorePopups.push({ id, text, x, y, isBig });
    this.soundService.playScorePop(isBig ? 500 : 100);
    this.cdr.markForCheck();

    window.setTimeout(() => {
      this.floatingScorePopups = this.floatingScorePopups.filter((p) => p.id !== id);
      this.cdr.markForCheck();
    }, 1250);
  }

  /**
   * Dispara popups em lote para os grupos pontuadores
   */
  public triggerScoringPopups(groups: { index: number; text: string; isBig?: boolean }[]) {
    groups.forEach((g, i) => {
      window.setTimeout(() => {
        this.spawnScorePopup(g.index, g.text, g.isBig);
      }, i * 110);
    });
  }

  public clearDice() {
    this.diceList.forEach((die) => {
      this.scene.remove(die.mesh);
      die.outlineMesh.geometry.dispose();
      (die.outlineMesh.material as THREE.Material).dispose();
      die.mesh.geometry.dispose();
      this.world.removeBody(die.body);
    });
    this.diceList = [];
    this.diceOverlays = [];
    this.floatingScorePopups = [];
    this.isFloating = false;
    this.isHolding = false;
    this.isRollingAny = false;
    this.dragHistory = [];
    if (this.settleTimeoutId) {
      clearTimeout(this.settleTimeoutId);
      this.settleTimeoutId = null;
    }
  }

  /* ================= INTERAÇÃO DO MOUSE ================= */

  onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || this.diceList.length === 0) return;

    this.updateMouseCoords(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 1. Dados em repouso: clique seleciona/desmarca para pontuar
    const allSettled = this.diceList.every((d) => d.settled);
    if (allSettled && !this.isRollingAny && !this.isFloating) {
      const meshes = this.diceList.map((d) => d.mesh);
      const intersects = this.raycaster.intersectObjects(meshes);
      if (intersects.length > 0) {
        const hitMesh = intersects[0].object as THREE.Mesh;
        const index = this.diceList.findIndex((d) => d.mesh === hitMesh);
        if (index !== -1) {
          this.diceClicked.emit(index);
          return;
        }
      }
      return;
    }

    // 2. Dados flutuando: agarrar com o mouse
    if (this.isFloating) {
      this.isHolding = true;
      this.shakeEnergy = 0;
      this.reversalCount = 0;
      this.lastMoveX = this.groupCenter.x;
      this.lastMoveZ = this.groupCenter.z;
      this.lastMoveTime = performance.now();
      this.lastSignX = 0;
      this.lastSignZ = 0;
      this.lastReversalTime = 0;
      this.soundService.playDiceGrab();
      this.dragHistory = [{ x: this.groupCenter.x, z: this.groupCenter.z, time: performance.now() }];
    }
  }

  onPointerMove(event: PointerEvent) {
    this.updateMouseCoords(event);

    if (this.isHolding) {
      this.raycaster.setFromCamera(this.mouse, this.camera);

      if (this.raycaster.ray.intersectPlane(this.dragPlane, this.planeIntersect)) {
        const clampedX = THREE.MathUtils.clamp(this.planeIntersect.x, -this.tableBounds.halfX + 2, this.tableBounds.halfX - 2);
        const clampedZ = THREE.MathUtils.clamp(this.planeIntersect.z, -this.tableBounds.halfZ + 1.5, this.tableBounds.halfZ - 2.0);
        this.groupCenter.set(clampedX, 3.2, clampedZ);

        const now = performance.now();
        this.dragHistory.push({ x: this.groupCenter.x, z: this.groupCenter.z, time: now });
        if (this.dragHistory.length > 6) {
          this.dragHistory.shift();
        }

        // DETECTOR DE SACUDIDA ESTILO TABLETOP SIMULATOR:
        // Só ativa se o jogador balançar de um lado para o outro (inversões rápidas de sentido)
        const dt = Math.max((now - this.lastMoveTime) / 1000, 0.001);
        const dx = clampedX - this.lastMoveX;
        const dz = clampedZ - this.lastMoveZ;
        const speed = Math.hypot(dx, dz) / dt;

        // Limiar mais ágil: detecta sacudidas curtas e rápidas de pulso
        if ((Math.abs(dx) > 0.12 || Math.abs(dz) > 0.12) && speed > 9) {
          const signX = Math.abs(dx) > 0.08 ? Math.sign(dx) : 0;
          const signZ = Math.abs(dz) > 0.08 ? Math.sign(dz) : 0;

          const reversedX = (signX !== 0 && this.lastSignX !== 0 && signX !== this.lastSignX);
          const reversedZ = (signZ !== 0 && this.lastSignZ !== 0 && signZ !== this.lastSignZ);

          if (reversedX || reversedZ) {
            const timeSinceLastRev = now - this.lastReversalTime;
            // Se inverteu a direção em menos de 500ms (movimento de ziguezague / chacoalhar)
            if (timeSinceLastRev < 500 && timeSinceLastRev > 30) {
              this.reversalCount++;
              this.lastReversalTime = now;

              // Resposta imediata: já na 1ª reversão dá energia e na 2ª entra com tudo
              const energyBoost = this.reversalCount >= 2 ? 0.65 : 0.35;
              this.shakeEnergy = Math.min(this.shakeEnergy + energyBoost, 1.2);
            } else {
              this.reversalCount = 1;
              this.lastReversalTime = now;
            }
            if (signX !== 0) this.lastSignX = signX;
            if (signZ !== 0) this.lastSignZ = signZ;
          } else {
            if (signX !== 0) this.lastSignX = signX;
            if (signZ !== 0) this.lastSignZ = signZ;
          }
        }

        // Se parou de inverter por mais de 400ms, reseta a contagem
        if (now - this.lastReversalTime > 400) {
          this.reversalCount = 0;
        }

        this.lastMoveX = clampedX;
        this.lastMoveZ = clampedZ;
        this.lastMoveTime = now;
      }
    }
  }

  onPointerUp(event: PointerEvent) {
    if (this.isHolding) {
      this.isHolding = false;

      let throwVx = 0;
      let throwVz = 0;

      if (this.dragHistory.length >= 2) {
        const first = this.dragHistory[0];
        const last = this.dragHistory[this.dragHistory.length - 1];
        const dt = Math.max((last.time - first.time) / 1000, 0.016);
        throwVx = ((last.x - first.x) / dt) * 0.85;
        throwVz = ((last.z - first.z) / dt) * 0.85;
      }

      // Se soltar parado ou com flick fraco, arremessa suave em direção ao centro da mesa
      const flickSpeed = Math.hypot(throwVx, throwVz);
      if (flickSpeed < 2.5) {
        const toCenterX = 0 - this.groupCenter.x;
        const toCenterZ = 0 - this.groupCenter.z;
        const dist = Math.hypot(toCenterX, toCenterZ) || 1;
        throwVx = (toCenterX / dist) * 9;
        throwVz = (toCenterZ / dist) * 9;
      }

      this.throwAll(throwVx, throwVz);
      this.dragHistory = [];
    }
  }

  private updateMouseCoords(event: PointerEvent) {
    const rect = this.containerRef.nativeElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /* ================= LOOP DE ANIMAÇÃO E MOTOR CANNON-ES ================= */

  private animate = () => {
    this.animFrameId = requestAnimationFrame(this.animate);
    const now = performance.now();
    const delta = Math.min((now - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = now;

    // 1. MODO FLUTUANDO (Com Repulsão Volumétrica Multicamada: NUNCA entram um no outro)
    if (this.isFloating) {
      const time = now * 0.0025;

      // Decaimento natural da energia de sacudida
      if (this.shakeEnergy > 0) {
        this.shakeEnergy = Math.max(0, this.shakeEnergy - delta * 2.2);
      }

      const isActivelyShaking = this.isHolding && this.shakeEnergy > 0.15;

      this.diceList.forEach((die, i) => {
        // EMBARALHAMENTO (SCRAMBLE): Sutil e coeso, sem se espalharem muito
        const scrambleAmp = isActivelyShaking ? this.shakeEnergy * 0.22 : 0;
        const scrambleX = Math.sin(now * 0.006 + i * 2.3) * scrambleAmp;
        const scrambleZ = Math.cos(now * 0.007 + i * 1.9) * scrambleAmp;

        const targetPosX = this.groupCenter.x + die.offsetX + scrambleX;
        const targetPosZ = this.groupCenter.z + die.offsetZ + scrambleZ;
        const baseOffsetY = die.offsetY || 0;
        const bobbingY = this.groupCenter.y + baseOffsetY + Math.sin(time * 2.2 + i * 1.1) * 0.12;

        const lerpSpeed = this.isHolding ? die.followSpeed : 0.08;
        die.mesh.position.x = THREE.MathUtils.lerp(die.mesh.position.x, targetPosX, lerpSpeed);
        die.mesh.position.y = THREE.MathUtils.lerp(die.mesh.position.y, bobbingY, 0.12);
        die.mesh.position.z = THREE.MathUtils.lerp(die.mesh.position.z, targetPosZ, lerpSpeed);

        if (this.isHolding) {
          const deltaX = targetPosX - die.mesh.position.x;
          // Inclinação suave e firme ao arrastar o mouse pela mesa (sem girar loucamente)
          die.mesh.rotation.z = THREE.MathUtils.lerp(die.mesh.rotation.z, -deltaX * 0.35, 0.1);

          // GIRO 3D / EMBARALHADA SUAVE (rolamento orgânico na mão, sem frenesi)
          if (isActivelyShaking) {
            const rotFactor = this.shakeEnergy * 0.07; // ~3.5x mais suave e controlado
            die.mesh.rotation.x += Math.sin(now * 0.008 + i * 1.5) * rotFactor;
            die.mesh.rotation.y += Math.cos(now * 0.009 + i * 1.8) * rotFactor;
            die.mesh.rotation.z += Math.sin(now * 0.007 + i * 2.1) * rotFactor * 0.5;
          } else {
            // Em movimento normal ou repouso na mão: dados permanecem alinhados e firmes
            const targetRotY = die.initialRotY ?? 0;
            die.mesh.rotation.x = THREE.MathUtils.lerp(die.mesh.rotation.x, Math.PI * 0.12, 0.1);
            die.mesh.rotation.y = THREE.MathUtils.lerp(die.mesh.rotation.y, targetRotY, 0.1);
          }
        } else {
          // Flutuação orgânica com leve balanço (sem girar loucamente)
          const targetRotY = die.initialRotY ?? 0;
          die.mesh.rotation.y = targetRotY + Math.sin(time * 1.2 + i * 0.8) * 0.12;
          die.mesh.rotation.x = Math.PI * 0.12 + Math.cos(time * 0.9 + i * 0.6) * 0.08;
        }
      });

      // REPULSÃO VOLUMÉTRICA MULTICAMADA (4 PASSES):
      // Impede matematicamente que qualquer vértice ou quina cruze outro dado!
      const count = this.diceList.length;
      for (let iter = 0; iter < 4; iter++) {
        for (let i = 0; i < count; i++) {
          for (let j = i + 1; j < count; j++) {
            const p1 = this.diceList[i].mesh.position;
            const p2 = this.diceList[j].mesh.position;
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const dz = p1.z - p2.z;
            const dist = Math.hypot(dx, dy, dz);

            if (dist < this.minDistance && dist > 0.0001) {
              const overlap = (this.minDistance - dist) * 0.5;
              const nx = dx / dist;
              const ny = dy / dist;
              const nz = dz / dist;
              p1.x += nx * overlap;
              p1.y += ny * overlap * 0.35;
              p1.z += nz * overlap;
              p2.x -= nx * overlap;
              p2.y -= ny * overlap * 0.35;
              p2.z -= nz * overlap;
            }
          }
        }
      }

      this.diceList.forEach((die) => {
        die.body.position.set(die.mesh.position.x, die.mesh.position.y, die.mesh.position.z);
        die.body.quaternion.set(die.mesh.quaternion.x, die.mesh.quaternion.y, die.mesh.quaternion.z, die.mesh.quaternion.w);
      });
    }

    // 2. MODO ARREMESSO (Física Real Pura sem teleporte nem piscadas)
    if (this.isRollingAny) {
      // Substepping do Cannon-es para estabilidade máxima e zero atravessamentos
      this.world.step(1 / 60, delta, 3);

      const timeSinceThrow = now - this.throwTimestamp;
      let allDiceStopped = true;

      this.diceList.forEach((die) => {
        if (!die.isRolling) return;

        allDiceStopped = false;

        // Trilha visual 100% física do Cannon-es
        die.mesh.position.set(die.body.position.x, die.body.position.y, die.body.position.z);
        die.mesh.quaternion.set(die.body.quaternion.x, die.body.quaternion.y, die.body.quaternion.z, die.body.quaternion.w);

        const vLen = die.body.velocity.length();
        const aLen = die.body.angularVelocity.length();
        const totalSpeed = vLen + aLen;

        // ANTI-EMPILHAMENTO: Se um dado parar ou diminuir a velocidade em cima de outro dado (Y alto),
        // ele recebe um impulso lateral suave para escorregar até o feltro!
        if (die.body.position.y > this.tableBounds.floorY + 0.45 && totalSpeed < 2.5) {
          const pushAngle = Math.random() * Math.PI * 2;
          die.body.velocity.x += Math.cos(pushAngle) * 3.5;
          die.body.velocity.z += Math.sin(pushAngle) * 3.5;
          die.body.angularVelocity.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
        }

        const isNearFloor = die.body.position.y <= this.tableBounds.floorY + 0.35;
        // Permite que o dado pare naturalmente no feltro por atrito
        const isSlowEnough = totalSpeed < 0.08 && isNearFloor;
        // O timeout de segurança (3.5s) NUNCA é travado por isNearFloor! Garante que nunca trave
        const isTimeOut = timeSinceThrow > 3500;

        if (isSlowEnough || isTimeOut) {
          die.isRolling = false;
          die.settled = true;

          die.body.velocity.set(0, 0, 0);
          die.body.angularVelocity.set(0, 0, 0);

          if (die.body.position.y > this.tableBounds.floorY + 0.1) {
            die.body.position.y = this.tableBounds.floorY;
          }

          die.body.sleep();
          die.mesh.position.set(die.body.position.x, die.body.position.y, die.body.position.z);
          die.mesh.quaternion.set(die.body.quaternion.x, die.body.quaternion.y, die.body.quaternion.z, die.body.quaternion.w);
        }
      });

      // Quando todos os dados assentaram no feltro:
      if (allDiceStopped && this.diceList.length > 0 && this.diceList.every((d) => d.settled)) {
        this.isRollingAny = false;

        // ANTI-EMPILHAMENTO E SEPARAÇÃO DEFINITIVA (Zero sobreposição / penetração):
        // 1. Nivelar todos no chão físico da mesa
        this.diceList.forEach((die) => {
          die.body.position.y = this.tableBounds.floorY;
          die.body.velocity.set(0, 0, 0);
          die.body.angularVelocity.set(0, 0, 0);
        });

        // 2. 12 passos de relaxamento em 2D (X, Z) garantindo distância mínima
        const count = this.diceList.length;
        for (let iter = 0; iter < 12; iter++) {
          for (let i = 0; i < count; i++) {
            for (let j = i + 1; j < count; j++) {
              const p1 = this.diceList[i].body.position;
              const p2 = this.diceList[j].body.position;
              const dx = p1.x - p2.x;
              const dz = p1.z - p2.z;
              const dist = Math.hypot(dx, dz);
              if (dist < this.minDistance) {
                const overlap = (this.minDistance - (dist || 0.001)) * 0.5;
                const angle = dist > 0.001 ? Math.atan2(dz, dx) : Math.random() * Math.PI * 2;
                p1.x += Math.cos(angle) * overlap;
                p1.z += Math.sin(angle) * overlap;
                p2.x -= Math.cos(angle) * overlap;
                p2.z -= Math.sin(angle) * overlap;

                p1.x = THREE.MathUtils.clamp(p1.x, -this.tableBounds.halfX + 1.2, this.tableBounds.halfX - 1.2);
                p1.z = THREE.MathUtils.clamp(p1.z, -this.tableBounds.halfZ + 1.2, this.tableBounds.halfZ - 1.2);
                p2.x = THREE.MathUtils.clamp(p2.x, -this.tableBounds.halfX + 1.2, this.tableBounds.halfX - 1.2);
                p2.z = THREE.MathUtils.clamp(p2.z, -this.tableBounds.halfZ + 1.2, this.tableBounds.halfZ - 1.2);
              }
            }
          }
        }

        // 3. Dorme os corpos e sincroniza malhas
        this.diceList.forEach((die) => {
          die.body.sleep();
          die.mesh.position.set(die.body.position.x, die.body.position.y, die.body.position.z);
          die.mesh.quaternion.set(die.body.quaternion.x, die.body.quaternion.y, die.body.quaternion.z, die.body.quaternion.w);
        });

        // Atualiza anéis e auras dos dados assentados
        this.updateDiceOverlays();

        // Lê os números reais físicos do topo de cada dado
        const physicalResults = this.diceList.map((d) => this.getPhysicalTopFace(d.mesh));

        // Delay de contemplação ágil de 600ms (vê parado claramente, sem lentidão)
        if (this.settleTimeoutId) {
          clearTimeout(this.settleTimeoutId);
        }
        this.settleTimeoutId = window.setTimeout(() => {
          this.ngZone.run(() => {
            this.rollFinished.emit(physicalResults);
          });
        }, 600);
      }
    } else if (!this.isFloating && !this.isHolding) {
      // 3. MODO REPOUSO / SELEÇÃO (Levitação suave dos dados marcados)
      this.diceList.forEach((die) => {
        const targetY = die.isSelected ? 1.8 : this.tableBounds.floorY;
        die.mesh.position.y = THREE.MathUtils.lerp(die.mesh.position.y, targetY, 0.2);
      });
      this.updateDiceOverlays();
    }

    this.renderer.render(this.scene, this.camera);
  };
}
