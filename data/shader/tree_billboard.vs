
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

uniform float scaling;

void main()
{
	vec3 position = FetchPosition();
	vec3 sphere_world_position = ProjectOntoSphere(position);
	vec2 uv = FetchTexCoord();

	vec3 eye = CAM_POS - sphere_world_position;
	vec3 eye_norm = normalize(eye);
	// TODO: this is degenerate for up ~ eye
	vec3 up = normalize(sphere_world_position);
	vec3 right = -cross(eye_norm, up);

	// Make it a billboard by offsetting points along the plane
	// parallel to the camera.
	vec2 offset = (uv - 0.5) * 2.0 * scaling;
	sphere_world_position += offset.x * right;

	// Forward final position and computed UV to PS
	PassClipPosition(WorldToClipSpace(sphere_world_position));

	uv.y = 1.0 - uv.y;
	PassTexCoord(uv);
	PassVec3(eye, eye);
	PassVec3(normal, up);
}

