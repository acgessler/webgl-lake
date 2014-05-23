
// Global medea instance
var medea = null;
var viewport = null;
var root = null;

function on_init_error() {
	console.log("Failed to initialize");
}

function on_tick(dtime) {
	return true;
}


function on_init_context(terrain_image) {
	var TILE_SIZE = 64;
	var TILE_INDEX_OFFSET = 12;

	var TerrainTile = medea.Node.extend({
		x : 0,
		y : 0,
		init : function(x, y) {
			this._super();
			this.x = x || 0;
			this.y = y || 0;

			var outer = this;
			var material = this._GetBaseMaterial();
			medea.CreateTerrainTileMesh(terrain_image,
				material,
				function(mesh) {
					var child = outer.AddChild();
					child.Translate([-TILE_SIZE / 2 + outer.x * TILE_SIZE,10,-TILE_SIZE / 2 + outer.y * TILE_SIZE]);
					child.AddEntity(mesh);
					child.Scale([1,0.4,1]);
				},
				(x + TILE_INDEX_OFFSET) * TILE_SIZE,
				(y + TILE_INDEX_OFFSET) * TILE_SIZE,
				TILE_SIZE + 1,
				TILE_SIZE + 1
			);
		},

		_GetBaseMaterial : (function() {
			var mat = null;
			return function() {
				if (mat) return mat;
				mat = medea.CreateSimpleMaterialFromTexture('url:data/textures/concrete-51.png',
					true, 16, null, 
					'url:data/textures/concrete-51_NM.png');
				return mat;
			};
		})()
	});

	console.log("Context created, setting up scene");
	viewport = medea.CreateViewport();
	viewport.ClearColor([1.0,0.0,1.0]);
	
	root = medea.RootNode();
	var light = medea.CreateNode();
	light.AddEntity(medea.CreateDirectionalLight([1,1,1], [0.2,-1,-0.5]));
	root.AddChild(light);

	var water = root.AddChild();
	var water_mesh = medea.CreateStandardMesh_Plane([0.7, 0.9, 0.95]);
	water_mesh.Material().Pass(0).CullFace(false);
	water.AddEntity(water_mesh);

	water.Translate([0,-20.01,0]);
    water.Scale(400);

    for (var x = -4; x <= 4; ++x) {
    	for (var y = -4; y <= 4; ++y) {
    		root.AddChild(new TerrainTile(x, y)).Translate([0,-50,0]);
    	}
	}

	// Add the skydome, as in the previous sample
	medea.LoadModules('skydome',function() {
		var dome_node = medea.CreateSkydomeNode('remote:skydome_sample/midmorning/midmorning.png', 0.4);
		root.AddChild(dome_node);
    });

	
	// And a plain camera controller
	medea.LoadModules('camcontroller',function() {
		var cam = medea.CreateCameraNode();
		root.AddChild(cam);
		viewport.Camera(cam);
		
		cam.Translate(vec3.create([0,25,5]));
		var cc = medea.CreateCamController('fps');
        cam.AddEntity(cc);
		cc.Enable();
	});

	medea.SetTickCallback(function(dtime) {
		on_tick(dtime);
		return true;
	});	

	medea.SetDebugPanel(null);
    
    console.log("Starting main loop");
	medea.Start();
}

function run() {
	var deps = ['input', 'material', 'standardmesh', 'forwardrenderer', 'light', 'debug', 'terraintile'];
	medealib.CreateContext('game_container', {dataroot: '../medea/data'}, deps, function(_medea) {
		
		// We only create one medea instance so make it global
		medea = _medea;

		// Load the terrain base image
		var img = new Image();
		img.onload = function() {
			on_init_context(img);
		};

		img.src = 'data/textures/heightmap0.png';

	}, on_init_error);
}
