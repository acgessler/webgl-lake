var InitSphericalTerrainType = function(medea, app) {

	var TerrainQuadTreeNode = InitTerrainQuadTreeType(medea, app);

	var axes = [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	];

	// Terrain root node.
	//
	// Holds six cube faces, each of which is a 2D adaptive quad tree (TerrainQuadTreeNode). 
	// Provide infrastructure to transform the six faces to form a seamless sphere and
	// to determine the height over ground of an arbitrary camera position.
	//
	// (Vertices are actually transformed in the quadtree leaf shaders, and TerrainQuadTreeNode
	//  furtherwork knows that it is used as a sphere face s.t it can set its own BB correctly)
	var SphericalTerrainNode = medea.Node.extend({

		terrain_data : null,

		node_mask : null,

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
				plane_anchor.Translate([0, RADIUS, 0]);
				plane_anchor.AddChild(plane);
				this.AddChild(plane_anchor);
			}

			// Add a separate child that will mask the sphere shape in the
			// stencil buffer. The shaders for the terrain cube faces then
			// use this mask to ensure that high mountains do not overlap
			// the atmosphere.
			var mat_mask = medea.CreateSimpleMaterialFromShaderPair('url:data/shader/mask');
			var state = mat_mask.Pass(0).State();
			state.color_mask = [false, false, false, false];
			state.stencil_func = ['always', 0x1, 0xff];
			state.stencil_op = ['replace', 'replace', 'replace'];
			state.depth_test = false;
			state.depth_write = false;
			state.stencil_mask = 0xff;
			state.stencil_test = true;

			var mesh_mask = medea.CreateDomeMesh(mat_mask, 0.0, 16, 0);
			mesh_mask.RenderQueue(medea.RENDERQUEUE_FIRST);

			var node_mask = this.node_mask = this.AddChild();
			node_mask.AddEntity(mesh_mask);	
			node_mask.SetStaticBB(medea.BB_INFINITE);
		},


		Render : function(camera, rqmanager) {
			this._super();
			
			var node_mask = this.node_mask;

			// FPS/Ground view: no stencil mask required
			if (app.IsFpsView()) {
				this.node_mask.Enabled(false);
			}
			// Orbit view:
			// Position the half-sphere used for stencil masking to
			// face towards the camera.
			else {
				this.node_mask.Enabled(true);
				node_mask.LocalXAxis(camera.GetWorldXAxis());
				node_mask.LocalYAxis(camera.GetWorldZAxis());
				node_mask.LocalZAxis(vec3.negate(camera.GetWorldYAxis()));
				node_mask.Scale(TERRAIN_STENCIL_CLIP_RADIUS);
			}
		},

		// Get the height (measured from a sphere with r=RADIUS) of the terrain under
		// any point.
		//
		// The returned height value includes the height scaling of the terrain.
		GetHeightAt : function(v) {
			var v_norm = vec3.normalize(v, vec3.create());

			// Find out which side to look at
			var children = this.children;
			var max_i = 0;
			var max_dot = 0;
			for (var i = 0; i < 6; ++i) {
				var axis = vec3.normalize(children[i].GetWorldYAxis());
				var dot = vec3.dot(axis, v_norm);
				if (i === 0 || dot > max_dot) {
					max_i = i;
					max_dot = dot;
				}	
			}

			// Transform the vector into the local coordinate space
			// of the correct face (which is from TERRAIN_PLANE_OFFSET to -TERRAIN_PLANE_OFFSET
			// on each axis, with 0,0,0 being the center of the plane)
			var plane_anchor = children[max_i];
			var trafo = plane_anchor.GetInverseGlobalTransform();

			var v4 = [v_norm[0], v_norm[1], v_norm[2], 0.0];
			mat4.multiplyVec4(trafo, v4);
			vec3.normalize(v4, v_norm);

			// Project from sphere coordinates onto the flat plane for the face
			vec3.scale(v_norm, RADIUS / v_norm[1]);

			// Now this is a 2D problem, recurse into the quadtree to get a response
			var height = plane_anchor.children[0].GetHeightAt(v_norm[0] - TERRAIN_PLANE_OFFSET,
				v_norm[2] - TERRAIN_PLANE_OFFSET);

			return height;
		},
	});


	return SphericalTerrainNode;
};
