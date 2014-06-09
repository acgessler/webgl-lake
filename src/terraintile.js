var InitTerrainTileType = function(medea) {
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

	return TerrainTile;
}
