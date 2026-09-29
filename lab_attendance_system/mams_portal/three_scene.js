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
    glassWall: 0x93c5fd,      // Clear airy tempered glass
    wallFrame: 0x334155,      // Wall trim metal
    woodSlab: 0xf5e1b8,       // Rich warm creamish wood
    creamWall: 0xf0e2ca,      // Architectural cream wall section
    metalFrame: 0x1e222b,     // Dark metal table frame/legs
    monitorBezel: 0x0a0c10,   // Matte black monitor
    keyboard: 0x1e2430,       // Dark keyboard
    chairSeat: 0x252a36,      // Dark ergonomic chair
    infinityGlow: 0xffa028,   // Rich warm golden-amber LED
    screenFree: 0x10b981,     // Emerald green glow
    screenOccupied: 0xef4444  // Crimson red glow
};

// Interactive States & Objects
let isDoorOpen = true;
let targetDoorAngle = Math.PI / 4.2; // 42 degrees open
let doorPivotRef = null;
let doorHitBoxRef = null;
let wallOccluders = [];

let isLightOn = true;
let isACOn = true;
let ambientLightRef, hemiLightRef, keyLightRef, fillLightRef, spotLeftRef, spotRightRef, infinityTubeMatRef;
let acCassetteMats = [];
let switchPanelRef = { lightBtnMat: null, acBtnMat: null, panelHitBox: null };

/**
 * Creates high-res procedural Light-Coloured Skybox with soft daylight gradients
 */
function createLightSkyboxTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");

    // Smooth architectural daylight sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 1024);
    grad.addColorStop(0.0, "#a5d8ff"); // Clear light sky blue at the zenith
    grad.addColorStop(0.35, "#d0ebff"); // Soft daylight cyan-blue
    grad.addColorStop(0.65, "#e7f5ff"); // Crisp airy horizon transition
    grad.addColorStop(0.85, "#f8fafc"); // Bright white horizon haze
    grad.addColorStop(1.0, "#e2e8f0"); // Soft light floor boundary

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    // Subtle soft distant fluffy clouds along horizon
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    for (let i = 0; i < 8; i++) {
        const cx = (i * 150) % 1024;
        const cy = 520 + Math.sin(i * 1.8) * 50;
        ctx.beginPath();
        ctx.arc(cx, cy, 90, 0, Math.PI * 2);
        ctx.arc(cx + 60, cy - 20, 70, 0, Math.PI * 2);
        ctx.arc(cx + 120, cy + 10, 80, 0, Math.PI * 2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

// Parametric Lemniscate (Infinity Symbol ∞)
class InfinityCurve extends THREE.Curve {
    constructor(scale = 4.4, height = 4.5) {
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

    // 1. Scene with Crisp Light-Coloured Skybox
    scene = new THREE.Scene();
    scene.background = createLightSkyboxTexture();
    scene.fog = new THREE.FogExp2(0xf1f5f9, 0.008);

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
    renderer.toneMappingExposure = 1.0; // Balanced exposure to preserve texture fidelity

    // 4. OrbitControls (Rotation Axis Fixed to Exact Center of Room)
    if (typeof THREE.OrbitControls !== "undefined") {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enableRotate = true;
        controls.rotateSpeed = 0.9;
        controls.enableZoom = true;
        controls.zoomSpeed = 1.0;
        controls.enablePan = false; // Prevents shifting the rotation axis away from room center
        controls.maxPolarAngle = Math.PI / 2.05; // Stay above floor
        controls.minDistance = 4;
        controls.maxDistance = 50;
        controls.target.set(0, 1.2, 0); // Exact center axis of the room
    }

    // 5. Rich Warm Lighting Setup (Studio balanced, no texture washout)
    setupWarmLighting();

    // 6. Build Room Architecture (Scaled up room, black floor, 30% cream middle walls, glass walls, 4 pillars)
    buildRoomArchitecture();

    // 7. Infinity Overhead Light Fixture (∞)
    buildInfinityChandelier();

    // 8. Build Single Centralized Ceiling AC (Above Lights in Exact Center) & Pillar Switchboard
    buildSingleCenterCeilingACAndSwitchPanel();

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

    // View Angle Buttons
    document.getElementById("reset-cam-btn")?.addEventListener("click", () => {
        setDefaultCameraPosition();
        showToast("🎯 Reset View to Center");
    });

    document.getElementById("rotate-90-btn")?.addEventListener("click", () => {
        rotateViewByAngle(Math.PI / 2);
    });

    document.getElementById("gate-view-btn")?.addEventListener("click", () => {
        setCameraView(-3.0, 3.2, 11.5, 0, 1.2, 0);
        showToast("🚪 Entrance Gate View");
    });

    document.getElementById("top-view-btn")?.addEventListener("click", () => {
        setCameraView(0.1, 24.0, 0.1, 0, 1.2, 0);
        showToast("🔝 Top-Down Floorplan View");
    });

    // Start Render Loop
    animate();
}

function setDefaultCameraPosition() {
    setCameraView(15.5, 16.5, 17.5, 0, 1.2, 0);
}

function setCameraView(px, py, pz, tx = 0, ty = 1.2, tz = 0) {
    camera.position.set(px, py, pz);
    if (controls) {
        controls.target.set(tx, ty, tz);
        controls.update();
    } else {
        camera.lookAt(tx, ty, tz);
    }
}

function rotateViewByAngle(rad) {
    if (!controls) return;
    const roomCenter = new THREE.Vector3(0, 1.2, 0);
    const offset = new THREE.Vector3().subVectors(camera.position, roomCenter);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rad);
    camera.position.addVectors(roomCenter, offset);
    controls.target.copy(roomCenter);
    controls.update();
    showToast("🔄 Rotated 90° Around Room Center");
}

/**
 * Rich Warm Lighting Setup (Balanced Golden Sunlight & Soft Amber Radiance)
 */
function setupWarmLighting() {
    ambientLightRef = new THREE.AmbientLight(0xfff7ed, 0.50); // Soft natural ambient
    scene.add(ambientLightRef);

    hemiLightRef = new THREE.HemisphereLight(0xffffff, 0xdbeafe, 0.45); // Daylight sky bounce
    hemiLightRef.position.set(0, 20, 0);
    scene.add(hemiLightRef);

    keyLightRef = new THREE.DirectionalLight(0xfffae8, 0.85); // Gentle sunlight
    keyLightRef.position.set(12, 18, 10);
    keyLightRef.castShadow = true;
    keyLightRef.shadow.mapSize.width = 2048;
    keyLightRef.shadow.mapSize.height = 2048;
    keyLightRef.shadow.camera.near = 0.5;
    keyLightRef.shadow.camera.far = 45;
    const d = 12;
    keyLightRef.shadow.camera.left = -d;
    keyLightRef.shadow.camera.right = d;
    keyLightRef.shadow.camera.top = d;
    keyLightRef.shadow.camera.bottom = -d;
    keyLightRef.shadow.bias = -0.0004;
    scene.add(keyLightRef);

    fillLightRef = new THREE.PointLight(0xffb84d, 0.40, 22, 1.4); // Subtle warm center fill
    fillLightRef.position.set(0, 3.4, 0);
    scene.add(fillLightRef);
}

/**
 * Builds Single Centralized Ceiling AC Unit (In the Exact Center, Above Lights at Y = 5.0m) & Switchboard
 */
function buildSingleCenterCeilingACAndSwitchPanel() {
    const roomW = 16.0;
    const roomD = 16.0;
    const pillarW = 0.70;
    const pillarCenterX = roomW / 2 - pillarW / 2; // 7.65
    const pillarCenterZ = roomD / 2 - pillarW / 2; // 7.65

    // 1. Smart Switch Panel on Left Corner Pillar (Near PC-8, facing +X into room)
    const panelW = 0.45;
    const panelH = 0.8;
    const panelGroup = new THREE.Group();
    panelGroup.position.set(-pillarCenterX + pillarW / 2 + 0.03, 1.65, -pillarCenterZ + 0.1);
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
        color: 0xffa028,
        emissive: 0xffa028,
        emissiveIntensity: 1.4,
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
        emissiveIntensity: 1.4,
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

    // 2. Single Grand Centralized 4-Way Ceiling Cassette AC (Exact Center at X=0, Z=0, Y=5.0m)
    acCassetteMats = [];
    const roofACH = 5.0;

    const cassetteGroup = new THREE.Group();
    cassetteGroup.position.set(0, roofACH, 0); // Exact Center

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.1 });
    const grilleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });

    // Grand Outer Cassette Panel Frame (2.2m x 2.2m)
    const casing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 2.2), bodyMat);
    cassetteGroup.add(casing);

    // Center Intake Grille (1.2m x 1.2m)
    const intake = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 1.2), grilleMat);
    intake.position.set(0, -0.07, 0);
    cassetteGroup.add(intake);

    // 4-Way Directional Airflow Vents (Front, Back, Left, Right)
    const ventGeoFB = new THREE.BoxGeometry(1.8, 0.02, 0.16);
    const v1 = new THREE.Mesh(ventGeoFB, grilleMat); v1.position.set(0, -0.07, 0.86); cassetteGroup.add(v1);
    const v2 = new THREE.Mesh(ventGeoFB, grilleMat); v2.position.set(0, -0.07, -0.86); cassetteGroup.add(v2);

    const ventGeoLR = new THREE.BoxGeometry(0.16, 0.02, 1.8);
    const v3 = new THREE.Mesh(ventGeoLR, grilleMat); v3.position.set(0.86, -0.07, 0); cassetteGroup.add(v3);
    const v4 = new THREE.Mesh(ventGeoLR, grilleMat); v4.position.set(-0.86, -0.07, 0); cassetteGroup.add(v4);

    // Glowing Blue Status LED Ring on the Central Cassette Frame
    const ledRingMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 1.6,
        roughness: 0.1
    });
    const ledRing = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.02, 1.26), ledRingMat);
    ledRing.position.set(0, -0.065, 0);
    cassetteGroup.add(ledRing);
    acCassetteMats.push(ledRingMat);

    scene.add(cassetteGroup);
}

