/**
 * ═══════════════════════════════════════════════════════════════════
 * 3D Interactive Lab Scene (Three.js) — Luxury Studio Architectural Theme
 * 
 * Features:
 * - Black reflective tile floor
 * - 4 Corner Dark Grey Architectural Pillars
 * - Glass Walls with Front Wall Entrance
 * - Continuous connected creamish-yellow wooden slab benches on Left & Right
 * - PC-8 moved forward into room & rotated
 * - PC-7 on front entrance wall
 * - Overhead warm-glow suspended Infinity Tube light (∞)
 * - Cozy warm architectural lighting
 * - Live glowing monitor screens (Green/Red) & raycasting modal
 * ═══════════════════════════════════════════════════════════════════
 */

let scene, camera, renderer, controls;
let pcWorkstations = {}; // Map of pc_id -> { group, screenMesh, sprite, status, pcData }
let raycaster, mouse;
let hoveredPC = null;
let animationFrameId = null;

// Palette & Architectural Materials
const PALETTE = {
    floor: 0x11141a,          // Sleek dark black floor
    floorGrid: 0x242b38,      // Subtle grid line
    pillar: 0x1e2430,         // Dark grey pillars
    glassWall: 0x64748b,      // Tempered architectural glass
    wallFrame: 0x334155,      // Wall trim metal
    woodSlab: 0xe5c583,       // Creamish yellow wood
    metalFrame: 0x1e222b,     // Dark metal table frame/legs
    monitorBezel: 0x0a0c10,   // Matte black monitor
    keyboard: 0x1e2430,       // Dark keyboard
    chairSeat: 0x252a36,      // Dark ergonomic chair
    infinityGlow: 0xffb84d,   // Warm golden-amber LED
    screenFree: 0x10b981,     // Emerald green glow
    screenOccupied: 0xef4444  // Crimson red glow
};

// Parametric Lemniscate (Infinity Symbol ∞)
class InfinityCurve extends THREE.Curve {
    constructor(scale = 3.6, height = 3.4) {
        super();
        this.scale = scale;
        this.height = height;
    }
    getPoint(t, optionalTarget = new THREE.Vector3()) {
        const point = optionalTarget;
        const angle = t * Math.PI * 2;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        const denom = 1 + sin * sin;
        const x = (this.scale * cos) / denom;
        const z = (this.scale * sin * cos * 1.8) / denom;
        const y = this.height;
        return point.set(x, y, z);
    }
}

/**
 * Initializes the entire 3D Three.js scene
 */
function init3DLabScene() {
    const container = document.getElementById("canvas-3d-container");
    const canvas = document.getElementById("lab-3d-canvas");
    if (!container || !canvas) return;

    // 1. Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d13); // Dark cinematic backdrop
    scene.fog = new THREE.FogExp2(0x0b0d13, 0.015);

    // 2. Camera (Isometric View)
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 100);
    setDefaultCameraPosition();

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance"
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    // 4. OrbitControls
    if (typeof THREE.OrbitControls !== "undefined") {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2.05; // Stay above floor
        controls.minDistance = 6;
        controls.maxDistance = 35;
        controls.target.set(0, 1.1, 0);
    }

    // 5. Warm Lighting Setup
    setupWarmLighting();

    // 6. Build Room Architecture (Black floor, glass walls, 4 pillars, entrance)
    buildRoomArchitecture();

    // 7. Infinity Overhead Light Fixture (∞)
    buildInfinityChandelier();

    // 8. Build Workstations (Connected slabs + PC-7 + PC-8)
    buildAllLabWorkstations();

    // 9. Raycasting for Click / Touch
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Listeners
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("click", onCanvasClick);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    window.addEventListener("resize", onWindowResize);

    const resetBtn = document.getElementById("reset-cam-btn");
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            setDefaultCameraPosition();
            if (controls) controls.target.set(0, 1.1, 0);
        });
    }

    // Start Render Loop
    animate();
}

function setDefaultCameraPosition() {
    camera.position.set(13.5, 14.5, 15.5);
    camera.lookAt(0, 1.1, 0);
}

/**
 * Cozy Warm Lighting Setup
 */
