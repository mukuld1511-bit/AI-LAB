/**
 * ═══════════════════════════════════════════════════════════════════
 * 3D Interactive AI LAB Digital Twin (Three.js)
 * 
 * Features:
 * - Strictly "AI LAB" Branding
 * - Black Reflective Floor with 4 Tall Dark Grey Corner Pillars
 * - 30% Solid Cream Wall Sections on Left & Right + 70% Glass Walls
 * - Red Board with White Inset Plate "AI LAB" Sign on Right of Gate
 * - Interactive Openable/Closeable Single Glass Gate (Click to swing open/close)
 * - Interactive Smart Light Switch on Left Corner Pillar (Click to toggle lights ON/OFF)
 * - Interactive Smart AC Switch on Left Corner Pillar + AC Wall Unit (Click to toggle AC ON/OFF)
 * - Continuous connected creamish-yellow wooden slab benches on Left & Right
 * - PC-8 moved forward into room & rotated; PC-7 on front entrance wall
 * - Overhead warm-glow suspended Infinity Tube light (∞)
 * - Real-time green/red monitor screen status & modal interaction
 * ═══════════════════════════════════════════════════════════════════
 */

let scene, camera, renderer, controls;
let pcWorkstations = {}; // Map of pc_id -> { group, screenMesh, sprite, status, pcData }
let raycaster, mouse;
let hoveredItem = null;
let animationFrameId = null;

// Palette & Architectural Materials
const PALETTE = {
    floor: 0x11141a,          // Sleek dark black floor
    floorGrid: 0x242b38,      // Subtle grid line
    pillar: 0x1e2430,         // Dark grey pillars
    glassWall: 0x64748b,      // Tempered architectural glass
    wallFrame: 0x334155,      // Wall trim metal
    woodSlab: 0xe5c583,       // Creamish yellow wood
    creamWall: 0xecd7b0,      // Solid cream wall section
    metalFrame: 0x1e222b,     // Dark metal table frame/legs
    monitorBezel: 0x0a0c10,   // Matte black monitor
    keyboard: 0x1e2430,       // Dark keyboard
    chairSeat: 0x252a36,      // Dark ergonomic chair
    infinityGlow: 0xffb84d,   // Warm golden-amber LED
    screenFree: 0x10b981,     // Emerald green glow
    screenOccupied: 0xef4444  // Crimson red glow
};

// Interactive States & Objects
let isDoorOpen = true;
let targetDoorAngle = Math.PI / 4.2; // 42 degrees open
let doorPivotRef = null;
let doorHitBoxRef = null;

let isLightOn = true;
let isACOn = true;
let ambientLightRef, hemiLightRef, keyLightRef, fillLightRef, spotLeftRef, spotRightRef, infinityTubeMatRef;
let acDisplayMatRef = null;
let switchPanelRef = { lightBtnMat: null, acBtnMat: null, panelHitBox: null };

// Parametric Lemniscate (Infinity Symbol ∞)
class InfinityCurve extends THREE.Curve {
    constructor(scale = 3.8, height = 4.4) {
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
    scene.background = new THREE.Color(0x0b0d13); // Cinematic dark backdrop
    scene.fog = new THREE.FogExp2(0x0b0d13, 0.012);

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
        controls.maxDistance = 38;
        controls.target.set(0, 1.2, 0);
    }

    // 5. Warm Lighting Setup
    setupWarmLighting();

    // 6. Build Room Architecture (Black floor, 30% cream walls, glass walls, 4 pillars, single glass gate)
    buildRoomArchitecture();

    // 7. Infinity Overhead Light Fixture (∞)
    buildInfinityChandelier();

    // 8. Build AC Unit on Back Wall & Smart Control Panel on Left Corner Pillar
    buildACAndSwitchPanel();

    // 9. Build Workstations (Connected slabs + PC-7 + PC-8)
    buildAllLabWorkstations();

    // 10. Raycasting for Interaction
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
            if (controls) controls.target.set(0, 1.2, 0);
        });
    }

    // Start Render Loop
    animate();
}

function setDefaultCameraPosition() {
    camera.position.set(13.5, 14.5, 15.5);
    camera.lookAt(0, 1.2, 0);
}

/**
 * Cozy Warm Lighting Setup
 */
