// =============================================================================
// Computer Graphics - Exercise 6 - Interactive Bowling Game
// =============================================================================
//
// This file starts from the finished HW05 static scene (lane, markings,
// gutters, pins, ball, lighting, UI containers, orbit camera) and adds the
// HW06 interactive game layer on top, in the regions marked `// TODO (HW06)`.
//
// HW06 adds:
//   1. Aiming & controls (move/aim the ball, oscillating power meter, release)
//   2. Simplified ball physics (rolling, gutter balls, optional curve)
//   3. Pin collision & toppling
//   4. 10-frame bowling scoring
//   5. Game flow (frames, reset, end-of-roll detection)
//
// Simplified, hand-written physics only — no external physics engine.
// =============================================================================

import {OrbitControls} from './OrbitControls.js'

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
// Set background color
scene.background = new THREE.Color(0x1a1a2e);

// Add lights to the scene
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 30, 0);
scene.add(directionalLight);

// Aim the light at the middle of the lane so shadows are centered on the scene
directionalLight.target.position.set(0, 0, -30);
scene.add(directionalLight.target);   // a DirectionalLight's target must be added to the scene

// Enable shadows
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;  // softer, less jagged shadow edges
directionalLight.castShadow = true;

// Widen the shadow camera frustum so it covers the whole 60-unit lane
directionalLight.shadow.mapSize.width = 2048;   // higher res = crisper shadows
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 120;
directionalLight.shadow.camera.left = -15;
directionalLight.shadow.camera.right = 15;
directionalLight.shadow.camera.top = 45;
directionalLight.shadow.camera.bottom = -45;

function degrees_to_radians(degrees) {
  var pi = Math.PI;
  return degrees * (pi/180);
}

// Create bowling lane
function createBowlingLane() {
  // Lane surface - just a simple light maple wood surface
  const laneGeometry = new THREE.BoxGeometry(3.5, 0.2, 60);
  const laneMaterial = new THREE.MeshPhongMaterial({
    color: 0xDEB887,  // Light maple wood color
    shininess: 80
  });
  const lane = new THREE.Mesh(laneGeometry, laneMaterial);
  lane.position.set(0, 0, -30);  // Lane extends from Z=0 (foul line) to Z=-60 (pin end)
  lane.receiveShadow = true;
  scene.add(lane);
}

// Create the approach area (where the bowler stands, behind the foul line at +Z)
function createApproach(){
    const approachGeometry =  new THREE.BoxGeometry(4.3, 0.2, 15);
    const approachMaterial = new THREE.MeshPhongMaterial({
        color: 0xC19A6B,  // a different, slightly darker wood shade than the lane
        shininess: 30
    });
    const approach = new THREE.Mesh(approachGeometry, approachMaterial);
    approach.position.set(0, 0, 7.5);  // +Z side, length 15 -> centered at Z=7.5
    approach.receiveShadow = true;
    scene.add(approach);
}

// Create the two gutters running alongside the lane
function createGutters() {
    const gutterGeometry = new THREE.BoxGeometry(0.4, 0.2, 60);
    const gutterMaterial = new THREE.MeshPhongMaterial({
        color: 0x2a2a3a,  // dark, so it contrasts with the lane
        shininess: 10
    });

    const leftGutter = new THREE.Mesh(gutterGeometry, gutterMaterial);
    leftGutter.position.set(-1.95, -0.1, -30);  // X just outside lane, lowered, full length
    leftGutter.receiveShadow = true;
    scene.add(leftGutter);

    const rightGutter = new THREE.Mesh(gutterGeometry, gutterMaterial);
    rightGutter.position.set(1.95, -0.1, -30);
    rightGutter.receiveShadow = true;
    scene.add(rightGutter);
}

