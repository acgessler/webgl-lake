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
	//height *=  max(0.3, Math.pow(abs(dot(normalize(CAM_POS - unit_sphere_pos * kRADIUS), unit_sphere_pos)), 0.2));
	return unit_sphere_pos * (kRADIUS + height);
}

#endif