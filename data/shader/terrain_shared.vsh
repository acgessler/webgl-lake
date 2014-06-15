#ifndef INCLUDED_TERRAIN_SHARED
#define INCLUDED_TERRAIN_SHARED

// TODO: HW filtering may not work everywhere (investigate!). Also,
// it is seemingly more shaky than regular LOD which makes me wonder
// where the HW's approximation lies.
//#define USE_HW_FILTERING

#include <url:/data/shader/constants_shared.vsh>

uniform sampler2D heightmap;

uniform vec4 terrain_uv_offset_scale;
uniform highp vec4 lod_range;
uniform float inv_terrain_map_dim;
uniform float lod_attenuation;


const float kMIN_LOD = 0.0;
const float kMAX_LOD = 8.0;

const float kLOD_BASE_UNIT = 16.0;
const float kSQ_LOD_BASE_UNIT = kLOD_BASE_UNIT * kLOD_BASE_UNIT;

vec2 TilePositionToTerrainUVCoordinates(vec2 tile_pos_xz) {
	tile_pos_xz *= kINV_TILE_SIZE;
	return inv_terrain_map_dim * (terrain_uv_offset_scale.xy +
		tile_pos_xz * terrain_uv_offset_scale.zw
	);
}

float CalcLOD(highp float sq_distance) {
	highp float lod = log2(sq_distance * 3.0 / kSQ_LOD_BASE_UNIT) * lod_attenuation * 0.5;
	return clamp(lod, kMIN_LOD, kMAX_LOD);
}


float SampleLOD(vec2 base, float lod_shift_amount) {
	vec2 lod_shift = vec2(lod_shift_amount, lod_shift_amount);

	vec2 delta_left = mod(base, lod_shift.xx);
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

float ComputeHeightAt(vec3 position, float sq_distance, vec2 uv) {
	// First reproduce the LOD calculation that also happened
	// when assigning coarse LODs to terrain tiles. For the
	// CLODing to work, they must match.
	float clod = CalcLOD(sq_distance);
	vec2 base = terrain_uv_offset_scale.xy + uv * terrain_uv_offset_scale.zw;

#ifdef USE_HW_FILTERING
	return texture2DLod(heightmap, base * inv_terrain_map_dim, clod).r;
#else
	
	// Sample the lower and the upper LOD and blend them
	// Note: since SampleLOD() does mostly 2D vector opts,
	// large part of this can be further vectorized.
	float lower_lod_height = SampleLOD(base, lod_range.z);
	float upper_lod_height = SampleLOD(base, lod_range.w);
	return mix(lower_lod_height, upper_lod_height, clamp(clod - lod_range.x, 0.0, 1.0) );
#endif

}

#endif 
