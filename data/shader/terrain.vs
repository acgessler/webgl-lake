
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


void main()
{
	vec3 position = FetchPosition();
	vec2 uv = position.xz * kINV_TILE_SIZE;

	// First map to world space as usual, this part is linear
	vec3 world_position = ModelToWorldSpace(position);

	///////////////////////////////////////////////////////////////////////////
	// Calculate spherical terrain height at this point

	// Input world_position is on the surface of the unit cube,
	// normalizing yields a non-linear map to unit sphere.
	vec3 unit_sphere_pos = normalize(world_position);

	// Approximate the final position of the terrain point by using
	// the terrain height under the camera
	float height_approx = kRADIUS + terrain_height_under_cam;
	vec3 sphere_world_position_with_height_approx = unit_sphere_pos *
		height_approx;

	// From this, derive an approximate world eye vector.
	//
	// The square length of the world eye vector is used to pick the LOD of
	// the terrain at this point, which then allows us to compute the exact
	// height.
	vec3 world_eye_approx = CAM_POS - sphere_world_position_with_height_approx;
	float cam_distance_approx_sq = dot(world_eye_approx, world_eye_approx);

	float height_unscaled = ComputeHeightAt(position, cam_distance_approx_sq, uv);
	float height = kRADIUS + height_unscaled * kHEIGHTMAP_PIXEL_TO_TERRAIN_HEIGHT;

	// Derive the exact terrain position from the exact height
	vec3 sphere_world_position_with_height = sphere_world_position_with_height_approx *
		(height / height_approx);

	// Calculate exact world eye vector from the now known height
	vec3 world_eye = CAM_POS - sphere_world_position_with_height;


	///////////////////////////////////////////////////////////////////////////

	// Forward model-space light direction to simplify PS.
	// To do so, construct a coordinate base for the point on the spherical
	// surface and project the global light direction.
	//
	// TODO: simplify this to be a single DP.
	vec3 world_tangent = ModelNormalToWorldSpace(vec3(1.0, 0.0, 0.0));
	vec3 tangent_point = world_position + world_tangent;
	vec3 spherical_tangent = normalize(
		(normalize(tangent_point) - unit_sphere_pos) * kRADIUS
	);

	vec3 spherical_bitangent = cross(spherical_tangent, unit_sphere_pos);
	vec3 model_light_dir = LIGHT_D0_DIR.xyz * mat3(
		spherical_tangent,
		unit_sphere_pos,
		spherical_bitangent
	);

	///////////////////////////////////////////////////////////////////////////
	
	PassClipPosition(WorldToClipSpace(sphere_world_position_with_height));
	PassVec4(eye_height, vec4(world_eye, height_unscaled));
	PassVec3(model_light_dir_0, normalize(model_light_dir));
	PassTexCoord(uv);
}

