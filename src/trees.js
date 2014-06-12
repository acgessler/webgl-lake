
function compute_tree_mesh(medea, terrain_image, tree_image) {
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
	return mesh;
}


var InitTreeTileType = function(medea, terrain_image, tree_image) {
	var tree_mesh = compute_tree_mesh(medea, terrain_image, tree_image);

	var TreeTile = medea.Node.extend({
		x : 0,
		y : 0,
		w : 1,

		mesh : null,

		init : function(x, y, w) {
			this._super();
			this.x = x | 0;
			this.y = y | 0;
			this.w = w === undefined ? 1 : w;
			
			this.AddEntity(tree_mesh);
			this.SetStaticBB(medea.BB_INFINITE);
		},
	});

	return TreeTile;
}
