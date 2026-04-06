import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { ApiError, buildApiUrl, formatFrenchDate, requestJson, setStatus } from "/assets/common.js";

const stage = document.querySelector("[data-viewer-stage]");
const canvasHost = document.querySelector("[data-viewer-canvas]");
const statusElement = document.querySelector("[data-viewer-status]");
const objectLoaderElement = document.querySelector("[data-viewer-object-loader]");
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
camera.position.set(0, 2.35, 8.0);

const displayPivot = new THREE.Group();
scene.add(displayPivot);

const pendingPivot = new THREE.Group();
pendingPivot.visible = false;
scene.add(pendingPivot);

const shadowCatcher = new THREE.Mesh(
  new THREE.CircleGeometry(1.5, 48),
  new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.13,
    depthWrite: false
  })
);
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.position.y = 0.04;
shadowCatcher.visible = false;
scene.add(shadowCatcher);

const ambientLight = new THREE.AmbientLight(0xece5d8, 0.35);
scene.add(ambientLight);

const spotlight = new THREE.SpotLight(0xfff0d5, 72, 30, Math.PI / 7, 0.42, 1.3);
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
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(2, 2);

const state = {
  items: [],
  index: 0,
  activeRoot: null,
  activeBaseScale: null,
  activeScaleFactor: 1,
  activeResources: [],
  activeFootprint: 1,
  pendingRoot: null,
  pendingIsFallback: false,
  pendingBaseScale: null,
  pendingResources: [],
  pendingFootprint: 1,
  pointerInsideStage: false,
  isHoveringObject: false,
  loadToken: 0,
  swipeStart: null,
  swipePointerId: null,
  swipeMoved: false,
  spinStartAt: 0,
  spinDuration: 3000,
  transition: null,
  transitionDuration: 250,
  transitionOffset: 2.4,
  refreshTimer: null
};

function disposeResources(resources) {
  for (const resource of resources) {
    if (resource?.dispose) {
      resource.dispose();
    }
  }
}

function disposeObject(root, resources, parent) {
  if (root) {
    parent.remove(root);
    disposeResources(resources);
    root.traverse((child) => {
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
}

function clearActiveObject() {
  disposeObject(state.activeRoot, state.activeResources, displayPivot);
  state.activeRoot = null;
  state.activeBaseScale = null;
  state.activeScaleFactor = 1;
  state.activeResources = [];
  state.activeFootprint = 1;
  state.isHoveringObject = false;
  shadowCatcher.visible = false;
}

function clearPendingObject() {
  disposeObject(state.pendingRoot, state.pendingResources, pendingPivot);
  state.pendingRoot = null;
  state.pendingIsFallback = false;
  state.pendingBaseScale = null;
  state.pendingResources = [];
  state.pendingFootprint = 1;
  pendingPivot.visible = false;
}

function setButtonsDisabled(disabled) {
  previousButton.disabled = disabled;
  nextButton.disabled = disabled;
}

function easeInQuad(value) {
  return value * value;
}

function easeOutQuad(value) {
  return 1 - (1 - value) * (1 - value);
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function updateMeta(item, index, total, isFallback) {
  countElement.textContent = `${index + 1} / ${total}`;
  titleElement.textContent = item.name;
  authorElement.textContent = item.author ? `Par ${item.author}` : "auteur.ice inconnu.e";
  createdElement.textContent = `Date ${item.fictional_date || formatFrenchDate(item.created_at)}`;
  stateElement.textContent = isFallback ? "Image source exposee en attendant le modele GLB" : "";
  stateElement.hidden = !isFallback;
  descriptionElement.textContent = item.description;
}

function setObjectLoaderVisible(visible) {
  objectLoaderElement.hidden = !visible;
  objectLoaderElement.style.display = visible ? "grid" : "none";
}

function fitObjectToStage(object, targetSize = 2.35) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxDimension;

  object.scale.setScalar(scale);
  object.position.set(-center.x * scale, -center.y * scale + 1.42, -center.z * scale);

  const footprint = Math.max(size.x, size.z) * scale;
  return {
    baseScale: object.scale.clone(),
    footprint: Math.max(0.9, footprint * 0.7)
  };
}

function interactiveObjectHitFromClient(clientX, clientY) {
  if (!state.activeRoot) {
    return false;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((clientY - rect.top) / rect.height) * 2 - 1);

  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(state.activeRoot, true).length > 0;
}

function startSpin() {
  state.spinStartAt = performance.now();
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

async function buildImageArtifact(imageUrl, resources) {
  const texture = await loadTexture(imageUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  resources.push(texture);

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.8),
    new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      roughness: 0.86,
      metalness: 0.02
    })
  );
  plane.castShadow = true;
  return plane;
}

async function buildArtifact(item, resources) {
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
    object: await buildImageArtifact(item.image_url, resources),
    isFallback: true
  };
}

