
var InitWaterTileType = function(medea) {
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

	return WaterTile;
}
