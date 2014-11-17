
/* medea.js - Open Source, High-Performance 3D Engine based on WebGL.
 *
 * (c) 2011-2013, Alexander C. Gessler
 *  https://github.com/acgessler/medea.js
 *
 * Made available under the terms and conditions of a 3-clause BSD license.
 *
 */
 
#include <remote:mcore/shaders/core.vsh>
#include <url:/data/shader/sphere_shared.vsh>

uniform mat4 terrain_face_transform;
uniform vec3 CAM_POS;

uniform mat3 camera_rotation_offset;

uniform sampler2D heightmap;
uniform sampler2D vegetation_map;

void main()
{
	vec3 position = FetchPosition();
	vec4 position_hom = vec4(position.x, 0.0, position.z, 1.0); 
	position_hom.xzw = camera_rotation_offset * position_hom.xzw;

	vec2 terrain_uv_pos = position_hom.xz * 0.5 / kRADIUS;
	vec4 vegetation = texture2D(vegetation_map, terrain_uv_pos);
	
	// Re-construct terrain height
	float terrain_height = texture2D(heightmap, terrain_uv_pos).r * 255.0 * kTERRAIN_HEIGHT_SCALE;
	vec3 world_position = (terrain_face_transform * position_hom).xyz;

	// Re-construct position on sphere
	float height = position.y * (1.0 + vegetation.g) + terrain_height + kRADIUS;
	vec3 sphere_world_position = normalize(world_position) * height;

	// Determine a suitable normal vector
	vec3 eye = CAM_POS - sphere_world_position;
	vec3 up = normalize(sphere_world_position);

	// Forward final position and UV to PS
	PassClipPosition(WorldToClipSpace(sphere_world_position));
	PassTexCoord(FetchTexCoord());
	PassVec3(eye, eye);
	PassVec3(normal, up);
	PassVec4(vegetation, vegetation);
}

