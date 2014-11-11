
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
#include <url:/data/shader/constants_shared.vsh>

uniform vec3 CAM_POS;

uniform float scaling;

void main()
{
	vec3 position = FetchPosition();
	vec3 sphere_world_position = ProjectOntoSphere(position);
	vec2 uv = FetchTexCoord();

	vec3 eye = CAM_POS - sphere_world_position;
	float eye_len = length(eye);
	vec3 eye_norm = eye / eye_len;
	// TODO: this is degenerate for up ~ eye
	vec3 up = normalize(sphere_world_position + eye_norm.yzx);
	vec3 right = cross(up, eye_norm);

	// Make it a billboard by offsetting points along the plane
	// parallel to the camera.
	vec2 offset = (uv - 0.5) * 2.0 * scaling;
	sphere_world_position += offset.x * right;

	// Forward final position and computed UV to PS
	PassClipPosition(WorldToClipSpace(sphere_world_position));

	uv.y = 1.0 - uv.y;
	PassTexCoord(uv);

	// Determine fade out based on distance. This is where tree
	// billboards get replaced by proper meshes
	float fadeout = smoothstep(kTREE_BILLBOARD_FADE_BEGIN,
		kTREE_BILLBOARD_FADE_END, eye_len); 

	PassVec4(eye_fadeout, vec4(eye, fadeout));
	PassVec3(normal, up);
}