function createFoulLine(){
    const foulGeometry = new THREE.BoxGeometry(3.5,0.02,0.15);
    const foulMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const foulLine = new THREE.Mesh(foulGeometry, foulMaterial);
    foulLine.position.set(0, 0.11, 0);  // full lane width, just above the surface, at the foul line
    scene.add(foulLine);
}
// Create the locator dots on the approach area
function createApproachDots() {
    const dotGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Row closer to the foul line: 7 dots
    const frontRowX = [-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5];
    frontRowX.forEach((x) => {
        const dot = new THREE.Mesh(dotGeometry, dotMaterial);
        dot.position.set(x, 0.11, 3);
        scene.add(dot);
    });

    // Row further back: 5 dots
    const backRowX = [-1.0, -0.5, 0, 0.5, 1.0];
    backRowX.forEach((x) => {
        const dot = new THREE.Mesh(dotGeometry, dotMaterial);
        dot.position.set(x, 0.11, 6);
        scene.add(dot);
    });
}

// Create the 7 targeting arrows embedded in the lane (~15 units from the foul line)
function createLaneArrows() {
    // Build one flat triangle outline (tip pointing +Y, which becomes -Z once laid flat)
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.3);      // tip
    arrowShape.lineTo(-0.15, -0.2); // bottom-left
    arrowShape.lineTo(0.15, -0.2);  // bottom-right
    arrowShape.lineTo(0, 0.3);      // close it

    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0x5a3a1a }); // dark brown

    // X offset -> the more off-center, the closer to the bowler (forms the V)
    const offsets = [-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5];
    offsets.forEach((x) => {
        const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
        arrow.rotation.x = -Math.PI / 2;     // lay it flat on the lane
        arrow.position.set(x, 0.11, -15 + Math.abs(x)); // center arrow furthest, outers pulled back
        scene.add(arrow);
    });
}

// Build a single bowling pin (white body + red neck stripes) as a Group
function createPin() {
    const pin = new THREE.Group();

    // Half-silhouette of the pin: x = radius from center, y = height.
    // Revolved around the Y axis by LatheGeometry to form the pin body.
    const profile = [
        new THREE.Vector2(0.00, 0.00),  // base center (bottom)
        new THREE.Vector2(0.12, 0.00),  // base edge
        new THREE.Vector2(0.12, 0.06),
        new THREE.Vector2(0.10, 0.14),
        new THREE.Vector2(0.15, 0.30),
        new THREE.Vector2(0.20, 0.45),  // belly (widest point)
        new THREE.Vector2(0.18, 0.60),
        new THREE.Vector2(0.12, 0.74),
        new THREE.Vector2(0.08, 0.85),  // neck (narrowest)
        new THREE.Vector2(0.10, 0.95),  // head bulge
        new THREE.Vector2(0.11, 1.04),
        new THREE.Vector2(0.08, 1.15),
        new THREE.Vector2(0.04, 1.22),
        new THREE.Vector2(0.00, 1.25),  // rounded top
    ];

    const bodyGeometry = new THREE.LatheGeometry(profile, 32); // 32 = smoothness around
    const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 60 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    pin.add(body);

    // Two red stripes around the neck (thin cylinders sitting just proud of the body)
    const stripeMaterial = new THREE.MeshPhongMaterial({ color: 0xcc0000, shininess: 60 });
    const stripeHeights = [0.80, 0.90];
    const stripeRadii = [0.11, 0.105];
    stripeHeights.forEach((h, i) => {
        const stripeGeometry = new THREE.CylinderGeometry(stripeRadii[i], stripeRadii[i], 0.04, 32);
        const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
        stripe.position.y = h;
        stripe.castShadow = true;
        pin.add(stripe);
    });

    return pin;
}

function createPinDeck() {
    const deckGeometry = new THREE.BoxGeometry(3.6, 0.1, 5);
    const deckMaterial = new THREE.MeshPhongMaterial({ color: 0xEAD9B0, shininess: 50 });
    const deck = new THREE.Mesh(deckGeometry, deckMaterial);
    deck.position.set(0, 0.15, -58.3); // bottom flush with lane top (0.1), top at y=0.2
    deck.receiveShadow = true;
    scene.add(deck);
}