function setupWarmLighting() {
    // Warm Ambient
    const ambientLight = new THREE.AmbientLight(0xffecd2, 0.65);
    scene.add(ambientLight);

    // Warm Hemisphere
    const hemiLight = new THREE.HemisphereLight(0xfff5eb, 0x1e2029, 0.55);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    // Key Warm Sun/Directional Light
    const warmKeyLight = new THREE.DirectionalLight(0xffd8a8, 0.9);
    warmKeyLight.position.set(10, 16, 9);
    warmKeyLight.castShadow = true;
    warmKeyLight.shadow.mapSize.width = 2048;
    warmKeyLight.shadow.mapSize.height = 2048;
    warmKeyLight.shadow.camera.near = 0.5;
    warmKeyLight.shadow.camera.far = 40;
    const d = 10;
    warmKeyLight.shadow.camera.left = -d;
    warmKeyLight.shadow.camera.right = d;
    warmKeyLight.shadow.camera.top = d;
    warmKeyLight.shadow.camera.bottom = -d;
    warmKeyLight.shadow.bias = -0.0004;
    scene.add(warmKeyLight);

    // Soft warm fill light
    const warmFill = new THREE.PointLight(0xffb84d, 0.8, 18, 1.2);
    warmFill.position.set(0, 3.2, 0);
    scene.add(warmFill);

    // Secondary subtle rim light
    const rimLight = new THREE.DirectionalLight(0xffe0b2, 0.35);
    rimLight.position.set(-10, 8, -8);
    scene.add(rimLight);
}

/**
 * Builds Black Floor, 4 Dark Grey Pillars, Glass Walls, and Front Entrance
 */
function buildRoomArchitecture() {
    const roomW = 14;
    const roomD = 14;

    // 1. Black Floor Base
    const floorGeo = new THREE.PlaneGeometry(roomW, roomD);
    const floorMat = new THREE.MeshStandardMaterial({
        color: PALETTE.floor,
        roughness: 0.25,
        metalness: 0.15
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Subtle dark grid
    const grid = new THREE.GridHelper(roomW, 14, PALETTE.floorGrid, PALETTE.floorGrid);
    grid.position.y = 0.005;
    scene.add(grid);

    // 2. Four Dark Grey Corner Pillars (Tall Architectural Height)
    const pillarH = 4.6;
    const pillarW = 0.65;
    const pillarGeo = new THREE.BoxGeometry(pillarW, pillarH, pillarW);
    const pillarMat = new THREE.MeshStandardMaterial({
        color: PALETTE.pillar,
        roughness: 0.4,
        metalness: 0.25
    });

    const pillarPositions = [
        [-roomW / 2 + pillarW / 2, pillarH / 2, -roomD / 2 + pillarW / 2], // Top-Left
        [roomW / 2 - pillarW / 2, pillarH / 2, -roomD / 2 + pillarW / 2],  // Top-Right
        [-roomW / 2 + pillarW / 2, pillarH / 2, roomD / 2 - pillarW / 2],  // Bottom-Left
        [roomW / 2 - pillarW / 2, pillarH / 2, roomD / 2 - pillarW / 2]   // Bottom-Right
    ];

    pillarPositions.forEach(pos => {
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(...pos);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        scene.add(pillar);
    });

    // 3. Full-Height Glass Walls with Dark Metal Framing
    const wallH = 3.6;
    const glassMat = new THREE.MeshStandardMaterial({
        color: PALETTE.glassWall,
        roughness: 0.1,
        metalness: 0.2,
        transparent: true,
        opacity: 0.35
    });
    const frameMat = new THREE.MeshStandardMaterial({ color: PALETTE.wallFrame, roughness: 0.4 });

    function createGlassWall(w, h, d, x, y, z) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glassMat);
        wall.position.set(x, y, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);

        // Top Frame Trim
        const topFrame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.08, d + 0.02), frameMat);
        topFrame.position.set(x, y + h / 2 + 0.04, z);
        scene.add(topFrame);
    }

    // Back Glass Wall (Full Height)
    createGlassWall(roomW - pillarW * 2, wallH, 0.12, 0, wallH / 2, -roomD / 2 + 0.06);

    // Left Glass Wall (Full Height)
    createGlassWall(0.12, wallH, roomD - pillarW * 2, -roomW / 2 + 0.06, wallH / 2, 0);

    // Right Glass Wall (Full Height)
    createGlassWall(0.12, wallH, roomD - pillarW * 2, roomW / 2 - 0.06, wallH / 2, 0);

    // Front Wall with Entrance Opening (Near Left side of front wall)
    // Left section of front wall (0.8m)
    createGlassWall(1.8, wallH, 0.12, -roomW / 2 + 1.55, wallH / 2, roomD / 2 - 0.06);
    // Right section of front wall (Leaves entrance opening from X = -4.3 to X = -1.8)
    createGlassWall(7.5, wallH, 0.12, 2.65, wallH / 2, roomD / 2 - 0.06);

    // 4. Physical 3D Entrance Gate Architecture
    build3DLabGate(-4.3, -1.8, roomD / 2 - 0.06, wallH);
}

