
// Global medea instance
var medea = null;
var viewport = null;
var root = null;

var lod_attenuation = 0.5;


function on_init_error() {
	console.log("Failed to initialize");
}

// Called by medea once per frame
function on_tick(dtime) {
	return true;
}

function log2(x) {
	return Math.log(x) / Math.log(2.0);
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

// Compute the min and max heights of each terrain tile on each LOD level.
// Returns a 3D array where the dimensions are:
//   - LOD level
//   - X axis tile index
//   - Y axis tile index
//
//  And each entry is a 2-tuple containing the minimum and maximum
//  (unscaled) heights of the tile.
//
// The number of LOD levels is |log2(terrain_image.GetWidth() / TILE_SIZE)|.
function compute_bounding_boxes(terrain_image) {
	var data = terrain_image.GetData();
	var tile_size = TILE_SIZE;
	var tiles_count = terrain_image.GetWidth() / tile_size;

	var level_count = log2(tiles_count) + 1;
	var bbs = new Array(level_count);

	// Derive base level (lod0) from source heightmap
	bbs[0] = new Array(tiles_count);
	for (var y = 0; y < tiles_count; ++y) {
		bbs[0][y] = new Array(tiles_count);
		for (var x = 0; x < tiles_count; ++x) {
			var vmin = 1e10;
			var vmax = -1e10;
			for (var yy = 0; yy < tile_size; ++yy) {
				var ybase = (y * tile_size + yy) * TERRAIN_PLANE_WIDTH;
				for (var xx = 0; xx < tile_size; ++xx) {
					var src_idx = (ybase + x * tile_size + xx) * 4;
					var height = data[src_idx];

					vmin = Math.min(vmin, height);
					vmax = Math.max(vmax, height);
				} 
			}
			bbs[0][y][x] = [vmin, vmax];
		}
	}

	// Merge upwards
	for (var l = 1; l < level_count; ++l) {
		var old_tiles_count = tiles_count;
		tiles_count /= 2;
		bbs[l] = new Array(tiles_count);
		for (var y = 0; y < tiles_count; ++y) {
			bbs[l][y] = new Array(tiles_count);
			for (var x = 0; x < tiles_count; ++x) {
				var vmin = 1e10;
				var vmax = -1e10;
				for (var yy = 0; yy < 2; ++yy) {
					var ybase = y * 2 + yy;
					for (var xx = 0; xx < 2; ++xx) {
						var minmax = bbs[l - 1][ybase][x * 2 + xx];

						vmin = Math.min(vmin, minmax[0]);
						vmax = Math.max(vmax, minmax[1]);
					} 
				}
				bbs[l][y][x] = [vmin, vmax];
			}
		}
	}
	return bbs;
}

function compute_tree_mesh(terrain_image, tree_image) {
	var data = tree_image.GetData(), w = tree_image.GetWidth(), h = tree_image.GetHeight();
	var height_data = terrain_image.GetData();

	var size_ratio = TERRAIN_PLANE_WIDTH / TREE_MAP_WIDTH;
	var tree_height = TREE_WIDTH * TREE_ASPECT;

	// For now, collect complete billboards for all trees.
	// TODO: use instancing to merge position and UV
	var c = 0;
	var tree_count = 0;
	for (var y = 0; y < h; ++y) {
		for (var x = 0; x < w; ++x, c += 4) {
			if (data[c + 3] !== 0) {
				++tree_count;
			}
		}
	}

	console.log('Totally ' + tree_count + ' trees');

	// Emit full vertices and do not use an index buffer. This
	// looses us the vertex cache effect, making vertex processing
	// an estimated 33% slower for trees (which is bad because it
	// does the billboard alignment at vertex stage). On the other
	// side, they don't all fit into one IBO.
	//
	// Estimated size of this VB is ~ 20MB which might pose a
	// problem on some hardware.
	var pos = new Float32Array(tree_count * 6 * 3);
	var uv = new Float32Array(tree_count * 6 * 2);
	var pos_cur = 0;
	var uv_cur = 0;
	c = 0;
	for (var y = 0; y < h; ++y) {
		
		for (var x = 0; x < w; ++x, c += 4) {
			if (data[c + 3] === 0) {
				continue;
			}

			// Place each tree in a tight distribution around its spot in the grid
			var rand = Math.random();
			rand *= rand;
			rand = rand * 0.5 + 0.5;
			var xofs = size_ratio * rand;
			var yofs = size_ratio * rand;

			var xpos = x * size_ratio + xofs;
			var ypos = y * size_ratio + yofs;

			var height_base = Math.floor(ypos) * (w * size_ratio);
			var terrain_height = height_data[(height_base + Math.floor(xpos)) * 4] *
				TERRAIN_HEIGHT_SCALE;

			for (var i = 0; i < 6; ++i) {
				pos[pos_cur++] = xpos;
				// Add slight variation in height as well
				pos[pos_cur++] = terrain_height + (i >= 2 && i <= 4 ? tree_height : 0) * (1.0 + rand * 0.2);
				pos[pos_cur++] = ypos;
			}

			uv[uv_cur++] = 0.0;
			uv[uv_cur++] = 0.0;

			uv[uv_cur++] = 1.0;
			uv[uv_cur++] = 0.0;

			uv[uv_cur++] = 1.0;
			uv[uv_cur++] = 1.0;

			uv[uv_cur++] = 1.0;
			uv[uv_cur++] = 1.0;

			uv[uv_cur++] = 0.0;
			uv[uv_cur++] = 1.0;

			uv[uv_cur++] = 0.0;
			uv[uv_cur++] = 0.0;
		}
	}

	var vertex_channels = {
		positions: pos,
		uvs : [uv]
	};

	var mat = medea.CreateSimpleMaterialFromShaderPair('url:data/shader/tree_billboard', {
		texture : medea.CreateTexture('url:/data/textures/pine_billboard.png', null),
		scaling : TREE_WIDTH
	});
	var mesh = medea.CreateSimpleMesh(vertex_channels, null, mat);
	mesh.Material().Pass(0).SetDefaultAlphaBlending();
	mesh.RenderQueue(medea.RENDERQUEUE_ALPHA);
	return mesh;
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
function on_init_context(terrain_image, tree_image) {
	


	console.log("Context created, setting up scene");
	viewport = medea.CreateViewport();
	viewport.ClearColor([0.0,0.0,0.0]);
	
	root = medea.RootNode();
	var light = medea.CreateNode();
	var light_entity = medea.CreateDirectionalLight([1,1,1], [0.7, -1.0,-0.7]);
	light.AddEntity(light_entity);
	root.AddChild(light);


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

	var axes = [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	];

	var AtmosphereNode = InitAtmosphereNodeType(medea);
	var TerrainQuadTreeNode = InitTerrainQuadTreeType(medea, terrain_image, tree_image);

	for (var i = 0; i < 6; ++i) {
		var is_back = i >= 3;
		var plane = new TerrainQuadTreeNode(0, 0, 32, is_back);
		plane.Translate([TERRAIN_PLANE_OFFSET, 0, TERRAIN_PLANE_OFFSET]);
		var plane_anchor = medea.CreateNode();
		plane_anchor.Rotate(Math.PI * 0.5, axes[i % 3]);
		if ( is_back ) {
			// Mirroring on 2 axes means that the face winding is
			// still the same, so we don't need to change culling
			// settings. This need to be taken into account when
			// creating the terrain image data though.
			plane_anchor.Scale([-1, -1, 1]);
		}
		plane_anchor.Translate([0, TERRAIN_PLANE_WIDTH / 2, 0]);
		plane_anchor.AddChild(plane);
		root.AddChild(plane_anchor);
	}


	// Add the skydome, as in the previous sample
	//medea.LoadModules('skydome',function() {
	//	var dome_node = medea.CreateSkydomeNode('remote:skydome_sample/midmorning/midmorning.png', 0.4);
	//	root.AddChild(dome_node);
    //});

	
	// And a plain camera controller
	medea.LoadModules('camcontroller',function() {
		var cam = medea.CreateCameraNode();
		root.AddChild(cam);
		viewport.Camera(cam);
		//cam.Culling(false);
		
		cam.Translate(vec3.create([1900,1900,1900]));
		var cc = medea.CreateCamController('orbit');
		cc.CameraDistance(RADIUS * 2);
		cc.MaximumCameraDistance(RADIUS * 5);
		cc.MinimumCameraDistance(RADIUS);
		cc.Smoothing(true);
		cc.SmoothSpeed(0.7);
		//cc.WalkSpeed(25);
        cam.AddEntity(cc);
		cc.Enable();
	});

	var input_handler = medea.CreateInputHandler();
	var light_rotation_matrix = mat4.identity(mat4.create());
	var light_temp_dir = [0.0, 0.0, 0.0, 0.0];
	mat4.rotate(light_rotation_matrix, 3.1415 * 2.0 / 24.0, [0.6, 0.0, 0.6]);
	medea.SetTickCallback(function(dtime) {
		on_tick(dtime);

		if(input_handler.ConsumeKeyDown(medea.KeyCode.ENTER)) {
			var dir = light_entity.Direction();
			mat4.multiplyVec4(light_rotation_matrix, [dir[0], dir[1], dir[2], 0.0], light_temp_dir);
            light_entity.Direction([light_temp_dir[0], light_temp_dir[1], light_temp_dir[2]]);
        }
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
	var deps = ['input', 'material', 'standardmesh', 'forwardrenderer', 'light', 'debug', 'terraintile', 'sceneloader', 'input_handler', 'keycodes'];
	medealib.CreateContext('game_container', {dataroot: '../medea/data'}, deps, function(_medea) {
		
		// We only create one medea instance so make it global
		medea = _medea;

		// Load the terrain base image
		medea.CreateImage('url:data/textures/heightmap0.png', function(img) {
			medea.CreateImage('url:data/textures/treemap.png', function(tree_img) {
				on_init_context(img, tree_img);
			});
		});
	}, on_init_error);
}