async function prepareArtifact(item) {
  const resources = [];
  const { object, isFallback } = await buildArtifact(item, resources);
  const { baseScale, footprint } = fitObjectToStage(object);

  return {
    item,
    object,
    isFallback,
    resources,
    baseScale,
    footprint
  };
}

function activatePreparedArtifact(prepared, index) {
  const isPendingObject = prepared.object === state.pendingRoot;
  clearActiveObject();
  if (isPendingObject) {
    pendingPivot.remove(state.pendingRoot);
    pendingPivot.visible = false;
    state.pendingRoot = null;
    state.pendingIsFallback = false;
    state.pendingBaseScale = null;
    state.pendingResources = [];
    state.pendingFootprint = 1;
  } else {
    clearPendingObject();
  }

  displayPivot.rotation.set(0, 0, 0);
  displayPivot.position.set(0, 0, 0);
  displayPivot.add(prepared.object);
  state.activeRoot = prepared.object;
  state.activeBaseScale = prepared.baseScale;
  state.activeScaleFactor = 1;
  state.activeResources = prepared.resources;
  state.activeFootprint = prepared.footprint;
  state.spinStartAt = 0;
  shadowCatcher.visible = true;
  shadowCatcher.scale.setScalar(prepared.footprint);
  state.index = index;
  updateMeta(prepared.item, state.index, state.items.length, prepared.isFallback);
  window.history.replaceState(null, "", `${window.location.pathname}#${prepared.item.id}`);
}

async function showItem(index) {
  if (!state.items.length) {
    return;
  }

  const nextIndex = (index + state.items.length) % state.items.length;
  const item = state.items[nextIndex];
  const loadToken = ++state.loadToken;
  setButtonsDisabled(true);
  setStatus(statusElement, "Chargement de l'objet...", "info");
  setObjectLoaderVisible(true);

  try {
    const prepared = await prepareArtifact(item);

    if (loadToken !== state.loadToken) {
      disposeObject(prepared.object, prepared.resources, displayPivot);
      return;
    }

    activatePreparedArtifact(prepared, nextIndex);
    setStatus(statusElement, "", "info");
  } catch (error) {
    console.error(error);
    setStatus(
      statusElement,
      error instanceof ApiError ? error.message : "Impossible de charger cet artefact.",
      "error"
    );
  } finally {
    setObjectLoaderVisible(false);
    setButtonsDisabled(state.items.length <= 1);
  }
}

async function transitionToItem(index, step) {
  if (!state.items.length || state.transition) {
    return;
  }

  const nextIndex = (index + state.items.length) % state.items.length;
  const direction = step >= 0 ? 1 : -1;
  const item = state.items[nextIndex];
  const loadToken = ++state.loadToken;

  setButtonsDisabled(true);
  setObjectLoaderVisible(true);
  setStatus(statusElement, "Chargement de l'objet...", "info");

  try {
    const prepared = await prepareArtifact(item);

    if (loadToken !== state.loadToken) {
      disposeObject(prepared.object, prepared.resources, pendingPivot);
      return;
    }

    clearPendingObject();
    pendingPivot.add(prepared.object);
    pendingPivot.visible = false;
    state.pendingRoot = prepared.object;
    state.pendingIsFallback = prepared.isFallback;
    state.pendingBaseScale = prepared.baseScale;
    state.pendingResources = prepared.resources;
    state.pendingFootprint = prepared.footprint;

    setObjectLoaderVisible(false);
    state.transition = {
      phase: "out",
      direction,
      startedAt: performance.now(),
      nextIndex
    };

    await wait(state.transitionDuration);

    if (loadToken !== state.loadToken) {
      return;
    }

    state.transition = {
      phase: "in",
      direction,
      startedAt: performance.now(),
      nextIndex
    };
    activatePreparedArtifact(
      {
        item,
        object: state.pendingRoot,
        isFallback: state.pendingIsFallback,
        resources: state.pendingResources,
        baseScale: state.pendingBaseScale,
        footprint: state.pendingFootprint
      },
      nextIndex
    );
    shadowCatcher.scale.setScalar(state.activeFootprint);
    setStatus(statusElement, "", "info");

    state.transition = {
      phase: "in",
      direction,
      startedAt: performance.now(),
      nextIndex
    };

    await wait(state.transitionDuration);
  } finally {
    state.transition = null;
    clearPendingObject();
    setObjectLoaderVisible(false);
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
      stateElement.hidden = false;
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
  if (!state.items.length || state.transition) {
    return;
  }

  transitionToItem(state.index + step, step);
}

function handleSwipeStart(event) {
  if (event.target.closest("button, a")) {
    return;
  }

  state.swipePointerId = event.pointerId;
  state.swipeStart = { x: event.clientX, y: event.clientY };
  state.swipeMoved = false;
}

function handleSwipeEnd(event) {
  if (!state.swipeStart || event.pointerId !== state.swipePointerId) {
    return;
  }

  const deltaX = event.clientX - state.swipeStart.x;
  const deltaY = event.clientY - state.swipeStart.y;
  const isTap = Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && !state.swipeMoved;
  state.swipeStart = null;
  state.swipePointerId = null;
  state.swipeMoved = false;

  if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
    navigate(deltaX > 0 ? -1 : 1);
    return;
  }

  if (isTap && interactiveObjectHitFromClient(event.clientX, event.clientY)) {
    startSpin();
  }
}

