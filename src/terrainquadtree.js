

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

		cube_face_idx : null,


		/////////////////////////////////////////////////////
		// All of the following are arranged such that two
		// consecutive elements correspond to an edge
		// of the quad.
		/////////////////////////////////////////////////////

		// Local position of each lower/upper corner of the bounding box
		lower_corner_points : null,
		upper_corner_points : null,

		// Normalized |lower_corner_points|
		corner_normals : null,

		worldspace_lower_corner_points : null,
		worldspace_upper_corner_points : null,
		worldspace_corner_normals : null,

		init : function(x, y, w, is_back, cube_face_idx) {
			this._super();
			this.x = x | 0;
			this.y = y | 0;
			this.w = w === undefined ? 1 : w;
			this.is_back = is_back;
			this.cube_face_idx = cube_face_idx;

			if (this.w === TILE_COUNT) {
				this.AddChild(new WaterTile(this.x, this.y, this.w, this.w, cube_face_idx));
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

		// Get the height of the terrain at a given 2D x,y coordinate.
		//
		// The returned height value includes the height scaling of the terrain.
		GetHeightAt : function(x, y) {
			// Any level of the tree can respond to a query for any position
			// as long as all the terrain fits in a single texture. If this
			// changed, this would need to recurse into the tree to find
			// someone with high-resolution imaginery.
			var image = app.GetHeightMap(cube_face_idx_to_heightmap_idx(this.cube_face_idx));
			var width = image.GetWidth();
			x0 = Math.floor(x);
			y0 = Math.floor(y);

			// Assume terrain wrapping
			x1 = (x0 + 1) % width;
			y1 = (y0 + 1) % width;

			// Perform a bilinear interpolation of the source texture
			// Note that this is different from what GetSmoothedHeightAt() does:
			// interpolation happens at source texture resolution, not relative
			// to global world resolution.
			var fx = x - x0;
			var fy = y - y0;
			
			var data = image.GetData();
			var height_at = function(xx, yy) {
				return data[(yy * width + xx) * 4];
			};	

			var x0y0 = height_at(x0, y0);
			var x1y0 = height_at(x1, y0);
			var x0y1 = height_at(x0, y1);
			var x1y1 = height_at(x1, y1);

			var smoothed_height = lerp(lerp(x0y0, x1y0, fx), lerp(x0y1, x1y1, fx), fy);
			return smoothed_height * TERRAIN_HEIGHT_SCALE;
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
				 (this.y + this.w) *  TILE_SIZE]);

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
			// the node's world transformation, i.e. the orientation of the 
			// terrain plane need not to be taken into account.
			//
			var scratch = vec3.create();
			var vmin = vec3.create([1e10, 1e10, 1e10]);
			var vmax = vec3.create([-1e10, -1e10, -1e10]);

			this.corner_normals = new Array(4);
			this.lower_corner_points = new Array(4);
			this.upper_corner_points = new Array(4);
			for (var i = 0; i < 4; ++i) {
				this.corner_normals[i] = vec3.create();
				this.lower_corner_points[i] = vec3.create();
				this.upper_corner_points[i] = vec3.create();
			}

			// First consider the four lower corner points
			for (var i = 0; i < 4; ++i) {
				scratch[0] = ((i == 1 || i == 2) ? b : a)[0];
				scratch[1] = a[1];
				scratch[2] = ((i >= 2) ? b : a)[2];

				this._ToSpherePoint(scratch);

				vec3.set(scratch, this.lower_corner_points[i]);
				vec3.normalize(scratch, this.corner_normals[i]);
				vec3.scale(this.corner_normals[i], RADIUS + b[1], this.upper_corner_points[i]);

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
			scratch[1] = b[1];
			scratch[2] = a[2] + (b[2]-a[2]) * sy;

			this._ToSpherePoint(scratch);

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
		Render : (function() {
			var corner = [
				vec3.create(),
				vec3.create(),
				vec3.create(),
				vec3.create()
			];

			var scratch = vec3.create();
			return function(camera, rqmanager, vis) {
				this._UpdateWorldSpaceCorners();
				var cam_pos = camera.GetWorldPos();
			
				var bb = this.GetWorldBB();
				var vmin = bb[0];
				var vmax = bb[1];

				var can_subdivide = this.w !== 1;

				// Always sub-divide if the camera position is in the node
				if (cam_pos[0] >= vmin[0] && cam_pos[0] < vmax[0] &&
					cam_pos[1] >= vmin[1] && cam_pos[1] < vmax[1] &&
					cam_pos[2] >= vmin[2] && cam_pos[2] < vmax[2]) {

					this._SetChildrenEnabled(can_subdivide);
					if (can_subdivide) {
						this._Subdivide();
					}
					else {
						this._RenderAsSingleTile(0);
					}
					return;
				}

				// Exclude tiles that are not visible because they are too
				// far away to be visible given the sphere shape.
				//
				// This case is not caught by the regular culling, which
				// does not know about the sphere topology.
				var visibility_status = this._DetermineVisibilityStatus(cam_pos);
				if (visibility_status === medea.VISIBLE_NONE) {
					this._SetChildrenEnabled(false);
					return;
				}
				else if(vis === medea.VISIBLE_PARTIAL && visibility_status === medea.VISIBLE_ALL) {
					visibility_status = medea.VISIBLE_PARTIAL;
				}

				this._SetChildrenEnabled(true);

				// Also, we always sub-divide if the LOD for the
				// entire tile (which spans multiple 1x1 tiles) would be
				// above the maximum LOD level that we can draw.
				if (can_subdivide && this.w > (1 << (COUNT_LOD_LEVELS-1))) {
					this._Subdivide();
					return;
				}

				// Determine the LOD bracket (i.e. min and max LOD) for this node.
				//
				// It is crucial that this exactly replicates the algorithm used in
				// terrain.vs or there WILL be cracks.
				//
				// To be able to render at this level of the tree, the difference in LOD
				// between any two corners may be at most 1 or discontinuities will occur.
				//
				//  - The maximum LOD of a tile is found at one of the corners
				//  - The minimum LOD of a tile is found at the point
				//    that is closest to the camera. This point must be an edge point
				//    (since we handled the case that the camera is within quad earlier)
				var cam_height = app.GetTerrainHeightUnderCamera();
				var clod_min, clod_max;
	
				for (var i = 0; i < 4; ++i) {
					vec3.set(this.worldspace_corner_normals[i], corner[i]);
					vec3.scale(corner[i], RADIUS + cam_height);
					
					var delta = vec3.subtract(cam_pos, corner[i], scratch);
					var clod = calc_clod(vec3.dot(delta, delta));
					if (i === 0 || clod > clod_max) {
						clod_max = clod;
					}
				}

				for (var i = 0; i < 4; ++i) {
					var p0 = corner[i];
					var p1 = corner[(i+1) % 4];
					var u = find_closest_point(p0, p1, cam_pos);
					if (u === null) {
						clod_min = clod_max;
					}
					u = saturate(u);
					vec3.lerp(p0, p1, u, scratch);

					var delta = vec3.subtract(cam_pos, scratch, scratch);
					var clod = calc_clod(vec3.dot(delta, delta));
					if (i === 0 || clod < clod_min) {
						clod_min = clod;
					}
				}
				
				clod_max = Math.ceil(clod_max);
				clod_min = Math.floor(clod_min);

				var clod_delta = clod_max - clod_min;
				var node_lod_delta = clod_min - this.node_lod_level;
				var can_satisfy_lod = node_lod_delta >= 0;

				// Now look for reasons to subdivide further
				var subdivide = !can_satisfy_lod;

				// If the node is partially hidden, subdivide down until a
				// threshold LOD is reached (this is a tradeoff between
				// drawing off screen / overdraw and an increased batch count).
				var PVS_THRESHOLD_LOD = app.GetGroundDistance() < 20 ? 3 : 5;
				subdivide = subdivide || (
					visibility_status == medea.VISIBLE_PARTIAL &&
					node_lod_delta <= 1 &&
					this.node_lod_level >= PVS_THRESHOLD_LOD);

				// |clod_delta| > 1.0 can cause cracks, but not dividing saves batches.
				// Thus, avoid only if close to the camera (i.e. low LOD)
				subdivide = subdivide || (clod_delta > 1.0 && clod_min === 0);

				if (can_subdivide && subdivide) {
					this._Subdivide();
				}
				else {
					this._RenderAsSingleTile(clod_min);
				}
			};
		})(),

		_UpdateWorldSpaceCorners : function() {
			if (this.worldspace_corner_normals) {
				return;
			}

			// Note: world space points could not generated in _CalculateStaticBB
			// as the node is not yet attached to the scenegraph at this time.

			this.worldspace_corner_normals = new Array(4);
			this.worldspace_lower_corner_points = new Array(4);
			this.worldspace_upper_corner_points = new Array(4);
			var world = this.GetGlobalTransform();

			for (var i = 0; i < 4; ++i) {
				var nor = this.worldspace_corner_normals[i] = vec3.create();
				transform_vector(world, this.corner_normals[i], nor);
				vec3.normalize(nor);

				var point = this.worldspace_lower_corner_points[i] = vec3.create();
				vec3.subtract(this.lower_corner_points[i], world_offset_without_rotation, point);
				mat4.multiplyVec3(world, point, point);

				point = this.worldspace_upper_corner_points[i] = vec3.create();
				vec3.subtract(this.upper_corner_points[i], world_offset_without_rotation, point);
				mat4.multiplyVec3(world, point, point);
			}
		},

		// Classify this tile w.r.t a world space |cam_pos| as one of
		// {medea.VISIBLE_ALL, medea.VISIBLE_NONE, medea.VISIBLE_PARTIAL}
		//
		// This augments regular culling by taking the sphere geometry into account.
		_DetermineVisibilityStatus : (function() {
			var scratch_src = new Float32Array(4);
			var zero = [0, 0, 0];
			return function(cam_pos) {
				var norm = vec3.normalize(vec3.create(cam_pos));

				var count_negative = 0;
				for (var i = 0; i < 4; ++i) {
					// First check against the dot product of the corner normals.
					// If a cube face is > 45 degrees apart from cameras up it
					// cannot be visible (assuming sane terrain elevation)
					var d = vec3.dot(this.worldspace_corner_normals[i], norm);
					if (d < 0.52 /* cos(45) */) {
						++count_negative;
						continue;
					}
					
					// Perform a line segment - sphere test on the ray from the camera position
					// to the corner of the tile.
					var corner = this.worldspace_upper_corner_points[i];
					var u = find_closest_point(cam_pos, corner, zero);

					if (u === null || u <= 0.01 || u >= 0.99) {
						continue;
					}

					vec3.lerp(cam_pos, corner, u, scratch_src);

					// TODO: this does not take elevations on the line between the camera and
					// the corner point into account. To further optimize, we could sweep
					// across the line.
					if (vec3.length(scratch_src) > RADIUS) {
						continue;
					}

					++count_negative;
				}

				if (count_negative === 0) {
					return medea.VISIBLE_ALL;
				}
				else if(count_negative === 4) {
					return medea.VISIBLE_NONE;
				}
				return medea.VISIBLE_PARTIAL;
			};
		})(),

		_Subdivide : function() {
			var sub_quads = this.sub_quads;
			if (sub_quads === null) {
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
				this.draw_tile = new TerrainTile(this.x, this.y, this.w, this.w, this.is_back, this.cube_face_idx);
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