function setupWarmLighting() {
    ambientLightRef = new THREE.AmbientLight(0xffecd2, 0.65);
    scene.add(ambientLightRef);

    hemiLightRef = new THREE.HemisphereLight(0xfff5eb, 0x1e2029, 0.55);
    hemiLightRef.position.set(0, 20, 0);
    scene.add(hemiLightRef);

    keyLightRef = new THREE.DirectionalLight(0xffd8a8, 0.9);
    keyLightRef.position.set(10, 16, 9);
    keyLightRef.castShadow = true;
    keyLightRef.shadow.mapSize.width = 2048;
    keyLightRef.shadow.mapSize.height = 2048;
    keyLightRef.shadow.camera.near = 0.5;
    keyLightRef.shadow.camera.far = 40;
    const d = 10;
    keyLightRef.shadow.camera.left = -d;
    keyLightRef.shadow.camera.right = d;
    keyLightRef.shadow.camera.top = d;
    keyLightRef.shadow.camera.bottom = -d;
    keyLightRef.shadow.bias = -0.0004;
    scene.add(keyLightRef);

    fillLightRef = new THREE.PointLight(0xffb84d, 0.8, 18, 1.2);
    fillLightRef.position.set(0, 3.2, 0);
    scene.add(fillLightRef);
}

/**
 * Builds AC Unit on Back Wall & Smart Control Panel on Left Corner Pillar
 */
function buildACAndSwitchPanel() {
    const roomW = 14;
    const roomD = 14;
    const pillarW = 0.65;

    // 1. Smart Switch Panel on Left Corner Pillar (Near PC-8, facing +X into room)
    const panelW = 0.45;
    const panelH = 0.8;
    const panelGroup = new THREE.Group();
    const pillarPosX = -roomW / 2 + pillarW / 2; // -6.475
    const pillarPosZ = -roomD / 2 + pillarW / 2; // -6.475
    panelGroup.position.set(pillarPosX + pillarW / 2 + 0.03, 1.65, pillarPosZ + 0.1);
    panelGroup.rotation.y = Math.PI / 2; // Face towards right (+X into the room)

    // Dark glass panel backing
    const panelBackMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.2,
        metalness: 0.8
    });
    const panelMesh = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, 0.03), panelBackMat);
    panelGroup.add(panelMesh);

    // Light Button (Top)
    const lightBtnMat = new THREE.MeshStandardMaterial({
        color: 0xffb84d,
        emissive: 0xffb84d,
        emissiveIntensity: 1.2,
        roughness: 0.2
    });
    const lightBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16), lightBtnMat);
    lightBtn.rotation.x = Math.PI / 2;
    lightBtn.position.set(0, 0.18, 0.02);
    panelGroup.add(lightBtn);

    // AC Button (Bottom)
    const acBtnMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 1.2,
        roughness: 0.2
    });
    const acBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16), acBtnMat);
    acBtn.rotation.x = Math.PI / 2;
    acBtn.position.set(0, -0.18, 0.02);
    panelGroup.add(acBtn);

    // 3D Panel Label Sprite
    const panelLabel = createTextBadge("⚡ AC & LIGHTS", "#e2e8f0", "#1e293b");
    panelLabel.position.set(0, 0.68, 0);
    panelLabel.scale.set(1.4, 0.45, 1);
    panelGroup.add(panelLabel);

    // Clickable Hitbox for Light Switch
    const lightHitBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
    lightHitBox.position.set(0, 0.18, 0.05);
    lightHitBox.userData = { isLightSwitch: true };
    panelGroup.add(lightHitBox);

    // Clickable Hitbox for AC Switch
    const acHitBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
    acHitBox.position.set(0, -0.18, 0.05);
    acHitBox.userData = { isACSwitch: true };
    panelGroup.add(acHitBox);

    scene.add(panelGroup);

    switchPanelRef = {
        lightBtnMat: lightBtnMat,
        acBtnMat: acBtnMat,
        lightHitBox: lightHitBox,
        acHitBox: acHitBox
    };

    // 2. Indoor Split AC Unit on Back Wall (Above PC-8)
    const acGroup = new THREE.Group();
    acGroup.position.set(-3.0, 3.2, -roomD / 2 + 0.25);

    const acMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
    const acBody = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.48, 0.32), acMat);
    acBody.castShadow = true;
    acGroup.add(acBody);

    // AC Louver Vent
    const ventMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
    const vent = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.06, 0.02), ventMat);
    vent.position.set(0, -0.16, 0.16);
    acGroup.add(vent);

    // Digital Temperature LED Display (24°C)
    const acDisplayMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 1.5
    });
    const acDisplay = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.09), acDisplayMat);
    acDisplay.position.set(0.52, 0.06, 0.165);
    acGroup.add(acDisplay);
    acDisplayMatRef = acDisplayMat;

    scene.add(acGroup);
}

