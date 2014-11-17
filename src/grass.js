

var InitGrassTileType = function(medea, app) {

	var GrassTile = medea.Node.extend({
		mesh : null,

		init : function(x) {
			this._super();
			
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
					var angle = 0; //Math.random() * Math.PI;
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

			var grass_diagonal_shift_vectors = [
				[ 1,  1],
				[-1,  1],
				[-1, -1],
				[ 1, -1],
			];

			var mat = medea.CreateSimpleMaterialFromShaderPair('url:data/shader/grass', {
				texture : medea.CreateTexture('url:/data/textures/gras_atlas.png', null),
				vegetation_map : medea.CreateTexture('url:/data/textures/vegetation_map0.jpg', null,
					medea.TEXTURE_FLAG_NO_MIPS |
					// Hint to medea that the texture will be accessed
					// from within a vertex shader.
					medea.TEXTURE_VERTEX_SHADER_ACCESS |
					medea.TEXTURE_FLAG_CLAMP_TO_EDGE),
				
				camera_rotation_offset : function() {
					var vpos = app.Get2DCoordinatesOnFaceUnderCamera();
					var vdir = app.Get2DDirectionOnFaceUnderCamera();

					var selected_shift;
					var max_dot = 0;
					for (var i = 0; i < 4; ++i) {
						var shift = grass_diagonal_shift_vectors[i];
						var dot = vdir[0] * shift[0] + vdir[1] * shift[1];
						if (i === 0 || dot > max_dot) {
							max_dot = dot;
							selected_shift = shift;
						}
					}

					var shift_amount = 24;

					vpos[0] = Math.floor(vpos[0]) - selected_shift[0] * shift_amount;
					vpos[1] = Math.floor(vpos[1]) - selected_shift[1] * shift_amount;

					var mrot = mat3.identity(mat3.create());
					mrot[6] = vpos[0];
					mrot[7] = vpos[1];

					if (selected_shift[1] < 0) {
						mrot[4] = -1;
					}
					return mrot;
				},

				terrain_face_transform : function() {
					var spherical_terrain = app.GetTerrainNode();
					var vpos = app.GetCameraPosition();
					var face_index = spherical_terrain.FindFaceIndexForUnitVector(vec3.normalize(vpos));
					var face_terrain = spherical_terrain.GetFace(face_index);

					return face_terrain.GetGlobalTransform();
				},
				heightmap : get_terrain_heightmap(0),
			});

			var mesh = this.mesh = medea.CreateSimpleMesh(vertex_channels, null, mat);
			var pass = mesh.Material().Pass(0);
			pass.SetDefaultAlphaBlending();
			pass.CullFace(false);

			mesh.RenderQueue(medea.RENDERQUEUE_ALPHA_LATE);

			this.AddEntity(mesh);
			this.SetStaticBB(medea.BB_INFINITE);

			this.EnabledIf(function() {
				var height_over_ground = app.GetGroundDistance();
				// Do not bother rendering grass if the camera is too far away
				// s.t. it would render at full transparency
				return height_over_ground < GRAS_FADE_END * 1.5;
			});
		},
	});

	return GrassTile;
}
