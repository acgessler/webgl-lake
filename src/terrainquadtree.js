

var InitTerrainQuadTreeType = function(medea, app) {
	// Compute the min and max heights of each terrain tile on each LOD level
	// for the given cube face.
	//
	// Returns as a 3D array as follows:
	//   - LOD level
	//   - X axis tile index
	//   - Y axis tile index
	//
	//  And each entry is a 2-tuple containing the minimum and maximum
	//  (unscaled) heights of the tile.
	//
	// The number of LOD levels is |log2(terrain_image.GetWidth() / TILE_SIZE)|.
	var compute_bounding_boxes = (function() {
		var bounding_boxes = {};
		return function(cube_face_idx) {

		var heightmap_idx = cube_face_idx_to_heightmap_idx(cube_face_idx);

		var key = heightmap_idx;
		if (bounding_boxes[key]) {
			return bounding_boxes[key];
		}

		var terrain_image = app.GetHeightMap(heightmap_idx);

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
						var height = data[src_idx] * TERRAIN_HEIGHT_SCALE;

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
		bounding_boxes[key] = bbs;
		return bbs;
		};
	})();


	var bounding_boxes_cache = {

	};

	var world_offset_without_rotation = vec3.create([
		TERRAIN_PLANE_OFFSET,
		RADIUS,
		TERRAIN_PLANE_OFFSET
	]);


	var WaterTile = InitWaterTileType(medea);
	var TerrainTile = InitTerrainTileType(medea, app);
	var TreeTile = InitTreeTileType(medea, app);


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

		// For each corner, a world-space normal to determine visibility
		corner_normals : null,

		cube_face_idx : null,

		init : function(x, y, w, is_back, cube_face_idx) {
			this._super();
			this.x = x | 0;
			this.y = y | 0;
			this.w = w === undefined ? 1 : w;
			// TODO: get rid of 'h' everywhere. We only use square sizes.
			this.h = w;
			this.is_back = is_back;
			this.cube_face_idx = cube_face_idx;

			if (this.w === TILE_COUNT) {
				this.AddChild(new WaterTile(this.x, this.y, this.w, this.h, cube_face_idx));
				this.AddChild(new TreeTile(this.x, this.y, this.w, cube_face_idx));
			}

			this.node_lod_level = log2(this.w);

			// There are two reasons why we need to override medea's
			// automatic BB calculation:
			//
			// - Quadtree nodes are added lazily, so initially only the root
			//   node without any mesh leaf exists. With an empty initial BB, nothing
			//   would ever be drawn, and the quadtree would therefore not get
			//   further subdivided.
			// - The transformation to spherical shape is applied outside of
			//   medea's transformation system (since the transformation
			//   is non-linear), so automatic BB calculation would not take
			//   it into account.
			this._CalculateStaticBB();
		},

		// Get the height of the terrain at a given 2D x,y coordinate
		//
		// The returned height value includes the height scaling of the terrain.
		GetHeightAt : function(x, y) {
			// Any level of the tree can respond to a query for any position
			// as long as all the terrain fits in a single texture. If this
			// change, this would need to recurse into the tree.
			x = Math.floor(x);
			y = Math.floor(y);

			var image = app.GetHeightMap(cube_face_idx_to_heightmap_idx(this.cube_face_idx));
			var data = image.GetData();
			return data[(y * image.GetWidth() + x) * 4] * TERRAIN_HEIGHT_SCALE;
		},

		// Populates the node's BB with a static AABB that reflects the sphere shape.
		//
		// Also populates this.corner_normals with normals for each of the corners.
		_CalculateStaticBB : function() {
			var terrain_bounding_boxes = compute_bounding_boxes(this.cube_face_idx);

			// Take the correct y bounding segment from the lookup table we generated
			// This gives a basic bounding box that needs to be transformed by the
			// sphere transformation.
			var height_min_max = terrain_bounding_boxes[this.node_lod_level]
				[this.y / this.w][this.x / this.w];

			var a = vec3.create([this.x * TILE_SIZE,
				height_min_max[0] * TERRAIN_HEIGHT_SCALE,
				this.y * TILE_SIZE]);
			var b = vec3.create([(this.x + this.w) *  TILE_SIZE,
				 height_min_max[1] * TERRAIN_HEIGHT_SCALE,
				 (this.y + this.h) *  TILE_SIZE]);

			// The static BB we set is given in local space. Two transformations get
			// later applied to it:
			//  i) offset to center around the plane origin
			//  ii) rotation/scale to set the correct face
			//
			// While ii) is invariant to the sphere transformation, i) is not.
			// Therefore we need to apply i) to calculate the BB and undo its
			// effect later.
			this.local_bb = medea.CreateBB(a, b);
			
			// Now transform this AABB by the sphere shape
			//
			// Note that static BBs are still multiplied with
			// the node's world transformation, i.e. the orientation
			// terrain plane need not to be taken into account.
			//
			var scratch = vec3.create();
			var vmin = vec3.create([1e10, 1e10, 1e10]);
			var vmax = vec3.create([-1e10, -1e10, -1e10]);

			this.corner_normals = new Array(4);
			for (var i = 0; i < 4; ++i) {
				this.corner_normals[i] = vec3.create();
			}

			// First consider the four inner corner points
			for (var i = 0; i < 4; ++i) {
				scratch[0] = ((i & 0x1) ? b : a)[0];
				scratch[1] = a[1];
				scratch[2] = ((i & 0x2) ? b : a)[2];

				this._ToSpherePoint(scratch);

				vec3.normalize(scratch, this.corner_normals[i]);
				for (var j = 0; j < 3; ++j) {
					vmin[j] = Math.min(vmin[j], scratch[j]);
					vmax[j] = Math.max(vmax[j], scratch[j]);
				}
			}

			// Then consider the point on the sphere tile that has the
			// highest extent in terms of world coordinates.
			var sx = saturate((16 - this.x) / this.w); 
			var sy = saturate((16 - this.y) / this.w); 
			scratch[0] = a[0] + (b[0]-a[0]) * sx;
			scratch[1] = 0;
			scratch[2] = a[2] + (b[2]-a[2]) * sy;
			vec3.add(scratch, world_offset_without_rotation);
			vec3.normalize(scratch);

			var height = b[1] + RADIUS;
			vec3.scale(scratch, height);

			for (var j = 0; j < 3; ++j) {
				vmin[j] = Math.min(vmin[j], scratch[j]);
				vmax[j] = Math.max(vmax[j], scratch[j]);
			}

			vec3.subtract(vmin, world_offset_without_rotation);
			vec3.subtract(vmax, world_offset_without_rotation);
			this.SetStaticBB(medea.CreateBB(vmin, vmax));
		},

		// Given a point local to the flat terrain, make it a point on
		// the sphere surface.
		//
		// -TERRAIN_PLANE_OFFSET, 0, -TERRAIN_PLANE_OFFSET marks the
		// center of the flat terrain.
		_ToSpherePoint : function(vec, dest) {
			var height = vec[1];
			vec[1] = 0;
			vec3.add(vec, world_offset_without_rotation);
			vec3.normalize(vec);

			var full_height = height + RADIUS;
			return vec3.scale(vec, full_height, dest);
		},

		// This is a Render() operation (not Update) since the terrain
		// rendering depends on the camera/viewport.
		//
		// Determines whether to further sub-divide or not and dynamically
		// updates the scene sub-graph under this node.
		Render : function(camera, rqmanager) {
			var cam_pos = camera.GetWorldPos();
		
			var bb = this.GetWorldBB();
			var vmin = bb[0];
			var vmax = bb[1];

			var can_subdivide = this.w != 1;

			// Quickly exclude tiles that are on the back side of the sphere.
			// This case is not caught by the regular culling (since it
			// doesn't know about the sphere topology hiding half of the
			// surface at a time).
			var visibility_status = this._DetermineVisibilityStatus(cam_pos);
			if (visibility_status === medea.VISIBLE_NONE) {
				this._SetChildrenEnabled(false);
				return;
			}

			this._SetChildrenEnabled(true);

			// If the node is partially hidden, subdivide down until a
			// threshold LOD is reached (this is a tradeoff between
			// overdraw and an increased batch count).
			var PVS_THRESHOLD_LOD = 4;
			if (can_subdivide && visibility_status == medea.VISIBLE_PARTIAL &&
				this.node_lod_level >= PVS_THRESHOLD_LOD) {
				this._Subdivide();
				return;
			}
			
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

			// Determine the LOD bracket for this node.
			//
			// It is crucial that this exactly replicates the algorithm used in
			// terrain.vs or there WILL be cracks.
			//
			// To be able to render at this level of the tree, the difference in LOD
			// between any two corners may be at most 1 or discontinuities will occur.
			var world = this.GetInverseGlobalTransform();
			var cam_height = app.GetTerrainNode().GetHeightAt(cam_pos);
			var cam_pos_local = mat4.multiplyVec3(world, cam_pos, vec3.create());

			var clod_min, clod_max;
			var corner = vec3.create();

			var xs = this.x * TILE_SIZE;
			var ys = this.y * TILE_SIZE;
			var xe = (this.x + this.w) * TILE_SIZE;
			var ye = (this.y + this.w) * TILE_SIZE;

			for (var i = 0; i < 4; ++i) {
				corner[0] = (i & 1 ? xs : xe);
				corner[1] = cam_height;
				corner[2] = (i & 2 ? ys : ye);

				corner = this._ToSpherePoint(corner);
				vec3.subtract(corner, world_offset_without_rotation, corner);
				
				var delta = vec3.subtract(cam_pos_local, corner, corner);
				var clod = calc_clod(vec3.dot(delta, delta));
				if (i === 0 || clod < clod_min) {
					clod_min = clod;
				}
				if (i === 0 || clod > clod_max) {
					clod_max = clod;
				}
			}
			
			//clod_max = Math.ceil(clod_max);
			//clod_min = 0; //Math.floor(clod_min);

			var clod_delta = clod_max - clod_min;
			var can_satisfy_lod = clod_min - this.node_lod_level >= 0;
			if ((clod_delta > 1.0 || !can_satisfy_lod) && can_subdivide) {
				this._Subdivide();
			}
			else {
				this._RenderAsSingleTile(clod_min);
			}
		},

		_DetermineVisibilityStatus : function(cam_pos) {
			var norm = vec3.normalize(vec3.create(cam_pos));
			var world = this.GetGlobalTransform();

			var count_negative = 0;
			var scratch_src = new Array(4);
			for (var i = 0; i < 4; ++i) {
				vec3.set(this.corner_normals[i], scratch_src);
				scratch_src[3] = 0;
				var cn = vec3.normalize(mat4.multiplyVec4(world, scratch_src, scratch_src));
				var d = vec3.dot(cn, norm);
				if (d < 0.0) {
					++count_negative;
				}
			}

			if (count_negative === 0) {
				return medea.VISIBLE_ALL;
			}
			else if(count_negative === 4) {
				return medea.VISIBLE_NONE;
			}
			return medea.VISIBLE_PARTIAL;
		},

		_Subdivide : function() {
			var sub_quads = this.sub_quads;
			if (sub_quads == null) {
				sub_quads = this.sub_quads = new Array(4);
				var x = this.x;
				var y = this.y;
				var w = this.w / 2;
				var is_back = this.is_back;
				var cube_face_idx = this.cube_face_idx;
				sub_quads[0] = new TerrainQuadTreeNode(x    , y    , w, is_back, cube_face_idx);
				sub_quads[1] = new TerrainQuadTreeNode(x + w, y    , w, is_back, cube_face_idx);
				sub_quads[2] = new TerrainQuadTreeNode(x    , y + w, w, is_back, cube_face_idx);
				sub_quads[3] = new TerrainQuadTreeNode(x + w, y + w, w, is_back, cube_face_idx);

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
				this.draw_tile = new TerrainTile(this.x, this.y, this.w, this.h, this.is_back, this.cube_face_idx);
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

		_SetChildrenEnabled : function(enabled) {
			for (var i = 0; i < this.children.length; ++i) {
				this.children[i].Enabled(enabled);
			}
		},
	});

	return TerrainQuadTreeNode;
}