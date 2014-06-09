var InitAtmosphereNodeType = function(medea) {
	// Leaf that actually draws a terrain tile (of any power-of-two size)
	// Could be part of TerrainQuadTreeNode, but factored out to keep things easy.
	var AtmosphereNode = medea.Node.extend({

		init : function(camera) {
			this._super();
			var mat_ground = medea.CreateSimpleMaterialFromShaderPair('url:data/shader/atmosphere', {}, null,
				{
					CAMERA_IN_SPACE : 1
				});

			var mat_sky = medea.CreateSimpleMaterialFromShaderPair('url:data/shader/atmosphere', {}, null,
				{
					CAMERA_IN_SPACE : 1,
					SKY : 1
				});

			var mesh_ground = medea.CreateDomeMesh(mat_ground, 0.0, 64);
			var mesh_sky = medea.CloneMesh(mesh_ground, mat_sky);

			var pass = mesh_sky.Material().Pass(0);
			pass.SetDefaultAlphaBlending();
			pass.DepthWrite(true);
			//pass.DepthTest(false);
			pass.CullFaceMode("front");
			pass.CullFace(true);

			var pow = Math.pow;
			pass.Set("v3InvWavelength", [1.0 / pow(0.650, 4.0), 1.0 / pow(0.570, 4.0), 1.0 / pow(0.475, 4.0)]);
			//pass.Set("fCameraHeight", RADIUS_GROUND * 1.5);
			pass.Set("fCameraHeight2", function() {
				var l = vec3.length(camera.GetWorldPos());
				return l * l;
			});
			pass.Set("fInnerRadius", RADIUS_GROUND);
			//pass.Set("fInnerRadius2", RADIUS_GROUND * RADIUS_GROUND);

			pass.Set("fOuterRadius", OUTER_RADIUS);
			pass.Set("fOuterRadius2", OUTER_RADIUS * OUTER_RADIUS);

			pass.Set("fKrESun", 0.0025 * 20.0);
			pass.Set("fKmESun", 0.0010 * 20.0);
			pass.Set("fKr4PI", 0.0025 * 4.0 * 3.141592653);
			pass.Set("fKm4PI", 0.0010 * 4.0 * 3.141592653);
			pass.Set("fScale", 1.0 / (OUTER_RADIUS - RADIUS_GROUND));
			pass.Set("fScaleDepth", 0.25);
			pass.Set("fScaleOverScaleDepth", 4.0 / (OUTER_RADIUS - RADIUS_GROUND));
			pass.Set("g", -0.95);
			pass.Set("g2", -0.95 * -0.95);

			pass = mesh_ground.Material().Pass(0);
			pass.SetDefaultAlphaBlending();
			pass.DepthWrite(true);
			pass.DepthTest(false);
			pass.CullFaceMode("back");
			pass.CullFace(false);


			pass.Set("v3InvWavelength", [1.0 / pow(0.650, 4.0), 1.0 / pow(0.570, 4.0), 1.0 / pow(0.475, 4.0)]);
			//pass.Set("fCameraHeight", RADIUS_GROUND * 1.5);
			pass.Set("fCameraHeight2", function() {
				var l = vec3.length(camera.GetWorldPos());
				return l * l;
			});
			pass.Set("fInnerRadius", RADIUS_GROUND);
			//pass.Set("fInnerRadius2", RADIUS_GROUND * RADIUS_GROUND);

			pass.Set("fOuterRadius", OUTER_RADIUS);
			pass.Set("fOuterRadius2", OUTER_RADIUS * OUTER_RADIUS);

			pass.Set("fKrESun", 0.0025 * 20.0);
			pass.Set("fKmESun", 0.0010 * 20.0);
			pass.Set("fKr4PI", 0.0025 * 4.0 * 3.141592653);
			pass.Set("fKm4PI", 0.0010 * 4.0 * 3.141592653);
			pass.Set("fScale", 1.0 / (OUTER_RADIUS - RADIUS_GROUND));
			pass.Set("fScaleDepth", 0.25);
			pass.Set("fScaleOverScaleDepth", 4.0 / (OUTER_RADIUS - RADIUS_GROUND));
			pass.Set("g", -0.95);
			pass.Set("g2", -0.95 * -0.95);


			mesh_ground.RenderQueue(medea.RENDERQUEUE_ALPHA_LATE);
			mesh_sky.RenderQueue(medea.RENDERQUEUE_ALPHA_LATE);

			var node_ground = this.AddChild();
			node_ground.AddEntity(mesh_ground);
			node_ground.Scale(RADIUS_GROUND);

			var node_sky = this.AddChild();
			node_sky.AddEntity(mesh_sky);
			node_sky.Scale(OUTER_RADIUS);

			var outer = this;
			camera.AddListener('OnUpdateGlobalTransform', function() {
				outer.LocalXAxis(camera.GetWorldXAxis());
				outer.LocalYAxis(camera.GetWorldZAxis());
				outer.LocalZAxis(vec3.negate(camera.GetWorldYAxis()));
			}, 'atmosphere_sky_align');

			this.SetStaticBB(medea.BB_INFINITE);
		},
	});

	return AtmosphereNode;
};