/**
 * Builds Scaled-Up Black Floor, 4 Dark Grey Pillars, 30% Cream Walls, Glass Walls, and Single Glass Gate
 */
function buildRoomArchitecture() {
    wallOccluders = []; // Reset occluders

    const roomW = 16.0;
    const roomD = 16.0;
    const pillarW = 0.70;
    const pillarH = 4.8;

    // 1. Black Floor Base (16.0m x 16.0m)
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
    const grid = new THREE.GridHelper(roomW, 16, PALETTE.floorGrid, PALETTE.floorGrid);
    grid.position.y = 0.005;
    scene.add(grid);

    // 2. Four Dark Grey Corner Pillars (Tall Architectural Height)
    const pillarGeo = new THREE.BoxGeometry(pillarW, pillarH, pillarW);
    const pillarMat = new THREE.MeshStandardMaterial({
        color: PALETTE.pillar,
        roughness: 0.4,
        metalness: 0.25
    });

    const pillarCenterX = roomW / 2 - pillarW / 2; // 7.65
    const pillarCenterZ = roomD / 2 - pillarW / 2; // 7.65

    const pillarPositions = [
        [-pillarCenterX, pillarH / 2, -pillarCenterZ], // Top-Left (Near PC-8)
        [pillarCenterX, pillarH / 2, -pillarCenterZ],  // Top-Right
        [-pillarCenterX, pillarH / 2, pillarCenterZ],  // Bottom-Left
        [pillarCenterX, pillarH / 2, pillarCenterZ]   // Bottom-Right
    ];

    pillarPositions.forEach(pos => {
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(...pos);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        pillar.userData = { isOccluder: true, isWall: true };
        scene.add(pillar);
        wallOccluders.push(pillar);
    });

    // 3. Wall Architecture (Seamlessly sealed room connecting directly into all 4 corner pillars)
    const wallH = 4.2; // Full architectural height
    const totalWallLen = roomD - pillarW; // 15.3m (Center of back pillar to center of front pillar)

    const creamLen = 4.8;                               // 30% Cream Center Section (~4.8m)
    const glassSideLen = (totalWallLen - creamLen) / 2; // 35% Glass Side Sections (~5.25m each)

    // Wood Grain Texture for Wall Sections
    const textureLoader = new THREE.TextureLoader();
    const woodWallTex = textureLoader.load("wood_texture.jpg");
    woodWallTex.wrapS = THREE.RepeatWrapping;
    woodWallTex.wrapT = THREE.RepeatWrapping;
    woodWallTex.repeat.set(1.2, 1.2);

    const creamWallMat = new THREE.MeshStandardMaterial({
        map: woodWallTex,
        color: 0xffffff, // True natural blonde wood grain texture
        roughness: 0.45,
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
        wall.userData = { isOccluder: true, isWall: true };
        scene.add(wall);
        wallOccluders.push(wall);

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

    // ── Wall-Mounted AI LAB Poster on Right Side Wall (Facing Into Lab) ──
    buildRightWallAIPoster(pillarCenterX, zMiddleCream);

    // ── Front Wall: Seals seamlessly to both front corner pillars with gate opening in between ──
    const gateLeftX = -4.6;
    const gateRightX = -1.8;

    // Left glass section (from Left Pillar to Gate Left Post)
    const leftFrontSpan = gateLeftX - (-pillarCenterX); // ~3.05m
    createWallSegment(leftFrontSpan, wallH, 0.12, -pillarCenterX + leftFrontSpan / 2, wallH / 2, pillarCenterZ, glassMat);

    // Right glass section (from Gate Right Post to Right Pillar)
    const rightFrontSpan = pillarCenterX - gateRightX; // ~9.45m
    createWallSegment(rightFrontSpan, wallH, 0.12, gateRightX + rightFrontSpan / 2, wallH / 2, pillarCenterZ, glassMat);

    // 4. Physical 3D Entrance Gate with Interactive Openable Single Glass Door & Red Signboard
    build3DLabGate(gateLeftX, gateRightX, pillarCenterZ, wallH);
}

/**
 * Builds Wall-Mounted Illuminated AI LAB Poster on the Right Wall
 */
function buildRightWallAIPoster(wallX, wallZ) {
    const posterW = 2.6;
    const posterH = 1.5;
    const posterGroup = new THREE.Group();
    posterGroup.position.set(wallX - 0.10, 2.35, wallZ); // Mounted on interior face of right wall
    posterGroup.rotation.y = -Math.PI / 2; // Face towards left (-X into the room)

    // Dark sleek aluminium frame
    const posterFrameMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.25,
        metalness: 0.8
    });
    const posterFrame = new THREE.Mesh(new THREE.BoxGeometry(posterW + 0.12, posterH + 0.12, 0.04), posterFrameMat);
    posterGroup.add(posterFrame);

    // Canvas Artwork Inset
    const posterArtTexture = createAILabPosterTexture();
    const posterArtMat = new THREE.MeshStandardMaterial({
        map: posterArtTexture,
        roughness: 0.35,
        metalness: 0.05
    });
    const posterArt = new THREE.Mesh(new THREE.BoxGeometry(posterW, posterH, 0.02), posterArtMat);
    posterArt.position.set(0, 0, 0.022);
    posterGroup.add(posterArt);

    // Subtle soft gallery spotlight above poster
    const posterSpot = new THREE.PointLight(0x38bdf8, 0.35, 6, 1.5);
    posterSpot.position.set(0, posterH / 2 + 0.2, 0.25);
    posterGroup.add(posterSpot);

    scene.add(posterGroup);
}