/**
 * Builds Black Floor, 4 Dark Grey Pillars, 30% Cream Walls, Glass Walls, and Single Glass Gate
 */
function buildRoomArchitecture() {
    const roomW = 14;
    const roomD = 14;
    const pillarW = 0.65;
    const pillarH = 4.6;

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
    const pillarGeo = new THREE.BoxGeometry(pillarW, pillarH, pillarW);
    const pillarMat = new THREE.MeshStandardMaterial({
        color: PALETTE.pillar,
        roughness: 0.4,
        metalness: 0.25
    });

    const pillarPositions = [
        [-roomW / 2 + pillarW / 2, pillarH / 2, -roomD / 2 + pillarW / 2], // Top-Left (Near PC-8)
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

    // 3. Wall Architecture (Seamlessly sealed room connecting directly into all 4 corner pillars)
    const wallH = 4.0; // Full architectural height
    const pillarCenterX = roomW / 2 - pillarW / 2; // 6.675
    const pillarCenterZ = roomD / 2 - pillarW / 2; // 6.675
    const totalWallLen = roomD - pillarW; // 13.35m (Center of back pillar to center of front pillar)

    const creamLen = 4.0;                             // 30% Cream Center Section (~4.0m)
    const glassSideLen = (totalWallLen - creamLen) / 2; // 35% Glass Side Sections (~4.675m each)

    const creamWallMat = new THREE.MeshStandardMaterial({
        color: PALETTE.creamWall, // Architectural cream wall
        roughness: 0.65,
        metalness: 0.05
    });
    const glassMat = new THREE.MeshStandardMaterial({
        color: PALETTE.glassWall,
        roughness: 0.1,
        metalness: 0.2,
        transparent: true,
        opacity: 0.35
    });
    const frameMat = new THREE.MeshStandardMaterial({ color: PALETTE.wallFrame, roughness: 0.4 });

    function createWallSegment(w, h, d, x, y, z, material) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        wall.position.set(x, y, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);

        // Top Frame Trim
        const topFrame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.08, d + 0.02), frameMat);
        topFrame.position.set(x, y + h / 2 + 0.04, z);
        scene.add(topFrame);

        // Bottom Baseboard Trim
        const baseTrim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.06, d + 0.02), frameMat);
        baseTrim.position.set(x, 0.03, z);
        scene.add(baseTrim);
    }

    // ── Back Wall: Completely spans from Left Pillar Corner to Right Pillar Corner ──
    createWallSegment(totalWallLen, wallH, 0.12, 0, wallH / 2, -pillarCenterZ, glassMat);

    // ── Left Wall: [Glass 35%] === [Solid Cream 30% (Middle)] === [Glass 35%] ──
    const zBackGlass = -pillarCenterZ + glassSideLen / 2;
    const zFrontGlass = pillarCenterZ - glassSideLen / 2;
    const zMiddleCream = 0.0;

    createWallSegment(0.12, wallH, glassSideLen, -pillarCenterX, wallH / 2, zBackGlass, glassMat);
    createWallSegment(0.14, wallH, creamLen, -pillarCenterX, wallH / 2, zMiddleCream, creamWallMat);
    createWallSegment(0.12, wallH, glassSideLen, -pillarCenterX, wallH / 2, zFrontGlass, glassMat);

    // ── Right Wall: [Glass 35%] === [Solid Cream 30% (Middle)] === [Glass 35%] ──
    createWallSegment(0.12, wallH, glassSideLen, pillarCenterX, wallH / 2, zBackGlass, glassMat);
    createWallSegment(0.14, wallH, creamLen, pillarCenterX, wallH / 2, zMiddleCream, creamWallMat);
    createWallSegment(0.12, wallH, glassSideLen, pillarCenterX, wallH / 2, zFrontGlass, glassMat);

    // ── Front Wall: Seals seamlessly to both front corner pillars with gate opening in between ──
    const gateLeftX = -4.3;
    const gateRightX = -1.8;

    // Left glass section (from Left Pillar to Gate Left Post)
    const leftFrontSpan = gateLeftX - (-pillarCenterX); // ~2.375m
    createWallSegment(leftFrontSpan, wallH, 0.12, -pillarCenterX + leftFrontSpan / 2, wallH / 2, pillarCenterZ, glassMat);

    // Right glass section (from Gate Right Post to Right Pillar)
    const rightFrontSpan = pillarCenterX - gateRightX; // ~8.475m
    createWallSegment(rightFrontSpan, wallH, 0.12, gateRightX + rightFrontSpan / 2, wallH / 2, pillarCenterZ, glassMat);

    // 4. Physical 3D Entrance Gate with Interactive Openable Single Glass Door & Red Signboard
    build3DLabGate(gateLeftX, gateRightX, pillarCenterZ, wallH);
}

