#ifndef INCLUDED_SPHERE_SHARED
#define INCLUDED_SPHERE_SHARED

#include <remote:mcore/shaders/core.vsh>
#include <url:data/shader/constants_shared.vsh>

// Project from model space to spherically transformed world space
vec3 ProjectOntoSphere(vec3 position) {
	float height = position.y;
	position.y = 0.0;
	vec3 world_position = ModelToWorldSpace(position);
	vec3 unit_sphere_pos = normalize(world_position);
	return unit_sphere_pos * (kRADIUS + height);
}

#endif