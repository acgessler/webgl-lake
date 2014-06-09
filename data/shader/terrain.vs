
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
#include <url:data/shader/constants_shared.vsh>

uniform vec3 CAM_POS;
uniform vec3 LIGHT_D0_DIR;

uniform float sq_base_height;


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

	float height = ComputeHeightAt(position, dot(world_eye, world_eye) - sq_base_height, uv);
	position.y = (height * 255.0 * kTERRAIN_HEIGHT_SCALE);

	vec3 sphere_world_position_with_height = sphere_world_position +
		unit_sphere_pos * position.y;
	world_eye = CAM_POS - sphere_world_position_with_height;

	// Forward final position and computed UV to PS
	PassClipPosition(WorldToClipSpace(sphere_world_position_with_height));
	PassTexCoord(uv);
	PassVec4(eye_height, vec4(world_eye, height));

	// Forward model-space light direction to simplify PS.
	// To do so, construct a coordinate base for the point
	// on the spherical surface.
	//
	// TODO: simplify to be a single DP.
	vec3 world_tangent = ModelNormalToWorldSpace(vec3(1.0, 0.0, 0.0));
	vec3 tangent_point = world_position + world_tangent;
	vec3 spherical_tangent = normalize(
		normalize(tangent_point) * kRADIUS - sphere_world_position
	);

	vec3 spherical_bitangent = cross(spherical_tangent, unit_sphere_pos);
	vec3 model_light_dir = LIGHT_D0_DIR.xyz * mat3(spherical_tangent, unit_sphere_pos, spherical_bitangent);

	//
	//model_light_dir.y += (WIT * vec4(shift.xyz, 0.0)).y / kRADIUS;
	PassVec3(model_light_dir_0, normalize(model_light_dir));
}

