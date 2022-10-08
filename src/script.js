import * as THREE from "https://cdn.skypack.dev/three@0.136.0";
import {OrbitControls} from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/controls/OrbitControls";

console.clear();

let scene = new THREE.Scene();
scene.background = new THREE.Color(0x220000);
let camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 1000);
camera.position.set(0, 17, 0);
let renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
window.addEventListener("resize", event => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
})

let controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;


let light = new THREE.DirectionalLight(0xffffff, 0.9);
light.position.setScalar(1);
scene.add(light, new THREE.AmbientLight(0xffffff, 0.6));

let gu = {
  time: {value: 0}
}

// <PLATES>
let g = new THREE.InstancedBufferGeometry().copy( new THREE.BoxGeometry(1, 1, 0.2, 50, 50, 1));
g.instanceCount = Infinity;
let plateData = []; // distancePhase, heightPhase, rotZlocal, rotYglobal
let plateData2 = []; // scaleX, scaleY
let color = [];
let c = new THREE.Color();
for( let i = 0; i < 500; i++ ){
  plateData.push(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    THREE.MathUtils.randFloat(-Math.PI, Math.PI),
    THREE.MathUtils.randFloat(-Math.PI * 2, Math.PI * 2)
  );
  plateData2.push(
    Math.random() + 1,
    Math.random() * 2 + 1,
  )
  c.set(0xff0000).multiplyScalar(Math.random() * 0.9 + 0.1);
  color.push(c.r, c.g, c.b);
}
g.setAttribute("plateData", new THREE.InstancedBufferAttribute(new Float32Array(plateData), 4));
g.setAttribute("plateData2", new THREE.InstancedBufferAttribute(new Float32Array(plateData2), 2));
g.setAttribute("color", new THREE.InstancedBufferAttribute(new Float32Array(color), 3));
let m = new THREE.MeshStandardMaterial({
  vertexColors: true,
  onBeforeCompile: shader => {
    shader.uniforms.time = gu.time;
    shader.vertexShader = `
      uniform float time;
      attribute vec4 plateData;
      attribute vec2 plateData2;
      
      mat2 rot2d(float a){
        float c = cos(a);
        float s = sin(a);
        return mat2(c, s, -s, c); 
      }
      
      ${shader.vertexShader}
    `.replace(
      `#include <beginnormal_vertex>`,
      `#include <beginnormal_vertex>
      
      float t = time;
      
      vec3 pos = position;
      pos.xy *= plateData2;
      float baseR = sin(plateData.x + t) * 2. + 5.;
      pos.z += baseR;
      
      pos.xy *= rot2d(plateData.z + t * 0.5 * sign(plateData.z));
      pos.y += sin(plateData.y + t * 0.05) * 10.;
      
      float actualRound = pos.x / baseR;
      pos.xz = rot2d(-actualRound) * vec2(0., pos.z);
      pos.xz *= rot2d(plateData.w + t * 0.1 * sign(plateData.w));
      
      objectNormal.xy *= rot2d(plateData.z + t * 0.5 * sign(plateData.z));;
      objectNormal.xz *= rot2d(plateData.w + t * 0.1 * sign(plateData.w));
      objectNormal.xz *= rot2d(-actualRound);
      
      
      `
    ).replace(
      `#include <begin_vertex>`,
      `#include <begin_vertex>
        transformed = pos;
      `
    );
    //console.log(shader.vertexShader);
    shader.fragmentShader = `
      float edgeFactor(vec2 p){ // antialiased grid (madebyevan)
        vec2 grid = abs(fract(p - 0.5) - 0.5) / fwidth(p) / 1.5;
        return min(grid.x, grid.y);
      }
      ${shader.fragmentShader}
    `.replace(
      `#include <dithering_fragment>`,
      `#include <dithering_fragment>
      
        float a = clamp(edgeFactor(vUv), 0., 1.);
        vec3 c = mix(vec3(1, 0, 0), gl_FragColor.rgb, a);
        gl_FragColor.rgb = c;
      `
    );
    //console.log(shader.fragmentShader);
  }
});
m.defines = {"USE_UV": ""};

let o = new THREE.Mesh(g, m);
scene.add(o);
// </PLATES>

