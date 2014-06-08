
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

uniform float sq_base_height;

const float kINV_TILE_SIZE = 1.0 / 64.0;
const float kRADIUS = 1024.0;
const float kTERRAIN_HEIGHT_SCALE = 0.65;

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
	position.y = height * 255.0 * kTERRAIN_HEIGHT_SCALE;
	vec3 sphere_world_position_with_height = sphere_world_position +
		unit_sphere_pos * position.y;

	// Forward final position and computed UV to PS
	PassClipPosition(WorldToClipSpace(sphere_world_position_with_height));

	float lod = CalcLOD(dot(world_eye, world_eye) - sq_base_height);
	PassVec2(lod, vec2(floor(lod) / 8.0, lod - lod_range.x));
}

