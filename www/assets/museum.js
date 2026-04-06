import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { ApiError, buildApiUrl, formatFrenchDate, requestJson, setStatus } from "/assets/common.js";

const stage = document.querySelector("[data-viewer-stage]");
const canvasHost = document.querySelector("[data-viewer-canvas]");
const statusElement = document.querySelector("[data-viewer-status]");
const countElement = document.querySelector("[data-viewer-count]");
const titleElement = document.querySelector("[data-viewer-title]");
const authorElement = document.querySelector("[data-viewer-author]");
const createdElement = document.querySelector("[data-viewer-created]");
const stateElement = document.querySelector("[data-viewer-state]");
const descriptionElement = document.querySelector("[data-viewer-description]");
const previousButton = document.querySelector("[data-prev]");
const nextButton = document.querySelector("[data-next]");

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasHost.append(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x1a1d20, 9, 20);

const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
camera.position.set(0, 2.1, 6.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableZoom = true;
controls.enableDamping = true;
controls.minDistance = 3.2;
controls.maxDistance = 10;
controls.target.set(0, 1.2, 0);

const displayPivot = new THREE.Group();
scene.add(displayPivot);

const ambientLight = new THREE.AmbientLight(0xece5d8, 0.35);
scene.add(ambientLight);

const spotlight = new THREE.SpotLight(0xfff0d5, 18, 30, Math.PI / 7, 0.42, 1.3);
spotlight.position.set(3.8, 7.5, 4);
spotlight.castShadow = true;
spotlight.shadow.mapSize.set(2048, 2048);
spotlight.target.position.set(0, 1.2, 0);
scene.add(spotlight);
scene.add(spotlight.target);

const fillLight = new THREE.DirectionalLight(0xcfd8e6, 1.6);
fillLight.position.set(-4, 3.5, -3);
scene.add(fillLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(10, 80),
  new THREE.MeshStandardMaterial({
    color: 0x353a40,
    roughness: 0.94,
    metalness: 0.02
  })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const cyclorama = new THREE.Mesh(
  new THREE.CylinderGeometry(9, 9, 8.5, 64, 1, true, Math.PI * 0.5, Math.PI),
  new THREE.MeshStandardMaterial({
    color: 0x545962,
    side: THREE.BackSide,
    roughness: 1,
    metalness: 0
  })
);
cyclorama.position.set(0, 3.4, -0.6);
scene.add(cyclorama);

const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

const state = {
  items: [],
  index: 0,
  activeRoot: null,
  activeResources: [],
  lastInteractionAt: 0,
  loadToken: 0,
  swipeStart: null,
  refreshTimer: null
};

function trackResource(resource) {
  state.activeResources.push(resource);
}

function disposeActiveResources() {
  for (const resource of state.activeResources) {
    if (resource?.dispose) {
      resource.dispose();
    }
  }

  state.activeResources = [];
}

function clearActiveObject() {
  if (state.activeRoot) {
    displayPivot.remove(state.activeRoot);
    disposeActiveResources();
    state.activeRoot.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }

      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose?.());
      } else {
        child.material?.dispose?.();
      }
    });
  }

  state.activeRoot = null;
}

function setButtonsDisabled(disabled) {
  previousButton.disabled = disabled;
  nextButton.disabled = disabled;
}

function updateMeta(item, index, total, isFallback) {
  countElement.textContent = `${index + 1} / ${total}`;
  titleElement.textContent = item.name;
  authorElement.textContent = item.author ? `Par ${item.author}` : "Auteur ou autrice non renseigne";
  createdElement.textContent = `Archivee le ${formatFrenchDate(item.created_at)}`;
  stateElement.textContent = isFallback
    ? "Image source exposee en attendant le modele GLB"
    : "Modele 3D disponible";
  descriptionElement.textContent = item.description;
}

function fitObjectToStage(object, targetSize = 3.2) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxDimension;

  object.scale.setScalar(scale);
  object.position.set(-center.x * scale, -box.min.y * scale + 0.02, -center.z * scale);
}

function createPedestal() {
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.25, 0.32, 40),
    new THREE.MeshStandardMaterial({
      color: 0x766e61,
      roughness: 0.92,
      metalness: 0.03
    })
  );

  pedestal.position.y = 0.16;
  pedestal.receiveShadow = true;
  pedestal.castShadow = true;
  return pedestal;
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (texture) => resolve(texture),
      undefined,
      (error) => reject(error)
    );
  });
}

function loadModel(url) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (error) => reject(error)
    );
  });
}

async function buildImageArtifact(imageUrl) {
  const texture = await loadTexture(imageUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  trackResource(texture);

  const group = new THREE.Group();
  const pedestal = createPedestal();
  group.add(pedestal);

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.8),
    new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      roughness: 0.86,
      metalness: 0.02
    })
  );
  plane.position.set(0, 1.82, 0);
  plane.castShadow = true;
  group.add(plane);

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(2.42, 3.02, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0x8f7043,
      roughness: 0.45,
      metalness: 0.18
    })
  );
  frame.position.set(0, 1.82, -0.05);
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  const caption = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.12, 0.65),
    new THREE.MeshStandardMaterial({
      color: 0xd0c1a4,
      roughness: 0.72,
      metalness: 0.02
    })
  );
  caption.position.set(0, 0.66, 0.32);
  caption.castShadow = true;
  group.add(caption);

  return group;
}

