
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

void main()
{
	vec3 position = FetchPosition();
	vec3 world_position = ModelToWorldSpace(position);
	vec3 sphere_world_position = normalize(world_position) * (kRADIUS + position.y + 25.0);
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

