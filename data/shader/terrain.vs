
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

const float kMIN_LOD = 0.0;
const float kMAX_LOD = 4.0;

float CalcLOD(vec3 position) {
	vec3 distance = position - CAM_POS;
	float l = log(dot(distance, distance) * 0.0001) * 2.0;
	return l;
}


void main()
{
	vec3 position = FetchPosition();
	vec2 uv = FetchTexCoord();

	// First reproduce the LOD calculation that also happened
	// when assigning coarse LODs to terrain tiles. For the
	// CLODing to work, they must match.
	float clod = CalcLOD(position);
	highp vec2 lod_pair = clamp(vec2(kMIN_LOD, kMIN_LOD), vec2(kMAX_LOD, kMAX_LOD),
		vec2(floor(clod), ceil(clod)));
	highp vec2 lod_shift = exp2(lod_pair);

	vec2 base = terrain_uv_offset_scale.xy + uv * terrain_uv_offset_scale.zw;

	// Sample the lower LOD
	vec2 delta_left = base - floor(base / lod_shift.xx) * lod_shift.xx;
	float sample_pos = length(delta_left) / length(lod_shift.xx);

	vec2 sample_uv = inv_terrain_map_dim * (base - delta_left);
	float sample_left = texture2D(heightmap, sample_uv).r;
	float sample_right = texture2D(heightmap, sample_uv + lod_shift.xx * inv_terrain_map_dim).r;
	float lower_lod_height = mix(sample_left, sample_right, sample_pos);

	// Sample the upper LOD
	delta_left = base - floor(base / lod_shift.yy) * lod_shift.yy;
	sample_pos = length(delta_left) / length(lod_shift.yy);

	sample_uv = inv_terrain_map_dim  * (base - delta_left);
	sample_left = texture2D(heightmap, sample_uv).r;
	sample_right = texture2D(heightmap, sample_uv + lod_shift.yy * inv_terrain_map_dim).r;
	float upper_lod_height = mix(sample_left, sample_right, sample_pos);

	// Blend them together
	position.y = mix(lower_lod_height, upper_lod_height, clod - lod_pair.x) * 255.0;

	PassClipPosition(ModelToClipSpace(position));
	PassTexCoord(uv);

	PassVec3(eye, CAM_POS - ModelToWorldSpace(FetchPosition()));
	//PassVec4(terrain_uv_offset_scale, TERRAIN_UV_OFFSET_SCALE);
}

