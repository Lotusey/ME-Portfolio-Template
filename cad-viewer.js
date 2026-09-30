import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const appBaseUrl = new URL("./", import.meta.url);
const modelsBaseUrl = new URL("models/", appBaseUrl);
const manifestUrl = new URL("models/catalog.json", appBaseUrl);
const allowedExtensions = {
  twoD: new Set(["dwg", "dxf"]),
  threeD: new Set(["glb", "stl", "obj"]),
};

const tabs = [...document.querySelectorAll("[data-cad-tab]")];
const embed = document.getElementById("cad-2d-embed");
const empty2d = document.getElementById("cad-2d-empty");
const empty3d = document.getElementById("cad-3d-empty");
const status2d = document.getElementById("cad-2d-status");
const status3d = document.getElementById("cad-3d-status");
const name2d = document.getElementById("cad-2d-name");
const name3d = document.getElementById("cad-3d-name");
const canvas = document.getElementById("cad-3d-canvas");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111827);
scene.add(new THREE.HemisphereLight(0xffffff, 0x455064, 2.2));

const keyLight = new THREE.DirectionalLight(0xffffff, 3);
keyLight.position.set(4, 7, 5);
scene.add(keyLight);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
camera.position.set(4, 3, 5);

let renderer;
let controls;
let activeModel = null;
let loadSequence = 0;
let activeDrawing = null;
let drawingSequence = 0;
let embedReady = false;

function extensionOf(path) {
  return path.split(/[?#]/, 1)[0].split(".").pop().toLowerCase();
}

function safeModelUrl(path) {
  if (typeof path !== "string") return null;
  const relativePath = path.replace(/^\/+/, "");
  const url = new URL(relativePath, appBaseUrl);
  if (url.origin !== appBaseUrl.origin || !url.pathname.startsWith(modelsBaseUrl.pathname)) return null;
  return url;
}

function renderLibrary(container, entries, allowed, onSelect) {
  const validEntries = entries.filter((entry) => {
    const url = safeModelUrl(entry.url);
    return entry.name && url && allowed.has(extensionOf(url.pathname));
  });

  validEntries.forEach((entry, index) => {
    const extension = extensionOf(entry.url);
    const item = document.createElement("div");
    item.setAttribute("role", "listitem");
    const button = document.createElement("button");
    button.className = "cad-sample";
    button.type = "button";
    button.setAttribute("aria-pressed", "false");

    const badge = document.createElement("span");
    badge.className = "cad-sample-icon";
    badge.textContent = extension;

    const text = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = entry.name;
    const detail = document.createElement("small");
    detail.textContent = entry.description || extension.toUpperCase();
    text.append(title, detail);
    button.append(badge, text);
    button.addEventListener("click", () => {
      container.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      onSelect(entry);
    });
    button.dataset.index = String(index);
    item.append(button);
    container.append(item);
  });

  return validEntries.length;
}

function setTab(tabName) {
  tabs.forEach((tab) => {
    const selected = tab.dataset.cadTab === tabName;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute("aria-controls")).hidden = !selected;
  });

  if (tabName === "3d") resizeRenderer();
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => setTab(tab.dataset.cadTab));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    tabs[nextIndex].focus();
    setTab(tabs[nextIndex].dataset.cadTab);
  });
});

function initializeRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.addEventListener("change", () => renderer.render(scene, camera));
  resizeRenderer();
}

function resizeRenderer() {
  if (!renderer || document.getElementById("cad-panel-3d").hidden) return;
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

function fitModel(object) {
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) throw new Error("This model does not contain visible geometry.");
  const center = bounds.getCenter(new THREE.Vector3());
  object.position.sub(center);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.01);
  const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.15;
  camera.near = Math.max(radius / 1000, 0.001);
  camera.far = radius * 100;
  camera.position.set(distance * 0.85, distance * 0.65, distance);
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.minDistance = radius * 0.05;
  controls.maxDistance = radius * 50;
  controls.update();
}

