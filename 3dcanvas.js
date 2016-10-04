
var canvas;
            
var camera, scene, renderer, container;
var light, pointLight, geometry, mesh;
var uniforms, material;
var heightmap, diffTexture, dispTexture;
var georez = 256;

function threestart() {

    container = document.getElementById( 'threecontainer' );
    canvas = document.getElementById("tempCanvas");

    // --- WebGl render

    try {
        renderer = new THREE.WebGLRenderer();
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
    camera.position.z = -500;
    camera.position.y = -300;
    camera.lookAt(scene.position);
    camera.updateMatrix();


    controls = new THREE.TrackballControls( camera, renderer.domElement );
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
            
    ambientLight = new THREE.AmbientLight( 0xffffff, 1.0 );
    scene.add( ambientLight );
    
    ambientLight.position.set(0, 100, -200);



    // MATERIAL

    dispTexture = new THREE.Texture(canvas);
    
    var shader = THREE.ShaderLib[ "normalmap" ];
    uniforms = THREE.UniformsUtils.clone( shader.uniforms );
    
    uniforms[ "enableDisplacement" ] = { type: 'i', value: 1 };
    uniforms[ "tDisplacement" ] = { type: 't', value: dispTexture };
    uniforms[ "uDisplacementScale" ] = { type: 'f', value: 35 };
    
    uniforms[ "enableDiffuse" ] = { type: 'i', value: 1 };
    uniforms[ "tDiffuse" ].value = dispTexture;

    uniforms[ "tNormal" ] = { type: 't', value: new THREE.ImageUtils.loadTexture( 'flat.png' )};
    
    
    
    material = new THREE.ShaderMaterial( {
        uniforms: uniforms,
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
        // lights: false,
        lights: true,
        side: THREE.DoubleSide
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
    adjustFOV();
    update();
}

function resizeGeometry() {
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
    camera.fov = fov / Math.log(window.innerWidth) * 3;
    console.log('fov', fov, 'width:', window.innerWidth, 'dpr:', Tangram.debug.Utils.device_pixel_ratio, 'cam.fov:', camera.fov)
    camera.updateProjectionMatrix();
    render();
}

function update() {
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

