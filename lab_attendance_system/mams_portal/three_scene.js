/**
 * ═══════════════════════════════════════════════════════════════════
 * 3D Interactive Lab Scene (Three.js)
 * Physical Layout:
 * - 3 PCs along Left Wall (PC-1, PC-2, PC-3) up to the corner
 * - Entrance on Left Wall near front
 * - 3 PCs along Right Wall (PC-4, PC-5, PC-6)
 * - PC-7 near front/entrance area
 * - PC-8 along Back Wall (facing back wall)
 * - Wooden cream tables, sleek black monitors with glowing screens
 * ═══════════════════════════════════════════════════════════════════
 */

let scene, camera, renderer, controls;
let pcWorkstations = {}; // Map of pc_id -> { group, screenMesh, sprite, status, pcData }
let raycaster, mouse;
let hoveredPC = null;
let animationFrameId = null;

// Palette
const COLORS = {
    floor: 0xf1f5f9,
    floorGrid: 0xe2e8f0,
    wall: 0x94a3b8,
    wallGlass: 0xcfd8dc,
    tableWood: 0xded0bb, // Cream wood
    tableLegs: 0x1e293b, // Dark metal
    monitorBezel: 0x0f172a,
    keyboard: 0x1e293b,
    chairSeat: 0x334155,
    screenFree: 0x10b981,     // Glowing Green
    screenOccupied: 0xef4444, // Glowing Red
    screenHover: 0x38bdf8     // Cyan highlight
};

/**
 * Initializes the entire 3D Three.js scene
 */
function init3DLabScene() {
    const container = document.getElementById("canvas-3d-container");
    const canvas = document.getElementById("lab-3d-canvas");
    if (!container || !canvas) return;

    // 1. Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    scene.fog = new THREE.FogExp2(0xf8fafc, 0.018);

    // 2. Camera (Isometric Perspective)
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);
    setDefaultCameraPosition();

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // 4. OrbitControls
    if (typeof THREE.OrbitControls !== "undefined") {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2.05; // Don't go below floor
        controls.minDistance = 6;
        controls.maxDistance = 35;
        controls.target.set(0, 1.2, 0);
    }

    // 5. Lighting
    setupLighting();

    // 6. Build Physical Room
    buildRoom();

    // 7. Build Workstations (8 PCs)
    buildAllWorkstations();

    // 8. Raycasting for Interaction
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Event Listeners
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

    // Start Animation Loop
    animate();
}

function setDefaultCameraPosition() {
    camera.position.set(13, 14, 15);
    camera.lookAt(0, 1.2, 0);
}

/**
 * Studio Lighting Setup
 */
function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.6);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 0.85);
    dirLight.position.set(12, 18, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 40;
    const d = 12;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    // Soft blue fill from opposite side
    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.4);
    fillLight.position.set(-12, 10, -10);
    scene.add(fillLight);
}

/**
 * Builds Floor, Low Walls, Entrance, and Floor Grid
 */
