

 
#include <remote:mcore/shaders/core.vsh>

uniform float inv_cloud_radius;
uniform vec3 CAM_POS;

const float PI = 3.1415926;
const float INV_PI = 1.0 / PI;


void main()
{
	PassClipPosition(ModelToClipSpace(FetchPosition()));

	vec3 world_position = ModelToWorldSpace(FetchPosition());
	vec3 unitsphere_world_position = world_position * inv_cloud_radius;
	PassNormal(normalize(unitsphere_world_position));
	PassVec3(eye, world_position - CAM_POS);

	// Generate texture coordinates. We cannot pre-compute them
	// since the cloud layer is drawn as half-sphere that is
	// rotated to always face the camera.

	// |unitsphere_world_position| is a point on the surface of a unit sphere.
	// UV coordinates are simply the angle part of the corresponding
	// polar coordinate.
	// 
	float theta = acos(unitsphere_world_position.y); 
    float phi = (atan(unitsphere_world_position.x, unitsphere_world_position.z)) + PI * 0.5; 

	PassTexCoord(vec2(phi, theta) * INV_PI);
}