// Standard 10-pin triangular layout. Foul line at Z=0, head pin nearest the bowler.
const PIN_POSITIONS = [
    {x: 0.0, z: -57.000}, // 1 (head pin)
    {x: -0.5, z: -57.866}, // 2
    {x: 0.5, z: -57.866}, // 3
    {x: -1.0, z: -58.732}, // 4
    {x: 0.0, z: -58.732}, // 5
    {x: 1.0, z: -58.732}, // 6
    {x: -1.5, z: -59.598}, // 7
    {x: -0.5, z: -59.598}, // 8
    {x: 0.5, z: -59.598}, // 9
    {x: 1.5, z: -59.598}, // 10
];

const PIN_REST_Y = 0.2; // base resting on the pin deck

// Build all 10 pins and capture references so the game layer can test collisions,
// topple them, track which are standing, and reset them between rolls/frames.
const pins = [];
function createPins() {
    PIN_POSITIONS.forEach((p) => {
        const pin = createPin();
        pin.position.set(p.x, PIN_REST_Y, p.z);
        scene.add(pin);
        pins.push({
            mesh: pin,
            homePos: new THREE.Vector3(p.x, PIN_REST_Y, p.z), // where it resets to
            standing: true,
            falling: false,
        });
    });
}

function createHoles(radius, ball) {
    const holeMaterial = new THREE.MeshPhongMaterial({color: 0x111111}); // near-black = looks like a hole
    const holeDirections = [
        new THREE.Vector3(-0.18, 0.95, 0.20),  // finger 1
        new THREE.Vector3(0.18, 0.95, 0.20),  // finger 2 (adjacent to finger 1)
        new THREE.Vector3(0.00, 0.95, -0.28),  // thumb (offset from the two fingers)
    ];

    holeDirections.forEach((dir) => {
        dir.normalize();  // turn it into a pure direction (length 1)

        const holeGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.18, 16);
        const hole = new THREE.Mesh(holeGeometry, holeMaterial);

        // Move it out to the surface, pulled in a bit so it's embedded ("drilled in")
        hole.position.copy(dir.clone().multiplyScalar(radius * 0.85));

        // Align the cylinder's axis (its local +Y) with the outward direction,
        // so the hole points toward the ball's center instead of straight up.
        hole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

        ball.add(hole);
    });
}

// Ball geometry constants the physics layer needs.
const BALL_RADIUS = 0.45;
const BALL_REST_Y = BALL_RADIUS + 0.1;        // y so the ball rests on the surface
const BALL_START = new THREE.Vector3(0, BALL_REST_Y, 7); // approach, centered on the lane

function createBowlingBall() {
    const ball = new THREE.Group();   // group so the sphere + holes move together

    // Glossy sphere body
    const ballGeometry = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
    const ballMaterial = new THREE.MeshPhongMaterial({
        color: 0x1565C0,       // deep blue (pick any color you like)
        shininess: 100,        // high shininess = glossy
        specular: 0xffffff     // bright white highlight = that polished, wet look
    });
    const sphere = new THREE.Mesh(ballGeometry, ballMaterial);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    ball.add(sphere);

    createHoles(BALL_RADIUS, ball);

    // Place on the approach, centered on the lane
    ball.position.copy(BALL_START);
    scene.add(ball);
    return ball;
}

// Bonus: raised bumper rails sitting on top of each gutter (rounded, "inflatable" look)
function createBumpers() {
    const bumperGeometry = new THREE.CylinderGeometry(0.18, 0.18, 60, 16);
    const bumperMaterial = new THREE.MeshPhongMaterial({
        color: 0xE53935,  // bright red, contrasts with the dark gutters
        shininess: 60
    });

    [-1.95, 1.95].forEach((x) => {
        const bumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
        bumper.rotation.x = Math.PI / 2;       // align the cylinder along the lane (Z)
        bumper.position.set(x, 0.18, -30);     // rests on the gutter (gutter top at y=0)
        bumper.castShadow = true;
        bumper.receiveShadow = true;
        scene.add(bumper);
    });
}

