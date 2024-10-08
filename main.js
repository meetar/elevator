/*jslint browser: true*/
/*global Tangram, gui */
import { renderer, container, camera, mesh, update, threestart, resizeGeometry, gridSquareWidth, gridSquareHeight } from "./3dcanvas";
import * as dat from 'dat.gui';
import * as THREE from 'three';

console.log('Tangram:', Tangram);

let lastX, lastY;
let clientX, clientY;
let uvArray;

document.addEventListener('mousedown', (event) => {
    // get the offset relative to a grid square on mousedown
    const initialPos = getWorldPositionFromScreen(event.clientX, event.clientY, mesh);
    offset.x = (mesh.position.x - initialPos.x) % gridSquareWidth;
    offset.y = (mesh.position.y - initialPos.y) % gridSquareHeight;
});

// save client cursor position
document.addEventListener('mousemove', (event) => {
    lastX = clientX;
    lastY = clientY;
    clientX = event.clientX;
    clientY = event.clientY;
});

// function to convert screen coordinates to world space
function getWorldPositionFromScreen(screenX, screenY) {
    // convert screen coordinates to normalized device coordinates (-1 to +1)
    const ndcX = (screenX / window.innerWidth) * 2 - 1;
    const ndcY = -(screenY / window.innerHeight) * 2 + 1;

    // create a vector in normalized device space
    const ndc = new THREE.Vector3(ndcX, ndcY, 0.5); // z = 0.5 is at the middle of the frustum depth

    // unproject this vector back into world space
    ndc.unproject(camera);

    const dir = ndc.sub(camera.position).normalize(); // get the direction from the camera to the unprojected point
    const distance = -camera.position.z / dir.z; // distance from the camera to the z = 0 plane
    const position = camera.position.clone().add(dir.multiplyScalar(distance)); // calculate the world position on that plane

    return position;
}

let offset = new THREE.Vector3(); // store the offset between the mouse position and mesh position

const moveMesh = (e) => {
    // get initial uv mapping
    if (!uvArray) uvArray = mesh.geometry.attributes.uv.array.slice(); // assign by value

    // get screen position in world space, then track mesh to cursor
    const newpos = getWorldPositionFromScreen(clientX, clientY)

    // track mesh to cursor, applying offset set by mousedown
    mesh.position.x = (newpos.x  % gridSquareWidth) + offset.x;
    mesh.position.y = (newpos.y % gridSquareHeight) + offset.y;

    // mesh position from world space to object space
    const inverseMatrix = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const movementVector = new THREE.Vector3(mesh.position.x, mesh.position.y, 0).applyMatrix4(inverseMatrix);

    // assuming mesh.geometry is a plane aligned with the X-Y plane
    const uvMovementX = movementVector.x / mesh.geometry.parameters.width;
    const uvMovementY = movementVector.y / mesh.geometry.parameters.height;

    // adjust the UVs in the opposite direction to the mesh's movement
    const uvAttribute = mesh.geometry.attributes.uv;
    for (let i = 0; i < uvAttribute.array.length; i += 2) {
        uvAttribute.array[i] += uvMovementX; // U coordinate
        uvAttribute.array[i + 1] += uvMovementY; // V coordinate
    }

    uvAttribute.needsUpdate = true;

};