/**
 * Builds 3D Physical Entrance Gate (Jambs, Lintel, Double Swinging Glass Doors, Handles & Scanner)
 */
function build3DLabGate(xLeft, xRight, zPos, gateHeight) {
    const gateGroup = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: PALETTE.pillar, roughness: 0.35, metalness: 0.3 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.15, metalness: 0.85 });
    const doorGlassMat = new THREE.MeshStandardMaterial({
        color: 0x93c5fd,
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.55
    });

    const doorW = (xRight - xLeft) / 2 - 0.04;
    const doorH = gateHeight - 0.2;

    // 1. Left & Right Door Posts (Jambs)
    const postGeo = new THREE.BoxGeometry(0.14, gateHeight, 0.14);
    const leftPost = new THREE.Mesh(postGeo, frameMat);
    leftPost.position.set(xLeft, gateHeight / 2, zPos);
    leftPost.castShadow = true;
    gateGroup.add(leftPost);

    const rightPost = new THREE.Mesh(postGeo, frameMat);
    rightPost.position.set(xRight, gateHeight / 2, zPos);
    rightPost.castShadow = true;
    gateGroup.add(rightPost);

    // 2. Overhead Lintel Beam
    const lintelW = xRight - xLeft + 0.14;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(lintelW, 0.18, 0.16), frameMat);
    lintel.position.set((xLeft + xRight) / 2, gateHeight - 0.09, zPos);
    lintel.castShadow = true;
    gateGroup.add(lintel);

    // 3. Left Swinging Glass Door Leaf (Ajar / Open inwards)
    const leftDoorPivot = new THREE.Group();
    leftDoorPivot.position.set(xLeft + 0.05, 0, zPos);
    leftDoorPivot.rotation.y = Math.PI / 4.5; // Swung 40 deg inwards

    // Door glass panel
    const doorLeafGeo = new THREE.BoxGeometry(doorW, doorH, 0.035);
    const leftDoorMesh = new THREE.Mesh(doorLeafGeo, doorGlassMat);
    leftDoorMesh.position.set(doorW / 2, doorH / 2, 0);
    leftDoorMesh.castShadow = true;
    leftDoorPivot.add(leftDoorMesh);

    // Door frame border (Dark trim around glass)
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.02, doorH + 0.02, 0.04), frameMat);
    doorFrame.position.set(doorW / 2, doorH / 2, 0);
    // leftDoorPivot.add(doorFrame);

    // Handle bar
    const handleGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.9);
    const leftHandle = new THREE.Mesh(handleGeo, handleMat);
    leftHandle.position.set(doorW - 0.1, doorH / 2, 0.04);
    leftDoorPivot.add(leftHandle);

    gateGroup.add(leftDoorPivot);

    // 4. Right Swinging Glass Door Leaf (Ajar / Open inwards)
    const rightDoorPivot = new THREE.Group();
    rightDoorPivot.position.set(xRight - 0.05, 0, zPos);
    rightDoorPivot.rotation.y = -Math.PI / 4.5; // Swung -40 deg inwards

    const rightDoorMesh = new THREE.Mesh(doorLeafGeo, doorGlassMat);
    rightDoorMesh.position.set(-doorW / 2, doorH / 2, 0);
    rightDoorMesh.castShadow = true;
    rightDoorPivot.add(rightDoorMesh);

    const rightHandle = new THREE.Mesh(handleGeo, handleMat);
    rightHandle.position.set(-doorW + 0.1, doorH / 2, 0.04);
    rightDoorPivot.add(rightHandle);

    gateGroup.add(rightDoorPivot);

    // 5. Access Scanner Pedestal on entrance side
    const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.3 });
    const scannerPedestal = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), pedestalMat);
    scannerPedestal.position.set(xRight + 0.35, 0.55, zPos + 0.6);
    scannerPedestal.castShadow = true;
    gateGroup.add(scannerPedestal);

    // Glowing Blue RFID/NFC Reader on top of pedestal
    const scannerBezel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.16), new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        emissive: 0x3b82f6,
        emissiveIntensity: 1.2
    }));
    scannerBezel.position.set(xRight + 0.35, 1.12, zPos + 0.6);
    gateGroup.add(scannerBezel);

    // 6. 3D Gate Overhead Illuminated Sign
    const gateSign = createTextBadge("🚪 AI/ML LAB GATE", "#bfdbfe", "#1e3a8a");
    gateSign.position.set((xLeft + xRight) / 2, gateHeight + 0.55, zPos);
    gateSign.scale.set(2.2, 0.75, 1);
    gateGroup.add(gateSign);

    scene.add(gateGroup);
}

