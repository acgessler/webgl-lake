
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
const float kINV_TILE_SIZE = 1.0 / 64.0;


void main()
{
	vec3 position = FetchPosition();
	vec2 uv = position.xz * kINV_TILE_SIZE;

	position.y = 0.0;
	vec3 world_position = ModelToWorldSpace(position);
	vec3 world_eye = CAM_POS - world_position;

	float height = ComputeHeightAt(position, vec3(world_eye.x, 0, world_eye.z), uv);
	position.y = height * 255.0;

	// Forward final position and computed UV to PS
	PassClipPosition(ModelToClipSpace(position));

	float lod = CalcLOD(vec3(world_eye.x, 0, world_eye.z));
	PassVec2(lod, vec2(lod_range.y - lod, lod - lod_range.x));
}