// <LIGHTNINGS>
class Lightning extends THREE.Points {
  constructor(){
    super();
    let g = new THREE.BufferGeometry();
    this.MAX_COUNT = 250;
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Array(this.MAX_COUNT * 3).fill(0), 3));
    g.setAttribute("u", new THREE.Float32BufferAttribute(new Array(this.MAX_COUNT).fill(0).map((p, i) => {return i / (this.MAX_COUNT - 1)}), 1));
    g.setAttribute("ends", new THREE.Float32BufferAttribute(new Array(this.MAX_COUNT).fill(0), 1));
    g.setAttribute("direction", new THREE.Float32BufferAttribute(new Array(this.MAX_COUNT * 3).fill(0).map(p => {return Math.random() * 2 - 1}), 3));
    g.attributes.ends.setX(0, 1);
    g.attributes.ends.setX(this.MAX_COUNT - 1, 1);
    g.setAttribute("pSize", new THREE.Float32BufferAttribute(new Array(this.MAX_COUNT).fill().map(p => {return 0.1 + Math.random() * 0.9}), 1));
    this.uniforms = {
      totalTime: {value: 0},
      eventTime: {value: 0}
    }
    let m = new THREE.PointsMaterial({
      size: 0.2,
      onBeforeCompile: shader => {
        shader.uniforms.totalTime = this.uniforms.totalTime;
        shader.uniforms.eventTime = this.uniforms.eventTime;
        shader.vertexShader = `
          #define ss(a, b, c) smoothstep(a, b, c)
          uniform float totalTime;
          uniform float eventTime;
          attribute float u; // u without v :)
          attribute float ends;
          attribute vec3 direction;
          attribute float pSize;
          
          varying float vAction; // 0..1
          varying float vActionCurve; 
          ${shader.vertexShader}
        `.replace(
          `#include <begin_vertex>`,
          `#include <begin_vertex>
            vAction = clamp((totalTime - eventTime) / 0.25, 0., 1.);
            vActionCurve = ss(0., 0.1, vAction) - ss(0.1, 1., vAction);
            transformed = position + direction * pow(vAction, 4.) * 0.01;
          `
        ).replace(
          `gl_PointSize = size;`,
          `float sizeCurve = ss(0., 0.2, vAction + u);
          gl_PointSize = size * (0.5 + vActionCurve * 0.5 + ends) * pSize * sizeCurve;`
        );
        console.log(shader.vertexShader);
        shader.fragmentShader = `
          varying float vAction;
          varying float vActionCurve;
          ${shader.fragmentShader}
        `.replace(
          `#include <clipping_planes_fragment>`,
          `#include <clipping_planes_fragment>
            if(vAction > 0.99 || length(gl_PointCoord.xy - 0.5) > 0.5) discard;
          `
        ).replace(
          `#include <premultiplied_alpha_fragment>`,
          `#include <premultiplied_alpha_fragment>
            vec3 col = mix(vec3(1, 0, 0), vec3(1, 0.875, 1), vActionCurve);
            gl_FragColor.rgb = col;
          `
        );
        console.log(shader.fragmentShader);
      }
    });
    this.geometry = g;
    this.material = m;
    this.curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    this.baseV3 = new THREE.Vector3(0, 0, 3);
    this.axis = new THREE.Vector3(0, 1, 0);
    this.v3 = new THREE.Vector3();
    this.tempPts = [];
    
    let tick = () => {
      this.uniforms.eventTime.value = this.uniforms.totalTime.value;
      this.setPositions();
      setTimeout(tick, THREE.MathUtils.randInt(1000, 2000));
    };
    setTimeout(tick, THREE.MathUtils.randInt(10000));
    
    this.update = t => {
      this.uniforms.totalTime.value = t;
    }
  }
  setPositions(){
      let aStart = Math.random() * Math.PI;
      let aEnd = Math.random() * Math.PI * (2 / 3) + Math.PI * (2 / 3) + aStart;
      let baseHeight = (Math.random() - 0.5) * 20; 
      this.curve.points[0].copy(this.baseV3).applyAxisAngle(this.axis, aStart).setY(baseHeight + THREE.MathUtils.randFloat(-5, 5));
      this.curve.points[2].copy(this.baseV3).applyAxisAngle(this.axis, aEnd).setY(baseHeight + THREE.MathUtils.randFloat(-5, 5));
      this.curve.points[1].addVectors(this.curve.points[0], this.curve.points[2]).multiplyScalar(0.5).addScaledVector(this.v3.randomDirection(), 1.5);
      this.tempPts = this.curve.getSpacedPoints(this.MAX_COUNT - 1);
      this.tempPts.forEach((p, i) => {
        this.geometry.attributes.position.setXYZ(i, p.x, p.y, p.z);
      });
      this.geometry.attributes.position.needsUpdate = true;
    }
}
// </LIGHTNINGS>

let updatables = [];
for(let i = 0; i < 10; i++){addUpdatable(new Lightning())};

let clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  let t = clock.getElapsedTime();
  controls.update();
  gu.time.value = t;
  updatables.forEach(u => {u.update(t)});
  renderer.render(scene, camera);
});

function addUpdatable(updatable){
  updatables.push(updatable);
  scene.add(updatable);
}