/**
 * Builds Interactive Single Glass Gate + Red Board with White Plate Sign on Right Side of Gate
 */
function build3DLabGate(xLeft, xRight, zPos, gateHeight) {
    const gateGroup = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: PALETTE.pillar, roughness: 0.35, metalness: 0.3 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.15, metalness: 0.85 });
    const doorGlassMat = new THREE.MeshStandardMaterial({
        color: 0x93c5fd,
        roughness: 0.1,
        metalness: 0.15,
        transparent: true,
        opacity: 0.55
    });

    const gateSpan = xRight - xLeft;
    const doorW = gateSpan - 0.1;
    const doorH = gateHeight - 0.3;

    // 1. Left & Right Door Frame Jambs
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
    const lintelW = gateSpan + 0.14;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(lintelW, 0.18, 0.16), frameMat);
    lintel.position.set((xLeft + xRight) / 2, gateHeight - 0.09, zPos);
    lintel.castShadow = true;
    gateGroup.add(lintel);

    // 3. Interactive Openable Single Glass Gate (Pivoted on Left Jamb)
    const doorPivot = new THREE.Group();
    doorPivot.position.set(xLeft + 0.06, 0, zPos);
    doorPivot.rotation.y = targetDoorAngle;
    doorPivotRef = doorPivot;

    // Door glass pane
    const doorLeafGeo = new THREE.BoxGeometry(doorW, doorH, 0.04);
    const singleDoorMesh = new THREE.Mesh(doorLeafGeo, doorGlassMat);
    singleDoorMesh.position.set(doorW / 2, doorH / 2 + 0.05, 0);
    singleDoorMesh.castShadow = true;
    doorPivot.add(singleDoorMesh);

    // Stainless steel vertical door handle bar
    const handleGeo = new THREE.CylinderGeometry(0.016, 0.016, 1.1);
    const doorHandle = new THREE.Mesh(handleGeo, handleMat);
    doorHandle.position.set(doorW - 0.15, doorH / 2 + 0.05, 0.045);
    doorPivot.add(doorHandle);

    // Clickable Hitbox on Door to Toggle Open / Close
    const doorHitBox = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.4), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
    doorHitBox.position.set(doorW / 2, doorH / 2 + 0.05, 0);
    doorHitBox.userData = { isDoor: true };
    doorPivot.add(doorHitBox);
    doorHitBoxRef = doorHitBox;

    gateGroup.add(doorPivot);

    // 4. Red Board with White Plate Signboard (On Right Side of Gate)
    const signBoardGroup = new THREE.Group();
    signBoardGroup.position.set(xRight + 0.8, 1.85, zPos + 0.08);

    // Red Board Backing
    const redBoardMat = new THREE.MeshStandardMaterial({
        color: 0xdc2626, // Vivid Red Board
        roughness: 0.3,
        metalness: 0.1
    });
    const redBoardMesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.05), redBoardMat);
    redBoardMesh.castShadow = true;
    signBoardGroup.add(redBoardMesh);

    // White Plate Inset with strictly "AI LAB" Name
    const whitePlateTexture = createAILabPlateTexture();
    const whitePlateMat = new THREE.MeshStandardMaterial({
        map: whitePlateTexture,
        roughness: 0.2,
        metalness: 0.05
    });
    const whitePlateMesh = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.64, 0.02), whitePlateMat);
    whitePlateMesh.position.set(0, 0, 0.035);
    signBoardGroup.add(whitePlateMesh);

    gateGroup.add(signBoardGroup);

    // 5. Access Scanner Pedestal on entrance side
    const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.3 });
    const scannerPedestal = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), pedestalMat);
    scannerPedestal.position.set(xRight + 0.25, 0.55, zPos + 0.65);
    scannerPedestal.castShadow = true;
    gateGroup.add(scannerPedestal);

    const scannerBezel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.16), new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        emissive: 0x3b82f6,
        emissiveIntensity: 1.2
    }));
    scannerBezel.position.set(xRight + 0.25, 1.12, zPos + 0.65);
    gateGroup.add(scannerBezel);

    scene.add(gateGroup);
}