/**
 * Creates High-DPI Procedural Futuristic "AI LAB" Poster Artwork Texture
 */
function createAILabPosterTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");

    // 1. Dark Futuristic Deep Slate Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 1024, 600);
    bgGrad.addColorStop(0, "#080c16");
    bgGrad.addColorStop(0.5, "#0f172a");
    bgGrad.addColorStop(1, "#030712");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1024, 600);

    // 2. Subtle Cyber Grid Traces
    ctx.strokeStyle = "rgba(56, 189, 248, 0.10)";
    ctx.lineWidth = 1.5;
    for (let x = 40; x < 1024; x += 55) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 600);
        ctx.stroke();
    }
    for (let y = 40; y < 600; y += 55) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(1024, y);
        ctx.stroke();
    }

    // 3. Neural Synapse Network Nodes & Connections
    const nodes = [
        [160, 130], [280, 90], [512, 140], [740, 90], [860, 130],
        [200, 470], [360, 510], [512, 450], [660, 510], [820, 470],
        [120, 300], [900, 300]
    ];

    ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
    ctx.lineWidth = 2.5;
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[i][0] - nodes[j][0];
            const dy = nodes[i][1] - nodes[j][1];
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 260) {
                ctx.beginPath();
                ctx.moveTo(nodes[i][0], nodes[i][1]);
                ctx.lineTo(nodes[j][0], nodes[j][1]);
                ctx.stroke();
            }
        }
    }

    nodes.forEach(([nx, ny], idx) => {
        ctx.fillStyle = idx % 2 === 0 ? "rgba(56, 189, 248, 0.85)" : "rgba(244, 63, 94, 0.85)";
        ctx.beginPath();
        ctx.arc(nx, ny, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(nx, ny, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    // 4. Futuristic Double Poster Border
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 4;
    roundRect(ctx, 30, 30, 964, 540, 18);
    ctx.stroke();

    ctx.strokeStyle = "rgba(251, 191, 36, 0.6)";
    ctx.lineWidth = 2;
    roundRect(ctx, 42, 42, 940, 516, 12);
    ctx.stroke();

    // 5. Header
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 26px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("CENTER FOR ADVANCED RESEARCH & COMPUTING", 512, 100);

    // 6. Glowing "AI LAB" Main Title
    const titleGrad = ctx.createLinearGradient(200, 0, 800, 0);
    titleGrad.addColorStop(0.0, "#38bdf8");
    titleGrad.addColorStop(0.5, "#ffffff");
    titleGrad.addColorStop(1.0, "#f59e0b");

    ctx.fillStyle = titleGrad;
    ctx.font = "900 120px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(56, 189, 248, 0.8)";
    ctx.shadowBlur = 24;
    ctx.fillText("AI LAB", 512, 260);
    ctx.shadowBlur = 0;

    // 7. Subtitle
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 28px 'Inter', sans-serif";
    ctx.fillText("ARTIFICIAL INTELLIGENCE & MACHINE LEARNING", 512, 370);

    // 8. Footer Tech Specs
    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 20px 'Inter', sans-serif";
    ctx.fillText("NEURAL NETWORKS • COMPUTER VISION • DEEP LEARNING", 512, 425);

    ctx.fillStyle = "rgba(56, 189, 248, 0.95)";
    ctx.font = "bold 18px 'Inter', sans-serif";
    ctx.fillText("⚡ HIGH-THROUGHPUT GPU COMPUTE CLUSTER • ACTIVE WORKSTATIONS ⚡", 512, 500);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    if (THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
    return texture;
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
    const doorH = gateHeight - 0.4;

    // 1. Left & Right Door Frame Jambs
    const postGeo = new THREE.BoxGeometry(0.14, gateHeight, 0.14);
    const leftPost = new THREE.Mesh(postGeo, frameMat);
    leftPost.position.set(xLeft, gateHeight / 2, zPos);
    leftPost.castShadow = true;
    leftPost.userData = { isOccluder: true, isWall: true };
    gateGroup.add(leftPost);
    wallOccluders.push(leftPost);

    const rightPost = new THREE.Mesh(postGeo, frameMat);
    rightPost.position.set(xRight, gateHeight / 2, zPos);
    rightPost.castShadow = true;
    rightPost.userData = { isOccluder: true, isWall: true };
    gateGroup.add(rightPost);
    wallOccluders.push(rightPost);

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
    signBoardGroup.position.set(xRight + 0.9, 1.95, zPos + 0.08);

    // Red Board Backing
    const redBoardMat = new THREE.MeshStandardMaterial({
        color: 0xdc2626, // Vivid Red Board
        roughness: 0.3,
        metalness: 0.1
    });
    const redBoardMesh = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.85, 0.05), redBoardMat);
    redBoardMesh.castShadow = true;
    redBoardMesh.userData = { isOccluder: true, isWall: true };
    signBoardGroup.add(redBoardMesh);
    wallOccluders.push(redBoardMesh);

    // White Plate Inset with strictly "AI LAB" Name
    const whitePlateTexture = createAILabPlateTexture();
    const whitePlateMat = new THREE.MeshStandardMaterial({
        map: whitePlateTexture,
        roughness: 0.2,
        metalness: 0.05
    });
    const whitePlateMesh = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.68, 0.02), whitePlateMat);
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
    const infinityCurve = new InfinityCurve(4.4, 4.5); // Scaled for larger room
    const tubeGeo = new THREE.TubeGeometry(infinityCurve, 160, 0.08, 16, true);
    
    // Glowing warm LED material
    const tubeMat = new THREE.MeshStandardMaterial({
        color: PALETTE.infinityGlow,
        emissive: PALETTE.infinityGlow,
        emissiveIntensity: 1.8,
        roughness: 0.1
    });
    infinityTubeMatRef = tubeMat;

    const infinityTube = new THREE.Mesh(tubeGeo, tubeMat);
    scene.add(infinityTube);

    // Light cords hanging from high ceiling
    const cordMat = new THREE.MeshBasicMaterial({ color: 0x334155 });
    const cordGeo = new THREE.CylinderGeometry(0.012, 0.012, 1.4);

    const cordPoints = [
        [-2.8, 5.2, 0],
        [2.8, 5.2, 0],
        [0, 5.2, 1.8],
        [0, 5.2, -1.8]
    ];

    cordPoints.forEach(pos => {
        const cord = new THREE.Mesh(cordGeo, cordMat);
        cord.position.set(...pos);
        scene.add(cord);
    });

    // Soft Warm Studio Spotlights under the raised infinity loops (Gentle intensity, no texture blowout)
    spotLeftRef = new THREE.PointLight(PALETTE.infinityGlow, 0.50, 14, 1.6);
    spotLeftRef.position.set(-2.4, 4.2, 0);
    scene.add(spotLeftRef);

    spotRightRef = new THREE.PointLight(PALETTE.infinityGlow, 0.50, 14, 1.6);
    spotRightRef.position.set(2.4, 4.2, 0);
    scene.add(spotRightRef);
}

