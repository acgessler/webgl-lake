
// Global medea instance which is yet uninitialized
var medea = null;

// Variables accessible via dat.gui
var lod_attenuation = 1.0;
var auto_rotate_sun = true;

///////////////////////////////////////////////////////////////////////////////////
// Types imported from other modules
// Imported lazily after medea is initialized.
var AtmosphereNode;
var SphericalTerrainNode;
var OrbitCamController;
var SphereFpsCamController;
var GrassTile;
var DetailTreeNode;
var TerrainQuadTreeNode;
var WaterTile;
var TerrainTile;
var TreeTile;
var StarsNode;

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


///////////////////////////////////////////////////////////////////////////////////
// app
//
// Core application state. This is injected into all other modules and manages
// initialization, shutdown, global state, frame management and scene updates.
//
///////////////////////////////////////////////////////////////////////////////////
var app = {

	// Fields
	root : null,
	viewport : null,
	terrain_root : null,
	dome_node : null,

	fps_view : false,
	orbit_ground_distance : 0,
	orbit_cam : null,
	orbit_cam_controller : null,
	fps_cam : null,
	fps_cam_controller : null,

	light : null,
	light_entity : null,
	sun : null,
	time_of_day : -1,

	stars : null,

	input_handler : null,

	/////////////////////////////////////////////////////////////////////////
	// Initialization

	Init : function() {
		this.input_handler = medea.CreateInputHandler();

		this.viewport = medea.CreateViewport();
		this.viewport.ClearColor([0.0,0.0,0.0]);

		this.root = medea.RootNode();
		
		this._InitPlanet();
		this._InitStars();
		this._InitCameras();
	   	this._InitSun();

	   	// TODO: this belongs into the spherical terrain code, but currently
		// has to be attached to the FPS camera. Maybe, cameras should be
		// owned elsewhere.
		this.fps_cam.AddChild(new GrassTile());
	},

	_InitCameras : function() {
		// Configure the orbit camera
		var cam = this.orbit_cam = medea.CreateCameraNode("Orbit");
		cam.ZNear(1);
		cam.ZFar(10000);

		var cc = this.orbit_cam_controller = new OrbitCamController(true,
			INITIAL_CAM_PHI,
			INITIAL_CAM_THETA);
		cc.TerrainNode(this.terrain_root);
		cc.MouseStyle(medea.CAMCONTROLLER_MOUSE_STYLE_ON_LEFT_MBUTTON);
		cc.CameraDistance(INITIAL_ORBIT_CAM_DISTANCE);
		cc.MaximumCameraDistance(MAX_ORBIT_CAM_DISTANCE);
		cc.MinimumCameraDistance(RADIUS);
		cc.Smoothing(true);
		cc.SmoothSpeed(CAM_SMOOTH_SPEED);

	    cam.AddEntity(cc);
	    cam.Translate(vec3.scale([RADIUS, RADIUS, RADIUS], 1.8));
	    this.root.AddChild(cam);

		// Configure the ground-level FPS camera
		var fps_cam = this.fps_cam = medea.CreateCameraNode("FPS");
		fps_cam.ZNear(1);
		fps_cam.ZFar(10000);
		this.root.AddChild(fps_cam);

		var cc_fps = this.fps_cam_controller = new SphereFpsCamController();
	    cc_fps.TerrainNode(this.terrain_root);
		cc_fps.Enable();

	    fps_cam.AddEntity(cc_fps);
	   	cc_fps.PlaceNodeAt(fps_cam, [0.5, 1.0, 0.3]);

	   	// Initially activate the Orbit camera
	    this.viewport.Camera(cam);
	},

	_InitStars : function() {
		this.stars = new StarsNode();
		this.root.AddChild(this.stars);
	},

	_InitSun : function() {
		var light = this.light = medea.CreateNode();
		var light_entity = this.light_entity = medea.CreateDirectionalLight([1,1,1]);
		light.AddEntity(light_entity);
		this.root.AddChild(light);

		// Add the sun billboard
		var sun_bb = this.sun_bb = medea.CreateBillboardNode('url:data/textures/sunsprite.png', false, true);
		var sun = this.sun = this.root.AddChild(sun_bb);
		sun.Scale(SUN_SIZE);

		this.SetTimeOfDay(18.0);
	},

	_InitPlanet : function() {
		this.root.AddChild(new AtmosphereNode());
		
		var terrain_root = this.terrain_root = new SphericalTerrainNode();
		this.root.AddChild(terrain_root);
	},


	/////////////////////////////////////////////////////////////////////////
	// API for other modules

	// Get the scenegraph node that represents the entire sphere terrain.
	// This is a |SphericalTerrainNode| instance
	GetTerrainNode : function() {
		return this.terrain_root;
	},

	// Get the medea.Image (lockable, all data in RAM) that holds
	// height data for a particular heightmap index.
	//
	// cube_face_idx_to_heightmap_idx() maps from cube faces to
	// heightmap indices.
	GetHeightMap : function(heightmap_idx) {
		return resources_preloaded['heightmap_' + heightmap_idx];
	},

	// Gets the tree map corresponding to a single heightmap index.
	GetTreeMap : function(heightmap_idx) {
		return resources_preloaded['treemap_' + heightmap_idx];
	},

	// Gets the estimated distance from the camera to the ground
	GetGroundDistance : function() {
		if (this.fps_view) {
			return FPS_HEIGHT_OVER_GROUND;
		}
		return this.orbit_ground_distance;
	},

	// Get the current active camera node
	GetActiveCamera : function() {
		if (this.fps_view) {
			return this.fps_cam;
		}
		return this.orbit_cam;
	},

	// Get the world space position of the current active camera
	GetCameraPosition : function() {
		return app.GetActiveCamera().GetWorldPos();
	},

	// Get the camera position above the ground, taking into
	// account the actual height of the terrain.
	GetCameraPositionRelativeToGround : CachePerFrame(function() {
		var vpos = app.GetCameraPosition();
		var vlen = vec3.length(vpos); 
		vec3.scale(vpos, (app.GetGroundDistance() + RADIUS) / vlen);
		return vpos;
	}),

	// Get the actual height of the terrain below the camera (i.e.
	// along the camera's UP axis)
	GetTerrainHeightUnderCamera : CachePerFrame(function() {
		return app.GetTerrainNode().GetHeightAt(app.GetCameraPosition());
	}),

	// Get the(cubically) smoothed height of the terrain below
	// the camera.
	GetSmoothedTerrainHeightUnderCamera : CachePerFrame(function() {
		return app.GetTerrainNode().GetSmoothedHeightAt(app.GetCameraPosition());
	}),

	// Get the 2D coordinates
	Get2DCoordinatesOnFaceUnderCamera : CachePerFrame(function() {
		return app.GetTerrainNode().Get2DCoordinatesOnFace(app.GetCameraPosition());
	}),

	Get2DDirectionOnFaceUnderCamera : CachePerFrame(function() {
		var cam_pos = app.GetCameraPosition();
		var cam_dir = app.GetActiveCamera().GetWorldZAxis();
		vec3.add(cam_pos, cam_dir, cam_dir);

		var terrain_node = app.GetTerrainNode();
		var v0 = terrain_node.Get2DCoordinatesOnFace(cam_pos);
		var v1 = terrain_node.Get2DCoordinatesOnFace(cam_dir);

		v1[0] -= v0[0];
		v1[1] -= v0[1];

		var v_norm = 1.0 / (v1[0] * v1[0] + v1[1] * v1[1]);
		v1[0] *= v_norm;
		v1[1] *= v_norm;
		return v1;
	}),


	IsFpsView : function(trafo) {
		return this.fps_view;
	},

	SwitchToFpsView : function(trafo) {
		if (this.fps_view) {
			return;
		}
		this.fps_view = true;
		this.fps_cam.LocalTransform(trafo);
		this.viewport.Camera(this.fps_cam);

		console.log("Switching to FPS view");
	},

	GetTimeOfDay : function() {
		return this.time_of_day;
	},

	// Set time of day relative to an arbitrary '0 AM' location.
	// |tod| specifies the hour and is taken mod 24.
	SetTimeOfDay : (function() {
		var light_rotation_matrix = mat4.create();
		var light_temp_dir = [0.0, 0.0, 0.0, 0.0];
		var sun_rotation_axis = vec3.normalize([0.2, 1.0, 0.2]);
		// Make sure the initial light direction is orthogonal on the sun's rotation axis
		var base_light_dir = vec3.normalize(vec3.cross(sun_rotation_axis, [0.0, 0.0, 1.0], vec3.create()));

		return function(tod) {
			tod = tod % 24.0;

			this.time_of_day = tod;
			mat4.identity(light_rotation_matrix);
			mat4.rotate(light_rotation_matrix, tod * 3.1415 * 2.0 / 24.0, sun_rotation_axis);

			var dir = base_light_dir;
			mat4.multiplyVec4(light_rotation_matrix, [dir[0], dir[1], dir[2], 0.0], light_temp_dir);

			vec3.normalize(light_temp_dir);
	        this.light_entity.Direction([light_temp_dir[0], light_temp_dir[1], light_temp_dir[2]]);

	        vec3.scale(light_temp_dir, -SUN_DISTANCE);
	        if (this.sun) {
	        	this.sun.LocalPos(light_temp_dir);
	        }
	    };
	})(),


	/////////////////////////////////////////////////////////////////////////
	// Implementation

	// Called once per frame, |dtime| is the time delta in seconds since the last invocation
	_Tick : function(dtime) {
		// FPS/Ground view has a fixed sub and z range
		// TODO: change this
		if (this.IsFpsView()) {
			var up = this.fps_cam.GetWorldYAxis();
			var right = this.fps_cam.GetWorldXAxis();
			vec3.lerp(up, right, 0.5);
			vec3.normalize(up);
			vec3.negate(up);
			this.light_entity.Direction(up);

			if (this.sun) {
				this.sun.LocalPos(vec3.scale(up, SUN_DISTANCE));
			}
			return;
		}
		
		// Orbit view already supports moving sun
		if(this.input_handler.ConsumeKeyDown(medea.KeyCode.ENTER)) {
			this.SetTimeOfDay(this.GetTimeOfDay() + 0.5);
        }
        else if (auto_rotate_sun) {
        	this.SetTimeOfDay(this.GetTimeOfDay() + dtime * SUN_MOVE_SPEED);
        }

        // Update orbit camera Z planes.
        // i)  We should always be able to see at least the entire planet + atmosphere + sun
        // ii) Use a fixed 1:10000 ratio for the zplane distances
        var distance = vec3.length(this.orbit_cam.GetWorldPos());
        distance *= 2.0;
        
        distance = Math.max((RADIUS + SUN_DISTANCE) * 1.01, distance);
        this.orbit_cam.ZFar(distance);	        
        this.orbit_cam.ZNear(distance / 10000);
	},

	// Set new global distance from orbit to ground
	_SetOrbitGroundDistance : function(d) {
		this.orbit_ground_distance = d;
	},
};



