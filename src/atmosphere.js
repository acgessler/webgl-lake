var InitAtmosphereNodeType = function(medea) {
	// Draws the atmosphere with scattering and cloud layer from space as well
	// as a static, skydome-based version on ground level.
	var AtmosphereNode = medea.Node.extend({

		camera : null,

		mat_sky : null,
		mat_ground : null,
		mesh_ground : null,
		mesh_sky : null,
		node_ground : null,
		node_sky : null,

		node_clouds : null,

		init : function() {
			this._super();
			
			var shader = 'url:data/shader/atmosphere';
			var mat_ground = this.mat_ground = medea.CreateSimpleMaterialFromShaderPair(shader,
				{}, null,
				{
					CAMERA_IN_SPACE : 1
				}
			);

			var mat_sky = this.mat_sky = medea.CreateSimpleMaterialFromShaderPair(shader,
				{}, null,
				{
					CAMERA_IN_SPACE : 1,
					SKY : 1
				}
			);

			var mesh_ground = this.mesh_ground = medea.CreateDomeMesh(mat_ground, 0.0, 64, 6);
			var mesh_sky = this.mesh_sky = medea.CloneMesh(mesh_ground, mat_sky);
			mesh_ground.RenderQueue(medea.RENDERQUEUE_LAST);
			mesh_sky.RenderQueue(medea.RENDERQUEUE_LAST);

			var pass = mat_sky.Pass(0);
			pass.SetDefaultAlphaBlendingNotPremultiplied();
			pass.DepthWrite(true);
			//pass.DepthTest(false);
			pass.CullFaceMode("front");
			pass.CullFace(true);

			mat_sky.SetIgnoreUniformVarLocationNotFound();
			this._SetupScatteringConstants(pass);

			mat_ground.SetIgnoreUniformVarLocationNotFound();
			mat_ground.Pass(0).CopyConstantsFrom(pass);

			pass = mat_ground.Pass(0);
			pass.BlendOp('add');
			pass.BlendFunc('one', 'one_minus_src_alpha');
			pass.BlendEnable(true);
			pass.DepthWrite(true);
			pass.DepthTest(false);
			pass.CullFaceMode("back");
			pass.CullFace(true);

			var node_ground = this.node_ground = this.AddChild();
			node_ground.AddEntity(mesh_ground);
			node_ground.Scale(RADIUS_GROUND);

			var node_sky = this.node_sky = this.AddChild();
			node_sky.AddEntity(mesh_sky);
			node_sky.Scale(OUTER_RADIUS);

			this._SetupCloudLayer();
		
			// Prevent any culling on this node or its children
			this.SetStaticBB(medea.BB_INFINITE);
		},

		Render : function(camera, rqmanager) {
			this._super();
			this.camera = camera;

			// Position the half-sphere according to the camera mode
			// (orbit mode is 90deg rotated wrt FPS mode)
			//
			// Also set material accordingly. Orbit camera is always treated
			// as "from space" even though the Orbit camera technically enters
			// the atmosphere.
			if (camera.Name().indexOf("Orbit") !== -1) {
				this.LocalXAxis(camera.GetWorldXAxis());
				this.LocalYAxis(camera.GetWorldZAxis());
				this.LocalZAxis(vec3.negate(camera.GetWorldYAxis()));

				this.mesh_ground.Material(this.mat_ground);
				this.mesh_sky.Material(this.mat_sky_from_ground);

				this.node_ground.Enabled(true);
				this.node_sky.Enabled(true);
			}
			else {
				this.node_ground.Enabled(false);
				this.node_sky.Enabled(false);
			}
		},


		_SetupCloudLayer : function() {
			var shader = 'url:data/shader/clouds';
			var mat_clouds = this.mat_sky = medea.CreateSimpleMaterialFromShaderPair(shader, {
				texture : 'url:data/textures/clouds.png'
			});

			var mesh_clouds = this.mesh_clouds = medea.CloneMesh(this.mesh_ground, mat_clouds);
			mesh_clouds.RenderQueue(medea.RENDERQUEUE_ALPHA_LATE);

			var pass = mat_clouds.Pass(0);
			pass.SetDefaultAlphaBlendingNotPremultiplied();
			pass.DepthWrite(false);
			pass.DepthTest(false);
			pass.CullFaceMode("back");
			pass.CullFace(true);

			var node_clouds = this.node_clouds = this.AddChild();
			node_clouds.AddEntity(mesh_clouds);
			node_clouds.Scale(CLOUDS_RADIUS);
		},

		_SetupScatteringConstants : function(pass) {
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
		}
	});

	return AtmosphereNode;
};