function buildRoom() {
    const roomW = 14;
    const roomD = 14;

    // Floor Base
    const floorGeo = new THREE.PlaneGeometry(roomW, roomD);
    const floorMat = new THREE.MeshStandardMaterial({
        color: COLORS.floor,
        roughness: 0.4,
        metalness: 0.05
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grid Floor Overlay
    const grid = new THREE.GridHelper(roomW, 14, 0xcbd5e1, 0xe2e8f0);
    grid.position.y = 0.005;
    scene.add(grid);

    // Architectural Half-Height Walls (0.75m height)
    const wallH = 0.8;
    const wallThick = 0.2;
    const wallMat = new THREE.MeshStandardMaterial({
        color: COLORS.wallGlass,
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: 0.65
    });
    const wallTrimMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.5 });

    function createWall(w, h, d, x, y, z) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);

        // Top trim
        const trim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), wallTrimMat);
        trim.position.set(x, y + h / 2 + 0.02, z);
        scene.add(trim);
    }

    // Back Wall (Z = -roomD/2)
    createWall(roomW, wallH, wallThick, 0, wallH / 2, -roomD / 2);

    // Right Wall (X = +roomW/2)
    createWall(wallThick, wallH, roomD, roomW / 2, wallH / 2, 0);

    // Front Wall (Z = +roomD/2)
    createWall(roomW, wallH, wallThick, 0, wallH / 2, roomD / 2);

    // Left Wall with Entrance opening near front-left corner
    // Left Wall section from Z = -7 to Z = 2 (Length 9)
    createWall(wallThick, wallH, 9.5, -roomW / 2, wallH / 2, -2.25);
    // Entrance gap from Z = 2.5 to Z = 5.5
    // Left Wall front corner stub from Z = 5.5 to Z = 7 (Length 1.5)
    createWall(wallThick, wallH, 1.5, -roomW / 2, wallH / 2, 6.25);

    // Entrance Floor Mat / Marker
    const entranceMatGeo = new THREE.PlaneGeometry(1.8, 2.5);
    const entranceMat = new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        roughness: 0.7,
        transparent: true,
        opacity: 0.25
    });
    const entranceFloor = new THREE.Mesh(entranceMatGeo, entranceMat);
    entranceFloor.rotation.x = -Math.PI / 2;
    entranceFloor.position.set(-roomW / 2 + 0.9, 0.01, 4.0);
    scene.add(entranceFloor);

    // 3D Entrance Sign Sprite
    const entranceSprite = createTextBadge("🚪 LAB ENTRANCE", "#1e40af", "#dbeafe");
    entranceSprite.position.set(-roomW / 2 + 0.9, 1.4, 4.0);
    entranceSprite.scale.set(1.8, 0.6, 1);
    scene.add(entranceSprite);
}

/**
 * Builds a single Workstation (Cream Wood Table, Black Monitor, Keyboard, Mouse, Chair, Floating Badge)
 */