/**
 * Overhead Warm Modular Tube in Shape of Infinity (∞) — Raised High
 */
function buildInfinityChandelier() {
    const infinityCurve = new InfinityCurve(3.8, 4.4); // Raised to 4.4m
    const tubeGeo = new THREE.TubeGeometry(infinityCurve, 160, 0.08, 16, true);
    
    // Glowing warm LED material
    const tubeMat = new THREE.MeshStandardMaterial({
        color: PALETTE.infinityGlow,
        emissive: PALETTE.infinityGlow,
        emissiveIntensity: 2.0,
        roughness: 0.1
    });

    const infinityTube = new THREE.Mesh(tubeGeo, tubeMat);
    scene.add(infinityTube);

    // Light cords hanging from high ceiling
    const cordMat = new THREE.MeshBasicMaterial({ color: 0x334155 });
    const cordGeo = new THREE.CylinderGeometry(0.012, 0.012, 1.4);

    const cordPoints = [
        [-2.4, 5.1, 0],
        [2.4, 5.1, 0],
        [0, 5.1, 1.5],
        [0, 5.1, -1.5]
    ];

    cordPoints.forEach(pos => {
        const cord = new THREE.Mesh(cordGeo, cordMat);
        cord.position.set(...pos);
        scene.add(cord);
    });

    // Warm Spotlights under the raised infinity loops
    const spotLeft = new THREE.PointLight(PALETTE.infinityGlow, 1.3, 14, 1.4);
    spotLeft.position.set(-2.0, 4.1, 0);
    scene.add(spotLeft);

    const spotRight = new THREE.PointLight(PALETTE.infinityGlow, 1.3, 14, 1.4);
    spotRight.position.set(2.0, 4.1, 0);
    scene.add(spotRight);
}

/**
 * Builds Workstations:
 * - Continuous connected wooden slabs on Left (PC-1, PC-2, PC-3) and Right (PC-4, PC-5, PC-6)
 * - PC-7 at front wall near entrance
 * - PC-8 rotated and moved forward into the room
 */
