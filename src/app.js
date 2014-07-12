
// Global medea instance
var viewport = null;
var root = null;


// Global state
var global_camera_height = RADIUS;

// Variables accessible via dat.gui
var lod_attenuation = 0.5;
var auto_rotate_sun = true;


function on_init_error() {
	console.log("Failed to initialize");
}

// Called by medea once per frame
function on_tick(dtime) {
	return true;
}



// Given an approximate |sq_distance| of an object, determine the
// continuous LOD (CLOD) value for it. CLOD is in [0, COUNT_LOD_LEVELS[
//
// Must keep in sync with terrain.vs
function calc_clod(sq_distance) {
	var log_distance = log2(sq_distance * 3.0 / (16.0 * 16.0)) * 0.5 * lod_attenuation;
	return Math.max(0, Math.min(COUNT_LOD_LEVELS - 1,
		log_distance));
}



var GRASS_TILE_SIZE = TILE_SIZE * 1.5;

// Number of blades per grass unit
var GRASS_BLADE_COUNT = 3;

function build_grass_mesh() {
	var threshold = GRASS_TILE_SIZE * GRASS_TILE_SIZE;
	var unit_count = 0;
	for (var y = 0; y < GRASS_TILE_SIZE; ++y) {
		for (var x = 0; x < GRASS_TILE_SIZE; ++x) {
			if (x*x + y*y > threshold) {
				continue;
			}
			++unit_count;
		}
	}

	// TODO: this should use instancing to supply the positions
	var pos = new Float32Array(unit_count * GRASS_BLADE_COUNT * 6 * 3);
	var uv = new Float32Array(unit_count * GRASS_BLADE_COUNT * 6 * 2);
	var pos_cur = 0;
	var uv_cur = 0;
	for (var y = 0; y < GRASS_TILE_SIZE; ++y) {
		for (var x = 0; x < GRASS_TILE_SIZE; ++x) {
			if (x*x + y*y > threshold) {
				continue;
			}
			
			for (var i = 0; i < GRASS_BLADE_COUNT; ++i) {

			}
		}
	}

	var vertex_channels = {
		positions: pos,
		uvs : [uv]
	};

	var mat = medea.CreateSimpleMaterialFromShaderPair('url:data/shader/grass', {
		texture : medea.CreateTexture('url:/data/textures/grass1.png', null
			/*,medea.TEXTURE_PREMULTIPLIED_ALPHA*/)
	});
	var mesh = medea.CreateSimpleMesh(vertex_channels, null, mat);
	mesh.Material().Pass(0).SetDefaultAlphaBlending();
	mesh.RenderQueue(medea.RENDERQUEUE_ALPHA);
}