// Bonus: a bench behind the approach area for the bowler to sit on
function createSeating() {
    const woodMaterial = new THREE.MeshPhongMaterial({ color: 0x6B4226, shininess: 20 });
    const bench = new THREE.Group();

    // Seat slab
    const seatGeometry = new THREE.BoxGeometry(4, 0.15, 1.2);
    const seat = new THREE.Mesh(seatGeometry, woodMaterial);
    seat.position.set(0, 0.6, 0);
    bench.add(seat);

    // Backrest
    const backGeometry = new THREE.BoxGeometry(4, 0.8, 0.15);
    const back = new THREE.Mesh(backGeometry, woodMaterial);
    back.position.set(0, 1.0, -0.5);
    bench.add(back);

    // Four legs
    const legGeometry = new THREE.BoxGeometry(0.15, 0.6, 0.15);
    [[-1.8, -0.45], [1.8, -0.45], [-1.8, 0.45], [1.8, 0.45]].forEach(([x, z]) => {
        const leg = new THREE.Mesh(legGeometry, woodMaterial);
        leg.position.set(x, 0.3, z);
        bench.add(leg);
    });

    bench.traverse((obj) => {
        if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
        }
    });

    bench.position.set(0, 0, 17);  // behind the approach (approach ends at Z=15)
    scene.add(bench);
}

// Create all elements
createBowlingLane();
createApproach();
createGutters();
createFoulLine();
createApproachDots();
createLaneArrows();
createPinDeck();
createPins();
const ball = createBowlingBall();
createBumpers();
createSeating();

// Set camera position for bowler's perspective
const cameraTranslate = new THREE.Matrix4();
cameraTranslate.makeTranslation(0, 5, 12);
camera.applyMatrix4(cameraTranslate);

// Orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
let isOrbitEnabled = true;

// Pivot the orbit camera around the middle of the lane for nicer navigation
controls.target.set(0, 1, -20);
controls.update();

function createUI(){
    const scorecard = document.getElementById('scorecard');

    for (let i = 1; i <= 10; i++) {
        const frame = document.createElement('div');
        frame.className = (i === 10) ? 'frame tenth' : 'frame';

        // frame number
        const number = document.createElement('div');
        number.className = 'frame-number';
        number.textContent = i;
        frame.appendChild(number);

        // roll boxes (2 per frame, but 3 in the 10th)
        const rolls = document.createElement('div');
        rolls.className = 'frame-rolls';
        const rollCount = (i === 10) ? 3 : 2;
        for (let r = 0; r < rollCount; r++) {
            const roll = document.createElement('div');
            roll.className = 'roll';
            rolls.appendChild(roll);
        }
        frame.appendChild(rolls)
        // running-total box
        const total = document.createElement('div');
        total.className = 'frame-total';
        frame.appendChild(total);

        scorecard.appendChild(frame);
    }
}

createUI();

// Preset camera views — one per required submission screenshot.
// Each sets both the camera position and the orbit pivot (controls.target),
// since zoom/orbit happen around the target.
const cameraViews = {
  // 1: Overall view of the lane with pins (the default bowler's perspective)
  "1": { position: [0, 5, 12],    target: [0, 1, -20] },
  // 2: Close-up of the pin formation at the end of the lane
  "2": { position: [0, 3, -48],   target: [0, 1, -58] },
  // 3: Bowling ball on the approach area
  "3": { position: [0, 2.5, 14],  target: [0, 0.5, 7] },
  // 4: Angled view demonstrating camera controls
  "4": { position: [14, 9, -8],   target: [0, 1, -35] },
};

function setCameraView(view) {
  camera.position.set(...view.position);
  controls.target.set(...view.target);
  controls.update();
}

// =============================================================================
// HW06 GAME STATE  + TUNING CONSTANTS
// =============================================================================
// ---- Tuning constants -------------------------------------------------------
const LANE_HALF_WIDTH = 1.75;                       // lane is 3.5 wide -> gutter when |x| > this
const AIM_LIMIT       = LANE_HALF_WIDTH - BALL_RADIUS; // keep the ball fully on the lane while aiming (±1.3)
const AIM_STEP        = 0.08;                        // x-nudge per Left/Right press
const MAX_AIM_ANGLE   = degrees_to_radians(12);      // clamp for launch angle off straight
const AIM_ANGLE_STEP  = degrees_to_radians(1.5);     // angle change per Up/Down press (optional curve)

