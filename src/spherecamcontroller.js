var GetSphereFpsCamControllerType = function(medea, app) {
	var SphereFpsCamController = medea.CamController.extend({

		scratch_mat : null,
		hispeed_on_shift : true,
		terrain_node : null,

		init : function(enabled) {
			this._super(enabled);

			this.turn_speed = 0.005;
			this.walk_speed = 5.5;

			this.scratch_mat = mat4.identity(mat4.create());
		},

		HispeedOnShift : medealib.Property('hispeed_on_shift'),
		TurnSpeed : medealib.Property('turn_speed'),
		WalkSpeed : medealib.Property('walk_speed'),
		TerrainNode : medealib.Property('terrain_node'),

		Update : function(dtime, node) {
			this._super(dtime, node);
			var pos = node.LocalPos();
			
			var pos_nor = vec3.normalize(pos);
			vec3.scale(pos_nor, RADIUS + app.GetSmoothedTerrainHeightUnderCamera() + FPS_HEIGHT_OVER_GROUND);
			node.LocalPos(pos_nor);

			// Adjust coordinate system base to the sphere geometry.
			// Usually this is only a very small change.
			//node.LocalYAxis(pos_nor);
			//node.LocalXAxis(vec3.cross(node.LocalZAxis(), pos_nor));
			//node.LocalZAxis(vec3.cross(node.LocalXAxis(), node.LocalYAxis()));
		},

		PlaceNodeAt : function(node, v) {
			var pos_nor = vec3.normalize(v);

			node.LocalYAxis(pos_nor);
			node.LocalXAxis(vec3.cross(node.LocalZAxis(), pos_nor));
			node.LocalZAxis(vec3.cross(node.LocalXAxis(), node.LocalYAxis()));

			node.LocalPos(vec3.scale(pos_nor, RADIUS_GROUND));
		},


		ProcessMouseDelta : function(dtime, n, d) {
			var mrot = this.scratch_mat;

			// Process mouse movement on the y axis
			if(d[1] !== 0) {
				mrot = mat4.rotate(mat4.identity(mrot),-d[1]*this.turn_speed, n.LocalXAxis());
				n.LocalYAxis(mat4.multiplyVec3(mrot,n.LocalYAxis()));
				n.LocalZAxis(mat4.multiplyVec3(mrot,n.LocalZAxis()));
			}

			// Process mouse movement on the x axis
			if(d[0] !== 0) {
				var pos = n.LocalPos();
				if (vec3.length(pos) < RADIUS) {
					return;
				}
				var pos_nor = vec3.normalize(pos);

				mrot = mat4.rotate(mat4.identity(mrot),-d[0]*this.turn_speed, pos_nor);
				n.LocalYAxis(mat4.multiplyVec3(mrot,n.LocalYAxis()));
				n.LocalZAxis(mat4.multiplyVec3(mrot,n.LocalZAxis()));
				n.LocalXAxis(vec3.cross(n.LocalYAxis(),n.LocalZAxis()));
			}
		},
			

		ProcessKeyboard : function(dtime, n) {

			var ws = this.walk_speed;
			if(this.hispeed_on_shift) {
				if(medea.IsKeyDown(16) /* SHIFT */) {
					ws *= 10;
				}
			}

			// W
			if(medea.IsKeyDown(87)) {
				n.Translate([0,0,-ws * dtime]);
			}
			// A
			if(medea.IsKeyDown(65)) {
				n.Translate([-ws * dtime,0,0]);
			}
			// S
			if(medea.IsKeyDown(83)) {
				n.Translate([0,0,ws * dtime]);
			}
			// D
			if(medea.IsKeyDown(68)) {
				n.Translate([ws * dtime,0,0]);
			}

			// PAGE UP
			var terrain = null; //this.terrain_node;
			if(medea.IsKeyDown(33)) {
				if (terrain) {
					terrain.HeightOffset(terrain.HeightOffset()+ws * dtime);
				}
				else {
					n.Translate([0,ws * dtime,0]);
				}
			}
			
			// PAGE DOWN
			if(medea.IsKeyDown(34)) {
				if (terrain) {
					terrain.HeightOffset(terrain.HeightOffset()-ws * dtime);
				}
				else {
					n.Translate([0,-ws * dtime,0]);
				}
			}
		}
	});

	return SphereFpsCamController;
};