/**
 * Creates high-DPI White Plate texture with strictly "AI LAB" bold red text
 */
function createAILabPlateTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    // Pure White plate background
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 8, 8, 496, 240, 16);
    ctx.fill();

    // Red inner border
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 8;
    roundRect(ctx, 16, 16, 480, 224, 12);
    ctx.stroke();

    // Bold strictly "AI LAB" text
    ctx.fillStyle = "#dc2626";
    ctx.font = "900 84px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("AI LAB", 256, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return texture;
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
    infinityTubeMatRef = tubeMat;

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
    spotLeftRef = new THREE.PointLight(PALETTE.infinityGlow, 1.3, 14, 1.4);
    spotLeftRef.position.set(-2.0, 4.1, 0);
    scene.add(spotLeftRef);

    spotRightRef = new THREE.PointLight(PALETTE.infinityGlow, 1.3, 14, 1.4);
    spotRightRef.position.set(2.0, 4.1, 0);
    scene.add(spotRightRef);
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
function getIntersectedObject(clientX, clientY) {
    const canvas = document.getElementById("lab-3d-canvas");
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const hitBoxes = Object.values(pcWorkstations).map(w => w.hitBox);
    if (doorHitBoxRef) hitBoxes.push(doorHitBoxRef);
    if (switchPanelRef.lightHitBox) hitBoxes.push(switchPanelRef.lightHitBox);
    if (switchPanelRef.acHitBox) hitBoxes.push(switchPanelRef.acHitBox);

    const intersects = raycaster.intersectObjects(hitBoxes);

    if (intersects.length > 0) {
        return intersects[0].object.userData;
    }
    return null;
}

function onMouseMove(event) {
    const canvas = document.getElementById("lab-3d-canvas");
    const targetData = getIntersectedObject(event.clientX, event.clientY);

    if (targetData) {
        canvas.style.cursor = "pointer";
        if (targetData.pcId && hoveredItem !== targetData.pcId) {
            hoveredItem = targetData.pcId;
            highlightPC(targetData.pcId, true);
        }
    } else {
        canvas.style.cursor = "default";
        if (hoveredItem) {
            highlightPC(hoveredItem, false);
            hoveredItem = null;
        }
    }
}

function highlightPC(pcId, isHovered) {
    const item = pcWorkstations[pcId];
    if (item) {
        if (isHovered) {
            item.screenMat.emissiveIntensity = 1.4;
        } else {
            item.screenMat.emissiveIntensity = item.status === "free" ? 0.75 : 0.95;
        }
    }

    // Two-Way Sync: Highlight 2D Grid Card
    const card = document.getElementById(`grid-pc-${pcId}`);
    if (card) {
        if (isHovered) {
            card.style.transform = "translateY(-6px) scale(1.02)";
            card.style.borderColor = "#3b82f6";
            card.style.boxShadow = "0 14px 25px -4px rgba(59, 130, 246, 0.25)";
        } else {
            card.style.transform = "";
            card.style.borderColor = "";
            card.style.boxShadow = "";
        }
    }
}

function onCanvasClick(event) {
    const targetData = getIntersectedObject(event.clientX, event.clientY);
    if (!targetData) return;

    if (targetData.pcId) {
        const item = pcWorkstations[targetData.pcId];
        const isFree = item ? item.status === "free" : true;
        if (typeof handlePCClick === "function") {
            handlePCClick(targetData.pcId, isFree);
        }
    } else if (targetData.isDoor) {
        toggleDoor();
    } else if (targetData.isLightSwitch) {
        toggleLabLights();
    } else if (targetData.isACSwitch) {
        toggleLabAC();
    }
}