previousButton.addEventListener("click", () => navigate(-1));
nextButton.addEventListener("click", () => navigate(1));

stage.addEventListener("pointerdown", handleSwipeStart);
stage.addEventListener("pointermove", (event) => {
  if (state.swipeStart && event.pointerId === state.swipePointerId) {
    const deltaX = event.clientX - state.swipeStart.x;
    const deltaY = event.clientY - state.swipeStart.y;
    if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
      state.swipeMoved = true;
    }
  }

  state.pointerInsideStage = true;
  state.isHoveringObject = interactiveObjectHitFromClient(event.clientX, event.clientY);
});
stage.addEventListener("pointerup", handleSwipeEnd);
stage.addEventListener("pointercancel", () => {
  state.swipeStart = null;
  state.swipePointerId = null;
  state.swipeMoved = false;
});
stage.addEventListener("pointerleave", () => {
  state.pointerInsideStage = false;
  state.isHoveringObject = false;
});

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

  const time = performance.now() * 0.001;
  let objectOffsetX = 0;

  if (state.activeRoot) {
    const hoverTargetScale = state.pointerInsideStage && state.isHoveringObject ? 1.1 : 1;
    state.activeScaleFactor += (hoverTargetScale - state.activeScaleFactor) * 0.12;
    if (state.activeBaseScale) {
      state.activeRoot.scale.copy(state.activeBaseScale).multiplyScalar(state.activeScaleFactor);
    }

    displayPivot.position.y = Math.sin(time * 1.15) * 0.12;
    const baseRotationY = Math.sin(time * 0.72) * 0.18;
    let spinRotationY = 0;
    if (state.spinStartAt > 0) {
      const progress = Math.min(1, (performance.now() - state.spinStartAt) / state.spinDuration);
      const eased = 0.5 - Math.cos(Math.PI * progress) / 2;
      spinRotationY = eased * Math.PI * 2;
      if (progress >= 1) {
        state.spinStartAt = 0;
      }
    }
    displayPivot.rotation.y = baseRotationY + spinRotationY;
    displayPivot.rotation.z = Math.sin(time * 0.48) * 0.035;
    shadowCatcher.scale.y = shadowCatcher.scale.x * (0.92 + Math.sin(time * 1.15) * 0.04);
    shadowCatcher.material.opacity = 0.11 - Math.sin(time * 1.15) * 0.018;
  }

  if (state.transition) {
    const progress = Math.min(1, (performance.now() - state.transition.startedAt) / state.transitionDuration);
    const direction = state.transition.direction;

    if (state.transition.phase === "out") {
      objectOffsetX = -direction * state.transitionOffset * easeInQuad(progress);
    } else if (state.transition.phase === "in") {
      objectOffsetX = direction * state.transitionOffset * (1 - easeOutQuad(progress));
    }
  }

  displayPivot.position.x = objectOffsetX;
  shadowCatcher.position.x = objectOffsetX;

  const orbitAngle = Math.sin(time * 0.22) * 0.065;
  const orbitHeight = 2.25 + Math.sin(time * 0.17) * 0.12;
  const orbitRadius = 8.0;
  camera.position.set(
    Math.sin(orbitAngle) * orbitRadius,
    orbitHeight,
    Math.cos(orbitAngle) * orbitRadius
  );
  camera.lookAt(0, 1.3, 0);
  renderer.render(scene, camera);
}

resizeRenderer();
loadItems();
state.refreshTimer = window.setInterval(() => {
  loadItems({ silent: true });
}, 15000);
animate();