function buildAllLabWorkstations() {
    const slabW = 1.15;
    const slabL = 7.8;
    const slabH = 0.08;
    const tablePosY = 1.0;

    const woodMat = new THREE.MeshStandardMaterial({
        color: PALETTE.woodSlab, // Creamish yellow wood
        roughness: 0.45,
        metalness: 0.08
    });
    const metalLegMat = new THREE.MeshStandardMaterial({ color: PALETTE.metalFrame, roughness: 0.35 });

    // Helper: Build a continuous bench slab with support legs
    function createConnectedBench(centerX, centerZ) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(slabW, slabH, slabL), woodMat);
        slab.position.set(centerX, tablePosY, centerZ);
        slab.castShadow = true;
        slab.receiveShadow = true;
        scene.add(slab);

        // Heavy metal support leg frames under slab
        const legZOffsets = [-slabL / 2 + 0.2, 0, slabL / 2 - 0.2];
        legZOffsets.forEach(lz => {
            const frameGeo = new THREE.BoxGeometry(slabW - 0.1, tablePosY, 0.06);
            const legFrame = new THREE.Mesh(frameGeo, metalLegMat);
            legFrame.position.set(centerX, tablePosY / 2, centerZ + lz);
            legFrame.castShadow = true;
            scene.add(legFrame);
        });
    }

    // 1. Left Continuous Wooden Slab (Holds PC-1, PC-2, PC-3)
    createConnectedBench(-5.3, -1.0);

    // 2. Right Continuous Wooden Slab (Holds PC-4, PC-5, PC-6)
    createConnectedBench(5.3, -1.0);

    // 3. Mount Left Monitors & Accessories on Left Slab
    mountMonitorStation("PC-1", -5.3, 1.8, Math.PI / 2, tablePosY + slabH / 2);
    mountMonitorStation("PC-2", -5.3, -1.0, Math.PI / 2, tablePosY + slabH / 2);
    mountMonitorStation("PC-3", -5.3, -3.8, Math.PI / 2, tablePosY + slabH / 2);

    // 4. Mount Right Monitors & Accessories on Right Slab
    mountMonitorStation("PC-4", 5.3, 1.8, -Math.PI / 2, tablePosY + slabH / 2);
    mountMonitorStation("PC-5", 5.3, -1.0, -Math.PI / 2, tablePosY + slabH / 2);
    mountMonitorStation("PC-6", 5.3, -3.8, -Math.PI / 2, tablePosY + slabH / 2);

    // 5. PC-7 Table on Front Entrance Wall (X = 1.8, Z = 4.8, rotated Math.PI)
    createStandaloneTable("PC-7", 1.8, 4.8, Math.PI, woodMat, metalLegMat, tablePosY, slabH);

    // 6. PC-8: Moved forward inside room & rotated (Z = -3.8, X = 0.0, rotated Math.PI)
    createStandaloneTable("PC-8", 0.0, -3.8, Math.PI, woodMat, metalLegMat, tablePosY, slabH);
}

/**
 * Creates a standalone table workstation (for PC-7 and PC-8)
 */
function createStandaloneTable(pcId, posX, posZ, rotY, woodMat, metalLegMat, tablePosY, slabH) {
    const tableW = 2.0;
    const tableD = 1.1;

    const group = new THREE.Group();
    group.position.set(posX, 0, posZ);
    group.rotation.y = rotY;

    // Tabletop
    const top = new THREE.Mesh(new THREE.BoxGeometry(tableW, slabH, tableD), woodMat);
    top.position.set(0, tablePosY, 0);
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.06, tablePosY, 0.06);
    const legOffsets = [
        [-tableW / 2 + 0.1, tablePosY / 2, -tableD / 2 + 0.1],
        [tableW / 2 - 0.1, tablePosY / 2, -tableD / 2 + 0.1],
        [-tableW / 2 + 0.1, tablePosY / 2, tableD / 2 - 0.1],
        [tableW / 2 - 0.1, tablePosY / 2, tableD / 2 - 0.1]
    ];
    legOffsets.forEach(pos => {
        const leg = new THREE.Mesh(legGeo, metalLegMat);
        leg.position.set(...pos);
        leg.castShadow = true;
        group.add(leg);
    });

    scene.add(group);

    // Mount Monitor on this standalone table
    mountMonitorStation(pcId, posX, posZ, rotY, tablePosY + slabH / 2);
}

/**
 * Mounts Monitor, Stand, Keyboard, Mouse, Ergonomic Chair, and 3D Floating Badge
 */