///////////////////////////////////////////////////////////////////////////////////
// Handler for medea initialization errors (i.e. WebGl not available)
function on_init_error() {
	console.log("Failed to create medea context");
}


///////////////////////////////////////////////////////////////////////////////////
// Handler for successful medea initialization
// Invoked once the medea context (global |medea| object) is ready to use
function on_init_context() {
	var canvas = document.getElementById('game_container');
	console.log("Context created, setting up scene");
	
	// Initialize types from other modules, injecting both medea and
	// the (yet uninitialized) app reference.
	AtmosphereNode = InitAtmosphereNodeType(medea, app);
	SphericalTerrainNode = InitSphericalTerrainType(medea, app);
	OrbitCamController = GetOrbitCamControllerType(medea, app);
	SphereFpsCamController = GetSphereFpsCamControllerType(medea, app);
	GrassTile = InitGrassTileType(medea, app);
	DetailTreeNode = InitDetailTreeNodeType(medea, app);
	TerrainQuadTreeNode = InitTerrainQuadTreeType(medea, app);
	WaterTile = InitWaterTileType(medea, app);
	TerrainTile = InitTerrainTileType(medea, app);
	TreeTile = InitTreeTileType(medea, app);
	StarsNode = InitStarsNodeType(medea, app);

	// Now perform actual initialization and dispatch ticks to app.
	console.log("Starting app initialization");
	app.Init();

	console.log("Setting up tick callbacks (main loop)");
	medea.SetTickCallback(function(dtime) {
		var width = canvas.clientWidth;
		var height = canvas.clientHeight;
		if (canvas.width !== width || canvas.height !== height) {
	   		canvas.width = width;
	   		canvas.height = height;
	   	}

		app._Tick(dtime);
		return true;
	});	

	console.log("Setting up debug panels");
	medea.SetDebugPanel(null, function() {
		var f1 = medea.debug_panel.gui.addFolder('Terrain');
		f1.add(this, 'lod_attenuation');

		var f2 = medea.debug_panel.gui.addFolder('Sun');
		f2.add(this, 'auto_rotate_sun');
	});

    console.log("Starting main loop");
	medea.Start();
}


///////////////////////////////////////////////////////////////////////////////////
// Entry point. Initializes medea, preloads critical resources and then
// dispatches to either |on_init_context| or  |on_init_error|.
function run() {
	// 
	var deps = ['input', 'material', 'standardmesh', 'forwardrenderer', 'light', 'debug', 'terraintile',
		'sceneloader','input_handler','keycodes','skydome','billboard','camcontroller', 'skybox'
	];

	console.log("Creating medea context");
	medealib.CreateContext('game_container', {dataroot: '../medea/data'}, deps, function(_medea) {
		// We only create one medea instance so make it global
		medea = _medea;

		// Preload images that are critical for rendering the first frame
		var countdown = 0;
		for (var k in resources_preloaded) {
			++countdown;
		}

		console.log("Preloading flight-critical resources");
		for (var k in resources_preloaded) {
			medea.CreateImage(resources_preloaded[k], (function(k) {
				return function(img) {
					resources_preloaded[k] =  img;
					if (--countdown === 0) {
						on_init_context();
					}
				};
			})(k))
			;
		}
	}, on_init_error);
}
