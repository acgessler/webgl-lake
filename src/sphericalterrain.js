var InitSphericalTerrainType = function(medea, app) {

	// Canonical axes
	var axes = [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	];

	// Terrain root node.
	//
	// Holds six cube faces, each of which is a 2D adaptive quad tree (TerrainQuadTreeNode). 
	// Provides infrastructure to transform the six faces to form a seamless sphere and
	// for determining the height over ground of an arbitrary camera position.
	//
	// (TerrainQuadTreeNode knows that it is used as a sphere face and sets its
	//  own BB correctly)
	var SphericalTerrainNode = medea.Node.extend({

		face_anchors : null,
		node_mask : null,

		init : function() {
			this._super();

			this.AddChild(new DetailTreeNode());
			this.face_anchors = new Array(6);

			for (var i = 0; i < 6; ++i) {
				var is_back = i >= 3;
				var face = new TerrainQuadTreeNode(0, 0, TILE_COUNT, is_back, i);
				face.Translate([TERRAIN_PLANE_OFFSET, 0, TERRAIN_PLANE_OFFSET]);
				var face_anchor = medea.CreateNode();
				
				face_anchor.Rotate(Math.PI * 0.5, axes[i % 3]);

				// Hardcoded hacks to rotate the patches to be seamless
				if (i === 1) {
					face_anchor.Rotate(Math.PI * -0.5, axes[1]);
				}
				else if (i === 2) {
					face_anchor.Rotate(Math.PI * -0.5, axes[1]);
				}
				else if (i === 5) {
					face_anchor.Rotate(Math.PI * -0.5, axes[1]);
				}

				if ( is_back ) {
					// Mirroring on 2 axes means that the face winding is
					// still the same, so we don't need to change culling
					// settings. This need to be taken into account when
					// creating the terrain image data though.
					face_anchor.Scale([-1, -1, 1]);
				}
				face_anchor.Translate([0, RADIUS, 0]);
				face_anchor.AddChild(face);
				this.AddChild(face_anchor);
				this.face_anchors[i] = face_anchor;
			}

			// Add a separate child that will mask the sphere shape in the
			// stencil buffer. The shaders for the terrain cube faces then
			// use this mask to ensure that high mountains do not overlap
			// the atmosphere in orbital views.
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


		// Gets the root TerrainQuadTreeNode for each face
		GetFace : function(face_idx) {
			return this.face_anchors[face_idx].children[0];
		},

		// Gets the root TerrainQuadTreeNode for each face
		GetFaceAnchor : function(face_idx) {
			return this.face_anchors[face_idx];
		},

		// Medea render 
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
			var face_anchors = this.face_anchors;
			var max_i = 0;
			var max_dot = 0;
			for (var i = 0; i < 6; ++i) {
				var axis = vec3.normalize(face_anchors[i].GetWorldYAxis());
				var dot = vec3.dot(axis, v);
				if (i === 0 || dot > max_dot) {
					max_i = i;
					max_dot = dot;
				}	
			}
			return max_i;
		},

		// For a given world-space position |v| find the world-space positions
		// of all trees anchors within |radius| on the surface (approximately)
		GetTreesInRadius : function(v, radius) {
			var face_coords = this.Get2DCoordinatesOnFace(v);
			var face_idx = this.FindFaceIndexForUnitVector(vec3.normalize(v, vec3.create()));
			var tree_image = app.GetTreeMap(0 /*face_idx TODO */);

			// TODO: de-duplicate from trees.js
			var data = tree_image.GetData(), w = tree_image.GetWidth(), h = tree_image.GetHeight();
			var size_ratio = TERRAIN_PLANE_WIDTH / TREE_MAP_WIDTH;

			var scaled_radius = radius / size_ratio;
			var scaled_radius_sq = scaled_radius * scaled_radius;

			var scaled_center_x = face_coords[0] / size_ratio;
			var scaled_center_y = face_coords[1] / size_ratio;

			var ymin = Math.floor(clamp(0, h, scaled_center_y - scaled_radius));
			var ymax = Math.ceil (clamp(0, h, scaled_center_y + scaled_radius));
			var xmin = Math.floor(clamp(0, w, scaled_center_x - scaled_radius));
			var xmax = Math.ceil (clamp(0, w, scaled_center_x + scaled_radius));

			var trees = [];

			for (var y = ymin; y < ymax; ++y) {
				var yd = y - scaled_center_y;
				yd *= yd;

				for (var x = xmin; x < xmax; ++x) {
					var xd = x - scaled_center_x;
					xd *= xd;

					if (xd + yd > scaled_radius_sq) {
						continue;
					}

					if (data[(y * w + x) * 4] === 0) {
						// This is a tree, find the height under it and emit
						// the world-space position of the tree anchor.
						var face_anchor = this.GetFaceAnchor(face_idx);
						var height = face_anchor.children[0].GetHeightAt(x * size_ratio, y * size_ratio);

						var x_offset = (x * size_ratio) + TERRAIN_PLANE_OFFSET;
						var y_offset = (y * size_ratio) + TERRAIN_PLANE_OFFSET;

						var trafo = face_anchor.GetGlobalTransform();
						var v = vec3.create([x_offset, RADIUS, y_offset]);
						transform_vector(trafo, v);
						vec3.normalize(v);
						vec3.scale(v, RADIUS + height);

						trees.push(v);
					}
				}
			}
			return trees;
		},

		// For a given world-space position find the sphere face that is below
		// it under an orthogonal projection and within that face determine
		// the 2D coordinates of the camera in heightmap coordinates.
		Get2DCoordinatesOnFace : function(v) {
			var v_norm = vec3.normalize(v, vec3.create());

			// Find out which side to look at
			var face_idx = this.FindFaceIndexForUnitVector(v_norm);

			// Transform the vector into the local coordinate space
			// of the correct face (which goes from TERRAIN_PLANE_OFFSET to -TERRAIN_PLANE_OFFSET
			// on each axis, with 0,0,0 being the center of the face)
			var face_anchor = this.GetFaceAnchor(face_idx);
			var trafo = face_anchor.GetInverseGlobalTransform();

			transform_vector(trafo, v_norm);
			vec3.normalize(v_norm);

			// Project from sphere coordinates onto the flat face for the face
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
			// of the correct face (which goes from TERRAIN_PLANE_OFFSET to -TERRAIN_PLANE_OFFSET
			// on each axis, with 0,0,0 being the center of the face)
			var face_anchor = this.GetFaceAnchor(face_idx);
			var trafo = face_anchor.GetInverseGlobalTransform();

			transform_vector(trafo, v_norm);
			vec3.normalize(v_norm);

			// Project from sphere coordinates onto the flat face for the face
			vec3.scale(v_norm, RADIUS / v_norm[1]);

			// Now this is a 2D problem, recurse into the quadtree to get a response
			var height = face_anchor.children[0].GetHeightAt(
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
				// on each axis, with 0,0,0 being the center of the face)
				var face_anchor = this.GetFaceAnchor(face_idx);
				var trafo = face_anchor.GetInverseGlobalTransform();

				transform_vector(trafo, v_norm);
				vec3.normalize(v_norm);

				// Project from sphere coordinates onto the flat face for the face
				vec3.scale(v_norm, RADIUS / v_norm[1]);

				var x_sample_pos = v_norm[0] - TERRAIN_PLANE_OFFSET;
				var y_sample_pos = v_norm[2] - TERRAIN_PLANE_OFFSET;

				var SAMPLE_DELTA = 1.0;

				var smoothed_height = 0.0;
				for (var j = -range, cursor = 0; j <= range; ++j) {
					for (var k = -range; k <= range; ++k, ++cursor) {
						smoothed_height += gauss_coeffs[cursor] * face_anchor.children[0].GetHeightAt(
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
