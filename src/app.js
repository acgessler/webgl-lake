
// Global medea instance
var medea = null;
var viewport = null;
var root = null;

var lod_attenuation = 0.5;

// The following parameters need to be synced with constants_shared.vsh
// Technically most of them could be made uniforms and passed to
// shaders at runtime, but it significantly decreases shader
// performance and comes at higher CPU overhead.
var COUNT_LOD_LEVELS = 9;
var TILE_SIZE = 64;
var TERRAIN_PLANE_WIDTH = 2048;
var TERRAIN_PLANE_OFFSET = -TERRAIN_PLANE_WIDTH / 2;
var RADIUS = 1024;
var TREE_MAP_WIDTH = 512; // terrain % trees == 0

// Tree billboard height over width
var TREE_WIDTH = 2.6;
var TREE_ASPECT = 2.3;

var TERRAIN_HEIGHT_SCALE = 0.55;

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


// Return the prototype mesh for drawing a terrain surface with VTF-based
// height (i.e the mesh is a flat grid with y==0). This mesh
// is never used for drawing, but tiles use CloneMesh()
// to get independent copies.
var get_prototype_terrain_mesh = medealib.Cached(function() {
	var mesh = medea.CreateFlatTerrainTileMesh(get_prototype_terrain_material(),
		TILE_SIZE,
		TILE_SIZE,
		Math.min(COUNT_LOD_LEVELS, log2(TILE_SIZE)),
		true /* No UVS */);

	// TODO: calculate proper bounding box
	mesh.BB(medea.CreateBB([0, 0, 0], [TILE_SIZE, 255, TILE_SIZE]));
	mesh.LODAttenuationScale(lod_attenuation);
	return mesh;
});

// Return the prototype material for drawing terrain. This material
// is never used for drawing, but terrain tiles use CloneMaterial()
// to get independent copies.
var get_prototype_terrain_material = medealib.Cached(function() {
	var constants = {
		// TERRAIN_SPECULAR
		// spec_color_shininess : [1,1,1,32],
		coarse_normal_texture : 'url:data/textures/heightmap0-nm_NRM.png',
		fine_normal_texture : 'url:data/textures/heightmap0-nm_NRM_2.png',

		ground_texture: 'url:data/textures/terrain_detail_a.jpg',
		ground_normal_texture: 'url:data/textures/terrain_detail_a_NRM.png',

		stone_texture: 'url:data/textures/terrain_detail_b.jpg',
		stone_normal_texture: 'url:data/textures/terrain_detail_b_NRM.png',

		grass_texture: 'url:data/textures/terrain_detail_d.jpg',
		snow_texture: 'url:data/textures/terrain_detail_c.jpg',

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
			// Hint to medea that the texture will be accessed
			// from within a vertex shader.
			medea.TEXTURE_VERTEX_SHADER_ACCESS,

			// Only one channel is required
			medea.TEXTURE_FORMAT_LUM),
	};	
	var mat = medea.CreateSimpleMaterialFromShaderPair('url:data/shader/terrain', constants);
	mat.SetIgnoreUniformVarLocationNotFound();
	return mat;
});

// Return the prototype material for drawing water. This material
// is never used for drawing, but water tiles use CloneMaterial()
// to get independent copies.
var get_prototype_water_material = medealib.Cached(function() {
	var water_material = medea.CreateSimpleMaterialFromShaderPair('url:data/shader/water', {
			texture : 'url:/data/textures/water.jpg',
			// Allocate the heightmap again, this time with MIPs as we'll otherwise suffer from aliasing
			heightmap : medea.CreateTexture('url:data/textures/heightmap0a.png', null, null,
					// Only one channel is required
					medea.TEXTURE_FORMAT_LUM),
			spec_color_shininess : [0.95, 0.95, 1.0, 32.0],
			inv_terrain_map_dim: 1.0 / TERRAIN_PLANE_WIDTH
		}
	);
	water_material.Pass(0).SetDefaultAlphaBlending();
	return water_material;
});

