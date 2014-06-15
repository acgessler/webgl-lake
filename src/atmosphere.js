var InitAtmosphereNodeType = function(medea) {
	// Leaf that actually draws a terrain tile (of any power-of-two size)
	// Could be part of TerrainQuadTreeNode, but factored out to keep things easy.
	var AtmosphereNode = medea.Node.extend({

		camera : null,

		init : function() {
			this._super();

			// Compile all 4 different permutations of shaders:
			// (ground, atmosphere) X (ground, atmosphere)
			var shader = 'url:data/shader/atmosphere';
			var mat_ground = medea.CreateSimpleMaterialFromShaderPair(shader,
				{}, null,
				{
					CAMERA_IN_SPACE : 1
				}
			);

			var mat_sky = medea.CreateSimpleMaterialFromShaderPair(shader,
				{}, null,
				{
					CAMERA_IN_SPACE : 1,
					SKY : 1
				}
			);
/*
			var mat_ground_from_ground = medea.CreateSimpleMaterialFromShaderPair(shader,
				{}, null,
				{
				}
			); */

			var mat_sky_from_ground = medea.CreateSimpleMaterialFromShaderPair(shader,
				{}, null,
				{
					SKY : 1
				}
			);

			var mesh_ground = medea.CreateDomeMesh(mat_ground, 0.0, 48, 6);
			var mesh_sky = medea.CloneMesh(mesh_ground, mat_sky_from_ground);
			mesh_ground.RenderQueue(medea.RENDERQUEUE_ALPHA_LATE);
			mesh_sky.RenderQueue(medea.RENDERQUEUE_ALPHA_LATE);

			var pass = mat_sky.Pass(0);
			pass.SetDefaultAlphaBlendingNotPremultiplied();
			pass.DepthWrite(true);
			//pass.DepthTest(false);
			pass.CullFaceMode("front");
			pass.CullFace(true);
			mat_sky_from_ground.Pass(0).ShareStateWith(pass);

			this._SetupConstants(pass);

			mat_ground.SetIgnoreUniformVarLocationNotFound();
			mat_ground.Pass(0).CopyConstantsFrom(pass);

			//mat_ground_from_ground.SetIgnoreUniformVarLocationNotFound();
			//mat_ground_from_ground.Pass(0).CopyConstantsFrom(pass);

			mat_sky_from_ground.SetIgnoreUniformVarLocationNotFound();
			mat_sky_from_ground.Pass(0).CopyConstantsFrom(pass);

			pass = mat_ground.Pass(0);
			pass.BlendOp('add');
			pass.BlendFunc('one', 'one_minus_src_alpha');
			pass.BlendEnable(true);
			pass.DepthWrite(true);
			pass.DepthTest(false);
			pass.CullFaceMode("back");
			pass.CullFace(true);
			//mat_ground_from_ground.Pass(0).ShareStateWith(pass);

			var node_ground = this.AddChild();
			node_ground.AddEntity(mesh_ground);
			node_ground.Scale(RADIUS_GROUND);

			var node_sky = this.AddChild();
			node_sky.AddEntity(mesh_sky);
			node_sky.Scale(OUTER_RADIUS);

		
			this.SetStaticBB(medea.BB_INFINITE);
		},

		Render : function(camera, rqmanager) {
			this._super();
			this.camera = camera;

			this.LocalXAxis(camera.GetWorldXAxis());
			this.LocalYAxis(camera.GetWorldYAxis());
			this.LocalZAxis(camera.GetWorldZAxis());
		},

		_SetupConstants : function(pass) {
			var pow = Math.pow;
			pass.Set("v3InvWavelength", [1.0 / pow(0.650, 4.0), 1.0 / pow(0.570, 4.0), 1.0 / pow(0.475, 4.0)]);

			var outer = this;

			// Pass in camera height and height square as a function to update it once a frame
			pass.Set("fCameraHeight2", function() {
				var l = vec3.length(outer.camera.GetWorldPos());
				return l * l;
			});
			pass.Set("fCameraHeight", function() {
				var l = vec3.length(outer.camera.GetWorldPos());
				return l;
			});
			pass.Set("fInnerRadius", RADIUS_GROUND);
			pass.Set("fInnerRadius2", RADIUS_GROUND * RADIUS_GROUND);

			pass.Set("fKrESun", 0.0025 * 20.0);
			pass.Set("fKmESun", 0.0010 * 20.0);
			pass.Set("fKr4PI", 0.0025 * 4.0 * 3.141592653);
			pass.Set("fKm4PI", 0.0010 * 4.0 * 3.141592653);
			pass.Set("fScale", 1.0 / (OUTER_RADIUS - RADIUS_GROUND));
			pass.Set("fScaleDepth", 0.25);
			pass.Set("fScaleOverScaleDepth", 4.0 / (OUTER_RADIUS - RADIUS_GROUND));
			pass.Set("g", -0.95);
			pass.Set("g2", -0.95 * -0.95);
		}
	});

	return AtmosphereNode;
};