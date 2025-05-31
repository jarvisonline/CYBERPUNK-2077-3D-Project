import "./style.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { RGBShiftShader } from "three/examples/jsm/shaders/RGBShiftShader.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import gsap from "gsap";
import LocomotiveScroll from "locomotive-scroll";
import * as handpose from "@tensorflow-models/handpose";
import "@tensorflow/tfjs";

const locomotiveScroll = new LocomotiveScroll();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.z = 3.5;

const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector("#canvas"),
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.outputEncoding = THREE.sRGBEncoding;

// Post processing setup
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const rgbShiftPass = new ShaderPass(RGBShiftShader);
rgbShiftPass.uniforms["amount"].value = 0.003;
composer.addPass(rgbShiftPass);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

let model;

// Load HDRI environment map
new RGBELoader().load(
  "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/pond_bridge_night_1k.hdr",
  function (texture) {
    const envMap = pmremGenerator.fromEquirectangular(texture).texture;
    scene.environment = envMap;
    texture.dispose();
    pmremGenerator.dispose();

    // Load GLTF model after environment is ready
    const loader = new GLTFLoader();

    loader.load(
      "./DamagedHelmet.gltf", // Replace with your model path
      function (gltf) {
        model = gltf.scene;
        scene.add(model);
      },
      function (xhr) {
        console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
      },
      function (error) {
        console.error("An error happened:", error);
      }
    );
  }
);

async function setupHandDetection() {
  // Load hand detection model
  const handModel = await handpose.load();

  const video = document.createElement("video");
  video.style.position = "absolute";
  video.style.bottom = "10px";
  video.style.right = "10px";
  video.style.width = "160px";
  video.style.height = "120px";
  video.style.zIndex = "10";
  document.body.appendChild(video);

  navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
    video.srcObject = stream;
    video.play();
  });

  video.addEventListener("loadeddata", async () => {
    detectHand(video, handModel);
  });
}

async function detectHand(video, handModel) {
  const predictions = await handModel.estimateHands(video);

  if (predictions.length > 0 && model) {
    let leftHand = null;
    let rightHand = null;

    // Determine which hand is left and which is right
    predictions.forEach((hand) => {
      const wrist = hand.landmarks[0];
      if (wrist[0] < video.videoWidth / 2) {
        leftHand = hand;
      } else {
        rightHand = hand;
      }
    });

    if (leftHand) {
      const wrist = leftHand.landmarks[0];
      const middleFingerTip = leftHand.landmarks[12];

      if (wrist && middleFingerTip) {
        const rotationX = ((wrist[1] + middleFingerTip[1]) / 2 - 0.5) * Math.PI * 2;

        gsap.to(model.rotation, {
          x: rotationX,
          duration: 0.5,
        });
      }
    }

    if (rightHand) {
      const wrist = rightHand.landmarks[0];
      const middleFingerTip = rightHand.landmarks[12];

      if (wrist && middleFingerTip) {
        const rotationY = ((wrist[0] + middleFingerTip[0]) / 2 - 0.5) * Math.PI * 2;

        gsap.to(model.rotation, {
          y: rotationY,
          duration: 0.5,
        });
      }
    }
  }

  requestAnimationFrame(() => detectHand(video, handModel));
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  window.requestAnimationFrame(animate);
  composer.render(); // Changed from renderer.render to composer.render
}

setupHandDetection(); // Initialize hand detection
animate();
