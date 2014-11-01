

var InitGrassTileType = function(medea, app) {

	var compute_grass_mesh = function() {
		var blade_count = GRASS_NODES_PER_AXIS * GRASS_NODES_PER_AXIS * GRASS_BLADES_PER_NODE;
		var size_ratio = TILE_SIZE / GRASS_NODES_PER_AXIS;

		var pos = new Float32Array(blade_count * 6 * 3);
		var uv = new Float32Array(blade_count * 6 * 2);
		var pos_cur = 0;
		var uv_cur = 0;

		for (var y = 0; y < GRASS_NODES_PER_AXIS; ++y) {
			for (var x = 0; x < GRASS_NODES_PER_AXIS; ++x) {
				var xpos = x * size_ratio - TILE_SIZE / 2;
				var ypos = y * size_ratio - TILE_SIZE / 2;

				// Place each blade with a random tilt in angle
				var angle = Math.random() * Math.PI;
				for (var i = 0; i < GRASS_BLADES_PER_NODE; ++i, angle += Math.PI * 2 / GRASS_BLADES_PER_NODE) {
					var xd = Math.cos(angle) * GRASS_BLADE_WIDTH / 2;
					var yd = Math.sin(angle) * GRASS_BLADE_WIDTH / 2;
					
					// TODO: Use instancing to put things together. This also brings this into the size range
					// in which using an IBO is feasible to rid us of the duplicates.
					pos[pos_cur++] = xpos - xd;
					pos[pos_cur++] = 0.0;
					pos[pos_cur++] = ypos - yd;
					uv[uv_cur++] = 0.0;
					uv[uv_cur++] = 1.0;

					pos[pos_cur++] = xpos + xd;
					pos[pos_cur++] = 0.0;
					pos[pos_cur++] = ypos + yd;
					uv[uv_cur++] = 1.0;
					uv[uv_cur++] = 1.0;

					pos[pos_cur++] = xpos + xd;
					pos[pos_cur++] = GRASS_BLADE_HEIGHT;
					pos[pos_cur++] = ypos + yd;
					uv[uv_cur++] = 1.0;
					uv[uv_cur++] = 0.0;

					pos[pos_cur++] = xpos + xd;
					pos[pos_cur++] = GRASS_BLADE_HEIGHT;
					pos[pos_cur++] = ypos + yd;
					uv[uv_cur++] = 1.0;
					uv[uv_cur++] = 0.0;

					pos[pos_cur++] = xpos - xd;
					pos[pos_cur++] = GRASS_BLADE_HEIGHT;
					pos[pos_cur++] = ypos - yd;
					uv[uv_cur++] = 0.0;
					uv[uv_cur++] = 0.0;

					pos[pos_cur++] = xpos - xd;
					pos[pos_cur++] = 0.0;
					pos[pos_cur++] = ypos - yd;
					uv[uv_cur++] = 0.0;
					uv[uv_cur++] = 1.0;
				}
			}
		}

		var vertex_channels = {
			positions: pos,
			uvs : [uv]
		};

		var mat = medea.CreateSimpleMaterialFromShaderPair('url:data/shader/grass', {
			texture : medea.CreateTexture('url:/data/textures/gras2.png', null),
			cam_flat_2d_offset : function() {
				var v = app.Get2DCoordinatesOnFaceUnderCamera();
				return v;
			},
			heightmap : medea.CreateTexture('url:data/textures/heightmap' + 0 + '.png', null,
			// We don't need MIPs for the heightmap anyway
			medea.TEXTURE_FLAG_NO_MIPS |
			// Hint to medea that the texture will be accessed
			// from within a vertex shader.
			medea.TEXTURE_VERTEX_SHADER_ACCESS |
			medea.TEXTURE_FLAG_CLAMP_TO_EDGE,

			// Only one channel is required
			medea.TEXTURE_FORMAT_LUM),
		});
		var mesh = medea.CreateSimpleMesh(vertex_channels, null, mat);
		mesh.Material().Pass(0).SetDefaultAlphaBlending();
		mesh.RenderQueue(medea.RENDERQUEUE_ALPHA);
		return mesh;
	};


	var GrassTile = medea.Node.extend({
		mesh : null,

		init : function(x) {
			this._super();
			
			var mesh = this.mesh = compute_grass_mesh();
			this.AddEntity(mesh);
			this.SetStaticBB(medea.BB_INFINITE);
		},

		Render : function(camera, rqmanager) {
			this._super(camera, rqmanager);

			var state = this.mesh.Material().Pass(0).State();
			this.mesh.Material().Pass(0).CullFace(false);

			// In FPS/ground mode, no stencil clipping takes place
			if (app.IsFpsView()) {
				state.stencil_test = false;
			}
		},
	});

	return GrassTile;
}
