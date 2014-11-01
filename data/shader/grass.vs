
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

uniform vec3 CAM_POS;
uniform vec2 cam_flat_2d_offset;
uniform sampler2D heightmap;

void main()
{
	vec3 position = FetchPosition();
	float height = texture2D(heightmap, (position.xz + cam_flat_2d_offset) * 0.5 / kRADIUS).r * 255.0 * kTERRAIN_HEIGHT_SCALE;
	vec3 world_position = ModelToWorldSpace(position);

	vec3 sphere_world_position = normalize(world_position) * (kRADIUS + position.y + height);
	vec2 uv = FetchTexCoord();

	vec3 eye = CAM_POS - sphere_world_position;
	// TODO: this is degenerate for up ~ eye
	vec3 up = normalize(sphere_world_position);

	// Forward final position and cUV to PS
	PassClipPosition(WorldToClipSpace(sphere_world_position));

	PassTexCoord(uv);
	PassVec3(eye, eye);
	PassVec3(normal, up);
}