function createWorkstation(pcId, posX, posZ, rotY, monitorFacingOpposite = false) {
    const group = new THREE.Group();
    group.position.set(posX, 0, posZ);
    group.rotation.y = rotY;

    // 1. Table Top (Cream Wood)
    const tableW = 2.0;
    const tableD = 1.1;
    const tableH = 0.08;
    const tablePosY = 1.0;

    const woodMat = new THREE.MeshStandardMaterial({
        color: COLORS.tableWood,
        roughness: 0.5,
        metalness: 0.05
    });
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(tableW, tableH, tableD), woodMat);
    tableTop.position.set(0, tablePosY, 0);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    group.add(tableTop);

    // 2. Table Legs (Dark Metal Frame)
    const legMat = new THREE.MeshStandardMaterial({ color: COLORS.tableLegs, roughness: 0.4 });
    const legGeo = new THREE.BoxGeometry(0.06, tablePosY, 0.06);

    const legOffsets = [
        [-tableW / 2 + 0.1, tablePosY / 2, -tableD / 2 + 0.1],
        [tableW / 2 - 0.1, tablePosY / 2, -tableD / 2 + 0.1],
        [-tableW / 2 + 0.1, tablePosY / 2, tableD / 2 - 0.1],
        [tableW / 2 - 0.1, tablePosY / 2, tableD / 2 - 0.1]
    ];
    legOffsets.forEach(pos => {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(...pos);
        leg.castShadow = true;
        group.add(leg);
    });

    // 3. Monitor Setup
    const monitorGroup = new THREE.Group();
    const monitorOffsetZ = monitorFacingOpposite ? 0.25 : -0.25;
    monitorGroup.position.set(0, tablePosY + tableH / 2, monitorOffsetZ);
    if (monitorFacingOpposite) {
        monitorGroup.rotation.y = Math.PI;
    }

    // Monitor Stand Base & Arm
    const bezelMat = new THREE.MeshStandardMaterial({ color: COLORS.monitorBezel, roughness: 0.3 });
    const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.25), bezelMat);
    standBase.position.set(0, 0.01, 0);
    monitorGroup.add(standBase);

    const standArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.38, 0.04), bezelMat);
    standArm.position.set(0, 0.19, -0.05);
    monitorGroup.add(standArm);

    // Monitor Frame / Bezel
    const screenW = 1.05;
    const screenH = 0.65;
    const screenD = 0.04;
    const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(screenW, screenH, screenD), bezelMat);
    screenFrame.position.set(0, 0.45, 0);
    screenFrame.castShadow = true;
    monitorGroup.add(screenFrame);

    // Glowing Display Screen
    const screenMat = new THREE.MeshStandardMaterial({
        color: COLORS.screenFree,
        emissive: COLORS.screenFree,
        emissiveIntensity: 0.75,
        roughness: 0.2
    });
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(screenW - 0.06, screenH - 0.06), screenMat);
    screenMesh.position.set(0, 0.45, screenD / 2 + 0.002);
    monitorGroup.add(screenMesh);

    group.add(monitorGroup);

    // 4. Keyboard & Mouse
    const kbMat = new THREE.MeshStandardMaterial({ color: COLORS.keyboard, roughness: 0.6 });
    const kbZ = monitorFacingOpposite ? -0.18 : 0.18;
    const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.015, 0.22), kbMat);
    keyboard.position.set(0, tablePosY + tableH / 2 + 0.008, kbZ);
    group.add(keyboard);

    const mouseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.12), kbMat);
    mouseMesh.position.set(0.45, tablePosY + tableH / 2 + 0.008, kbZ);
    group.add(mouseMesh);

    // 5. Ergonomic Lab Chair
    const chairGroup = new THREE.Group();
    const chairZ = monitorFacingOpposite ? -0.75 : 0.75;
    chairGroup.position.set(0, 0, chairZ);
    if (monitorFacingOpposite) chairGroup.rotation.y = Math.PI;

    const chairMat = new THREE.MeshStandardMaterial({ color: COLORS.chairSeat, roughness: 0.7 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.6), chairMat);
    seat.position.set(0, 0.65, 0);
    seat.castShadow = true;
    chairGroup.add(seat);

    const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.06), chairMat);
    backrest.position.set(0, 1.02, 0.27);
    backrest.castShadow = true;
    chairGroup.add(backrest);

    const chairStem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), legMat);
    chairStem.position.set(0, 0.3, 0);
    chairGroup.add(chairStem);

    const chairBase = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 6), legMat);
    chairBase.position.set(0, 0.02, 0);
    chairGroup.add(chairBase);

    group.add(chairGroup);

    // 6. Floating Status Sprite (Text + Badge)
    const sprite = createStatusSprite(pcId, "AVAILABLE", true);
    sprite.position.set(0, tablePosY + 1.25, 0);
    sprite.scale.set(1.9, 0.75, 1);
    group.add(sprite);

    // 7. Clickable Hitbox for Raycaster
    const hitBoxGeo = new THREE.BoxGeometry(tableW + 0.2, 2.0, tableD + 0.8);
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
 * Creates all 8 PCs according to user's layout specification:
 * - 3 consecutive PCs along left wall (PC-1, PC-2, PC-3)
 * - 3 consecutive PCs along right wall (PC-4, PC-5, PC-6)
 * - PC-7 near front/entrance
 * - PC-8 facing back wall
 */
function buildAllWorkstations() {
    // Left Wall PCs (X = -5.3, facing inwards into the lab, rotated Math.PI / 2)
    createWorkstation("PC-1", -5.3, 1.8, Math.PI / 2);
    createWorkstation("PC-2", -5.3, -0.9, Math.PI / 2);
    createWorkstation("PC-3", -5.3, -3.6, Math.PI / 2);

    // Right Wall PCs (X = +5.3, facing inwards, rotated -Math.PI / 2)
    createWorkstation("PC-4", 5.3, 1.8, -Math.PI / 2);
    createWorkstation("PC-5", 5.3, -0.9, -Math.PI / 2);
    createWorkstation("PC-6", 5.3, -3.6, -Math.PI / 2);

    // PC-7 (Front / Entrance area, facing room = 0 deg)
    createWorkstation("PC-7", 0.0, 4.2, 0);

    // PC-8 (Back Wall, "facing the back wall" = rotated Math.PI)
    createWorkstation("PC-8", 0.0, -5.2, Math.PI, true);
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
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
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
        const targetColor = isFree ? COLORS.screenFree : COLORS.screenOccupied;
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
        item.screenMat.emissiveIntensity = 1.35;
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
 * Render Loop with subtle breathing animation on monitors
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
