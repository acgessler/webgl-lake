#ifndef INCLUDED_TERRAIN_SHARED
#define INCLUDED_TERRAIN_SHARED

uniform sampler2D heightmap;
uniform vec4 terrain_uv_offset_scale;
uniform highp vec4 lod_range;
uniform float inv_terrain_map_dim;
uniform float lod_attenuation;


const float kMIN_LOD = 0.0;
const float kMAX_LOD = 5.0;


float CalcLOD(highp vec3 world_eye) {
	highp float lod = log(dot(world_eye, world_eye) / (16.0 * 16.0)) * lod_attenuation * 0.5 / log(2.0);
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

float ComputeHeightAt(vec3 position, vec3 world_eye, vec2 uv) {
	// First reproduce the LOD calculation that also happened
	// when assigning coarse LODs to terrain tiles. For the
	// CLODing to work, they must match.
	float clod = CalcLOD(world_eye);
	vec2 base = terrain_uv_offset_scale.xy + uv * terrain_uv_offset_scale.zw;

	// Sample the lower and the upper LOD and blend them
	// Note: since SampleLOD() does mostly 2D vector opts,
	// large part of this can be further vectorized.
	float lower_lod_height = SampleLOD(base, lod_range.z);
	float upper_lod_height = SampleLOD(base, lod_range.w);
	return mix(lower_lod_height, upper_lod_height, clod - lod_range.x);
}

#endif 
