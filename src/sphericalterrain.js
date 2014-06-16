var InitSphericalTerrainType = function(medea, terrain_image, tree_image) {

	var TerrainQuadTreeNode = InitTerrainQuadTreeType(medea, terrain_image, tree_image);

	var axes = [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	];

	// Terrain root node.
	//
	// Holds six quad tree nodes and transforms them to form a seamless sphere.
	var SphericalTerrainNode = medea.Node.extend({

		terrain_data : null,

		init : function() {
			this._super();

			//this.terrain_data = terrain_image

			for (var i = 0; i < 6; ++i) {
				var is_back = i >= 3;
				var plane = new TerrainQuadTreeNode(0, 0, TILE_COUNT, is_back, i);
				plane.Translate([TERRAIN_PLANE_OFFSET, 0, TERRAIN_PLANE_OFFSET]);
				var plane_anchor = medea.CreateNode();
				
				plane_anchor.Rotate(Math.PI * 0.5, axes[i % 3]);

				// Hardcoded hacks to rotate the patches to be seamless
				if (i === 1) {
					plane_anchor.Rotate(Math.PI * -0.5, axes[1]);
				}
				else if (i === 2) {
					plane_anchor.Rotate(Math.PI * -0.5, axes[1]);
				}
				else if (i === 5) {
					plane_anchor.Rotate(Math.PI * -0.5, axes[1]);
				}

				if ( is_back ) {
					// Mirroring on 2 axes means that the face winding is
					// still the same, so we don't need to change culling
					// settings. This need to be taken into account when
					// creating the terrain image data though.
					plane_anchor.Scale([-1, -1, 1]);
				}
				plane_anchor.Translate([0, TERRAIN_PLANE_WIDTH / 2, 0]);
				plane_anchor.AddChild(plane);
				this.AddChild(plane_anchor);
			}
		},

		// Get the height (measured from RADIUS) of the terrain under any point.
		//
		// The returned height value includes any y scalings.
		GetHeightAt : function(v) {
			var v_norm = vec.normalize(v, vec3.create());

			// Find out which side to look at

			return RADIUS;
		},
	});


	return SphericalTerrainNode;
};
