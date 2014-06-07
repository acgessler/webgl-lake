
/* medea.js - Open Source, High-Performance 3D Engine based on WebGL.
 *
 * (c) 2011-2013, Alexander C. Gessler
 *  https://github.com/acgessler/medea.js
 *
 * Made available under the terms and conditions of a 3-clause BSD license.
 *
 */
 
#include <remote:mcore/shaders/core.vsh>
#include <url:/data/shader/terrain_shared.vsh>

uniform vec3 CAM_POS;
uniform vec3 LIGHT_D0_DIR;
uniform mat4 WIT;

const float kINV_TILE_SIZE = 1.0 / 64.0;
const float kRADIUS = 1024.0;

vec3 CubeToSphereSurface(vec3 pos) {
	return normalize(pos) * kRADIUS;
}

void main()
{
	vec3 position = FetchPosition();
	vec2 uv = position.xz * kINV_TILE_SIZE;

	// First map to world space as usual, this part is linear
	vec3 world_position = ModelToWorldSpace(position);

	// Input world_position is on the surface of the unit cube,
	// therefore normalizing yields a non-linear map to unit sphere.
	vec3 unit_sphere_pos = normalize(world_position);
	vec3 sphere_world_position = unit_sphere_pos * kRADIUS;
	vec3 shift = sphere_world_position - world_position;
	vec3 world_eye = CAM_POS - sphere_world_position;

	float height = ComputeHeightAt(position, vec3(world_eye.x, 0.0, world_eye.z), uv);
	position.y = height * 255.0;

	vec3 sphere_world_position_with_height = sphere_world_position +
		unit_sphere_pos * position.y;
	world_eye = CAM_POS - sphere_world_position_with_height;

	// Forward final position and computed UV to PS
	PassClipPosition(WorldToClipSpace(sphere_world_position_with_height));
	PassTexCoord(uv);
	PassVec4(eye_height, vec4(world_eye, height));

	// Forward model-space light direction to simplify PS.
	vec3 model_light_dir = (WIT * vec4(LIGHT_D0_DIR.xyz, 0.0)).xyz;

	//
	model_light_dir.y += (WIT * vec4(shift.xyz, 0.0)).y / kRADIUS;
	PassVec3(model_light_dir_0, normalize(model_light_dir));
}