function loadThreeModel(entry) {
  const url = safeModelUrl(entry.url);
  const extension = extensionOf(url.pathname);
  initializeRenderer();
  empty3d.hidden = true;
  status3d.textContent = `Loading ${entry.name}...`;
  name3d.textContent = entry.name;
  const sequence = ++loadSequence;
  const onLoad = (object) => {
    if (sequence !== loadSequence) return;
    if (activeModel) scene.remove(activeModel);

    if (object.isBufferGeometry) {
      object.computeVertexNormals();
      const mesh = new THREE.Mesh(object, new THREE.MeshStandardMaterial({ color: 0xe0a348, metalness: 0.12, roughness: 0.58, side: THREE.DoubleSide }));
      object = mesh;
    } else if (extension === "obj") {
      object.traverse((child) => {
        if (child.isMesh) child.material = new THREE.MeshStandardMaterial({ color: 0xe0a348, metalness: 0.12, roughness: 0.58, side: THREE.DoubleSide });
      });
    }

    activeModel = object;
    scene.add(activeModel);
    fitModel(activeModel);
    renderer.render(scene, camera);
    status3d.textContent = `${extension.toUpperCase()} model ready. Drag to orbit; scroll to zoom.`;
  };
  const onError = () => {
    if (sequence !== loadSequence) return;
    empty3d.hidden = false;
    status3d.textContent = `Could not load ${entry.name}. Check that the model file is available.`;
  };

  if (extension === "glb") {
    new GLTFLoader().load(url.href, (gltf) => onLoad(gltf.scene), undefined, onError);
  } else if (extension === "stl") {
    new STLLoader().load(url.href, onLoad, undefined, onError);
  } else {
    new OBJLoader().load(url.href, onLoad, undefined, onError);
  }
}

async function sendDrawingToEmbed(drawing) {
  const sequence = drawing.sequence;
  const source = safeModelUrl(drawing.entry.url);
  if (!source) return;

  status2d.textContent = `Loading ${drawing.entry.name}...`;
  try {
    const response = await fetch(source.href);
    if (!response.ok) throw new Error(`Drawing request failed (${response.status}).`);
    const buffer = await response.arrayBuffer();
    if (sequence !== drawingSequence || !embed.contentWindow) return;

    embed.contentWindow.postMessage(
      {
        type: "mlightcad-embed:open",
        filename: decodeURIComponent(source.pathname.split("/").pop()),
        buffer,
      },
      "https://mlightcad.com",
      [buffer]
    );
    status2d.textContent = `Opening ${drawing.entry.name} in the DWG/DXF viewer...`;
  } catch (error) {
    if (sequence !== drawingSequence) return;
    empty2d.hidden = false;
    status2d.textContent = `Could not load ${drawing.entry.name}: ${error.message}`;
  }
}

window.addEventListener("message", (event) => {
  if (event.origin !== "https://mlightcad.com" || event.source !== embed.contentWindow) return;
  if (event.data?.type !== "mlightcad-embed:ready") return;
  embedReady = true;
  if (activeDrawing) sendDrawingToEmbed(activeDrawing);
});

document.getElementById("cad-3d-reset").addEventListener("click", () => {
  if (activeModel) fitModel(activeModel);
  renderer?.render(scene, camera);
});

window.addEventListener("resize", resizeRenderer);
new ResizeObserver(resizeRenderer).observe(document.querySelector(".cad-stage-wrap"));

async function initializeLibrary() {
  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) throw new Error("Model catalog unavailable");
    const catalog = await response.json();
    const twoDCount = renderLibrary(
      document.getElementById("cad-2d-samples"),
      Array.isArray(catalog.twoD) ? catalog.twoD : [],
      allowedExtensions.twoD,
      (entry) => {
        const source = safeModelUrl(entry.url);
        if (!source) return;
        const drawing = { entry, sequence: ++drawingSequence };
        activeDrawing = drawing;
        empty2d.hidden = true;
        name2d.textContent = entry.name;

        const embedUrl = new URL("https://mlightcad.com/embed.html");
        embedUrl.searchParams.set("mode", "review");
        embedUrl.searchParams.set("view", "extents");
        embedUrl.searchParams.set("theme", "dark");
        embedUrl.searchParams.set("toolbar", "1");
        embed.hidden = false;

        if (embed.src && embedReady) {
          sendDrawingToEmbed(drawing);
        } else if (!embed.src) {
          status2d.textContent = `Preparing ${entry.name}...`;
          embedReady = false;
          embed.src = embedUrl.href;
        } else {
          status2d.textContent = `Preparing ${entry.name}...`;
        }
      }
    );
    const threeDCount = renderLibrary(
      document.getElementById("cad-3d-samples"),
      Array.isArray(catalog.threeD) ? catalog.threeD : [],
      allowedExtensions.threeD,
      loadThreeModel
    );

    empty2d.hidden = twoDCount > 0;
    empty3d.hidden = threeDCount > 0;
    if (!twoDCount) status2d.textContent = "No 2D drawings are in the library yet.";
    if (!threeDCount) status3d.textContent = "No 3D models are in the library yet.";
  } catch {
    status2d.textContent = "The model library could not be loaded.";
    status3d.textContent = "The model library could not be loaded.";
  }
}

initializeLibrary();