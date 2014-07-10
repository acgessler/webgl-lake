var GetOrbitCamControllerType = function(medea) {

	var ORBIT_CAM_BLEND_TO_FPS_START_HEIGHT = 100;
	var FPS_HEIGHT_OVER_GROUND = 10;

	// Slight variation of medea's stock OrbitCamController, adding the smooth
	// interpolation between Orbit and FPS view as the camera comes close to
	// the planet surface.
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


				// CHANGE WITH RESPECT TO THE NORMAL, medea-library OrbitCamController:
				// Close to the ground, pick the eye vector as a tangent to the planet
				// surface and up as a normal.
				if (this.terrain_node) {
					var terrain_height = this.terrain_node.GetHeightAt(veye);
					var threshold = RADIUS + terrain_height + FPS_HEIGHT_OVER_GROUND;
					if (dist < threshold) {
						dist = threshold;
						vo[12] = veye[0] * dist;
						vo[13] = veye[1] * dist;
						vo[14] = veye[2] * dist;
					}
					threshold += ORBIT_CAM_BLEND_TO_FPS_START_HEIGHT;
					if (dist < threshold) {
						var f = saturate((threshold - dist) / ORBIT_CAM_BLEND_TO_FPS_START_HEIGHT);
						vup[0] = lerp(vup[0], veye[0], f);
						vup[1] = lerp(vup[1], veye[1], f);
						vup[2] = lerp(vup[2], veye[2], f);

						f = 1.0 - f;
						veye[0] = lerp(0, veye[0], f);
						veye[1] = lerp(0, veye[1], f);
						veye[2] = lerp(1, veye[2], f);
					}
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
					mat4.translate(vo, this.pan_vector, vo);
				}

				node.LocalTransform(vo);
				this.dirty_trafo = false;
			};
		})()
	});

	return OrbitCamController;
};