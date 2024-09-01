import { DragControls } from "three/addons/controls/DragControls.js";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import * as THREE from "three";

var canvas;

export var camera, scene, renderer, container;
var pointLight, ambientLight, geometry, mesh;
var uniforms, material;
var dispTexture;
var georez = 256;
var controls, dragcontrols;

export function threestart() {

    container = document.getElementById( 'threecontainer' );
    canvas = document.getElementById("tempCanvas");

    // --- WebGl render

    try {
        renderer = new THREE.WebGLRenderer();
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.setSize( container.clientWidth, container.clientHeight );
        renderer.autoClear = false;
        container.appendChild( renderer.domElement );
    }
    catch (e) {
        alert(e);
    }

    scene = new THREE.Scene();

    // --- Camera

    var fov = 15; // camera field-of-view in degrees
    var width = renderer.domElement.width;
    var height = renderer.domElement.height;
    var aspect = width / height; // view aspect ratio
    camera = new THREE.PerspectiveCamera( fov, aspect );
    camera.position.z = -450;
    camera.position.y = -250;
    camera.lookAt(scene.position);
    camera.updateMatrix();


    controls = new TrackballControls( camera );
    controls.rotateSpeed = 3.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.3;
    controls.addEventListener( 'change', render );


    // --- Lights

    // pointLight = new THREE.PointLight( 0xffffff, 1.0 );
    // scene.add( pointLight );

    // pointLight.position.set(0, 100, -200);

    ambientLight = new THREE.AmbientLight( 0xffffff, 3.2 );
    scene.add( ambientLight );

    ambientLight.position.set(0, 100, -200);



    // MATERIAL

    dispTexture = new THREE.Texture(canvas);

    material = new THREE.MeshStandardMaterial( {
        map: dispTexture,
        displacementMap: dispTexture,
        displacementScale: 30.,
    } );


    // GEOMETRY
    var c = document.getElementById("container");
    var aspect = window.innerHeight / window.innerWidth;
    if (window.innerHeight < window.innerWidth) {
        geometry = new THREE.PlaneGeometry(georez, Math.round(georez*aspect), georez, Math.round(georez*aspect));
    } else {
        geometry = new THREE.PlaneGeometry(Math.round(georez*aspect), georez, Math.round(georez*aspect), georez);
    }
    geometry.computeTangents();
    mesh = new THREE.Mesh( geometry, material);
    mesh.rotation.y = Math.PI;
    scene.add(mesh);

    dragcontrols = new DragControls([mesh], camera, renderer.domElement);

    dragcontrols.addEventListener("dragstart", function (event) {
        console.log("dragStart");
    });

    dragcontrols.addEventListener("dragend", function (event) {
        console.log("dragEnd");
    });

    update();
}

export function resizeGeometry() {
    var aspect = window.innerHeight / window.innerWidth;
    if (window.innerHeight < window.innerWidth) {
        geometry.width = georez;
        geometry.height = georez*aspect;
    } else {
        geometry.height = georez;
        geometry.width = georez*aspect;
    }
    adjustFOV();
}

function adjustFOV() {
    var dist = 583;
    var aspect = window.innerHeight / window.innerWidth;
    var width = geometry.width;
    var fov;
    if (aspect < 1 ) fov = 2 * Math.atan( ( width / aspect ) / ( 2 * dist ) ) * ( 180 / Math.PI ); // in degrees
    else fov = 2 * Math.atan( height / ( 2 * dist ) ) * ( 180 / Math.PI ); // in degrees
    camera.fov = fov / Math.log(window.innerWidth) * 2.5;
    // console.log('fov', fov, 'width:', window.innerWidth, 'dpr:', Tangram.debug.Utils.device_pixel_ratio, 'cam.fov:', camera.fov)
    camera.updateProjectionMatrix();
    render();
}

export function update() {
    dispTexture.needsUpdate = true;
    render();
    controls.update(); // trackball interaction
}

function render() {
    renderer.clear();
    renderer.render(scene, camera);
}

window.onload = function() {
}

