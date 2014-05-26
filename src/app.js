
// Global medea instance
var medea = null;
var viewport = null;
var root = null;

var lod_attenuation = 0.4;
var COUNT_LOD_LEVELS = 6;

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
	var log_distance = Math.log(sq_distance / (16.0 * 16.0)) * 0.5 * lod_attenuation / Math.log(2);
	return Math.max(0, Math.min(COUNT_LOD_LEVELS - 1,
		log_distance));
}

// Invoked once the medea context (global |medea|) is ready to use
function on_init_context(terrain_image) {
	var TILE_SIZE = 64;
	var TERRAIN_PLANE_WIDTH = 2048;

	// Adaptive Quad-Tree node to dynamically subdivide the terrain.
	//
	// The rule for splitting is that a single terrain tile may
	// not span more than one LOD region, i.e. the maximum delta
	// in CLOD between any pair of corners is 1.
	//
	// On every Render(), the tree is updated to reflect the
	// camera being rendered. Unused child nodes are retained (but kept
	// disabled) though, so changing between cameras is cheap and does not incur
	// any expensive scenegraph updates.
	var TerrainQuadTreeNode = medea.Node.extend({
		x : 0,
		y : 0,
		w : 1,
		h : 1,

		// TerrainTile to do the actual drawing
		draw_tile : null,

		// Child nodes
		// (sub_quads is already a field of medea.Node)
		sub_quads : null,

		init : function(x, y, w, h) {
			this._super();
			this.x = x | 0;
			this.y = y | 0;
			this.w = w === undefined ? 1 : w;
			this.h = h === undefined ? 1 : h;

			// TODO: get proper BB from lookup table
			this.SetStaticBB(medea.CreateBB(
				vec3.create([this.x * TILE_SIZE, 0, this.y * TILE_SIZE]),
				vec3.create([(this.x + this.w) *  TILE_SIZE, 255, (this.y + this.h) *  TILE_SIZE])
			));
		},

		// This is a Render() operation (not Update) since the terrain
		// rendering depends on the camera/viewport.
		Render : function(camera, rqmanager) {
			var cam_pos = camera.GetWorldPos();

			// Determine whether to further sub-divide or not
			var bb = this.GetWorldBB();

			var vmin = bb[0];
			var vmax = bb[1];
			var can_subdivide = this.w != 1 && this.h != 1;
			
			// We always sub-divide if the player is in the node
			if (can_subdivide && 
				cam_pos[0] >= vmin[0] && cam_pos[0] < vmax[0] &&
				cam_pos[2] >= vmin[2] && cam_pos[2] < vmax[2]) {
				this._Subdivide();
				return;
			}

			// Also, we always sub-divide if the LOD for the
			// entire tile (which spans multiple 1x1 tiles) would be
			// above the maximum LOD level.
			if (can_subdivide && this.w > (1 << (COUNT_LOD_LEVELS-1))) {
				this._Subdivide();
				return;
			}

			// TODO: instead of assuming y==0 (what the shader
			// currently does, assume the center of the BB)
			cam_pos[1] = 0.0;
			var corners = [
				[vmin[0], 0, vmin[2]],
				[vmin[0], 0, vmax[2]],
				[vmax[0], 0, vmin[2]],
				[vmax[0], 0, vmax[2]],
			];

			var clod_min, clod_max;
			var scratch_vec = vec3.create();
			for (var i = 0; i < 4; ++i) {
				var delta = vec3.subtract(cam_pos, corners[i], scratch_vec);
				var clod = calc_clod(vec3.dot(delta, delta));
				if (i === 0 || clod < clod_min) {
					clod_min = clod;
				}
				if (i === 0 || clod > clod_max) {
					clod_max = clod;
				}
			}
			//clod_min = Math.floor(clod_min);
			//clod_max = Math.ceil(clod_max);
			var clod_delta = clod_max - clod_min;
			if (clod_delta >= 0.5 && can_subdivide) {
				this._Subdivide();
			}
			else {
				this._RenderAsSingleTile(clod_min);
			}
		},

		_Subdivide : function() {
			var sub_quads = this.sub_quads;
			if (sub_quads == null) {
				sub_quads = this.sub_quads = new Array(4);
				var x = this.x;
				var y = this.y;
				var w = this.w / 2;
				var h = this.h / 2;
				sub_quads[0] = new TerrainQuadTreeNode(x    , y    , w, h);
				sub_quads[1] = new TerrainQuadTreeNode(x + w, y    , w, h);
				sub_quads[2] = new TerrainQuadTreeNode(x    , y + h, w, h);
				sub_quads[3] = new TerrainQuadTreeNode(x + w, y + h, w, h);

				this.AddChild(sub_quads[0]);
				this.AddChild(sub_quads[1]);
				this.AddChild(sub_quads[2]);
				this.AddChild(sub_quads[3]);
			}

			// Enable the 4 sub-quads, disable the TerrainTile
			for (var i = 0; i < 4; ++i) {
				sub_quads[i].Enabled(true);
			}

			if (this.draw_tile) {
				this.draw_tile.Enabled(false);
			}
		},

		_RenderAsSingleTile : function(clod_min) {
			if (this.draw_tile === null) {
				this.draw_tile = new TerrainTile(this.x, this.y, this.w, this.h);
				this.AddChild(this.draw_tile);
			}

			this.draw_tile.SetLODRange(Math.floor(clod_min), Math.floor(clod_min)+ 1);

			// Enable the TerrainTile, disable the 4 sub-quads
			this.draw_tile.Enabled(true);
			var sub_quads = this.sub_quads;
			if (!sub_quads) {
				return;
			}
			for (var i = 0; i < 4; ++i) {
				sub_quads[i].Enabled(false);
			}
		},
	});

	var TerrainTile = medea.Node.extend({
		x : 0,
		y : 0,
		w : 1,
		h : 1,
		mesh : null,

		lod_min : -1,
		lod_max : -1,

		init : function(x, y, w, h) {
			this._super();
			this.x = x | 0;
			this.y = y | 0;
			this.w = w === undefined ? 1 : w;
			this.h = h === undefined ? 1 : h;

			var outer = this;

			// For each tile, create a clone of the material prototype
			// that has its own set of constants but shares other
			// rendering state. This will minimize the number of state
			// changes required to draw multiple tiles.
			var material = medea.CloneMaterial(this._GetPrototypeTerrainMaterial(), 
				medea.MATERIAL_CLONE_COPY_CONSTANTS | medea.MATERIAL_CLONE_SHARE_STATE);

			// Create a clone of the mesh prototype and assign the cloned
			// material to it.
			var mesh = this.mesh = medea.CloneMesh(this._GetPrototypeTerrainTileMesh(), material);

			// The default LOD mesh assigns LOD based on a stock formula
			// that doesn't match LOD assignment for tiles with w > 1.
			var outer = this;
			mesh._ComputeLODLevel = function() {
				var lod = Math.floor(outer.lod_min - Math.log(outer.w) / Math.log(2.0));
				//console.assert(lod >= 0, "invariant");
				//return 0;
				return Math.max(0,lod);
			};
			var xs = this.x * TILE_SIZE;
			var ys = this.y * TILE_SIZE;
			var ws = this.w * TILE_SIZE;
			var hs = this.h * TILE_SIZE;

			material.Pass(0).Set("terrain_uv_offset_scale", [xs, ys, ws, hs]);

			// Attach the mesh to the scenegraph
			this.Translate([xs, 0, ys]);
			this.Scale([this.w, 0.7, this.h]);
			this.AddEntity(mesh);
		},


		SetLODRange : function(lod_min, lod_max) {
			this.lod_min = lod_min;
			this.lod_max = lod_max;
			this.mesh.Material().Pass(0).Set("lod_range", [lod_min, lod_max, 1 << lod_min, 1 << lod_max]);
		},


		_GetPrototypeTerrainTileMesh : medealib.Cached(function() {
			var mesh = medea.CreateFlatTerrainTileMesh(this._GetPrototypeTerrainMaterial(),
				TILE_SIZE,
				TILE_SIZE,
				COUNT_LOD_LEVELS,
				true /* No UVS */);

			// TODO: calculate proper bounding box
			mesh.BB(medea.CreateBB([0, 0, 0], [TILE_SIZE, 255, TILE_SIZE]));
			mesh.LODAttenuationScale(lod_attenuation);
			return mesh;
		}),

		_GetPrototypeTerrainMaterial : medealib.Cached(function() {
			var constants = {
				// TERRAIN_SPECULAR
				// spec_color_shininess : [1,1,1,32],
				coarse_normal_texture : 'url:data/textures/heightmap0-nm_NRM.png',
				normal_texture : 'url:data/textures/concrete-51_NM.png',
				texture : 'url:data/textures/concrete-51.png',

				inv_terrain_map_dim: 1.0 / TERRAIN_PLANE_WIDTH,

				// Use a function setter to update tweakables every frame
				lod_attenuation : function() {
					return lod_attenuation;
				},

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
			var mat = medea.CreateSimpleMaterialFromShaderPair('url:data/shader/terrain', constants);
			mat.SetIgnoreUniformVarLocationNotFound();
			return mat;
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
	var water_material = medea.CreateSimpleMaterialFromShaderPair('url:data/shader/water', {
			texture : 'url:/data/textures/water.jpg',
			// Allocate the heightmap again, this time with MIPs as we'll otherwise suffer from aliasing
			heightmap : medea.CreateTexture('url:data/textures/heightmap0.png', null,
					// Only one channel is required
					medea.TEXTURE_FORMAT_LUM),
			spec_color_shininess : [0.95, 0.95, 1.0, 32.0]
		}
	);
	water_material.Pass(0).SetDefaultAlphaBlending();

	var water_mesh = medea.CreateStandardMesh_Plane(water_material);
	water_mesh.RenderQueue(medea.RENDERQUEUE_ALPHA);

	water_mesh.Material().Pass(0).CullFace(false);
	water.AddEntity(water_mesh);
	
	water.Translate([1024, 31.01, 1024]);
    water.Scale(1024);


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
	});


	root.AddChild(new TerrainQuadTreeNode(0, 0, 32, 32));
   



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
		
		cam.Translate(vec3.create([1024,75,1024]));
		var cc = medea.CreateCamController('fps');
        cam.AddEntity(cc);
		cc.Enable();
	});

	medea.SetTickCallback(function(dtime) {
		on_tick(dtime);
		return true;
	});	

	medea.SetDebugPanel(null, function() {
		var f1 = medea.debug_panel.gui.addFolder('Terrain');
		f1.add(this, 'lod_attenuation');
	});

	
    
    console.log("Starting main loop");
	medea.Start();
}

function run() {
	var deps = ['input', 'material', 'standardmesh', 'forwardrenderer', 'light', 'debug', 'terraintile', 'sceneloader'];
	medealib.CreateContext('game_container', {dataroot: '../medea/data'}, deps, function(_medea) {
		
		// We only create one medea instance so make it global
		medea = _medea;

		// Load the terrain base image
		medea.CreateImage('url:data/textures/heightmap0.png', function(img) {
			on_init_context(img);
		});
	}, on_init_error);
}
