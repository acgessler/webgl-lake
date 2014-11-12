
function InitTreeTileType(medea, app) {

	var tree_meshes = {};
	var compute_tree_mesh = function(cube_face_idx) {
		var heightmap_idx = cube_face_idx_to_heightmap_idx(cube_face_idx);

		var key = heightmap_idx;
		if (tree_meshes[key]) {
			return tree_meshes[key];
		}

		var terrain_image = app.GetHeightMap(heightmap_idx);
		var tree_image = app.GetTreeMap(heightmap_idx);

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
				if (data[c] === 0) {
					++tree_count;
				}
			}
		}

		console.log('Totally ' + tree_count + ' trees ' + ' for heightmap index ' + heightmap_idx);

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
				if (data[c] !== 0) {
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
		tree_meshes[key] = mesh;
		return mesh;
	};


	var TreeTile = medea.Node.extend({
		x : 0,
		y : 0,
		w : 1,

		mesh : null,

		init : function(x, y, w, cube_face_idx) {
			this._super();
			this.x = x | 0;
			this.y = y | 0;
			this.w = w === undefined ? 1 : w;
			
			var mesh = this.mesh = compute_tree_mesh(cube_face_idx);
			this.AddEntity(mesh);
			this.SetStaticBB(medea.BB_INFINITE);
		},

		Render : function(camera, rqmanager) {
			this._super();

			var state = this.mesh.Material().Pass(0).State();

			// In FPS/ground mode, no stencil clipping takes place
			if (app.IsFpsView()) {
				state.stencil_test = false;
			}
			// In Orbit mode, all terrain is clipped against the atmosphere contour
			else {
				state.stencil_func = ['equal', 0x1, 0xff];
				state.stencil_test = true;
			}
		},
	});

	return TreeTile;
}