async function buildArtifact(item) {
  if (item.has_model && item.model_url) {
    try {
      const object = await loadModel(item.model_url);
      object.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      return {
        object,
        isFallback: false
      };
    } catch (error) {
      console.error("Unable to load GLB, using image placeholder instead.", error);
    }
  }

  return {
    object: await buildImageArtifact(item.image_url),
    isFallback: true
  };
}

async function showItem(index) {
  if (!state.items.length) {
    return;
  }

  state.index = (index + state.items.length) % state.items.length;
  const item = state.items[state.index];
  const loadToken = ++state.loadToken;
  setButtonsDisabled(true);
  setStatus(statusElement, "Chargement de l'objet...", "info");

  try {
    const { object, isFallback } = await buildArtifact(item);

    if (loadToken !== state.loadToken) {
      object.traverse((child) => {
        child.geometry?.dispose?.();
        child.material?.dispose?.();
      });
      return;
    }

    clearActiveObject();
    fitObjectToStage(object);
    displayPivot.rotation.set(0, 0, 0);
    displayPivot.add(object);
    state.activeRoot = object;
    updateMeta(item, state.index, state.items.length, isFallback);
    window.history.replaceState(null, "", `${window.location.pathname}#${item.id}`);
    setStatus(statusElement, "", "info");
  } catch (error) {
    console.error(error);
    setStatus(
      statusElement,
      error instanceof ApiError ? error.message : "Impossible de charger cet artefact.",
      "error"
    );
  } finally {
    setButtonsDisabled(state.items.length <= 1);
  }
}

function resizeRenderer() {
  const { clientWidth, clientHeight } = canvasHost;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / Math.max(clientHeight, 1);
  camera.updateProjectionMatrix();
}

function itemIds(items) {
  return items.map((item) => item.id).join("|");
}

function activeItemId() {
  return state.items[state.index]?.id ?? window.location.hash.replace(/^#/, "");
}

async function loadItems({ silent = false } = {}) {
  if (!silent) {
    setStatus(statusElement, "Chargement des artefacts...", "info");
  }

  try {
    const response = await requestJson(buildApiUrl("items.php"));
    const nextItems = response.items;
    const idsChanged = itemIds(nextItems) !== itemIds(state.items);
    const shouldRefreshView = idsChanged || !state.activeRoot;

    state.items = nextItems;

    if (!state.items.length) {
      countElement.textContent = "0 / 0";
      titleElement.textContent = "Archive vide";
      authorElement.textContent = "";
      createdElement.textContent = "";
      stateElement.textContent = "Aucune contribution n'est encore visible.";
      descriptionElement.textContent = "Invitez les participant(e)s a soumettre une image pour lancer l'exposition.";
      setButtonsDisabled(true);
      if (!silent || !state.activeRoot) {
        setStatus(statusElement, "Le musee attend sa premiere contribution.", "info");
      }
      clearActiveObject();
      return;
    }

    if (!shouldRefreshView) {
      if (!silent) {
        setStatus(statusElement, "", "info");
      }
      return;
    }

    const preferredId = activeItemId();
    const startIndex = state.items.findIndex((item) => item.id === preferredId);
    await showItem(startIndex >= 0 ? startIndex : 0);
  } catch (error) {
    setStatus(
      statusElement,
      error instanceof ApiError ? error.message : "Impossible de charger l'archive.",
      "error"
    );
    setButtonsDisabled(true);
  }
}

function navigate(step) {
  if (!state.items.length) {
    return;
  }

  showItem(state.index + step);
}

function handleSwipeStart(event) {
  const touch = event.changedTouches[0];
  state.swipeStart = { x: touch.clientX, y: touch.clientY };
}

function handleSwipeEnd(event) {
  if (!state.swipeStart) {
    return;
  }

  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - state.swipeStart.x;
  const deltaY = touch.clientY - state.swipeStart.y;
  state.swipeStart = null;

  if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
    navigate(deltaX > 0 ? -1 : 1);
  }
}

controls.addEventListener("start", () => {
  state.lastInteractionAt = Date.now();
});

controls.addEventListener("end", () => {
  state.lastInteractionAt = Date.now();
});

previousButton.addEventListener("click", () => navigate(-1));
nextButton.addEventListener("click", () => navigate(1));

stage.addEventListener("touchstart", handleSwipeStart, { passive: true });
stage.addEventListener("touchend", handleSwipeEnd, { passive: true });

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    navigate(-1);
  } else if (event.key === "ArrowRight") {
    navigate(1);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    loadItems({ silent: true });
  }
});

window.addEventListener("beforeunload", () => {
  if (state.refreshTimer) {
    window.clearInterval(state.refreshTimer);
  }
});

window.addEventListener("resize", resizeRenderer);

function animate() {
  requestAnimationFrame(animate);

  if (state.activeRoot && Date.now() - state.lastInteractionAt > 1200) {
    displayPivot.rotation.y += 0.004;
  }

  controls.update();
  renderer.render(scene, camera);
}

resizeRenderer();
loadItems();
state.refreshTimer = window.setInterval(() => {
  loadItems({ silent: true });
}, 15000);
animate();
