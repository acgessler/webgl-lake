
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
	var TERRAIN_PLANE_WIDTH = 2048;
	var TILE_INDEX_OFFSET = 12;

	var TerrainTile = medea.Node.extend({
		x : 0,
		y : 0,
		init : function(x, y) {
			this._super();
			this.x = x | 0;
			this.y = y | 0;

			var outer = this;

			// For each tile, create a clone of the material prototype
			// that has its own set of constants but shares other
			// rendering state. This will minimize the number of state
			// changes required to draw multiple tiles.
			var material = medea.CloneMaterial(this._GetPrototypeTerrainMaterial(), 
				medea.MATERIAL_CLONE_COPY_CONSTANTS | medea.MATERIAL_CLONE_SHARE_STATE);

			// Create a clone of the mesh prototype and assign the cloned
			// material to it.
			var mesh = medea.CloneMesh(this._GetPrototypeTerrainTileMesh(), material);

			var xs = (x + TILE_INDEX_OFFSET) * TILE_SIZE;
			var ys = (y + TILE_INDEX_OFFSET) * TILE_SIZE;
			var ws = TILE_SIZE;
			var hs = TILE_SIZE;

			material.Pass(0).Set("terrain_uv_offset_scale", [xs, ys, ws, hs]);

			// Attach the mesh to the scenegraph
			var child = this.AddChild();
			child.Translate([-TILE_SIZE / 2 + this.x * TILE_SIZE,10,-TILE_SIZE / 2 + this.y * TILE_SIZE]);
			child.AddEntity(mesh);
			child.Scale([1,0.7,1]);
		},

		_GetPrototypeTerrainTileMesh : medealib.Cached(function() {
			return medea.CreateFlatTerrainTileMesh(this._GetPrototypeTerrainMaterial(),
				TILE_SIZE,
				TILE_SIZE,
				undefined, /* LOD levels */
				true /* No UVS */);
		}),

		_GetPrototypeTerrainMaterial : medealib.Cached(function() {
			var constants = {
				// TERRAIN_SPECULAR
				// spec_color_shininess : [1,1,1,32],
				coarse_normal_texture : 'url:data/textures/heightmap0-nm_NRM.png',
				normal_texture : 'url:data/textures/concrete-51_NM.png',
				texture : 'url:data/textures/concrete-51.png',

				inv_terrain_map_dim: 1.0 / TERRAIN_PLANE_WIDTH,

				// The heightmap needs custom parameters so we need to load it
				// manually (this is no overhead, specifying a URL for a texture
				// constant directly maps to medea.CreateTexture on that URL)
				heightmap : medea.CreateTexture('url:data/textures/heightmap0.png', null,
					// We don't need MIPs for the heightmap anyway
					medea.TEXTURE_FLAG_NO_MIPS | 
					// Also, only one channel is required
					medea.TEXTURE_FORMAT_LUM |
					// Hint to medea that the texture will be accessed
					// from within a vertex shader.
					medea.TEXTURE_VERTEX_SHADER_ACCESS),
			};	
			return medea.CreateSimpleMaterialFromShaderPair('url:data/shader/terrain', constants);
		}),
	});

	console.log("Context created, setting up scene");
	viewport = medea.CreateViewport();
	viewport.ClearColor([1.0,0.0,1.0]);
	
	root = medea.RootNode();
	var light = medea.CreateNode();
	light.AddEntity(medea.CreateDirectionalLight([1,1,1], [0.6, -1,-0.8]));
	root.AddChild(light);

	var water = root.AddChild();
	var water_mesh = medea.CreateStandardMesh_Plane(medea.CreateSimpleMaterialFromTexture(
		'url:/data/textures/water.jpg'));
	water_mesh.Material().Pass(0).CullFace(false);
	water.AddEntity(water_mesh);

	water.Translate([0,-9.01,0]);
    water.Scale(800);

    for (var x = -10; x <= 10; ++x) {
    	for (var y = -10; y <= 10; ++y) {
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
		medea.CreateImage('url:data/textures/heightmap0.png', function(img) {
			on_init_context(img);
		});
	}, on_init_error);
}