/**
 * Builds Workstations in Scaled Up Room:
 * - Continuous connected wooden slabs on Left (PC-1, PC-2, PC-3) and Right (PC-4, PC-5, PC-6)
 * - PC-7 at front wall near entrance
 * - PC-8 rotated and moved forward into the room
 */
function buildAllLabWorkstations() {
    const slabW = 1.25;
    const slabL = 9.2;
    const slabH = 0.08;
    const tablePosY = 1.0;

    // Wood Grain Texture for Tables & Workstation Slabs (Accurate sRGB Color Rendering)
    const textureLoader = new THREE.TextureLoader();
    const woodTableTex = textureLoader.load("wood_texture.jpg");
    woodTableTex.colorSpace = THREE.SRGBColorSpace;
    if (THREE.sRGBEncoding) woodTableTex.encoding = THREE.sRGBEncoding;
    woodTableTex.wrapS = THREE.RepeatWrapping;
    woodTableTex.wrapT = THREE.RepeatWrapping;
    woodTableTex.repeat.set(1.5, 4.0);

    const woodMat = new THREE.MeshStandardMaterial({
        map: woodTableTex,
        color: 0xfaf5ee, // Warm natural blonde wood tone
        roughness: 0.55,
        metalness: 0.02
    });
    const metalLegMat = new THREE.MeshStandardMaterial({ color: PALETTE.metalFrame, roughness: 0.35 });

    // Helper: Build a continuous bench slab with support legs (supports custom slab length)
    function createConnectedBench(centerX, centerZ, benchL = slabL) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(slabW, slabH, benchL), woodMat);
        slab.position.set(centerX, tablePosY, centerZ);
        slab.castShadow = true;
        slab.receiveShadow = true;
        scene.add(slab);

        // Heavy metal support leg frames under slab
        const legCount = Math.max(3, Math.round(benchL / 3.0));
        const step = (benchL - 0.8) / (legCount - 1);
        for (let i = 0; i < legCount; i++) {
            const lz = -benchL / 2 + 0.4 + i * step;
            const frameGeo = new THREE.BoxGeometry(slabW - 0.1, tablePosY, 0.06);
            const legFrame = new THREE.Mesh(frameGeo, metalLegMat);
            legFrame.position.set(centerX, tablePosY / 2, centerZ + lz);
            legFrame.castShadow = true;
            scene.add(legFrame);
        }
    }

    // 1. Left Continuous Wooden Slab (Holds BACKEND near gate, PC-2, PC-3)
    createConnectedBench(-6.0, -1.0, 9.2);

    // 2. Right Extended Continuous Wooden Slab (Centered at Z = 0.0, symmetrically flanking the AI LAB Poster)
    createConnectedBench(6.0, 0.0, 9.6);

    // 3. Mount Left Monitors & Accessories on Left Slab
    mountMonitorStation("BACKEND", -6.0, 2.4, Math.PI / 2, tablePosY + slabH / 2, true); // Dedicated Host Server right in front of the gate (where PC-1 used to be)
    mountMonitorStation("PC-2", -6.0, -1.0, Math.PI / 2, tablePosY + slabH / 2);
    mountMonitorStation("PC-3", -6.0, -4.4, Math.PI / 2, tablePosY + slabH / 2);

    // 4. Mount Right Monitors & Accessories on Extended Right Slab:
    // AI LAB Poster is in the center at Z = 0.0.
    // Right of the poster (towards gate): PC-1 (Z = 4.0) and PC-4 (Z = 1.8)
    // Left of the poster (towards window): PC-5 (Z = -1.8) and PC-6 (Z = -4.0, Ritik's Workstation)
    mountMonitorStation("PC-1", 6.0, 4.0, -Math.PI / 2, tablePosY + slabH / 2);
    mountMonitorStation("PC-4", 6.0, 1.8, -Math.PI / 2, tablePosY + slabH / 2);
    mountMonitorStation("PC-5", 6.0, -1.8, -Math.PI / 2, tablePosY + slabH / 2);
    mountMonitorStation("PC-6", 6.0, -4.0, -Math.PI / 2, tablePosY + slabH / 2); // Ritik's Workstation

    // 5. PC-7 Table on Front Entrance Wall (X = 2.4, Z = 5.6, rotated Math.PI)
    createStandaloneTable("PC-7", 2.4, 5.6, Math.PI, woodMat, metalLegMat, tablePosY, slabH);

    // 6. PC-8: Moved forward inside room & rotated (X = 0.0, Z = -4.5, rotated Math.PI)
    createStandaloneTable("PC-8", 0.0, -4.5, Math.PI, woodMat, metalLegMat, tablePosY, slabH);
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
function mountMonitorStation(pcId, posX, posZ, rotY, surfaceY, isServer = false) {
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

    // If Server / Backend PC, add dedicated Desktop Tower with LED accent
    if (isServer || pcId === "BACKEND") {
        const serverMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.7 });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.55, 0.45), serverMat);
        tower.position.set(-0.72, surfaceY + 0.28, -0.15);
        tower.castShadow = true;
        group.add(tower);

        // Server Glowing LED Strip (Cyan/Indigo)
        const ledMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 1.6 });
        const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.42, 0.02), ledMat);
        ledStrip.position.set(-0.59, surfaceY + 0.28, 0.06);
        group.add(ledStrip);
    }

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
    sprite.position.set(0, surfaceY + 1.35, 0);
    sprite.scale.set(2.2, 0.86, 1);
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
    canvas.width = 1024;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");

    drawSpriteCanvas(ctx, pcId, statusText, isFree);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.userData = { canvas: canvas, ctx: ctx, texture: texture };
    return sprite;
}