(function () {
    'use strict';

    var map_start_location = [0, 0, 2];
    var global_min = 0;
    var uminValue, umaxValue; // storage
    var scene_loaded = false;
    var moving = false;
    var analysing = false;
    var done = false;
    var tempCanvas;
    var spread = 1;
    var lastumax = null;
    var diff = null;
    var stopped = false; // emergency brake
    var widening = false;
    var tempFactor = 4; // size of tempCanvas relative to main canvas: 1/n

    /*** URL parsing ***/

    // leaflet-style URL hash pattern:
    // #[zoom],[lat],[lng]
    var url_hash = window.location.hash.slice(1, window.location.hash.length).split('/');

    if (url_hash.length == 3) {
        map_start_location = [url_hash[1],url_hash[2], url_hash[0]];
        // convert from strings
        map_start_location = map_start_location.map(Number);
    }

    /*** Map ***/

    var map = L.map('map',
        {"keyboardZoomOffset" : .05,
        "inertiaDeceleration" : 10000,
        "zoomSnap" : .001}
    );

    var layer = Tangram.leafletLayer({
        scene: 'scene.yaml',
        attribution: '<a href="https://mapzen.com/tangram" target="_blank">Tangram</a> | <a href="https://threejs.org" target="_blank">three.js</a> | <a href="https://github.com/meetar/elevator" target="_blank">Fork This</a>',
        postUpdate: function() {
            if (gui.autoexpose && !stopped) {
                // three stages:
                // 1) start analysis
                if (!analysing && !done) {
                    expose();
                }
                // 2) continue analysis
                else if (analysing && !done) {
                    start_analysis();
                }
                // 3) stop analysis and reset
                else if (done) {
                    done = false;
                }
            } else {
                drawTempImage();
            }
            // update three.js display
            update();
        }
    });

    // from https://davidwalsh.name/javascript-debounce-function
    function debounce(func, wait, immediate) {
        var timeout;
        return function() {
            var context = this, args = arguments;
            var later = function() {
                timeout = null;
                if (!immediate) func.apply(context, args);
            };
            var callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(context, args);
        };
    };

    function linkFromBlob(blob) {
        var urlCreator = window.URL || window.webkitURL;
        return urlCreator.createObjectURL( blob );
    }

    function expose() {
        analysing = true;
        if (typeof gui != 'undefined' && !gui.autoexpose) return false;
        if (scene_loaded) {
            start_analysis();
        } else {
            // wait for scene to initialize first
            scene.initializing.then(function() {
                start_analysis();
            });
        }
    }

    function updateGUI() {
        // update dat.gui controllers
        for (var i in gui.__controllers) {
            gui.__controllers[i].updateDisplay();
        }
    }

    function start_analysis() {
        // set levels
        var levels = analyse();
        if (levels) {
            diff = levels.max - lastumax;
            lastumax = levels.max;
            scene.styles.hillshade.shaders.uniforms.u_min = levels.min;
            scene.styles.hillshade.shaders.uniforms.u_max = levels.max;
        } else diff = 1;
        // was the last change a widening or narrowing?
        widening = diff < 0 ? false : true;
        scene.requestRedraw();
    }

    function drawTempImage() {
        var ctx = tempCanvas.getContext("2d", { willReadFrequently: true }); // Get canvas 2d context
        ctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);

        // copy main scene canvas into the tempCanvas with the 2d context
        ctx.drawImage(scene.canvas,0,0,scene.canvas.width,scene.canvas.height);
        return ctx;
    }

    function analyse() {
        var ctx = drawTempImage();
        // get all the pixels
        var pixels = ctx.getImageData(0,0, tempCanvas.width, tempCanvas.height, );

        var val;
        var counts = {};
        var empty = true;
        var max = 0, min = 255;
        // only check every nth pixel (vary with browser size)
        // var stride = Math.round(img.height * img.width / 1000000);
        // 4 = only sample the red value in [R, G, B, A]
        for (var i = 0; i < tempCanvas.height * tempCanvas.width * 4; i += 4) {
            val = pixels.data[i];
            var alpha = pixels.data[i+3];
            if (alpha === 0) { // empty pixel, skip to the next one
                continue;
            }
            // if we got this far, we found at least one non-empty pixel!
            empty = false;
            // update counts, to get a histogram
            counts[val] = counts[val] ? counts[val]+1 : 1;

            // update min and max so far
            min = Math.min(min, val);
            max = Math.max(max, val);
        }

        if (empty) {
            // no pixels found, skip the analysis
            return false;
        }
        if (max > 253 && min < 4 && !widening ) {
            // looks good, done
            analysing = false;
            done = true;
            spread = 2;
        }
        if (max === 255 && min === 0 && widening) {
            // over-exposed, widen the range
            spread *= 2;
            // cap spread
            spread = Math.min(spread, 512)
            max += spread / 2;
            min -= spread / 2;
        }

        // calculate adjusted elevation settings based on current pixel
        // values and elevation settings
        var range = (gui.u_max - gui.u_min);
        var minadj = (min / 255) * range + gui.u_min;
        var maxadj = (max / 255) * range + gui.u_min;

        // keep levels in range
        minadj = Math.max(minadj, -11000);
        maxadj = Math.min(maxadj, 8900);
        // only let the minimum value go below 0 if ocean data is included
        minadj = gui.include_oceans ? minadj : Math.max(minadj, 0);

        // keep min and max separated
        if (maxadj == minadj) {
            minadj -= 1;
            maxadj += 1;
        }

        // get the width of the current view in meters
        // compare to the current elevation range in meters
        // the ratio is the "height" of the current scene compared to its width –
        // multiply it by the width of your 3D mesh to get the height
        var zrange = (gui.u_max - gui.u_min);
        var xscale = zrange / scene.view.size.meters.x;
        gui.scaleFactor = xscale +''; // convert to string to make the display read-only

        scene.styles.hillshade.shaders.uniforms.u_min = minadj;
        scene.styles.hillshade.shaders.uniforms.u_max = maxadj;
        // update dat.gui controllers
        gui.u_min = minadj;
        gui.u_max = maxadj;
        updateGUI();
        return {max: maxadj, min: minadj}
    }

    window.layer = layer;
    var scene = layer.scene;
    window.scene = scene;

    // setView expects format ([lat, long], zoom)
    map.setView(map_start_location.slice(0, 3), map_start_location[2]);

    // var hash = new L.Hash(map);

    // Create dat GUI
    var gui;
    function addGUI () {
        gui.domElement.parentNode.style.zIndex = 5; // make sure GUI is on top of map
        window.gui = gui;
        gui.u_max = 8848.;
        gui.add(gui, 'u_max', -10916., 8848).name("max elevation").onChange(function(value) {
            scene.styles.hillshade.shaders.uniforms.u_max = value;
            scene.requestRedraw();
        });
        // gui.u_min = -10916.;
        gui.u_min = 0.;
        gui.add(gui, 'u_min', -10916., 8848).name("min elevation").onChange(function(value) {
            scene.styles.hillshade.shaders.uniforms.u_min = value;
            scene.requestRedraw();
        });

        gui.scaleFactor = 1 +'';
        gui.add(gui, 'scaleFactor').name("z:x scale factor");
        gui.autoexpose = true;
        gui.add(gui, 'autoexpose').name("auto-exposure").onChange(function(value) {
            sliderState(!value);
            if (value) {
                // store slider values
                uminValue = gui.u_min;
                umaxValue = gui.u_max;
                // force widening value to trigger redraw
                lastumax = 0;
                expose();
            } else if (typeof uminValue != 'undefined') {
                // retrieve slider values
                scene.styles.hillshade.shaders.uniforms.u_min = uminValue;
                scene.styles.hillshade.shaders.uniforms.u_max = umaxValue;
                scene.requestRedraw();
                gui.u_min = uminValue;
                gui.u_max = umaxValue;
                updateGUI();
            }
        });
        gui.include_oceans = false;
        gui.add(gui, 'include_oceans').name("include ocean data").onChange(function(value) {
            if (value) global_min = -11000;
            else global_min = 0;
            gui.u_min = global_min;
            scene.styles.hillshade.shaders.uniforms.u_min = global_min;
            expose();
            scene.requestRedraw();
        });
        gui.note = "press H to hide/show controls";
        gui.add(gui, 'note');
        gui.__controllers[3].domElement.firstChild.setAttribute("readonly", true);
        // gui.map_lines = false;
        // gui.add(gui, 'map_lines').name("map lines").onChange(function(value) {
        //     toggleLines(value);
        // });
        // gui.map_labels = false;
        // gui.add(gui, 'map_labels').name("map labels").onChange(function(value) {
        //     toggleLabels(value);
        // });
        // gui.export = function () {
        //     // button to open screenshot in a new tab – 'save as' to save to disk
        //     scene.screenshot().then(function(screenshot) { window.open(screenshot.url); });
        // }
        // gui.add(gui, 'export');
        // gui.help = function () {
        //     // show help screen and input blocker
        //     toggleHelp(true);
        // }
        // gui.add(gui, 'help');
        // // set scale factor text field to be uneditable but still selectable (for copying)
        // gui.__controllers[2].domElement.firstChild.setAttribute("readonly", true);
    }

    function stop() {
        console.log('stopping')
        stopped = true;
        console.log('stopping:', stopped)

    }

    function go() {
        stopped = false;
    }

    window.stop = stop;
    window.go = go;

    // disable sliders when autoexpose is on
    function sliderState(active) {
        var pointerEvents = active ? "auto" : "none";
        var opacity = active ? 1. : .5;
        gui.__controllers[0].domElement.parentElement.style.pointerEvents = pointerEvents;
        gui.__controllers[0].domElement.parentElement.style.opacity = opacity;
        gui.__controllers[1].domElement.parentElement.style.pointerEvents = pointerEvents;
        gui.__controllers[1].domElement.parentElement.style.opacity = opacity;
    }
    //
    // // show and hide help screen
    // function toggleHelp(active) {
        // var visibility = active ? "visible" : "hidden";
    //     document.getElementById('help').style.visibility = visibility;
    //     // help-blocker prevents map interaction while help is visible
    //     document.getElementById('help-blocker').style.visibility = visibility;
    // }
    //
    // // draw boundary and water lines
    // function toggleLines(active) {
    //     // scene.config.layers.water.visible = active;
    //     scene.styles.togglelines.shaders.uniforms.u_alpha = active ? 1. : 0.;
    //     scene.requestRedraw();
    // }
    // // draw labels
    // function toggleLabels(active) {
    //     // scene.config.layers.water.visible = active;
    //     scene.styles.toggletext.shaders.uniforms.u_alpha = active ? 1. : 0.;
    //     scene.requestRedraw();
    // }

    document.onkeydown = function (e) {
        e = e || window.event;
        // listen for 'h'
        if (e.which == 72) {
            // toggle UI
            var display = map._controlContainer.style.display;
            map._controlContainer.style.display = (display === "none") ? "block" : "none";
            document.getElementsByClassName('dg')[1].style.display = (display === "none") ? "block" : "none";
            // document.getElementsByClassName('dg')[1].style.opacity = (display === "none") ? "1" : "0";
        // // listen for 'esc'
        // } else if (e.which == 27) {
        //     toggleHelp(false);
        }
    };

    function resizeTempCanvas() {
        var tempCanvas = document.getElementById("tempCanvas");
        // can't use 'scene' here because three.js also uses scene :/
        var layer = Object.keys(map._layers)[0];
        if (typeof map._layers[layer].scene.canvas !== "undefined") {
            tempCanvas.width = map._layers[layer].scene.canvas.width;
            tempCanvas.height = map._layers[layer].scene.canvas.height;
        }
    }
    window.resizeTempCanvas = resizeTempCanvas;
    /***** Render loop *****/
    window.addEventListener('load', function () {
        // Scene initialized
        layer.on('init', function() {
            gui = new dat.GUI({ autoPlace: true, hideable: true, width: 300 });
            addGUI();
            // resetViewComplete();
            scene.subscribe({
                // will be triggered when tiles are finished loading
                // and also manually by the moveend event
                view_complete: function() {
                }
            });
            scene_loaded = true;

            sliderState(false);

            var originalDPR = Tangram.debug.Utils.device_pixel_ratio;
            Tangram.debug.Utils.updateDevicePixelRatio = function() {
                var prev = Tangram.debug.Utils.device_pixel_ratio;
                Tangram.debug.Utils.device_pixel_ratio = originalDPR / tempFactor;
                return Tangram.debug.Utils.device_pixel_ratio !== prev;
            }


            scene.updateConfig()

            tempCanvas = document.createElement("canvas");
            tempCanvas.id = "tempCanvas";
            document.body.insertBefore(tempCanvas, document.body.childNodes[0]);

            var layer = Object.keys(map._layers)[0];
            tempCanvas.width = map._layers[layer].scene.canvas.width / tempFactor;
            tempCanvas.height = map._layers[layer].scene.canvas.height / tempFactor;

            threestart();
            var scaleVal = 25.0;
            uniforms[ "uDisplacementScale" ].value = scaleVal;

            document.body.insertBefore(map._controlContainer, document.body.childNodes[0]);
            map._controlContainer.style.zindex = 100;

            // map._controlContainer.style.display = "none";
            // document.getElementsByClassName('dg')[1].style.display = "none";
            // dat.GUI.toggleHide();

        });

        layer.addTo(map);

        // bind help div onclicks
        // document.getElementById('help').onclick = function(){toggleHelp(false)};
        // document.getElementById('help-blocker').onclick = function(){toggleHelp(false)};


        // debounce moveend event
        var moveend = debounce(function(e) {
            moving = false;
            // manually reset view_complete
            scene.resetViewComplete();
            scene.requestRedraw();
        }, 250);

        map.on("movestart", function (e) {
            moving = true;
        });
        map.on("move", function (e) {
            moveMesh(e);
        });
        map.on("moveend", function (e) {
            moveend(e)
        });

        window.onresize = function (e) {
            resizeTempCanvas();
            resizeGeometry();
            renderer.setSize( container.clientWidth, container.clientHeight );
        };
    });

    return map;

}());
