
/* medea.js - Open Source, High-Performance 3D Engine based on WebGL.
 *
 * (c) 2011-2013, Alexander C. Gessler
 *  https://github.com/acgessler/medea.js
 *
 * Made available under the terms and conditions of a 3-clause BSD license.
 *
 */
 
#include <remote:mcore/shaders/core.vsh>

uniform vec3 CAM_POS;

uniform sampler2D heightmap;

uniform vec4 terrain_uv_offset_scale;
uniform float inv_terrain_map_dim;
uniform float lod_attenuation;

const float kMIN_LOD = 0.0;
const float kMAX_LOD = 4.0;

const float kINV_TILE_SIZE = 1.0 / 64.0;

float CalcLOD(vec3 world_eye) {
	float l = log(dot(world_eye, world_eye) * 0.0001) * 2.0 * lod_attenuation;
	return l;
}

float SampleLOD(vec2 base, float lod_shift_amount) {
	vec2 lod_shift = vec2(lod_shift_amount, lod_shift_amount);

	vec2 delta_left = base - floor(base / lod_shift.xx) * lod_shift.xx;
	vec2 sample_pos = delta_left / lod_shift.xx;

	vec2 sample_uv = inv_terrain_map_dim * (base - delta_left);
	vec3 sample_delta = vec3(lod_shift.xx * inv_terrain_map_dim, 0.0);

	vec4 samples = vec4(
		// Upper Left
		texture2D(heightmap, sample_uv).r,
		// Upper Right
		texture2D(heightmap, sample_uv + sample_delta.xz).r,
		// Lower Left
		texture2D(heightmap, sample_uv + sample_delta.zy).r,
		// Lower Right
		texture2D(heightmap, sample_uv + sample_delta.xy).r
	);
	vec2 samples_mixed = mix(samples.xz, samples.yw, sample_pos.xx);
	return mix(samples_mixed.x, samples_mixed.y, sample_pos.y);
}

void main()
{
	vec3 position = FetchPosition();
	vec2 uv = position.xz * kINV_TILE_SIZE;

	vec3 world_position = ModelToWorldSpace(position);
	vec3 world_eye = CAM_POS - world_position;

	// First reproduce the LOD calculation that also happened
	// when assigning coarse LODs to terrain tiles. For the
	// CLODing to work, they must match.
	float clod = CalcLOD(world_eye);
	highp vec2 lod_pair = clamp(vec2(kMIN_LOD, kMIN_LOD), vec2(kMAX_LOD, kMAX_LOD),
		vec2(floor(clod), ceil(clod)));
	highp vec2 lod_shift = exp2(lod_pair);

	vec2 base = terrain_uv_offset_scale.xy + uv * terrain_uv_offset_scale.zw;

	// Sample the lower and the upper LOD and blend them
	// Note: since SampleLOD() does mostly 2D vector opts,
	// large part of this can be further vectorized.
	float lower_lod_height = SampleLOD(base, lod_shift.x);
	float upper_lod_height = SampleLOD(base, lod_shift.y);
	position.y = mix(lower_lod_height, upper_lod_height, clod - lod_pair.x) * 255.0;

	// Forward final position and computed UV to PS
	PassClipPosition(ModelToClipSpace(position));
	PassTexCoord(uv);
	PassVec3(eye, world_eye);
}