// Invoked once the medea context (global |medea|) is ready to use
function on_init_context(resources) {
	console.log("Context created, setting up scene");
	viewport = medea.CreateViewport();
	viewport.ClearColor([0.0,0.0,0.0]);
	
	root = medea.RootNode();

	var fps_view = false;
	var orbit_ground_distance = 0;


	// Constructs a closure that caches invocations of f() for one frame
	var CachePerFrame = function(f) {
		var last_frame = -1;
		var value = null;
		return function() {
			var frame = medea.GetStatistics().count_frames;
			if (last_frame != frame) {
				last_frame = frame;
				value = f();
			}
			return value;
		};
	};

	// Application state. This is injected into all other modules, which
	// use it to access global properties such as camera, location or
	// preloaded shared resources such as heightmaps.
	var app = {

		GetTerrainNode : function() {
			return terrain_root;
		},

		// Get the medea.Image (lockable, all data in RAM) that holds
		// height data for a particular heightmap index.
		//
		// cube_face_idx_to_heightmap_idx() maps from cube faces to
		// heightmap indices.
		GetHeightMap : function(heightmap_idx) {
			return resources['heightmap_' + heightmap_idx];
		},

		// Gets the tree map corresponding to a single heightmap index.
		GetTreeMap : function(heightmap_idx) {
			return resources['treemap_' + heightmap_idx];
		},

		// Gets the estimated distance from the camera to the ground
		GetGroundDistance : function() {
			if (fps_view) {
				return FPS_HEIGHT_OVER_GROUND;
			}
			return orbit_ground_distance;
		},

		// Get the world space position of the current active camera
		GetCameraPosition : function() {
			if (fps_view) {
				return cam_fps.GetWorldPos();
			}
			return cam.GetWorldPos();
		},

		GetCameraPositionRelativeToGround : CachePerFrame(function() {
			var vpos = app.GetCameraPosition();
			var vlen = vec3.length(vpos); 
			vec3.scale(vpos, (app.GetGroundDistance() + RADIUS) / vlen);
			return vpos;
		}),

		// Get the (scaled) height of the terrain below the camera (i.e.
		// along the camera's UP axis)
		GetTerrainHeightUnderCamera : CachePerFrame(function() {
			return app.GetTerrainNode().GetHeightAt(app.GetCameraPosition());
		}),

		// Get a cubically smoothed terrain height value
		GetSmoothedTerrainHeightUnderCamera : CachePerFrame(function() {
			return app.GetTerrainNode().GetSmoothedHeightAt(app.GetCameraPosition());
		}),


		IsFpsView : function(trafo) {
			return fps_view;
		},

		SwitchToFpsView : function(trafo) {
			if (fps_view) {
				return;
			}
			fps_view = true;
			cam_fps.LocalTransform(trafo);
			viewport.Camera(cam_fps);

			console.log("Switching to FPS view");
		},

		/////////////////////////////////////////////////////////////////////////

		_SetOrbitGroundDistance : function(d) {
			orbit_ground_distance = d;
		},
	};
	

/*
    var mesh_parent = medea.CreateNode();
	medea.LoadSceneFromResource('url:data/meshes/tree5.json', mesh_parent, null, function(st) {
		if (st == medea.SCENE_LOAD_STATUS_GEOMETRY_FINISHED) {
			mesh_parent.Translate([1024, 42, 1024]);
			mesh_parent.Scale(0.25);
			root.AddChild(mesh_parent);

			mesh_parent.FilterEntitiesRecursively([medea.Mesh], function(m) {
				m.Material().Pass(0).SetDefaultAlphaBlending();
				m.RenderQueue(medea.RENDERQUEUE_ALPHA);
			});

			//medea.CloneNode(mesh_parent);
		}
	}); */

	

	var AtmosphereNode = InitAtmosphereNodeType(medea, app);
	
	var SphericalTerrainNode = InitSphericalTerrainType(medea, app);
	var terrain_root = new SphericalTerrainNode();
	root.AddChild(terrain_root);

	var dome_node = medea.CreateSkyboxNode('url:data/textures/skybox.png');
	root.AddChild(dome_node);

	// And the orbit camera 
	var cam = medea.CreateCameraNode("Orbit");
	cam.ZNear(1);
	cam.ZFar(10000);

	var OrbitCamController = GetOrbitCamControllerType(medea, app);
	var cc = new  OrbitCamController(true, INITIAL_CAM_PHI, INITIAL_CAM_THETA);
	cc.TerrainNode(terrain_root);
	cc.MouseStyle(medea.CAMCONTROLLER_MOUSE_STYLE_ON_LEFT_MBUTTON);
	cc.CameraDistance(INITIAL_ORBIT_CAM_DISTANCE);
	cc.MaximumCameraDistance(MAX_ORBIT_CAM_DISTANCE);
	cc.MinimumCameraDistance(RADIUS);
	cc.Smoothing(true);
	cc.SmoothSpeed(CAM_SMOOTH_SPEED);

    cam.AddEntity(cc);
    cam.Translate(vec3.scale([RADIUS, RADIUS, RADIUS], 1.8));
    root.AddChild(cam);

	// Add the ground-level FPS camera
	var cam_fps = medea.CreateCameraNode("FPS");
	cam_fps.ZNear(1);
	cam_fps.ZFar(10000);
	root.AddChild(cam_fps);

    var SphereFpsCamController = GetSphereFpsCamControllerType(medea, app);
    var cc_fps = new SphereFpsCamController();
    cc_fps.TerrainNode(terrain_root);
	cc_fps.Enable();

    cam_fps.AddEntity(cc_fps);
   	cc_fps.PlaceNodeAt(cam_fps, [0.5, 1.0, 0.3]);

   	// Initially activate the Orbit camera
    viewport.Camera(cam);

	var light = medea.CreateNode();
	var light_entity = medea.CreateDirectionalLight([1,1,1]);
	light.AddEntity(light_entity);
	root.AddChild(light);

	var sun = null;

	var time_of_day = -1;
	var set_time_of_day = (function() {
		var light_rotation_matrix = mat4.create();
		var light_temp_dir = [0.0, 0.0, 0.0, 0.0];
		var sun_rotation_axis = vec3.normalize([0.2, 1.0, 0.2]);
		// make sure the initial light direction is orthogonal on the sun's rotation axis
		var base_light_dir = vec3.normalize(vec3.cross(sun_rotation_axis, [0.0, 0.0, 1.0], vec3.create()));

		return function(tod) {
			time_of_day = tod;
			mat4.identity(light_rotation_matrix);
			mat4.rotate(light_rotation_matrix, tod * 3.1415 * 2.0 / 24.0, sun_rotation_axis);

			var dir = base_light_dir;
			mat4.multiplyVec4(light_rotation_matrix, [dir[0], dir[1], dir[2], 0.0], light_temp_dir);

			vec3.normalize(light_temp_dir);
	        light_entity.Direction([light_temp_dir[0], light_temp_dir[1], light_temp_dir[2]]);

	        vec3.scale(light_temp_dir, -SUN_DISTANCE);
	        if (sun) {
	        	sun.LocalPos(light_temp_dir);
	        }
	    };
	})();

	// Add the sun billboard
	var sun = root.AddChild(medea.CreateBillboardNode('url:data/textures/sunsprite.png', false, true));
	sun.Scale(SUN_SIZE);

	set_time_of_day(18.0);

	var input_handler = medea.CreateInputHandler();
	medea.SetTickCallback(function(dtime) {
		on_tick(dtime);

		var SUN_MOVE_SPEED = 0.2;

		// FPS/Ground view has a fixed sub and z range
		if (app.IsFpsView()) {
			var up = cam_fps.GetWorldYAxis();
			var right = cam_fps.GetWorldXAxis();
			vec3.lerp(up, right, 0.4);
			vec3.normalize(up);
			vec3.negate(up);
			light_entity.Direction(up);
			if (sun) {
				sun.LocalPos(vec3.scale(up, SUN_DISTANCE));
			}
			
			return true;
		}
		
		// Orbit view has moving sun
		if(input_handler.ConsumeKeyDown(medea.KeyCode.ENTER)) {
			set_time_of_day((time_of_day + 0.5) % 24.0);
        }
        else if (auto_rotate_sun) {
        	set_time_of_day((time_of_day + dtime * SUN_MOVE_SPEED) % 24.0);
        }

        // Update Z resolution based on the camera distance
        var distance = vec3.length(cam.GetWorldPos());
        distance *= 2.0;

        // Must always be able to see at least the entire planet + atmosphere + sun
        distance = Math.max((RADIUS + SUN_DISTANCE) * 1.01, distance);
        cam.ZFar(distance);

        // Use a fixed 1:10000 ratio for the zplane distance
        cam.ZNear(distance / 10000);

        // Store the current camera height over the ground
        global_camera_height = cc.camera_distance - RADIUS;
		return true;
	});	

	root.AddChild(new AtmosphereNode(cam));


	medea.SetDebugPanel(null, function() {
		var f1 = medea.debug_panel.gui.addFolder('Terrain');
		f1.add(this, 'lod_attenuation');

		var f2 = medea.debug_panel.gui.addFolder('Sun');
		f2.add(this, 'auto_rotate_sun');
	});
    
    console.log("Starting main loop");
	medea.Start();
}

function run() {
	var deps = [
		'input',
		'material',
		'standardmesh',
		'forwardrenderer',
		'light',
		'debug',
		'terraintile',
		'sceneloader',
		'input_handler',
		'keycodes',
		'skydome',
		'billboard',
		'camcontroller',
		'skybox'
	];
	medealib.CreateContext('game_container', {dataroot: '../medea/data'}, deps, function(_medea) {
		
		// We only create one medea instance so make it global
		medea = _medea;

		// List of images that are always loaded upfront
		var resources = {
			'heightmap_0' : 'url:data/textures/heightmap0.png',
			'heightmap_1' : 'url:data/textures/heightmap1.png',
			'treemap_0' : 'url:data/textures/treemap.png',
			'treemap_1' : 'url:data/textures/treemap.png',
		};

		var images = {
		};

		var countdown = 0;
		for (var k in resources) {
			++countdown;
		}
		for (var k in resources) {
			medea.CreateImage(resources[k], (function(k) {
				return function(img) {
					images[k] =  img;
					if (--countdown === 0) {
						on_init_context(images);
					}
				};
			})(k))
			;
		}
	}, on_init_error);
}