// Invoked once the medea context (global |medea|) is ready to use
function on_init_context(terrain_image, tree_image) {
	var terrain_bounding_boxes = compute_bounding_boxes(terrain_image);
	var tree_mesh = compute_tree_mesh(terrain_image, tree_image);

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

		// The LOD level that rendering the entire node in a single
		// tile corresponds to.
		node_lod_level : null,

		// TerrainTile to do the actual drawing
		draw_tile : null,

		// Child nodes
		// (children is already a field of medea.Node)
		sub_quads : null,

		// Whether the world transformation for this
		// treenode requires all of its meshes to be
		// rendered with reversed culling.
		is_back : false,

		// AABB in local space
		local_bb : null,

		init : function(x, y, w, is_back) {
			this._super();
			this.x = x | 0;
			this.y = y | 0;
			this.w = w === undefined ? 1 : w;
			// TODO: get rid of 'h' everywhere. We only use square sizes.
			this.h = w;
			this.is_back = is_back;

			if (this.w === 32) {
				this.AddEntity(tree_mesh);
				this.AddChild(new WaterTile(this.x, this.y, this.w, this.h));
			}

			this.node_lod_level = log2(this.w);

			// There are two reasons why we need to override medea's
			// automatic BB calculation:
			//
			// - quadtree nodes are added lazily, so initially everything is
			//   empty. Nothing would get drawn, and the quadtree would
			//   therefore not get further subdivided.
			// - The transformation to spherical shape is applied external to
			//   medea's transformation system (since the transformation
			//   is non-linear), so BB calculation would give wrong results.
			this._CalculateStaticBB();
		},

		_CalculateStaticBB : function() {
			// Take the correct y bounding segment from the lookup table we generated
			// This gives a basic bounding box.
			var height_min_max = terrain_bounding_boxes[this.node_lod_level]
				[this.y / this.w][this.x / this.w];

			var a = vec3.create([this.x * TILE_SIZE,
				height_min_max[0] * TERRAIN_HEIGHT_SCALE,
				this.y * TILE_SIZE]);
			var b = vec3.create([(this.x + this.w) *  TILE_SIZE,
				 height_min_max[1] * TERRAIN_HEIGHT_SCALE,
				 (this.y + this.h) *  TILE_SIZE]);

			this.local_bb = medea.CreateBB(a, b);
			
			// Now transform this AABB by the sphere shape
			//
			// Note that static BBs are still multiplied with
			// the node's world transformation, i.e. the orientation
			// terrain plane need not to be taken into account.
			var scratch = vec3.create();
			var vmin = vec3.create();
			vmin[0] = 1e10;
			vmin[1] = 1e10;
			vmin[2] = 1e10;
			var vmax = vec3.create();
			vmax[0] = -1e10;
			vmax[1] = -1e10;
			vmax[2] = -1e10;
			for (var i = 0; i < 8; ++i) {
				scratch[0] = ((i & 0x1) ? b : a)[0] + TERRAIN_PLANE_OFFSET;
				scratch[1] = RADIUS;
				scratch[2] = ((i & 0x2) ? b : a)[2] + TERRAIN_PLANE_OFFSET;

				vec3.normalize(scratch);

				var height = ((i & 0x4) ? b : a)[1] + RADIUS;
				scratch[0] *= height;
				scratch[1] *= height;
				scratch[2] *= height;

				scratch[1] -= RADIUS;

				for (var j = 0; j < 3; ++j) {
					vmin[j] = Math.min(vmin[j], scratch[j]);
					vmax[j] = Math.max(vmax[j], scratch[j]);
				}
			}

			vmin[0] -= TERRAIN_PLANE_OFFSET;
			vmin[2] -= TERRAIN_PLANE_OFFSET;
			vmax[0] -= TERRAIN_PLANE_OFFSET;
			vmax[2] -= TERRAIN_PLANE_OFFSET;
			this.SetStaticBB(medea.CreateBB(vmin, vmax));
		},

		cnt : 0,

		// This is a Render() operation (not Update) since the terrain
		// rendering depends on the camera/viewport.
		Render : function(camera, rqmanager) {
			var cam_pos = camera.GetWorldPos();
		
			var vmin = this.bb[0];
			var vmax = this.bb[1];

			// Determine whether to further sub-divide or not
			var can_subdivide = this.w != 1;
			
			// We always sub-divide if the player is in the node
			if (can_subdivide && 
				cam_pos[0] >= vmin[0] && cam_pos[0] < vmax[0] &&
				cam_pos[1] >= vmin[1] && cam_pos[1] < vmax[1] &&
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

			var clod_min, clod_max;
			var scratch_vec = vec3.create();
			for (var i = 0; i < 8; ++i) {
				var corner = [
					i & 1 ? vmin[0] : vmax[0],
					i & 2 ? vmin[1] : vmax[1],
					i & 4 ? vmin[2] : vmax[2],
				];
				var delta = vec3.subtract(cam_pos, corner, scratch_vec);
				var clod = calc_clod(vec3.dot(delta, delta));
				if (i === 0 || clod < clod_min) {
					clod_min = clod;
				}
				if (i === 0 || clod > clod_max) {
					clod_max = clod;
				}
			}
	
			var clod_delta = clod_max - clod_min;
			var can_satisfy_lod = clod_min - Math.floor(log2(this.w)) >= 0;
			if ((clod_delta >= 1.0 || !can_satisfy_lod) && can_subdivide) {
				this._Subdivide();
			}
			else {
				this._RenderAsSingleTile(clod_min,
					(this.local_bb[0][1] + this.local_bb[1][1]) * 0.5);
			}
		},

		_Subdivide : function() {
			var sub_quads = this.sub_quads;
			if (sub_quads == null) {
				sub_quads = this.sub_quads = new Array(4);
				var x = this.x;
				var y = this.y;
				var w = this.w / 2;
				var is_back = this.is_back;
				sub_quads[0] = new TerrainQuadTreeNode(x    , y    , w, is_back);
				sub_quads[1] = new TerrainQuadTreeNode(x + w, y    , w, is_back);
				sub_quads[2] = new TerrainQuadTreeNode(x    , y + w, w, is_back);
				sub_quads[3] = new TerrainQuadTreeNode(x + w, y + w, w, is_back);

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

		_RenderAsSingleTile : function(clod_min, tile_y_mean) {
			if (this.draw_tile === null) {
				this.draw_tile = new TerrainTile(this.x, this.y, this.w, this.h, this.is_back, tile_y_mean);
				this.AddChild(this.draw_tile);
			}

			var clod_adjusted = Math.floor(clod_min);
			this.draw_tile.SetLODRange(clod_adjusted, clod_adjusted + 1);

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

		_NotVisible : function() {
			if (this.draw_tile !== null) {
				this.draw_tile.Enabled(false);
			}
			if (this.sub_quads !== null) {
				for (var i = 0; i < 4; ++i) {
					this.sub_quads[i].Enabled(false);
				}
			}
		},
	});


	// Leaf that actually draws a water tile (of any power-of-two) size.
	// Water is usually drawn at a higher LOD than normal terrain tiles.
	var WaterTile = medea.Node.extend({
		x : 0,
		y : 0,
		w : 1,
		h : 1,

		mesh : null,

		init : function(x, y, w, h, is_back) {
			this._super();
			this.x = x | 0;
			this.y = y | 0;
			this.w = w === undefined ? 1 : w;
			this.h = h === undefined ? 1 : h;
			this.is_back = is_back;

			var xs = this.x * TILE_SIZE;
			var ys = this.y * TILE_SIZE;
			var ws = this.w * TILE_SIZE;
			var hs = this.h * TILE_SIZE;

			// Attach the mesh to the scenegraph and position the tile correctly
			this.Translate([xs, 0, ys]);
			this.Scale([this.w, TERRAIN_HEIGHT_SCALE, this.h]);
			
			var water_material = medea.CloneMaterial(get_prototype_water_material());
			water_material.Pass(0).Set("terrain_uv_offset_scale", [xs, ys, ws, hs]);
			var water_mesh = medea.CloneMesh(get_prototype_terrain_mesh(), water_material);
			// The terrain mesh is a LOD mesh, but water gets drawn at LOD0
			water_mesh._ComputeLODLevel = function() {
				return 0;
			};
			water_mesh.RenderQueue(medea.RENDERQUEUE_ALPHA_EARLY);

			water_mesh.Material().Pass(0).CullFace(false);
			this.AddEntity(water_mesh);
			this.SetStaticBB(medea.BB_INFINITE);
		},
	});

	// Leaf that actually draws a terrain tile (of any power-of-two size)
	// Could be part of TerrainQuadTreeNode, but factored out to keep things easy.
	var TerrainTile = medea.Node.extend({
		x : 0,
		y : 0,
		w : 1,
		h : 1,
		mesh : null,

		lod_min : -1,
		lod_max : -1,

		is_back : false,

		init : function(x, y, w, h, is_back, tile_y_mean) {
			this._super();
			this.x = x | 0;
			this.y = y | 0;
			this.w = w === undefined ? 1 : w;
			this.h = h === undefined ? 1 : h;
			this.is_back = is_back;

			var outer = this;

			// For each tile, create a clone of the material prototype
			// that has its own set of constants but shares other
			// rendering state. This will minimize the number of state
			// changes required to draw multiple tiles.
			var material = medea.CloneMaterial(get_prototype_terrain_material(), 
				medea.MATERIAL_CLONE_COPY_CONSTANTS | medea.MATERIAL_CLONE_SHARE_STATE);

			// Create a clone of the mesh prototype and assign the cloned
			// material to it.
			var mesh = this.mesh = medea.CloneMesh(get_prototype_terrain_mesh(), material);

			// The default LOD mesh assigns LOD based on a stock formula
			// that doesn't match LOD assignment for tiles with w > 1.
			var outer = this;
			mesh._ComputeLODLevel = function() {
				var lod = Math.floor(outer.lod_min - log2(outer.w));
				//console.assert(lod >= 0, "invariant");
				return Math.max(0,lod);
			};
			var xs = this.x * TILE_SIZE;
			var ys = this.y * TILE_SIZE;
			var ws = this.w * TILE_SIZE;
			var hs = this.h * TILE_SIZE;

			material.Pass(0).Set("terrain_uv_offset_scale", [xs, ys, ws, hs]);
			material.Pass(0).Set("uv_scale", this.w);
			material.Pass(0).Set("sq_base_height", tile_y_mean * tile_y_mean);
			material.Pass(0).CullFaceMode(is_back ? "back" : "front");
			material.Pass(0).CullFace(false);

			// Attach the mesh to the scenegraph and position the tile correctly
			this.Translate([xs, 0, ys]);
			this.Scale([this.w, TERRAIN_HEIGHT_SCALE, this.h]);
			this.AddEntity(mesh);
		},


		SetLODRange : function(lod_min, lod_max) {
			this.lod_min = lod_min;
			this.lod_max = lod_max;
			this.mesh.Material().Pass(0).Set("lod_range", [lod_min, lod_max, 1 << lod_min, 1 << lod_max]);
		},
	});

	console.log("Context created, setting up scene");
	viewport = medea.CreateViewport();
	viewport.ClearColor([1.0,0.0,1.0]);
	
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

	for (var i = 0; i < 6; ++i) {
		var is_back = i >= 3;
		var plane = new TerrainQuadTreeNode(0, 0, 32, is_back);
		plane.Translate([TERRAIN_PLANE_OFFSET, 0, TERRAIN_PLANE_OFFSET]);
		var plane_anchor = medea.CreateNode();
		plane_anchor.Rotate(Math.PI * 0.5, axes[i % 3]);
		if ( is_back ) {
			// Mirroring on 3 axes means that all faces need
			// to be rendered with reverse face winding.
			plane_anchor.Scale(-1);
		}
		plane_anchor.Translate([0, TERRAIN_PLANE_WIDTH / 2, 0]);
		plane_anchor.AddChild(plane);
		root.AddChild(plane_anchor);
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
		//cam.Culling(false);
		
		cam.Translate(vec3.create([1900,1900,1900]));
		var cc = medea.CreateCamController('orbit');
		cc.CameraDistance(RADIUS * 2);
		cc.MaximumCameraDistance(RADIUS * 5);
		cc.MinimumCameraDistance(RADIUS);
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
