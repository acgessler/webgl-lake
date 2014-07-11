var GetOrbitCamControllerType = function(medea, app) {

	// Slight variation of medea's stock OrbitCamController, adding the smooth
	// interpolation between Orbit and FPS view as the camera comes close to
	// the planet surface.
	//
	// In the context of the demo, this is a singleton.
	var OrbitCamController = medea.OrbitCamController.extend({

		terrain_node : null,

		TerrainNode : medealib.Property('terrain_node'),

		_UpdateNodeTransformation : (function() {
			var	view_with_offset 	= mat4.create()
			, 	vup 				= vec3.create()
			, 	vright 				= vec3.create()
			,	veye 				= vec3.create()
			;

			return function(node) {
				if (this.dirty_trafo === false) {
					return;
				}

				if (!this.terrain_node) {
					alert('terrain node not set');
				}

				var	vo 			= view_with_offset
				,	dist 		= this.camera_distance
				,	phi 		= this.phi
				,	theta 		= this.theta
				,	sintheta 	= Math.sin(theta)
				;

				veye[0] = Math.cos(phi)*sintheta;
				veye[1] = Math.cos(theta);
				veye[2] = Math.sin(phi)*sintheta;
				vec3.normalize(veye);

				// note: the following is basically what gluLookAt() does
				
				// translation
				vo[12] = veye[0] * dist;
				vo[13] = veye[1] * dist;
				vo[14] = veye[2] * dist;
				vo[15]  = 1;
				
				vup[0] = 0;
				vup[1] = 1;
				vup[2] = 0;

				// Transition between orbit (0.0) and ground view (1.0)
				var f = 0.0;

				// CHANGE WITH RESPECT TO THE NORMAL, medea-library OrbitCamController:
				// Close to the ground, pick the eye vector as a tangent to the planet
				// surface and up as a normal.
				var terrain_height = this.terrain_node.GetHeightAt(veye);
				var threshold = RADIUS + terrain_height + FPS_HEIGHT_OVER_GROUND;
				if (dist < threshold) {
					vo[12] = veye[0] * dist;
					vo[13] = veye[1] * dist;
					vo[14] = veye[2] * dist;
				}
				threshold += ORBIT_CAM_BLEND_TO_FPS_START_HEIGHT;
				if (dist < threshold) {
					f = saturate((threshold - dist) / ORBIT_CAM_BLEND_TO_FPS_START_HEIGHT);
					f = Math.sqrt(f);
					vec3.lerp(vup, veye, f);
					vec3.normalize(vup);

					// Pick a vector perpendicular to the current eye vector
					// To avoid a discontinuity during interpolation.
					//
					// Project it onto the sphere surface
					// TODO: use world camera up
					var vground = [1 + veye[0], veye[1], 1 + veye[2]];
					vec3.normalize(vground);
					vec3.subtract(vground, veye, vground);
					vec3.normalize(vground);

					vec3.lerp(veye, vground, f);
					vec3.normalize(veye);
				}

				// z-axis
				vo[8]  = veye[0];
				vo[9]  = veye[1];
				vo[10] = veye[2];
				vo[11] = 0;

				vec3.cross(vup, veye, vright);
				vec3.normalize(vright); 

				// x axis
				vo[0]  = vright[0];
				vo[1]  = vright[1];
				vo[2]  = vright[2];
				vo[3]  = 0;

				vec3.cross(veye, vright, vup);
				vec3.normalize(vup);

				// y axis
				vo[4]  = vup[0];
				vo[5]  = vup[1];
				vo[6]  = vup[2];
				vo[7]  = 0;

				if(this.pan_enable) {
					mat4.translate(vo, vec3.scale(this.pan_vector, (1-f), vec3.create()), vo);
				}

				if (f > 0.99) {
					app.SwitchToFpsView(vo);
				}
				else {
					app._SetOrbitGroundDistance(dist - terrain_height - RADIUS);
				}
				node.LocalTransform(vo);
				this.dirty_trafo = false;
			};
		})()
	});

	return OrbitCamController;
};