function onTouchStart(event) {
    if (event.touches.length === 1) {
        const touch = event.touches[0];
        const targetData = getIntersectedObject(touch.clientX, touch.clientY);
        if (!targetData) return;

        if (targetData.pcId) {
            const item = pcWorkstations[targetData.pcId];
            const isFree = item ? item.status === "free" : true;
            if (typeof handlePCClick === "function") {
                handlePCClick(targetData.pcId, isFree);
            }
        } else if (targetData.isDoor) {
            toggleDoor();
        } else if (targetData.isLightSwitch) {
            toggleLabLights();
        } else if (targetData.isACSwitch) {
            toggleLabAC();
        }
    }
}

/**
 * Interactive Controls: Door, Light, AC
 */
function toggleDoor() {
    isDoorOpen = !isDoorOpen;
    targetDoorAngle = isDoorOpen ? Math.PI / 4.2 : 0.0;
    showToast(isDoorOpen ? "🚪 Entrance Gate: OPENED" : "🚪 Entrance Gate: CLOSED");
}

function toggleLabLights() {
    isLightOn = !isLightOn;

    if (isLightOn) {
        ambientLightRef.intensity = 0.65;
        hemiLightRef.intensity = 0.55;
        keyLightRef.intensity = 0.9;
        fillLightRef.intensity = 0.8;
        if (spotLeftRef) spotLeftRef.intensity = 1.3;
        if (spotRightRef) spotRightRef.intensity = 1.3;
        if (infinityTubeMatRef) infinityTubeMatRef.emissiveIntensity = 2.0;
        if (switchPanelRef.lightBtnMat) switchPanelRef.lightBtnMat.emissiveIntensity = 1.2;
        showToast("💡 AI LAB Lights: ON");
    } else {
        ambientLightRef.intensity = 0.08;
        hemiLightRef.intensity = 0.08;
        keyLightRef.intensity = 0.15;
        fillLightRef.intensity = 0.1;
        if (spotLeftRef) spotLeftRef.intensity = 0.0;
        if (spotRightRef) spotRightRef.intensity = 0.0;
        if (infinityTubeMatRef) infinityTubeMatRef.emissiveIntensity = 0.1;
        if (switchPanelRef.lightBtnMat) switchPanelRef.lightBtnMat.emissiveIntensity = 0.1;
        showToast("🌙 AI LAB Lights: OFF (Cinematic Night Mode)");
    }
}

function toggleLabAC() {
    isACOn = !isACOn;

    if (isACOn) {
        if (acDisplayMatRef) {
            acDisplayMatRef.emissive.setHex(0x38bdf8);
            acDisplayMatRef.emissiveIntensity = 1.5;
        }
        if (switchPanelRef.acBtnMat) switchPanelRef.acBtnMat.emissiveIntensity = 1.2;
        showToast("❄️ AI LAB AC: ON (Cooling at 24°C)");
    } else {
        if (acDisplayMatRef) {
            acDisplayMatRef.emissive.setHex(0x475569);
            acDisplayMatRef.emissiveIntensity = 0.15;
        }
        if (switchPanelRef.acBtnMat) switchPanelRef.acBtnMat.emissiveIntensity = 0.1;
        showToast("⏸️ AI LAB AC: STANDBY / OFF");
    }
}

function showToast(message) {
    let toast = document.getElementById("canvas-3d-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "canvas-3d-toast";
        toast.className = "canvas-toast";
        const container = document.getElementById("canvas-3d-container");
        if (container) container.appendChild(toast);
    }
    toast.innerText = message;
    toast.classList.add("show");
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 2800);
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
 * Render Loop with smooth door swing animation, breathing monitors & infinity pulse
 */
let clock = new THREE.Clock();

function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const time = clock.getElapsedTime();

    if (controls) controls.update();

    // 1. Smooth Door Swing Interpolation
    if (doorPivotRef) {
        doorPivotRef.rotation.y += (targetDoorAngle - doorPivotRef.rotation.y) * 0.12;
    }

    // 2. Subtle gentle pulse for occupied screens and floating badges
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