function drawSpriteCanvas(ctx, pcId, statusText, isFree) {
    ctx.clearRect(0, 0, 1024, 400);

    const isBackend = pcId === "BACKEND";

    // Card background pill (High-DPI 1024x400)
    const radius = 42;
    const bgColor = isBackend ? "rgba(14, 165, 233, 0.95)" : isFree ? "rgba(16, 185, 129, 0.95)" : "rgba(239, 68, 68, 0.95)";
    ctx.fillStyle = "rgba(15, 23, 42, 0.96)";
    roundRect(ctx, 24, 24, 976, 352, radius);
    ctx.fill();

    ctx.strokeStyle = isBackend ? "#38bdf8" : isFree ? "#10b981" : "#ef4444";
    ctx.lineWidth = 10;
    roundRect(ctx, 24, 24, 976, 352, radius);
    ctx.stroke();

    // PC Name (Top)
    ctx.fillStyle = "#ffffff";
    ctx.font = isBackend ? "bold 78px 'Inter', -apple-system, sans-serif" : "bold 96px 'Inter', -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(isBackend ? "🖥️ BACKEND SERVER" : `💻 ${pcId}`, 512, 135);

    // Status Pill (Bottom)
    ctx.fillStyle = bgColor;
    roundRect(ctx, 70, 215, 884, 124, 30);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    if (isBackend) {
        ctx.font = "bold 56px 'Inter', -apple-system, sans-serif";
        ctx.fillText("⚡ 24/7 DEDICATED HOST", 512, 277);
    } else {
        const label = isFree ? "🟢 AVAILABLE" : `🔴 ${statusText}`;
        const fontSize = label.length > 20 ? 46 : label.length > 14 ? 54 : 64;
        ctx.font = `bold ${fontSize}px 'Inter', -apple-system, sans-serif`;
        ctx.fillText(label, 512, 277);
    }
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

        const isBackend = pc.pc_id === "BACKEND" || pc.is_backend;
        const isFree = !isBackend && pc.status.toLowerCase() === "free";
        item.status = isFree ? "free" : "occupied";
        item.pcData = pc;

        // 1. Update Screen Material Color & Emissive
        const serverColor = 0x38bdf8; // Electric Cyan Blue for Server Host
        const targetColor = isBackend ? serverColor : isFree ? PALETTE.screenFree : PALETTE.screenOccupied;
        item.screenMat.color.setHex(targetColor);
        item.screenMat.emissive.setHex(targetColor);
        item.screenMat.emissiveIntensity = isBackend ? 1.1 : isFree ? 0.75 : 0.95;

        // 2. Update Floating Sprite Canvas Texture
        if (item.sprite && item.sprite.userData) {
            const { ctx, texture } = item.sprite.userData;
            const statusLabel = isBackend ? "24/7 SERVER" : isFree ? "AVAILABLE" : (pc.occupied_by || "IN USE");
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

    // Combine interactive targets with solid wall & pillar occluders
    const allTargets = [...hitBoxes, ...wallOccluders];
    const intersects = raycaster.intersectObjects(allTargets, false);

    if (intersects.length > 0) {
        const firstHit = intersects[0].object;
        // If the line of sight is blocked by a wall or pillar, do NOT click through!
        if (firstHit.userData && (firstHit.userData.isOccluder || firstHit.userData.isWall)) {
            return null;
        }
        return firstHit.userData;
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
        ambientLightRef.intensity = 0.50;
        hemiLightRef.intensity = 0.45;
        keyLightRef.intensity = 0.85;
        fillLightRef.intensity = 0.40;
        if (spotLeftRef) spotLeftRef.intensity = 0.50;
        if (spotRightRef) spotRightRef.intensity = 0.50;
        if (infinityTubeMatRef) infinityTubeMatRef.emissiveIntensity = 1.8;
        if (switchPanelRef.lightBtnMat) switchPanelRef.lightBtnMat.emissiveIntensity = 1.4;
        showToast("💡 AI LAB Lights: ON (Balanced Golden Ambiance)");
    } else {
        ambientLightRef.intensity = 0.12;
        hemiLightRef.intensity = 0.10;
        keyLightRef.intensity = 0.18;
        fillLightRef.intensity = 0.05;
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
        acCassetteMats.forEach(mat => {
            mat.emissive.setHex(0x38bdf8);
            mat.emissiveIntensity = 1.6;
        });
        if (switchPanelRef.acBtnMat) switchPanelRef.acBtnMat.emissiveIntensity = 1.4;
        showToast("❄️ Roof Centralized AC: ON (Active Climate 24°C)");
    } else {
        acCassetteMats.forEach(mat => {
            mat.emissive.setHex(0x475569);
            mat.emissiveIntensity = 0.1;
        });
        if (switchPanelRef.acBtnMat) switchPanelRef.acBtnMat.emissiveIntensity = 0.1;
        showToast("⏸️ Roof Centralized AC: STANDBY / OFF");
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

// WASD & Arrow Key Movement + View Rotation State
const keysPressed = {
    w: false, a: false, s: false, d: false,
    q: false, e: false, r: false, f: false,
    arrowup: false, arrowdown: false, arrowleft: false, arrowright: false
};

window.addEventListener("keydown", (e) => {
    // Ignore keys if typing in an input or textarea
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
    if (activeTag === "input" || activeTag === "textarea") return;

    const k = e.key.toLowerCase();
    if (keysPressed.hasOwnProperty(k)) {
        keysPressed[k] = true;
    }
});

window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (keysPressed.hasOwnProperty(k)) {
        keysPressed[k] = false;
    }
});

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
 * Render Loop with WASD Walking, Q/E View Rotation, smooth door animation & breathing monitors
 */
let clock = new THREE.Clock();

function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.1);
    const time = clock.getElapsedTime();

    // 1. WASD / Arrow Key Orbit & Zoom Centered on Room Center (0, 1.2, 0)
    if (camera && controls) {
        const moveSpeed = 12.0 * delta; // Dolly/Zoom velocity
        const rotSpeed = 1.8 * delta;   // Orbit rotation speed around center axis
        const roomCenter = new THREE.Vector3(0, 1.2, 0);

        // A/D or Q/E or Left/Right Arrow: Smooth 360° Orbit Around Middle of Room
        if (keysPressed.a || keysPressed.q || keysPressed.arrowleft) {
            const offset = new THREE.Vector3().subVectors(camera.position, roomCenter);
            offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotSpeed);
            camera.position.addVectors(roomCenter, offset);
        }
        if (keysPressed.d || keysPressed.e || keysPressed.arrowright) {
            const offset = new THREE.Vector3().subVectors(camera.position, roomCenter);
            offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), -rotSpeed);
            camera.position.addVectors(roomCenter, offset);
        }

        // W / Up Arrow: Dolly In Toward Center
        if (keysPressed.w || keysPressed.arrowup) {
            const dir = new THREE.Vector3().subVectors(roomCenter, camera.position);
            const dist = dir.length();
            if (dist > controls.minDistance + 0.5) {
                dir.normalize();
                camera.position.addScaledVector(dir, moveSpeed);
            }
        }

        // S / Down Arrow: Dolly Out From Center
        if (keysPressed.s || keysPressed.arrowdown) {
            const dir = new THREE.Vector3().subVectors(camera.position, roomCenter);
            const dist = dir.length();
            if (dist < controls.maxDistance - 1.0) {
                dir.normalize();
                camera.position.addScaledVector(dir, moveSpeed);
            }
        }

        // R / F: Elevate / Lower Camera Height
        if (keysPressed.r) camera.position.y = Math.min(30.0, camera.position.y + moveSpeed * 0.7);
        if (keysPressed.f) camera.position.y = Math.max(1.5, camera.position.y - moveSpeed * 0.7);

        controls.target.copy(roomCenter);
    }

    if (controls) controls.update();

    // 2. Smooth Door Swing Interpolation
    if (doorPivotRef) {
        doorPivotRef.rotation.y += (targetDoorAngle - doorPivotRef.rotation.y) * 0.12;
    }

    // 3. Subtle gentle pulse for occupied screens and floating badges
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