function mountMonitorStation(pcId, posX, posZ, rotY, surfaceY) {
    const group = new THREE.Group();
    group.position.set(posX, 0, posZ);
    group.rotation.y = rotY;

    const bezelMat = new THREE.MeshStandardMaterial({ color: PALETTE.monitorBezel, roughness: 0.3 });

    // Monitor Stand
    const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.25), bezelMat);
    standBase.position.set(0, surfaceY + 0.01, -0.25);
    group.add(standBase);

    const standArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.38, 0.04), bezelMat);
    standArm.position.set(0, surfaceY + 0.2, -0.3);
    group.add(standArm);

    // Monitor Bezel
    const screenW = 1.05;
    const screenH = 0.65;
    const screenD = 0.04;
    const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(screenW, screenH, screenD), bezelMat);
    screenFrame.position.set(0, surfaceY + 0.45, -0.25);
    screenFrame.castShadow = true;
    group.add(screenFrame);

    // Glowing Display Screen (Green/Red)
    const screenMat = new THREE.MeshStandardMaterial({
        color: PALETTE.screenFree,
        emissive: PALETTE.screenFree,
        emissiveIntensity: 0.75,
        roughness: 0.2
    });
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(screenW - 0.06, screenH - 0.06), screenMat);
    screenMesh.position.set(0, surfaceY + 0.45, -0.25 + screenD / 2 + 0.002);
    group.add(screenMesh);

    // Keyboard & Mouse
    const kbMat = new THREE.MeshStandardMaterial({ color: PALETTE.keyboard, roughness: 0.6 });
    const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.015, 0.22), kbMat);
    keyboard.position.set(0, surfaceY + 0.008, 0.15);
    group.add(keyboard);

    const mouseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.12), kbMat);
    mouseMesh.position.set(0.45, surfaceY + 0.008, 0.15);
    group.add(mouseMesh);

    // Ergonomic Chair
    const chairGroup = new THREE.Group();
    chairGroup.position.set(0, 0, 0.75);

    const chairMat = new THREE.MeshStandardMaterial({ color: PALETTE.chairSeat, roughness: 0.7 });
    const metalMat = new THREE.MeshStandardMaterial({ color: PALETTE.metalFrame, roughness: 0.4 });

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.6), chairMat);
    seat.position.set(0, 0.65, 0);
    seat.castShadow = true;
    chairGroup.add(seat);

    const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.06), chairMat);
    backrest.position.set(0, 1.02, 0.27);
    backrest.castShadow = true;
    chairGroup.add(backrest);

    const chairStem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), metalMat);
    chairStem.position.set(0, 0.3, 0);
    chairGroup.add(chairStem);

    const chairBase = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 6), metalMat);
    chairBase.position.set(0, 0.02, 0);
    chairGroup.add(chairBase);

    group.add(chairGroup);

    // 3D Floating Badge Sprite
    const sprite = createStatusSprite(pcId, "AVAILABLE", true);
    sprite.position.set(0, surfaceY + 1.25, 0);
    sprite.scale.set(1.9, 0.75, 1);
    group.add(sprite);

    // Click Hitbox for Raycaster
    const hitBoxGeo = new THREE.BoxGeometry(1.8, 2.0, 1.8);
    const hitBoxMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
    const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
    hitBox.position.set(0, 1.0, 0);
    hitBox.userData = { pcId: pcId };
    group.add(hitBox);

    scene.add(group);

    pcWorkstations[pcId] = {
        group: group,
        screenMesh: screenMesh,
        screenMat: screenMat,
        sprite: sprite,
        hitBox: hitBox,
        status: "free",
        pcData: null
    };
}

/**
 * Generates high-DPI canvas texture for 3D floating sprite badge
 */
function createStatusSprite(pcId, statusText, isFree) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");

    drawSpriteCanvas(ctx, pcId, statusText, isFree);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.userData = { canvas: canvas, ctx: ctx, texture: texture };
    return sprite;
}

function drawSpriteCanvas(ctx, pcId, statusText, isFree) {
    ctx.clearRect(0, 0, 512, 200);

    // Card background pill
    const radius = 24;
    const bgColor = isFree ? "rgba(16, 185, 129, 0.92)" : "rgba(239, 68, 68, 0.95)";
    ctx.fillStyle = "rgba(15, 20, 28, 0.9)";
    roundRect(ctx, 16, 16, 480, 168, radius);
    ctx.fill();

    ctx.strokeStyle = isFree ? "#10b981" : "#ef4444";
    ctx.lineWidth = 6;
    roundRect(ctx, 16, 16, 480, 168, radius);
    ctx.stroke();

    // PC Name (Top)
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 52px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`💻 ${pcId}`, 256, 70);

    // Status Pill (Bottom)
    ctx.fillStyle = bgColor;
    roundRect(ctx, 60, 110, 392, 54, 16);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px 'Inter', sans-serif";
    const label = isFree ? "🟢 AVAILABLE" : `🔴 ${statusText}`;
    ctx.fillText(label, 256, 138);
}

