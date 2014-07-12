var InitTerrainTileType = function(medea, app) {
	// Leaf that actually draws a terrain tile (of any power-of-two size)
	// Could be part of TerrainQuadTreeNode, but factored out to keep things easy.
	//
	// At this point the fact that the terrain is transformed to be a sphere-part
	// is not of relevance except that the vertex shader used for drawing the
	// tile does said transformation.
	//
	// All other hacks
	var TerrainTile = medea.Node.extend({
		x : 0,
		y : 0,
		w : 1,
		h : 1,
		mesh : null,

		lod_min : -1,
		lod_max : -1,

		init : function(x, y, w, h, is_back, climate) {
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
			var material = medea.CloneMaterial(get_prototype_terrain_material(climate
				), 
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

			var pass = material.Pass(0);

			pass.Set("terrain_uv_offset_scale", [xs, ys, ws, hs]);
			pass.Set("uv_scale", this.w);
			pass.Set("terrain_height_under_cam", function() {
				return app.GetTerrainHeightUnderCamera();
			});

			// Cull mode does not change because back-facing faces are
			// mirrored on exactly two axes, making the face winding the same.
			pass.CullFaceMode("back");
			pass.CullFace(true);

			// Attach the mesh to the scenegraph and position the tile correctly
			
			// There is no need to scale y by TERRAIN_HEIGHT_SCALE, this is done
			// separately in the shader, after height is available.
			this.Translate([xs, 0, ys]);
			this.Scale([this.w, 1.0, this.h]);
			this.AddEntity(mesh);

			// No further culling in the leafs.
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


		SetLODRange : function(lod_min, lod_max) {
			this.lod_min = lod_min;
			this.lod_max = lod_max;
			this.mesh.Material().Pass(0).Set("lod_range", [lod_min, lod_max, 1 << lod_min, 1 << lod_max]);
		},
	});

	return TerrainTile;
}