const MIN_POWER    = 0.15;                           // power meter sweeps between these (0..1)
const MAX_POWER    = 1.0;
const POWER_SPEED  = 1.6;                            // meter oscillation rate (per sec)
const MIN_LAUNCH_SPEED = 18;                         // ball speed (units/sec) at MIN_POWER
const MAX_LAUNCH_SPEED = 55;                         // ball speed (units/sec) at MAX_POWER

const FRICTION   = 4.0;                              // rolling deceleration (units/sec^2)  [Step 3]
const STOP_SPEED = 2.0;                              // below this the ball counts as stopped [Step 3]
const GUTTER_Y   = -0.05;                            // y the ball drops to in a gutter      [Step 3]

// ---- Game phases  ------------------------------------
const PHASES = {
    AIMING:    'aiming',     // moving/aiming the ball on the foul line
    POWER:     'power',      // power meter oscillating, waiting for the lock
    ROLLING:   'rolling',    // ball in motion down the lane
    RESOLVING: 'resolving',  // ball stopped/gutter -> counting pins, scoring
    GAMEOVER:  'gameover',   // 10th frame complete
};

// ---- Mutable game state -----------------------------------------------------
const game = {
    phase: PHASES.AIMING,

    // aiming / release
    aimX:     0,                    // ball x along the foul line
    aimAngle: 0,                    // launch angle off straight-down-lane (radians)
    power:    MIN_POWER,            // current power-meter value (0..1)
    powerDir: 1,                    // meter sweep direction: +1 rising, -1 falling
    velocity: new THREE.Vector3(),  // release velocity, integrated each frame in Step 3

    // scoring: one sub-array of pinfall counts per frame (e.g. [7, 2] or [10])
    frames:        Array.from({ length: 10 }, () => []),
    currentFrame:  0,               // 0-based index into frames (frame 1 == index 0)
    pinsAtRollStart: 10,            // standing pins when the current roll started
};

// =============================================================================
// HW06 UI: POWER METER + LIVE SCORECARD
// =============================================================================
// TODO (HW06): Build the on-screen oscillating power meter and render the live
// 10-frame scorecard (strikes 'X', spares '/', running cumulative total) into
// the #scorecard frames created above. Extend the #controls-panel text with the
// HW06 controls (arrows / Space / R).

// =============================================================================
// HW06 PHYSICS & COLLISION (called every frame from animate)
// =============================================================================
// TODO (HW06): updateGame(deltaTime):
//   - integrate the ball's position from velocity (+ optional curve/friction)
//   - gutter detection: |ball.x| > 1.75 (lane half-width) -> gutter ball, 0 pins
//   - ball<->pin collisions (sphere vs pin bounding cylinder, ~0.20 radius)
//   - pin<->pin propagation + topple animation (rotate the pin group flat)
//   - end-of-roll detection -> count fallen pins, score, advance, reset ball

// =============================================================================
// HW06 INPUT HANDLING
// =============================================================================
// Handle key events
function handleKeyDown(e) {
  if (e.key.toLowerCase() === "o") {
    isOrbitEnabled = !isOrbitEnabled;
  } else if (cameraViews[e.key]) {
    setCameraView(cameraViews[e.key]);
  }

  // TODO (HW06): add interactive controls, gated by the current game phase:
  //   ArrowLeft / ArrowRight : move / aim the ball along the foul line
  //   ArrowUp   / ArrowDown  : adjust spin / curve (optional)
  //   Space                  : start the power meter -> lock power -> release
  //   r                      : reset pins / start a new game
}

document.addEventListener('keydown', handleKeyDown);

// Animation function
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);

  const deltaTime = clock.getDelta();
  // TODO (HW06): updateGame(deltaTime);

  // Update controls
  controls.enabled = isOrbitEnabled;
  controls.update();

  renderer.render(scene, camera);
}

window.addEventListener('resize',  () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();   // must call this after changing aspect
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