function createTextBadge(text, textColor, bgColor) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = bgColor;
    roundRect(ctx, 10, 10, 492, 140, 24);
    ctx.fill();

    ctx.strokeStyle = textColor;
    ctx.lineWidth = 4;
    roundRect(ctx, 10, 10, 492, 140, 24);
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = "bold 44px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 80);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    return new THREE.Sprite(mat);
}

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

/**
 * Live Updates 3D Scene with backend PC Status
 */
function updatePCStatusIn3D(pcs) {
    if (!pcs || !Array.isArray(pcs)) return;

    pcs.forEach(pc => {
        const item = pcWorkstations[pc.pc_id];
        if (!item) return;

        const isFree = pc.status.toLowerCase() === "free";
        item.status = isFree ? "free" : "occupied";
        item.pcData = pc;

        // 1. Update Screen Material Color & Emissive
        const targetColor = isFree ? PALETTE.screenFree : PALETTE.screenOccupied;
        item.screenMat.color.setHex(targetColor);
        item.screenMat.emissive.setHex(targetColor);
        item.screenMat.emissiveIntensity = isFree ? 0.75 : 0.95;

        // 2. Update Floating Sprite Canvas Texture
        if (item.sprite && item.sprite.userData) {
            const { ctx, texture } = item.sprite.userData;
            const statusLabel = isFree ? "AVAILABLE" : (pc.occupied_by || "IN USE");
            drawSpriteCanvas(ctx, pc.pc_id, statusLabel, isFree);
            texture.needsUpdate = true;
        }
    });
}

/**
 * Raycasting Mouse Interactions
 */
function getIntersectedPC(clientX, clientY) {
    const canvas = document.getElementById("lab-3d-canvas");
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const hitBoxes = Object.values(pcWorkstations).map(w => w.hitBox);
    const intersects = raycaster.intersectObjects(hitBoxes);

    if (intersects.length > 0) {
        return intersects[0].object.userData.pcId;
    }
    return null;
}

function onMouseMove(event) {
    const canvas = document.getElementById("lab-3d-canvas");
    const pcId = getIntersectedPC(event.clientX, event.clientY);

    if (pcId) {
        canvas.style.cursor = "pointer";
        if (hoveredPC !== pcId) {
            hoveredPC = pcId;
            highlightPC(pcId, true);
        }
    } else {
        canvas.style.cursor = "default";
        if (hoveredPC) {
            highlightPC(hoveredPC, false);
            hoveredPC = null;
        }
    }
}

function highlightPC(pcId, isHovered) {
    const item = pcWorkstations[pcId];
    if (!item) return;

    if (isHovered) {
        item.screenMat.emissiveIntensity = 1.4;
    } else {
        item.screenMat.emissiveIntensity = item.status === "free" ? 0.75 : 0.95;
    }
}

function onCanvasClick(event) {
    const pcId = getIntersectedPC(event.clientX, event.clientY);
    if (pcId) {
        const item = pcWorkstations[pcId];
        const isFree = item ? item.status === "free" : true;
        if (typeof handlePCClick === "function") {
            handlePCClick(pcId, isFree);
        }
    }
}

function onTouchStart(event) {
    if (event.touches.length === 1) {
        const touch = event.touches[0];
        const pcId = getIntersectedPC(touch.clientX, touch.clientY);
        if (pcId) {
            const item = pcWorkstations[pcId];
            const isFree = item ? item.status === "free" : true;
            if (typeof handlePCClick === "function") {
                handlePCClick(pcId, isFree);
            }
        }
    }
}

function onWindowResize() {
    const container = document.getElementById("canvas-3d-container");
    if (!container || !renderer || !camera) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

/**
 * Render Loop with subtle breathing animation on monitors & infinity glow
 */
let clock = new THREE.Clock();

function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const time = clock.getElapsedTime();

    if (controls) controls.update();

    // Subtle gentle pulse for occupied screens and floating badges
    Object.values(pcWorkstations).forEach(item => {
        if (item.status === "occupied") {
            item.screenMat.emissiveIntensity = 0.85 + Math.sin(time * 3.5) * 0.2;
        }
        if (item.sprite) {
            item.sprite.position.y = 1.0 + 1.25 + Math.sin(time * 2 + (item.group.position.x || 0)) * 0.03;
        }
    });

    renderer.render(scene, camera);
}
