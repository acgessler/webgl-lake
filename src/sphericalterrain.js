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

		// Given an unit vector |v|, find the index of the cube face that
		// corresponds to it.
		FindFaceIndexForUnitVector : function(v) {
			var children = this.children;
			var max_i = 0;
			var max_dot = 0;
			for (var i = 0; i < 6; ++i) {
				var axis = vec3.normalize(children[i].GetWorldYAxis());
				var dot = vec3.dot(axis, v);
				if (i === 0 || dot > max_dot) {
					max_i = i;
					max_dot = dot;
				}	
			}
			return max_i;
		},


		// For a given world-space position find the sphere face that is below
		// it under an orthogonal projection and within that face determine
		// its 2D coordinates.
		Get2DCoordinatesOnFace : function(v) {
			// TODO: this algorithm is not continuous across face boundaries
			var v_norm = vec3.normalize(v, vec3.create());

			// Find out which side to look at
			var face_idx = this.FindFaceIndexForUnitVector(v_norm);

			// Transform the vector into the local coordinate space
			// of the correct face (which is from TERRAIN_PLANE_OFFSET to -TERRAIN_PLANE_OFFSET
			// on each axis, with 0,0,0 being the center of the plane)
			var plane_anchor = this.children[face_idx];
			var trafo = plane_anchor.GetInverseGlobalTransform();

			transform_vector(trafo, v_norm);
			vec3.normalize(v_norm);

			// Project from sphere coordinates onto the flat plane for the face
			vec3.scale(v_norm, RADIUS / v_norm[1]);

			return [v_norm[0] - TERRAIN_PLANE_OFFSET, v_norm[2] - TERRAIN_PLANE_OFFSET];
		},


		// Get the height (measured from a sphere with r=RADIUS) of the terrain under
		// any given point.
		//
		// The returned height value includes the height scaling of the terrain.
		GetHeightAt : function(v) {
			var v_norm = vec3.normalize(v, vec3.create());

			// Find out which side to look at
			var face_idx = this.FindFaceIndexForUnitVector(v_norm);

			// Transform the vector into the local coordinate space
			// of the correct face (which is from TERRAIN_PLANE_OFFSET to -TERRAIN_PLANE_OFFSET
			// on each axis, with 0,0,0 being the center of the plane)
			var plane_anchor = this.children[face_idx];
			var trafo = plane_anchor.GetInverseGlobalTransform();

			transform_vector(trafo, v_norm);
			vec3.normalize(v_norm);

			// Project from sphere coordinates onto the flat plane for the face
			vec3.scale(v_norm, RADIUS / v_norm[1]);

			// Now this is a 2D problem, recurse into the quadtree to get a response
			var height = plane_anchor.children[0].GetHeightAt(
				v_norm[0] - TERRAIN_PLANE_OFFSET,
				v_norm[2] - TERRAIN_PLANE_OFFSET);
			return height;
		},

		// Get a gaussian smoothed height value for the terrain under a given point.
		//
		// The returned height value includes the height scaling of the terrain.
		GetSmoothedHeightAt : (function() {

			// Precalculate normalized coefficients for a 2D symmetric, gaussian kernel (rho=1, mean=0)
			var KERNEL_WIDTH = 3;

			var gauss_coeffs = new Array(KERNEL_WIDTH * KERNEL_WIDTH);

			var range = Math.floor(KERNEL_WIDTH / 2);
			var sum = 0.0;
			for (var j = -range, cursor = 0; j <= range; ++j) {
				for (var k = -range; k <= range; ++k, ++cursor) {
					var coeff = Math.exp(- (j*j + k*k) / 2.0 );
					sum += coeff;
					gauss_coeffs[cursor] = coeff;
				}
			}

			for (var i = gauss_coeffs.length - 1; i >= 0; --i) {
				gauss_coeffs[i] /= sum;
			}

			return function(v) {

				// TODO: this algorithm is not continuous across face boundaries
				// as sampling is always restricted to one cube face.
				var v_norm = vec3.normalize(v, vec3.create());

				// Find out which side to look at
				var face_idx = this.FindFaceIndexForUnitVector(v_norm);

				// Transform the vector into the local coordinate space
				// of the correct face (which is from TERRAIN_PLANE_OFFSET to -TERRAIN_PLANE_OFFSET
				// on each axis, with 0,0,0 being the center of the plane)
				var plane_anchor = this.children[face_idx];
				var trafo = plane_anchor.GetInverseGlobalTransform();

				transform_vector(trafo, v_norm);
				vec3.normalize(v_norm);

				// Project from sphere coordinates onto the flat plane for the face
				vec3.scale(v_norm, RADIUS / v_norm[1]);

				var x_sample_pos = v_norm[0] - TERRAIN_PLANE_OFFSET;
				var y_sample_pos = v_norm[2] - TERRAIN_PLANE_OFFSET;

				var SAMPLE_DELTA = 1.0;

				var smoothed_height = 0.0;
				for (var j = -range, cursor = 0; j <= range; ++j) {
					for (var k = -range; k <= range; ++k, ++cursor) {
						smoothed_height += gauss_coeffs[cursor] * plane_anchor.children[0].GetHeightAt(
							x_sample_pos +  SAMPLE_DELTA * j,
							y_sample_pos +  SAMPLE_DELTA * k
						);
					}
				}
				return smoothed_height;
			};
		})()
	});


	return SphericalTerrainNode;
};
